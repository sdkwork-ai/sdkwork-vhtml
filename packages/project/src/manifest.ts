/**
 * VHTML 1.1 project layout and optional `vhtml.json` manifest.
 *
 * A project is a directory, not a single file. The manifest makes the entry
 * point, source file, asset folders, generated outputs, render outputs and cache
 * location explicit and portable.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode, VhtmlError } from '@sdkwork/vhtml-core/errors';

export const MANIFEST_FILENAME = 'vhtml.json';
export const MANIFEST_VERSION = '1.1';

export interface ProjectLayoutPaths {
  /** Base directory for hand-authored assets. */
  assets: string;
  images: string;
  video: string;
  audio: string;
  fonts: string;
  /** Optional external Scene HTML fragments. */
  scenes: string;
  /** Provider outputs. */
  generated: string;
  /** Default render/export outputs. */
  renders: string;
  /** Cache directory (generation cache, thumbnails, waveforms). */
  cache: string;
}

export interface ProjectManifest {
  version: string;
  id?: string;
  title?: string;
  /** Canonical VHTML entry file, relative to the project root. */
  entry: string;
  /** Optional code-first source file. */
  source?: string;
  /**
   * Set by `vhtml split --detach`: the canonical `.vhtml` entry is now the
   * source of truth and `vhtml build` must not regenerate it from `source`.
   */
  detached?: boolean;
  paths: ProjectLayoutPaths;
  build?: {
    out?: string;
  };
  preview?: {
    port?: number;
    open?: boolean;
    chrome?: string;
  };
  export?: {
    outDir?: string;
    format?: string;
    width?: number;
    height?: number;
    fps?: string | number;
    crf?: number;
    preset?: string;
    captions?: boolean;
  };
  settings?: {
    allowRemoteAssets?: boolean;
    maxAssetSize?: number;
    frameTimeoutMs?: number;
  };
  requirements?: string[];
  /** Open extension data; tooling must ignore unknown keys. */
  [key: string]: unknown;
}

export interface ResolvedProjectInput {
  root: string;
  entry: string;
  manifest: ProjectManifest;
  manifestPath?: string;
  layout: ProjectLayoutPaths;
  source?: string;
}

export const DEFAULT_LAYOUT: ProjectLayoutPaths = {
  assets: 'assets',
  images: 'assets/images',
  video: 'assets/video',
  audio: 'assets/audio',
  fonts: 'assets/fonts',
  scenes: 'scenes',
  generated: 'generated',
  renders: 'renders',
  cache: '.vhtml/cache',
};

const LAYOUT_KEYS: Array<keyof ProjectLayoutPaths> = [
  'assets', 'images', 'video', 'audio', 'fonts', 'scenes', 'generated', 'renders', 'cache',
];

function normalizeRelative(value: string, what: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (!normalized) throw new VhtmlError(ErrorCode.VALIDATION_INVALID_VALUE, `${what} must not be empty`);
  if (path.isAbsolute(value) || normalized.startsWith('../') || normalized === '..') {
    throw new VhtmlError(
      ErrorCode.SECURITY_PATH_ESCAPE,
      `${what} must be relative to the project root (got "${value}")`,
    );
  }
  if (normalized.split('/').includes('..')) {
    throw new VhtmlError(
      ErrorCode.SECURITY_PATH_ESCAPE,
      `${what} must not escape the project root (got "${value}")`,
    );
  }
  return normalized;
}

export function defaultManifest(id?: string): ProjectManifest {
  return {
    version: MANIFEST_VERSION,
    id,
    entry: 'video.vhtml',
    source: 'video.ts',
    paths: { ...DEFAULT_LAYOUT },
    build: { out: 'video.vhtml' },
    preview: { port: 4173, open: true },
    export: { outDir: 'renders', format: 'mp4', crf: 20 },
  };
}

export function readManifest(root: string): { manifest: ProjectManifest; manifestPath?: string } {
  const manifestPath = path.join(root, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return { manifest: defaultManifest() };
  }
  let parsed: Partial<ProjectManifest>;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')) as Partial<ProjectManifest>;
  } catch (error) {
    throw new VhtmlError(
      ErrorCode.PARSE_INVALID_DOCUMENT,
      `invalid ${MANIFEST_FILENAME}: ${(error as Error).message}`,
    );
  }
  const paths: ProjectLayoutPaths = { ...DEFAULT_LAYOUT };
  for (const key of LAYOUT_KEYS) {
    const value = parsed.paths?.[key];
    if (typeof value === 'string' && value.trim()) {
      paths[key] = normalizeRelative(value, `paths.${key}`);
    }
  }
  const entry = normalizeRelative(String(parsed.entry ?? 'video.vhtml'), 'entry');
  const source = parsed.source ? normalizeRelative(String(parsed.source), 'source') : undefined;
  const manifest: ProjectManifest = {
    ...parsed,
    version: String(parsed.version ?? MANIFEST_VERSION),
    entry,
    source,
    paths,
  };
  if (manifest.version !== MANIFEST_VERSION) {
    throw new VhtmlError(
      ErrorCode.PARSE_UNSUPPORTED_VERSION,
      `${MANIFEST_FILENAME} declares version ${manifest.version}; this runtime implements ${MANIFEST_VERSION}`,
    );
  }
  return { manifest, manifestPath };
}

