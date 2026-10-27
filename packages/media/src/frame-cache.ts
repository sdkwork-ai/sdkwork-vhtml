/**
 * Deterministic frame cache (RFC-0016, incremental render).
 *
 * Sampled composition frames are content-addressed under
 * `<root>/.vhtml/cache/frames/<key>/frame-%06d.png`. The key hashes the
 * canonical project serialization, the sampled range/fps, asset file
 * fingerprints (size + mtime) and the renderer fingerprint. Repeated exports
 * of an unchanged project — and every preset of a multi-preset batch — reuse
 * the sampled PNGs instead of re-opening Chromium.
 *
 * The cache is a per-machine artifact keyed under the project layout cache
 * directory (`.vhtml/cache/`, per the project-layout profile). Pixel identity
 * still follows the same-environment rule: a Chromium update changes frames,
 * so the renderer fingerprint participates in the key and stale keys can be
 * pruned with `pruneFrameCache`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '@sdkwork/vhtml-core/model';
import { serializeProject } from '@sdkwork/vhtml-core/serialize';
import { toNumber, type Rational } from '@sdkwork/vhtml-core/time';

const KEY_VERSION = 'v1';

export interface FrameCacheFingerprint {
  executablePath?: string;
  headless?: boolean;
  sandbox?: boolean;
  allowNetwork?: boolean;
}

export interface FrameCacheKeyOptions {
  /** Project root used to resolve asset files for fingerprinting. */
  root: string;
  timelineId: string;
  fps: Rational;
  rangeStart: Rational;
  rangeDuration: Rational;
  renderer: FrameCacheFingerprint;
}

export interface FrameCache {
  /** Directory holding this key's frames. */
  dir: string;
  hits: number;
  misses: number;
  has(frame: number): boolean;
  read(frame: number): Buffer | undefined;
  write(frame: number, png: Buffer): void;
  pathFor(frame: number): string;
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Stable key for one sampling job. Asset files participate through
 * size+mtime so replacing media on disk invalidates cached frames without
 * hashing gigabytes; mtime changes only cause extra misses (never stale hits).
 */
export function frameCacheKey(project: Project, options: FrameCacheKeyOptions): string {
  const assets = project.assets.map((asset) => {
    let fingerprint = 'missing';
    try {
      const stat = fs.statSync(path.resolve(options.root, asset.src));
      fingerprint = `${stat.size}:${stat.mtimeMs}`;
    } catch {
      /* unresolvable asset: "missing" participates in the key (safe direction) */
    }
    return `${asset.id}:${asset.src}:${fingerprint}`;
  });
  return hashText(JSON.stringify({
    version: KEY_VERSION,
    project: serializeProject(project),
    timeline: options.timelineId,
    fps: `${options.fps.num}/${options.fps.den}`,
    range: [toNumber(options.rangeStart), toNumber(options.rangeDuration)],
    renderer: options.renderer,
    assets,
  }));
}

export function frameFileName(frame: number): string {
  return `frame-${String(frame).padStart(6, '0')}.png`;
}

/**
 * Open (or create) the cache for one key. Frames are validated by existence
 * and non-zero size only; the key carries every input that determines pixels.
 * With `refresh`, existing entries are ignored for reads but still rewritten.
 */
export function openFrameCache(cacheDir: string, key: string, options: { refresh?: boolean } = {}): FrameCache {
  const dir = path.join(cacheDir, key);
  fs.mkdirSync(dir, { recursive: true });
  const cache: FrameCache = {
    dir,
    hits: 0,
    misses: 0,
    has(frame: number): boolean {
      if (options.refresh) return false;
      try {
        return fs.statSync(cache.pathFor(frame)).size > 0;
      } catch {
        return false;
      }
    },
    read(frame: number): Buffer | undefined {
      if (options.refresh) return undefined;
      try {
        const png = fs.readFileSync(cache.pathFor(frame));
        if (!png.length) return undefined;
        cache.hits += 1;
        return png;
      } catch {
        return undefined;
      }
    },
    write(frame: number, png: Buffer): void {
      cache.misses += 1;
      const temporary = `${cache.pathFor(frame)}.tmp`;
      fs.writeFileSync(temporary, png);
      fs.renameSync(temporary, cache.pathFor(frame));
    },
    pathFor(frame: number): string {
      return path.join(dir, frameFileName(frame));
    },
  };
  return cache;
}

/** Count cached frames without charging hits (used to skip opening Chromium). */
export function countCachedFrames(cache: FrameCache, totalFrames: number): number {
  let cached = 0;
  for (let frame = 0; frame < totalFrames; frame += 1) {
    if (cache.has(frame)) cached += 1;
  }
  return cached;
}

/**
 * Prune old key directories, keeping the newest `keep` by mtime. The frame
 * cache is generated output owned by the exporter; targets are enumerated as
 * exact directory names from one readdir and every path resolves inside the
 * cache root before removal.
 */
export function pruneFrameCache(cacheDir: string, keep = Number(process.env.VHTML_FRAME_CACHE_KEEP ?? 8)): Array<string> {
  if (!Number.isFinite(keep) || keep < 1) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const resolvedRoot = path.resolve(cacheDir);
  const keyDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.resolve(resolvedRoot, entry.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { name: entry.name, full, mtime };
    })
    .filter((candidate) => candidate.full.startsWith(resolvedRoot + path.sep));
  keyDirs.sort((a, b) => b.mtime - a.mtime);
  const removed: Array<string> = [];
  for (const candidate of keyDirs.slice(keep)) {
    try {
      fs.rmSync(candidate.full, { recursive: true, force: true });
      removed.push(candidate.name);
    } catch {
      /* a concurrent export may hold the dir; leaving it is safe */
    }
  }
  return removed;
}
