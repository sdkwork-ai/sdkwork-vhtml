/**
 * Portable VHTML project packages (`*.vhtmlpkg`) built on ZIP.
 *
 * The package contains the manifest, entry, source, assets, Scenes and generated
 * outputs. Caches, renders and tool directories are excluded by default.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import {
  MANIFEST_FILENAME,
  cacheCandidates,
  defaultManifest,
  isInsideRoot,
  readManifest,
  resolveProjectInput,
  writeManifest,
  type ProjectManifest,
  type ResolvedProjectInput,
} from './manifest.ts';

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', '.git', '.hg', '.svn', '.vhtml', '.vhtml-cache', '.cache',
  '.vscode', '.idea', '.dsh',
]);
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db', 'vhtml.package.json', 'vhtml.generated.json']);

export interface PackOptions {
  root: string;
  entry: string;
  manifest?: ProjectManifest;
  out: string;
  includeGenerated?: boolean;
  includeRenders?: boolean;
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  signal?: AbortSignal;
}

export interface PackResult {
  path: string;
  files: number;
  sizeBytes: number;
  uncompressedBytes: number;
  manifest: ProjectManifest;
}

export interface PackageMetadata {
  schema: 'vhtml.package/1.1';
  name: string;
  entry: string;
  id?: string;
  packedAt: string;
  files: Array<{ path: string; size: number; sha256: string }>;
}

function walk(root: string, options: PackOptions): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (options.signal?.aborted) throw new Error('packing cancelled');
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        if (!options.includeRenders && (path.basename(entry.name) === 'renders' || path.basename(entry.name) === 'out' || path.basename(entry.name) === 'dist')) continue;
        if (options.includeGenerated === false && (entry.name === 'generated' || relative === 'generated')) continue;
        visit(absolute);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(entry.name)) continue;
        if (/^\.env(?:\.|$)/i.test(entry.name) || /\.(?:pem|key|p12|pfx)$/i.test(entry.name)) continue;
        if (entry.name.endsWith('.vhtmlpkg') || entry.name.endsWith('.tmp')) continue;
        if (!options.includeRenders && (relative.startsWith('renders/') || relative.startsWith('out/') || relative.startsWith('dist/'))) continue;
        if (options.includeGenerated === false && relative.startsWith('generated/')) continue;
        files.push(relative);
      }
    }
  };
  visit(root);
  return files;
}

function sha256(buffer: Uint8Array): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function packProject(options: PackOptions): PackResult {
  const root = path.resolve(options.root);
  const manifest = options.manifest ?? readManifest(root).manifest ?? defaultManifest();
  const entryRelative = path.relative(root, path.resolve(options.entry)).split(path.sep).join('/');
  if (!isInsideRoot(root, options.entry)) throw new Error(`entry is outside project root: ${options.entry}`);
  if (!manifest.entry) manifest.entry = entryRelative;
  const manifestPath = path.join(root, MANIFEST_FILENAME);
  const hadManifest = fs.existsSync(manifestPath);
  if (!hadManifest) {
    manifest.entry = entryRelative;
    manifest.id = manifest.id ?? path.basename(root);
    writeManifest(root, manifest);
  }

  const relativeFiles = walk(root, options);
  if (!relativeFiles.includes(manifest.entry) && !relativeFiles.includes(entryRelative)) {
    relativeFiles.push(entryRelative);
  }
  if (!relativeFiles.includes(MANIFEST_FILENAME)) relativeFiles.push(MANIFEST_FILENAME);

  const archive: Record<string, Uint8Array> = {};
  const metadata: PackageMetadata = {
    schema: 'vhtml.package/1.1',
    name: path.basename(root),
    entry: manifest.entry,
    id: manifest.id,
    packedAt: new Date().toISOString(),
    files: [],
  };
  let uncompressedBytes = 0;
  for (const relative of relativeFiles.sort()) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || !isInsideRoot(root, absolute)) continue;
    const data = fs.readFileSync(absolute);
    archive[relative] = new Uint8Array(data);
    metadata.files.push({ path: relative, size: data.length, sha256: sha256(data) });
    uncompressedBytes += data.length;
  }
  // Generated assets are file payloads; the cache/registry maps them back to
  // generation tasks. Ship a portable copy so an unpacked project previews
  // without re-running providers.
  if (options.includeGenerated !== false) {
    const cachePath = cacheCandidates(root, manifest.paths).find((candidate) => fs.existsSync(candidate));
    if (cachePath) {
      const registry = fs.readFileSync(cachePath);
      archive['vhtml.generated.json'] = new Uint8Array(registry);
      metadata.files.push({ path: 'vhtml.generated.json', size: registry.length, sha256: sha256(registry) });
      uncompressedBytes += registry.length;
    }
  }

  const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  archive['vhtml.package.json'] = new Uint8Array(metadataBytes);

  const zipped = zipSync(archive, { level: options.compressionLevel ?? 6 });
  const out = path.resolve(options.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zipped);
  return {
    path: out,
    files: Object.keys(archive).length,
    sizeBytes: zipped.length,
    uncompressedBytes,
    manifest,
  };
}

export interface UnpackOptions {
  outDir: string;
  force?: boolean;
}

export interface UnpackResult extends ResolvedProjectInput {
  files: number;
  sizeBytes: number;
}

export function unpackProject(packagePath: string, options: UnpackOptions): UnpackResult {
  const absolute = path.resolve(packagePath);
  if (!fs.existsSync(absolute)) throw new Error(`package not found: ${packagePath}`);
  const zip = fs.readFileSync(absolute);
  const entries = unzipSync(new Uint8Array(zip));
  const outDir = path.resolve(options.outDir);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length && !options.force) {
    throw new Error(`destination is not empty: ${outDir} (use --force)`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  let files = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const normalized = name.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error(`unsafe package entry: ${name}`);
    }
    const target = path.resolve(outDir, normalized);
    if (!isInsideRoot(outDir, target)) throw new Error(`unsafe package entry: ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    files += 1;
  }
  const registry = entries['vhtml.generated.json'];
  if (registry) {
    try {
      JSON.parse(Buffer.from(registry).toString('utf8').replace(/^\uFEFF/, ''));
    } catch (error) {
      throw new Error(`invalid vhtml.generated.json in package: ${(error as Error).message}`);
    }
    const layout = readManifest(outDir).manifest.paths;
    const cacheFile = path.join(outDir, layout.cache, 'generated.json');
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, registry);
  }
  const resolved = resolveProjectInput(outDir);
  return { ...resolved, files, sizeBytes: zip.length };
}

export function packageInfo(packagePath: string): PackageMetadata & { packages: string[] } {
  const entries = unzipSync(new Uint8Array(fs.readFileSync(path.resolve(packagePath))));
  const metadata = entries['vhtml.package.json'];
  if (!metadata) throw new Error('package has no vhtml.package.json');
  return {
    ...(JSON.parse(Buffer.from(metadata).toString('utf8')) as PackageMetadata),
    packages: Object.keys(entries),
  };
}