export function writeManifest(root: string, manifest: ProjectManifest): string {
  const file = path.join(root, MANIFEST_FILENAME);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
}

function findEntry(root: string): string | undefined {
  const candidates = ['video.vhtml', `${path.basename(root)}.vhtml`];
  for (const candidate of candidates) {
    const file = path.join(root, candidate);
    if (fs.existsSync(file)) return candidate;
  }
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.vhtml'))
    .map((entry) => entry.name);
  return entries.length === 1 ? entries[0] : undefined;
}

/**
 * Resolve a CLI/Studio input. Accepts a project directory, a `vhtml.json`, or a
 * `.vhtml` entry file. Relative asset URLs always resolve from the project root.
 */
export function resolveProjectInput(input?: string): ResolvedProjectInput {
  const target = path.resolve(input ?? process.cwd());
  if (!fs.existsSync(target)) {
    throw new VhtmlError(ErrorCode.IO_NOT_FOUND, `project not found: ${input ?? target}`);
  }
  const isDirectory = fs.statSync(target).isDirectory();
  const root = isDirectory ? target : path.dirname(target);
  const { manifest, manifestPath } = readManifest(root);
  const layout = { ...manifest.paths };
  let entry: string;
  if (isDirectory) {
    if (manifestPath && fs.existsSync(path.join(root, manifest.entry))) {
      entry = path.join(root, manifest.entry);
    } else {
      const found = findEntry(root);
      if (!found) {
        throw new VhtmlError(
          ErrorCode.IO_NOT_FOUND,
          `no VHTML entry in ${root}; expected ${manifest.entry} or a single .vhtml file`,
        );
      }
      entry = path.join(root, found);
    }
  } else {
    const name = path.basename(target);
    if (name === MANIFEST_FILENAME) {
      return resolveProjectInput(root);
    }
    entry = name.endsWith('.vhtml') ? target : path.join(root, manifest.entry);
    if (!fs.existsSync(entry)) {
      throw new VhtmlError(ErrorCode.IO_NOT_FOUND, `VHTML entry not found: ${entry}`);
    }
  }
  const source = manifest.source ? path.join(root, manifest.source) : undefined;
  return {
    root,
    entry,
    manifest,
    manifestPath,
    layout,
    source: source && fs.existsSync(source) ? source : undefined,
  };
}

export function ensureProjectLayout(root: string, manifest: ProjectManifest = defaultManifest()): ResolvedProjectInput {
  fs.mkdirSync(root, { recursive: true });
  for (const key of LAYOUT_KEYS) {
    fs.mkdirSync(path.join(root, manifest.paths[key]), { recursive: true });
  }
  writeManifest(root, manifest);
  return {
    root,
    entry: path.join(root, manifest.entry),
    manifest,
    manifestPath: path.join(root, MANIFEST_FILENAME),
    layout: { ...manifest.paths },
    source: manifest.source ? path.join(root, manifest.source) : undefined,
  };
}

/** Canonical cache path; legacy `.vhtml-cache/` is still read. */
export function cacheFilePath(root: string, layout: ProjectLayoutPaths = DEFAULT_LAYOUT): string {
  return path.join(root, layout.cache, 'generated.json');
}

/** RFC-0016 deterministic frame-cache directory (`.vhtml/cache/frames`). */
export function framesCacheDir(root: string, layout: ProjectLayoutPaths = DEFAULT_LAYOUT): string {
  return path.join(root, layout.cache, 'frames');
}

export function legacyCacheFilePath(root: string): string {
  return path.join(root, '.vhtml-cache', 'generated.json');
}

export function cacheCandidates(root: string, layout: ProjectLayoutPaths = DEFAULT_LAYOUT): string[] {
  const canonical = cacheFilePath(root, layout);
  const legacy = legacyCacheFilePath(root);
  return canonical === legacy ? [canonical] : [canonical, legacy];
}

export function defaultAssetDirectory(root: string, kind: string, layout: ProjectLayoutPaths = DEFAULT_LAYOUT): string {
  const key =
    kind === 'video' ? 'video' :
    kind === 'audio' ? 'audio' :
    kind === 'font' ? 'fonts' :
    'images';
  return path.join(root, layout[key]);
}

export function toPosixRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export function isInsideRoot(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function projectUrl(root: string, src: string): string {
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  const absolute = path.isAbsolute(src) ? src : path.resolve(root, src);
  const relative = toPosixRelative(root, absolute);
  return `/${relative.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

export function findManifestForDirectory(directory: string): string | undefined {
  const file = path.join(directory, MANIFEST_FILENAME);
  return fs.existsSync(file) ? file : undefined;
}
