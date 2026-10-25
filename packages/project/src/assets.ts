/**
 * External file management for VHTML projects.
 *
 * Inventories every referenced file (declared assets, Scene HTML, inline CSS,
 * project CSS, stylesheets, scripts, external Scenes and generation outputs),
 * detects missing/unused files and imports local files into the project layout.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFragment } from 'parse5';
import type { Asset, Project } from '@sdkwork/vhtml-core/model';
import { allClips } from '@sdkwork/vhtml-core/model';
import { ErrorCode, type Diagnostic } from '@sdkwork/vhtml-core/errors';
import { probeMedia } from '@sdkwork/vhtml-ffmpeg';
import {
  DEFAULT_LAYOUT,
  defaultAssetDirectory,
  isInsideRoot,
  toPosixRelative,
  type ProjectLayoutPaths,
} from './manifest.ts';

export type ReferenceOrigin =
  | 'asset'
  | 'scene-file'
  | 'scene-html'
  | 'scene-css'
  | 'project-css'
  | 'stylesheet'
  | 'project-script'
  | 'generation-output'
  | 'output-captions';

export interface AssetReference {
  /** Authored path or URL. */
  ref: string;
  /** Absolute path when the reference is a local file. */
  absolute?: string;
  /** Project-relative path when inside the root. */
  relative?: string;
  origin: ReferenceOrigin;
  /** Human-readable owner, e.g. scene:hero or asset:voice. */
  owner: string;
  exists: boolean;
  external: boolean;
  insideRoot: boolean;
  remote: boolean;
  kind: 'file' | 'url' | 'data';
  assetId?: string;
}

export interface AssetUsage {
  asset: Asset;
  exists: boolean;
  used: boolean;
  references: AssetReference[];
}

export interface AssetInventory {
  root: string;
  layout: ProjectLayoutPaths;
  references: AssetReference[];
  assets: AssetUsage[];
  missing: AssetReference[];
  external: AssetReference[];
  outsideRoot: AssetReference[];
  unused: AssetUsage[];
  summary: {
    references: number;
    local: number;
    missing: number;
    external: number;
    assets: number;
    unusedAssets: number;
  };
}

const DATA_PREFIXES = ['data:', 'blob:', 'about:', '#', 'mailto:', 'tel:', 'javascript:'];
const HTML_URL_ATTRIBUTES = new Set([
  'src', 'href', 'poster', 'data', 'xlink:href', 'formaction', 'action',
]);

function isExternalUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function stripQueryAndHash(value: string): string {
  return value.split('#')[0]!.split('?')[0]!;
}

function resolveAssetFile(root: string, src: string): string {
  const clean = stripQueryAndHash(src);
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw path */
  }
  return path.resolve(root, decoded);
}

function assetExists(root: string, src: string): boolean {
  if (/^(https?:|data:|blob:)/i.test(src)) return true;
  return fs.existsSync(resolveAssetFile(root, src));
}

function assetUrl(src: string): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  const match = /^([^?#]*)([?#].*)?$/.exec(src);
  const clean = match?.[1] ?? src;
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  return `/${decoded.split('/').map((part) => encodeURIComponent(part)).join('/')}${match?.[2] ?? ''}`;
}

function cssUrls(css: string): string[] {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]+))\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (value) urls.push(value);
  }
  const imports = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^)'";]+))/gi;
  while ((match = imports.exec(css)) !== null) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (value) urls.push(value);
  }
  return urls;
}

function srcsetUrls(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}

function resolveReference(root: string, baseDir: string, raw: string): {
  absolute?: string;
  relative?: string;
  external: boolean;
  insideRoot: boolean;
  remote: boolean;
  kind: AssetReference['kind'];
} {
  const value = raw.trim();
  if (!value || DATA_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { external: false, insideRoot: false, remote: false, kind: 'data' };
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
    return { external: true, insideRoot: false, remote: true, kind: 'url' };
  }
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    const absolute = path.resolve(value);
    const insideRoot = isInsideRoot(root, absolute);
    return {
      absolute,
      relative: insideRoot ? toPosixRelative(root, absolute) : undefined,
      external: false,
      insideRoot,
      remote: false,
      kind: 'file',
    };
  }
  if (isExternalUrl(value)) {
    return { external: true, insideRoot: false, remote: false, kind: 'url' };
  }
  const clean = stripQueryAndHash(value);
  if (!clean) return { external: false, insideRoot: false, remote: false, kind: 'data' };
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  let absolute: string;
  if (decoded.startsWith('/')) {
    absolute = path.resolve(root, `.${decoded}`);
  } else if (path.isAbsolute(decoded)) {
    absolute = path.resolve(decoded);
  } else {
    absolute = path.resolve(baseDir, decoded);
  }
  const insideRoot = isInsideRoot(root, absolute);
  return {
    absolute,
    relative: insideRoot ? toPosixRelative(root, absolute) : undefined,
    external: false,
    insideRoot,
    remote: false,
    kind: 'file',
  };
}

class InventoryBuilder {
  readonly references: AssetReference[] = [];
  readonly project: Project;
  readonly root: string;
  readonly layout: ProjectLayoutPaths;
  private readonly scannedCss = new Set<string>();
  constructor(project: Project, root: string, layout: ProjectLayoutPaths) {
    this.project = project;
    this.root = root;
    this.layout = layout;
  }

  add(raw: string, origin: ReferenceOrigin, owner: string, baseDir = this.root, assetId?: string): void {
    const value = raw.trim();
    if (!value) return;
    const resolved = resolveReference(this.root, baseDir, value);
    if (resolved.kind === 'data' && !value.startsWith('data:')) return;
    const exists = resolved.absolute ? fs.existsSync(resolved.absolute) : resolved.external;
    this.references.push({
      ref: value,
      absolute: resolved.absolute,
      relative: resolved.relative,
      origin,
      owner,
      exists,
      external: resolved.external,
      insideRoot: resolved.insideRoot,
      remote: resolved.remote,
      kind: resolved.kind,
      assetId,
    });
  }

  scanCss(css: string | undefined, origin: ReferenceOrigin, owner: string, baseDir: string): void {
    if (!css) return;
    for (const url of cssUrls(css)) this.add(url, origin, owner, baseDir);
  }

  /** Scan an external CSS file and recursively follow local @import files. */
  scanCssFile(href: string, baseDir: string, owner: string, origin: ReferenceOrigin = 'stylesheet'): void {
    const resolved = resolveReference(this.root, baseDir, href);
    if (!resolved.absolute || !resolved.insideRoot || !fs.existsSync(resolved.absolute)) return;
    const absolute = path.resolve(resolved.absolute);
    if (this.scannedCss.has(absolute)) return;
    this.scannedCss.add(absolute);
    let css: string;
    try {
      css = fs.readFileSync(absolute, 'utf8');
    } catch {
      return;
    }
    const cssDir = path.dirname(absolute);
    for (const url of cssUrls(css)) {
      this.add(url, origin, owner, cssDir);
      if (/\.css(?:[?#]|$)/i.test(url) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) {
        this.scanCssFile(url, cssDir, owner, origin);
      }
    }
  }

  scanHtml(html: string | undefined, owner: string, baseDir: string, origin: ReferenceOrigin = 'scene-html'): void {
    if (!html) return;
    const fragment = parseFragment(html);
    const stack = [...fragment.childNodes];
    while (stack.length) {
      const node = stack.pop()!;
      if (!('tagName' in node)) {
        if ('childNodes' in node) stack.push(...(node.childNodes as typeof stack));
        continue;
      }
      const tag = node.tagName.toLowerCase();
      for (const attribute of node.attrs) {
        const name = attribute.name.toLowerCase();
        if (name === 'style') {
          this.scanCss(attribute.value, origin, owner, baseDir);
        } else if (name === 'srcset' || name === 'imagesrcset') {
          for (const url of srcsetUrls(attribute.value)) this.add(url, origin, owner, baseDir);
        } else if (HTML_URL_ATTRIBUTES.has(name)) {
          this.add(attribute.value, origin, owner, baseDir);
          if (tag === 'link' && name === 'href') {
            const rel = node.attrs.find((candidate) => candidate.name.toLowerCase() === 'rel')?.value.toLowerCase() ?? '';
            if (rel.split(/\s+/).includes('stylesheet')) this.scanCssFile(attribute.value, baseDir, owner, 'stylesheet');
          }
        }
      }
      if (tag === 'style') {
        this.scanCss(textContent(node), 'scene-css', owner, baseDir);
      }
      if ('childNodes' in node) stack.push(...(node.childNodes as typeof stack));
    }
  }

  scanScriptTags(tags: string[] | undefined, owner: string): void {
    for (const tag of tags ?? []) {
      this.scanHtml(tag, owner, this.root, 'project-script');
    }
  }
}

function textContent(node: { childNodes?: unknown[] }): string {
  let text = '';
  for (const child of (node.childNodes ?? []) as Array<{ value?: string; childNodes?: unknown[] }>) {
    if (typeof child.value === 'string') text += child.value;
    else text += textContent(child);
  }
  return text;
}

function usedAssetIds(project: Project): Set<string> {
  const ids = new Set<string>();
  const addRef = (ref: string | undefined): void => {
    if (!ref) return;
    const bare = ref.replace(/^(asset|gen):/, '');
    ids.add(bare);
    ids.add(ref);
  };
  for (const located of allClips(project)) addRef(located.clip.ref);
  for (const task of project.generations) {
    for (const input of task.inputs) addRef(input.ref);
    for (const output of task.outputs) if (output.id) ids.add(output.id);
  }
  for (const asset of project.assets) {
    if (asset.generatedBy && project.timelines.some((timeline) =>
      timeline.tracks.some((track) => track.clips.some((clip) => clip.ref === `gen:${asset.generatedBy}`)))) {
      ids.add(asset.id);
      ids.add(asset.generatedBy);
    }
  }
  return ids;
}

export function collectAssetInventory(
  project: Project,
  root: string,
  layout: ProjectLayoutPaths = DEFAULT_LAYOUT,
): AssetInventory {
  const builder = new InventoryBuilder(project, path.resolve(root), layout);
  const used = usedAssetIds(project);
  const assetReferences = new Map<string, AssetReference[]>();

  for (const asset of project.assets) {
    const before = builder.references.length;
    builder.add(asset.src, 'asset', `asset:${asset.id}`, root, asset.id);
    const refs = builder.references.slice(before);
    assetReferences.set(asset.id, refs);
  }

  for (const scene of project.scenes) {
    const owner = `scene:${scene.id}`;
    let baseDir = root;
    if (scene.src) {
      const external = resolveReference(root, root, scene.src);
      builder.add(scene.src, 'scene-file', owner, root);
      if (external.absolute) baseDir = path.dirname(external.absolute);
    }
    builder.scanHtml(scene.html, owner, baseDir, 'scene-html');
    builder.scanCss(scene.css, 'scene-css', owner, baseDir);
  }
  for (const [index, css] of project.styles.entries()) {
    builder.scanCss(css, 'project-css', `project.style[${index}]`, root);
  }
  for (const href of project.stylesheets ?? []) {
    builder.add(href, 'stylesheet', 'project.stylesheet', root);
    builder.scanCssFile(href, root, 'project.stylesheet', 'stylesheet');
  }
  builder.scanScriptTags(project.scripts, 'project.script');
  for (const task of project.generations) {
    for (const output of task.outputs) {
      if (output.path) builder.add(output.path, 'generation-output', `generation:${task.id}`, root);
    }
  }
  for (const output of project.outputs) {
    if (output.captionsPath) builder.add(output.captionsPath, 'output-captions', `output:${output.id}`, root);
  }

  const assets: AssetUsage[] = project.assets.map((asset) => ({
    asset,
    exists: assetExists(root, asset.src),
    used: used.has(asset.id) || used.has(asset.src),
    references: assetReferences.get(asset.id) ?? [],
  }));
  const missing = builder.references.filter((ref) => !ref.external && ref.kind === 'file' && !ref.exists);
  const external = builder.references.filter((ref) => ref.external);
  const outsideRoot = builder.references.filter((ref) => ref.kind === 'file' && ref.absolute && !ref.insideRoot);
  const unused = assets.filter((entry) => !entry.used && !entry.asset.generatedBy);
  return {
    root: path.resolve(root),
    layout,
    references: builder.references,
    assets,
    missing,
    external,
    outsideRoot,
    unused,
    summary: {
      references: builder.references.length,
      local: builder.references.filter((ref) => ref.kind === 'file').length,
      missing: missing.length,
      external: external.length,
      assets: assets.length,
      unusedAssets: unused.length,
    },
  };
}

export interface InventoryVerificationOptions {
  allowRemote?: boolean;
}

export function verifyAssetInventory(
  inventory: AssetInventory,
  options: InventoryVerificationOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const ref of inventory.missing) {
    diagnostics.push({
      code: ErrorCode.ASSET_NOT_FOUND,
      severity: 'error',
      message: `missing ${ref.origin} file "${ref.ref}" (referenced by ${ref.owner})`,
      objectId: ref.assetId,
      detail: { origin: ref.origin, owner: ref.owner },
    });
  }
  for (const ref of inventory.outsideRoot) {
    diagnostics.push({
      code: ErrorCode.SECURITY_PATH_ESCAPE,
      severity: 'error',
      message: `${ref.origin} reference escapes the project root: "${ref.ref}" (${ref.owner})`,
      objectId: ref.assetId,
    });
  }
  for (const ref of inventory.external) {
    diagnostics.push({
      code: ErrorCode.SECURITY_NETWORK_BLOCKED,
      severity: options.allowRemote ? 'info' : 'warning',
      message: `external ${ref.origin} reference "${ref.ref}" (${ref.owner}) is not portable; download it into the project`,
      objectId: ref.assetId,
    });
  }
  for (const entry of inventory.unused) {
    diagnostics.push({
      code: ErrorCode.ASSET_UNAVAILABLE,
      severity: 'info',
      message: `asset "${entry.asset.id}" is declared but not referenced by any clip or generation`,
      objectId: entry.asset.id,
    });
  }
  return diagnostics;
}

const EXTENSION_KINDS: Record<string, Asset['kind']> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', avif: 'image', gif: 'image', bmp: 'image',
  svg: 'svg',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio',
  vtt: 'captions', srt: 'captions',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font',
  json: 'data', csv: 'data', txt: 'data',
};

export function assetKindFromFilename(filename: string): Asset['kind'] | undefined {
  const extension = path.extname(filename).slice(1).toLowerCase();
  return EXTENSION_KINDS[extension];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  ogg: 'audio/ogg', opus: 'audio/ogg', vtt: 'text/vtt', srt: 'application/x-subrip',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

function hashBytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function slugify(value: string): string {
  const base = path.basename(value, path.extname(value))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'asset';
}

function uniqueAssetId(project: Project, base: string): string {
  const used = new Set<string>();
  used.add(project.id);
  for (const asset of project.assets) used.add(asset.id);
  for (const scene of project.scenes) used.add(scene.id);
  for (const timeline of project.timelines) {
    used.add(timeline.id);
    for (const track of timeline.tracks) {
      used.add(track.id);
      for (const clip of track.clips) used.add(clip.id);
    }
  }
  for (const task of project.generations) used.add(task.id);
  for (const output of project.outputs) used.add(output.id);
  let id = base;
  let counter = 2;
  while (used.has(id)) id = `${base}-${counter++}`;
  return id;
}

function uniqueFilename(directory: string, filename: string): string {
  const extension = path.extname(filename);
  const base = path.basename(filename, extension);
  let candidate = filename;
  let counter = 2;
  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${base}-${counter++}${extension}`;
  }
  return candidate;
}

function svgDimensions(content: string): { width?: number; height?: number } {
  const width = /<svg[^>]*\bwidth=["']?(\d+(?:\.\d+)?)/i.exec(content);
  const height = /<svg[^>]*\bheight=["']?(\d+(?:\.\d+)?)/i.exec(content);
  return {
    width: width ? Math.round(Number(width[1])) : undefined,
    height: height ? Math.round(Number(height[1])) : undefined,
  };
}

export interface ImportAssetOptions {
  project: Project;
  root: string;
  layout?: ProjectLayoutPaths;
  /** Source file on disk. */
  sourcePath?: string;
  /** Raw bytes (Studio upload). */
  data?: Buffer;
  /** Original filename; required with `data`. */
  filename: string;
  /** Optional explicit asset id. */
  id?: string;
  /** Destination directory, relative to the project root. */
  destination?: string;
  /** Skip overwriting and reuse an existing asset with the same hash. */
  dedupe?: boolean;
  /** Copy instead of move (source is never deleted by import). */
  probe?: boolean;
}

export async function importAssetFile(options: ImportAssetOptions): Promise<Asset> {
  const root = path.resolve(options.root);
  const layout = options.layout ?? DEFAULT_LAYOUT;
  const filename = path.basename(options.filename);
  const kind = assetKindFromFilename(filename);
  if (!kind) throw new Error(`unsupported asset extension: ${filename}`);
  if (!options.data && !options.sourcePath) throw new Error('import requires sourcePath or data');
  const bytes = options.data ?? fs.readFileSync(options.sourcePath!);
  if (bytes.length === 0) throw new Error(`cannot import empty file: ${filename}`);
  const hash = hashBytes(bytes);
  if (options.dedupe !== false) {
    const existing = options.project.assets.find(
      (asset) => asset.hash === hash && assetExists(root, asset.src),
    );
    if (existing) return existing;
  }

  if (options.id && options.project.assets.some((asset) => asset.id === options.id)) {
    throw new Error(`asset id already exists: ${options.id}`);
  }
  const destinationDir = options.destination
    ? path.resolve(root, options.destination)
    : defaultAssetDirectory(root, kind, layout);
  if (!isInsideRoot(root, destinationDir)) {
    throw new Error(`asset destination escapes project root: ${options.destination}`);
  }
  fs.mkdirSync(destinationDir, { recursive: true });
  const targetName = uniqueFilename(destinationDir, filename);
  const target = path.join(destinationDir, targetName);
  fs.writeFileSync(target, bytes);

  let duration: Asset['duration'];
  let width: number | undefined;
  let height: number | undefined;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  if (options.probe !== false && kind !== 'svg' && kind !== 'font' && kind !== 'data') {
    try {
      const probe = await probeMedia(target);
      if (probe.durationSeconds > 0) {
        duration = { num: Math.round(probe.durationSeconds * 1_000_000), den: 1_000_000 };
      }
      width = probe.video?.width;
      height = probe.video?.height;
      sampleRate = probe.audio?.sampleRate;
      channels = probe.audio?.channels;
    } catch {
      /* probe is best effort; validation reports decode failures later */
    }
  }
  if (kind === 'svg') {
    const dims = svgDimensions(bytes.toString('utf8'));
    width = dims.width;
    height = dims.height;
  }
  const id = options.id ?? uniqueAssetId(options.project, `asset-${slugify(targetName)}`);
  return {
    id,
    kind,
    src: toPosixRelative(root, target),
    mimeType: MIME_BY_EXTENSION[path.extname(target).slice(1).toLowerCase()],
    duration,
    width,
    height,
    sampleRate,
    channels,
    hash,
    size: bytes.length,
    provenance: { source: 'file' },
  };
}

export function relinkAsset(project: Project, root: string, assetId: string, nextSrc: string): Asset {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`asset not found: ${assetId}`);
  const resolved = resolveReference(root, root, nextSrc);
  if (!resolved.absolute || !resolved.insideRoot) {
    throw new Error(`asset path must stay inside the project root: ${nextSrc}`);
  }
  if (!fs.existsSync(resolved.absolute)) {
    throw new Error(`asset file not found: ${nextSrc}`);
  }
  asset.src = resolved.relative ?? nextSrc;
  return asset;
}

export function assetUsageMap(inventory: AssetInventory): Map<string, number> {
  const usage = new Map<string, number>();
  for (const ref of inventory.references) {
    if (!ref.assetId) continue;
    usage.set(ref.assetId, (usage.get(ref.assetId) ?? 0) + 1);
  }
  return usage;
}

export function assetsForStudio(project: Project, root: string, layout: ProjectLayoutPaths = DEFAULT_LAYOUT): {
  assets: Array<Asset & { used: boolean; exists: boolean; url: string; relative: string }>;
  missing: number;
  unused: number;
} {
  const inventory = collectAssetInventory(project, root, layout);
  const used = new Set(inventory.assets.filter((entry) => entry.used).map((entry) => entry.asset.id));
  const htmlPaths = new Set(
    inventory.references
      .filter((reference) => !reference.assetId && reference.relative)
      .map((reference) => reference.relative!),
  );
  return {
    assets: project.assets.map((asset) => ({
      ...asset,
      relative: asset.src,
      url: assetUrl(asset.src),
      exists: /^(https?:|data:)/i.test(asset.src) ? true : fs.existsSync(resolveAssetFile(root, asset.src)),
      used: used.has(asset.id) || htmlPaths.has(asset.src),
    })),
    missing: inventory.missing.length,
    unused: inventory.unused.length,
  };
}

export function ensureAssetLayout(root: string, layout: ProjectLayoutPaths): void {
  for (const directory of [layout.assets, layout.images, layout.video, layout.audio, layout.fonts, layout.scenes]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
}
