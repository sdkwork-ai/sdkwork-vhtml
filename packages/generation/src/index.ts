/**
 * VHTML Generation Tasks and provider adapters.
 *
 * Providers materialise task outputs into project-relative files and register
 * them as Assets with provenance. Cached results are reused unless --force.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runTool, ffmpegPath, probeMedia } from '@sdkwork/vhtml-ffmpeg';
import { generationKindToAssetKind, resolveReference, type Asset, type BibleProfile, type GenerationKind, type GenerationQuota, type GenerationTask, type GenerationUsage, type Project } from '@sdkwork/vhtml-core/model';
import { ErrorCode, VhtmlError } from '@sdkwork/vhtml-core/errors';
import { formatRate, toNumber } from '@sdkwork/vhtml-core/time';
import { cacheCandidates, cacheFilePath, DEFAULT_LAYOUT, legacyCacheFilePath } from '@sdkwork/vhtml-project/manifest';
import { bibleInputsFor } from './vendors.ts';

export interface GenerationRequest {
  task: GenerationTask;
  project: Project;
  root: string;
  outputDir: string;
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
  sampleRate: number;
  seed: number;
  signal?: AbortSignal;
  onProgress?: (message: string, percent?: number) => void;
}

export interface GeneratedFile {
  path: string;
  kind: Asset['kind'];
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  metadata?: Record<string, string>;
}

/**
 * What a provider run produced. Returning a bare `GeneratedFile[]` stays
 * valid; providers MAY return this envelope instead to report usage
 * (RFC-0013) or a provider job id alongside the files.
 */
export interface GenerationRun {
  files: GeneratedFile[];
  /** Provider-reported consumption; observed facts are merged over it. */
  usage?: GenerationUsage;
  providerJobId?: string;
}

export interface GenerationProviderCapabilities {
  kinds: GenerationKind[];
  models?: string[];
  inputRoles?: string[];
  outputs?: Asset['kind'][];
  supportsSeed?: boolean;
  supportsAsync?: boolean;
  maxDurationSeconds?: number;
  notes?: string;
}

export interface GenerationProvider {
  id: string;
  kinds: GenerationKind[];
  capabilities?: GenerationProviderCapabilities;
  generate(request: GenerationRequest): Promise<GeneratedFile[] | GenerationRun>;
}

export interface CacheEntry {
  key: string;
  file: string;
  asset: Asset;
  /** All assets for a multi-output task; `asset` is the first for compatibility. */
  assets?: Asset[];
  provider: string;
  model?: string;
  createdAt: string;
  hash?: string;
}

export interface GenerationCache {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export interface GenerateOptions {
  project: Project;
  root: string;
  taskIds?: string[];
  provider?: string;
  force?: boolean;
  signal?: AbortSignal;
  failFast?: boolean;
  onProgress?: (event: { taskId: string; message: string; percent?: number }) => void;
  cachePath?: string;
  /** Output directory relative to the project root; defaults to `generated`. */
  generatedDir?: string;
  /** Spending ceiling enforced before each provider call (RFC-0013). */
  quota?: GenerationQuota;
  /**
   * Provider list overriding the built-in registry; the first provider whose
   * `id` matches the task wins. Hosts and tests inject fake providers here.
   */
  providers?: GenerationProvider[];
}

export interface GenerationUsageSummary {
  cost?: number;
  currency?: string;
  credits?: number;
  tokens?: number;
  computeSeconds?: number;
  outputBytes?: number;
  /** Per-task usage records collected during the run. */
  tasks: Array<{ taskId: string; usage: GenerationUsage }>;
}

export interface GenerateResult {
  project: Project;
  cachePath: string;
  ran: string[];
  skipped: string[];
  failed: Array<{ taskId: string; message: string }>;
  issues: string[];
  /** Observed + provider-reported consumption across the run (RFC-0013). */
  usage?: GenerationUsageSummary;
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const BIBLE_REF = /^(character|style):(.+)$/;

function hashFile(file: string): string | undefined {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return undefined;
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'generated';
}

function colorsFromSeed(seed: number): string[] {
  const palette: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const hue = (seed * (index + 1) * 47) % 360;
    const saturation = 55 + ((seed >> (index * 3)) % 35);
    const lightness = 28 + ((seed >> (index * 2)) % 28);
    palette.push(hslToHex(hue, saturation, lightness));
  }
  return palette;
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  const channel = (value: number): string =>
    Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function outputFile(request: GenerationRequest, extension: string): string {
  fs.mkdirSync(request.outputDir, { recursive: true });
  const explicit = request.task.outputs[0]?.path;
  if (explicit) {
    const target = path.resolve(request.root, explicit);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
  }
  return path.join(request.outputDir, `${sanitizeId(request.task.id)}${extension}`);
}

/** Deterministic local provider: SVG images, gradient videos, synthesised audio. */
export const proceduralProvider: GenerationProvider = {
  id: 'procedural',
  kinds: ['image', 'video', 'audio', 'music', 'sfx', 'text'],
  capabilities: {
    kinds: ['image', 'video', 'audio', 'music', 'sfx', 'text'],
    outputs: ['image', 'video', 'audio', 'data'],
    supportsSeed: true,
    supportsAsync: false,
    notes: 'offline deterministic gradients, tones and text',
  },
  async generate(request: GenerationRequest): Promise<GeneratedFile[]> {
    const seed = hashText(`${request.task.id}:${request.task.prompt}:${request.seed}`).slice(0, 8);
    const numericSeed = Number.parseInt(seed, 16) || 1;
    const colors = colorsFromSeed(numericSeed);
    const { task } = request;
    if (task.kind === 'image') {
      const width = request.width;
      const height = request.height;
      const file = outputFile(request, '.svg');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset="0.45" stop-color="${colors[1]}"/>
      <stop offset="1" stop-color="${colors[2]}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.7" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${colors[3]}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${colors[3]}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="${Math.max(8, width / 40)}"/></filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${numericSeed % 1000}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.08"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <ellipse cx="${width * 0.72}" cy="${height * 0.32}" rx="${width * 0.42}" ry="${height * 0.5}" fill="url(#r)" filter="url(#blur)"/>
  <circle cx="${width * 0.24}" cy="${height * 0.72}" r="${Math.min(width, height) * 0.18}" fill="${colors[2]}" opacity="0.55" filter="url(#blur)"/>
  <path d="M 0 ${height * 0.82} Q ${width * 0.3} ${height * 0.6} ${width * 0.55} ${height * 0.84} T ${width} ${height * 0.75} V ${height} H 0 Z" fill="${colors[0]}" opacity="0.55"/>
  <rect width="100%" height="100%" filter="url(#grain)" opacity="0.5"/>
</svg>`;
      fs.writeFileSync(file, svg, 'utf8');
      return [{ path: file, kind: 'image', mimeType: 'image/svg+xml', width, height }];
    }
    if (task.kind === 'video') {
      const file = outputFile(request, '.mp4');
      const duration = Math.max(0.2, request.durationSeconds);
      const fps = Math.max(1, Math.round(request.frameRate));
      const width = request.width - (request.width % 2);
      const height = request.height - (request.height % 2);
      const type = ['linear', 'radial', 'circular', 'spiral', 'square'][numericSeed % 5] ?? 'linear';
      const speed = (0.005 + (numericSeed % 20) / 1000).toFixed(4);
      await runTool(
        ffmpegPath(),
        [
          '-nostdin', '-hide_banner', '-v', 'error', '-y',
          '-f', 'lavfi',
          '-i', `gradients=s=${width}x${height}:r=${fps}:c0=${colors[0]}:c1=${colors[1]}:c2=${colors[2]}:c3=${colors[3]}:n=4:type=${type}:speed=${speed}:seed=${numericSeed % 100000}:d=${duration.toFixed(3)}`,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart', '-t', duration.toFixed(3), file,
        ],
        { timeoutMs: 300_000, signal: request.signal },
      );
      return [{
        path: file,
        kind: 'video',
        mimeType: 'video/mp4',
        width,
        height,
        durationSeconds: duration,
      }];
    }
    if (task.kind === 'audio' || task.kind === 'music' || task.kind === 'sfx') {
      const file = outputFile(request, '.wav');
      const duration = Math.max(0.2, request.durationSeconds);
      const root = 130 + (numericSeed % 60);
      const frequencies = [root, root * 1.25, root * 1.5];
      const inputs = frequencies.flatMap((frequency) => [
        '-f', 'lavfi', '-i', `sine=frequency=${frequency.toFixed(2)}:duration=${duration.toFixed(3)}:sample_rate=${request.sampleRate}`,
      ]);
      const labels = frequencies.map((_, index) => `[${index}:a]`).join('');
      const fadeIn = Math.min(0.6, duration / 2);
      const fadeOut = Math.min(0.8, duration / 2);
      const fadeOutStart = Math.max(0, duration - fadeOut);
      const filter = `${labels}amix=inputs=${frequencies.length}:normalize=1,afade=t=in:d=${fadeIn.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)},volume=0.9,loudnorm=I=-16:TP=-1.5:LRA=11`;
      await runTool(
        ffmpegPath(),
        [
          '-nostdin', '-hide_banner', '-v', 'error', '-y',
          ...inputs,
          '-filter_complex', filter,
          '-ac', '2', '-ar', String(request.sampleRate), '-c:a', 'pcm_f32le', file,
        ],
        { timeoutMs: 120_000, signal: request.signal },
      );
      return [{
        path: file,
        kind: 'audio',
        mimeType: 'audio/wav',
        durationSeconds: duration,
        sampleRate: request.sampleRate,
        channels: 2,
      }];
    }
    if (task.kind === 'text') {
      const file = outputFile(request, '.txt');
      fs.writeFileSync(file, task.prompt, 'utf8');
      return [{ path: file, kind: 'data', mimeType: 'text/plain' }];
    }
    throw new VhtmlError(
      ErrorCode.GENERATION_CAPABILITY_MISSING,
      `the procedural provider cannot generate "${task.kind}"; use an HTTP or manifest provider`,
    );
  },
};

/** Manifest provider: maps task ids to pre-generated files. */
export const manifestProvider: GenerationProvider = {
  id: 'manifest',
  kinds: ['image', 'video', 'audio', 'music', 'speech', 'sfx', 'text', 'edit', 'avatar', 'lipsync', 'dub', 'matte', 'translation', 'storyboard'],
  capabilities: {
    kinds: ['image', 'video', 'audio', 'music', 'speech', 'sfx', 'text', 'edit', 'avatar', 'lipsync', 'dub', 'matte', 'translation', 'storyboard'],
    inputRoles: ['reference-image', 'reference-video', 'reference-audio', 'first-frame', 'last-frame', 'mask', 'voice', 'music', 'script'],
    supportsSeed: false,
    supportsAsync: false,
    notes: 'maps task ids to pre-generated files; deterministic for a fixed manifest',
  },
  async generate(request: GenerationRequest): Promise<GeneratedFile[]> {
    const manifestPath = String(
      request.task.params.manifest ??
      process.env.VHTML_MANIFEST ??
      path.join(request.root, 'vhtml-manifest.json'),
    );
    const resolved = path.isAbsolute(manifestPath) ? manifestPath : path.resolve(request.root, manifestPath);
    if (!fs.existsSync(resolved)) {
      throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, `manifest not found: ${resolved}`);
    }
    type ManifestEntry = string | { file: string; kind?: Asset['kind']; mimeType?: string; role?: string };
    const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '')) as Record<string, ManifestEntry | ManifestEntry[]>;
    const entry = manifest[request.task.id];
    if (!entry) {
      throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, `manifest has no entry for task "${request.task.id}"`);
    }
    return (Array.isArray(entry) ? entry : [entry]).map((item): GeneratedFile => {
      const file = typeof item === 'string' ? item : item.file;
      const absolute = path.isAbsolute(file) ? file : path.resolve(path.dirname(resolved), file);
      if (!fs.existsSync(absolute)) {
        throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, `manifest output missing: ${absolute}`);
      }
      return {
        path: absolute,
        kind: typeof item === 'object' && item.kind ? item.kind : generationKindToAssetKind(request.task.kind),
        mimeType: typeof item === 'object' ? item.mimeType : undefined,
        metadata: typeof item === 'object' && item.role ? { role: item.role } : undefined,
      };
    });
  },
};

async function downloadFile(url: string, target: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
}

/** Generic HTTP provider. The endpoint contract is documented in specification/generation.md. */
export const httpProvider: GenerationProvider = {
  id: 'http',
  kinds: ['image', 'video', 'audio', 'music', 'speech', 'sfx', 'text', 'edit', 'avatar', 'lipsync', 'dub', 'matte', 'translation', 'storyboard'],
  capabilities: {
    kinds: ['image', 'video', 'audio', 'music', 'speech', 'sfx', 'text', 'edit', 'avatar', 'lipsync', 'dub', 'matte', 'translation', 'storyboard'],
    inputRoles: ['reference-image', 'reference-video', 'reference-audio', 'first-frame', 'last-frame', 'mask', 'voice', 'music', 'script', 'character', 'style'],
    supportsSeed: true,
    supportsAsync: true,
    notes: 'vendor-neutral POST /generate + statusUrl contract',
  },
  async generate(request: GenerationRequest): Promise<GeneratedFile[]> {
    const endpoint =
      String(request.task.params.endpoint ?? process.env.VHTML_PROVIDER_URL ?? '');
    if (!endpoint) {
      throw new VhtmlError(
        ErrorCode.GENERATION_PROVIDER_NOT_FOUND,
        'HTTP provider requires VHTML_PROVIDER_URL or task params.endpoint',
      );
    }
    const token = process.env.VHTML_PROVIDER_TOKEN;
    const payload = {
      schema: 'vhtml.generation/1.1',
      taskId: request.task.id,
      kind: request.task.kind,
      prompt: request.task.prompt,
      negativePrompt: request.task.negativePrompt,
      model: request.task.model,
      constraints: request.task.constraints,
      params: request.task.params,
      direction: request.task.direction,
      inputs: resolvedGenerationInputs(request.project, request.task),
      rights: request.task.rights,
      safety: request.task.safety,
      seed: request.seed,
    };
    let response: Response | undefined;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(`${endpoint.replace(/\/$/, '')}/generate`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: request.signal,
        });
        if (response.ok) break;
        lastError = new Error(`provider HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      } catch (error) {
        lastError = error as Error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!response || !response.ok) {
      throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, lastError?.message ?? 'provider request failed');
    }
    let result = (await response.json()) as {
      jobId?: string;
      statusUrl?: string;
      outputs?: Array<{ url?: string; base64?: string; path?: string; mimeType?: string; kind?: Asset['kind']; width?: number; height?: number; durationSeconds?: number; sampleRate?: number; channels?: number }>;
    };
    if (result.jobId && result.statusUrl) {
      const statusUrl = new URL(result.statusUrl, endpoint).toString();
      for (let poll = 0; poll < 600; poll += 1) {
        if (request.signal?.aborted) throw new VhtmlError(ErrorCode.GENERATION_CANCELLED, 'generation cancelled');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusResponse = await fetch(statusUrl, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          signal: request.signal,
        });
        if (!statusResponse.ok) continue;
        const status = (await statusResponse.json()) as typeof result & { status?: string; error?: string };
        request.onProgress?.(`job ${result.jobId}: ${status.status ?? 'running'}`);
        if (status.status === 'failed') {
          throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, status.error ?? 'provider job failed');
        }
        if (status.outputs) {
          result = status;
          break;
        }
      }
    }
    if (!result.outputs?.length) {
      throw new VhtmlError(ErrorCode.GENERATION_INVALID_OUTPUT, 'provider returned no outputs');
    }
    const files: GeneratedFile[] = [];
    let index = 0;
    for (const output of result.outputs) {
      const kind = output.kind ?? generationKindToAssetKind(request.task.kind);
      const extension =
        kind === 'video' ? '.mp4' :
        kind === 'audio' ? '.wav' :
        kind === 'image' ? '.png' :
        kind === 'svg' ? '.svg' : '.bin';
      const target =
        index === 0
          ? outputFile(request, extension)
          : path.join(request.outputDir, `${sanitizeId(request.task.id)}-${index + 1}${extension}`);
      if (output.url) await downloadFile(new URL(output.url, endpoint).toString(), target, request.signal);
      else if (output.base64) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(output.base64, 'base64'));
      } else if (output.path) {
        const source = path.isAbsolute(output.path) ? output.path : path.resolve(request.root, output.path);
        fs.copyFileSync(source, target);
      } else {
        throw new VhtmlError(ErrorCode.GENERATION_INVALID_OUTPUT, 'provider output has no url, base64 or path');
      }
      files.push({
        path: target,
        kind,
        mimeType: output.mimeType,
        width: output.width,
        height: output.height,
        durationSeconds: output.durationSeconds,
        sampleRate: output.sampleRate,
        channels: output.channels,
      });
      index += 1;
    }
    return files;
  },
};

export const providers: GenerationProvider[] = [proceduralProvider, manifestProvider, httpProvider];

export function providerCatalog(): Array<{
  id: string;
  kinds: GenerationKind[];
  capabilities: GenerationProviderCapabilities;
}> {
  return providers.map((provider) => ({
    id: provider.id,
    kinds: provider.kinds,
    capabilities: provider.capabilities ?? { kinds: provider.kinds },
  }));
}

export function getProvider(id: string): GenerationProvider | undefined {
  return providers.find((provider) => provider.id === id);
}

function cacheKeyFor(project: Project, task: GenerationTask, provider: string, root: string): string {
  const inputs = task.inputs.map((input) => {
    const asset = project.assets.find(
      (candidate) => candidate.id === input.ref || candidate.id === input.ref.replace(/^(asset|gen):/, ''),
    );
    const file = asset ? path.resolve(root, asset.src) : undefined;
    return [input.ref, file && fs.existsSync(file) ? hashFile(file) : undefined];
  });
  // Bible inputs participate through their full profile (RFC-0014): bumping a
  // bible's version or editing its description must invalidate cached outputs.
  const bibles = bibleInputsFor(task, project).map(([, bible]) => ({
    kind: bible.kind,
    id: bible.id,
    version: bible.version,
    description: bible.description,
    negative: bible.negative,
    references: bible.references.map((reference) => {
      const asset = project.assets.find(
        (candidate) => candidate.id === reference.ref || candidate.id === reference.ref.replace(/^(asset|gen):/, ''),
      );
      const file = asset ? path.resolve(root, asset.src) : undefined;
      return [reference.ref, reference.role, file && fs.existsSync(file) ? hashFile(file) : undefined];
    }),
  }));
  return hashText(JSON.stringify({
    task: {
      id: task.id,
      kind: task.kind,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      inputs,
      bibles,
      constraints: task.constraints,
      params: task.params,
      direction: task.direction,
      rights: task.rights,
      safety: task.safety,
      provider: task.provider,
      model: task.model,
    },
    provider,
    version: '1.1.0',
  }));
}

export { bibleInputsFor };

function loadCache(file: string): GenerationCache {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(text) as GenerationCache;
    if (parsed && parsed.version === 1 && parsed.entries) return parsed;
  } catch {
    /* ignore */
  }
  return { version: 1, entries: {} };
}

function writeCache(file: string, cache: GenerationCache): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function assetIdFor(taskId: string, index: number): string {
  return index === 0 ? `gen:${taskId}` : `gen:${taskId}:${index}`;
}

/**
 * Return tasks in dependency order. Generation inputs may reference another
 * task as `gen:<id>` or by bare task id; cycles are rejected before any provider
 * receives work. Selecting task ids automatically includes their dependencies.
 */
export function orderGenerationTasks(project: Project, taskIds?: string[]): GenerationTask[] {
  const byId = new Map(project.generations.map((task) => [task.id, task]));
  if (new Set(byId.keys()).size !== project.generations.length) {
    throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, 'duplicate generation task ids');
  }
  const selected = taskIds ? new Set(taskIds) : undefined;
  if (selected) {
    for (const id of selected) {
      if (!byId.has(id)) {
        throw new VhtmlError(ErrorCode.GENERATION_TASK_NOT_FOUND, `generation task "${id}" does not exist`);
      }
    }
  }
  const state = new Map<string, 0 | 1 | 2>();
  const ordered: GenerationTask[] = [];
  const stack: string[] = [];

  const visit = (task: GenerationTask): void => {
    const status = state.get(task.id) ?? 0;
    if (status === 2) return;
    if (status === 1) {
      const cycle = [...stack.slice(stack.indexOf(task.id)), task.id].join(' -> ');
      throw new VhtmlError(ErrorCode.GENERATION_DEPENDENCY_CYCLE, `generation dependency cycle: ${cycle}`);
    }
    state.set(task.id, 1);
    stack.push(task.id);
    for (const input of task.inputs) {
      const ref = input.ref.startsWith('gen:') ? input.ref.slice(4) : input.ref;
      const dependency = byId.get(ref);
      if (dependency) visit(dependency);
    }
    stack.pop();
    state.set(task.id, 2);
    ordered.push(task);
  };

  for (const task of project.generations) {
    if (!selected || selected.has(task.id) || ordered.some((candidate) => candidate.id === task.id)) {
      visit(task);
    }
  }
  // Tasks pulled in as dependencies are already in `ordered`; preserve the
  // selected closure when taskIds is provided.
  if (selected) {
    const included = new Set(ordered.map((task) => task.id));
    for (const id of selected) {
      if (!included.has(id)) visit(byId.get(id)!);
    }
  }
  return ordered;
}

export async function materializeGenerations(options: GenerateOptions): Promise<GenerateResult> {
  const project = structuredClone(options.project);
  const root = path.resolve(options.root);
  const canonicalCache = cacheFilePath(root);
  const legacyCache = legacyCacheFilePath(root);
  let cachePath =
    options.cachePath ??
    (fs.existsSync(canonicalCache)
      ? canonicalCache
      : fs.existsSync(legacyCache)
        ? legacyCache
        : canonicalCache);
  if (!fs.existsSync(cachePath) && fs.existsSync(legacyCache) && cachePath !== legacyCache) {
    cachePath = legacyCache;
  }
  const cache = loadCache(cachePath);
  const issues: string[] = [];
  const ran: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ taskId: string; message: string }> = [];
  const orderedTasks = orderGenerationTasks(project, options.taskIds);
  const generatedDir = path.join(root, options.generatedDir ?? 'generated');
  // RFC-0013 usage ledger: declared + observed consumption across this run,
  // checked against `options.quota` before every provider call.
  const usageTasks: Array<{ taskId: string; usage: GenerationUsage }> = [];
  const totals = { cost: 0, credits: 0, tokens: 0, computeSeconds: 0, outputBytes: 0 };
  let usageCurrency: string | undefined;
  const accumulate = (taskId: string, usage: GenerationUsage): void => {
    totals.cost += usage.cost ?? 0;
    totals.credits += usage.credits ?? 0;
    totals.tokens += usage.tokens ?? 0;
    totals.computeSeconds += usage.computeSeconds ?? 0;
    totals.outputBytes += usage.outputBytes ?? 0;
    if (usage.currency) usageCurrency ??= usage.currency;
    usageTasks.push({ taskId, usage });
  };
  const assertQuota = (task: GenerationTask): void => {
    const quota = options.quota;
    if (!quota) return;
    const checks: Array<[string, number | undefined, number]> = [
      ['maxCost', quota.maxCost, totals.cost],
      ['maxCredits', quota.maxCredits, totals.credits],
      ['maxTokens', quota.maxTokens, totals.tokens],
      ['maxComputeSeconds', quota.maxComputeSeconds, totals.computeSeconds],
    ];
    for (const [cap, limit, spent] of checks) {
      if (limit === undefined) continue;
      if (spent > limit + Number.EPSILON) {
        throw new VhtmlError(
          ErrorCode.GENERATION_QUOTA_EXCEEDED,
          `generation quota ${cap}=${limit} exceeded after ${spent} (task "${task.id}" pending); no further provider calls were made`,
          { objectId: task.id },
        );
      }
    }
  };

  for (const task of orderedTasks) {
    const providerId = options.provider ?? task.provider ?? 'procedural';
    const provider = (options.providers ?? []).find((candidate) => candidate.id === providerId) ?? getProvider(providerId);
    if (!provider) {
      const message = `provider "${providerId}" is not installed`;
      task.status = 'failed';
      failed.push({ taskId: task.id, message });
      issues.push(message);
      if (options.failFast !== false) {
        throw new VhtmlError(ErrorCode.GENERATION_PROVIDER_NOT_FOUND, message, { objectId: task.id });
      }
      continue;
    }
    if (!provider.kinds.includes(task.kind)) {
      const message = `provider "${providerId}" does not support ${task.kind}`;
      task.status = 'failed';
      failed.push({ taskId: task.id, message });
      issues.push(message);
      if (options.failFast !== false) {
        throw new VhtmlError(ErrorCode.GENERATION_CAPABILITY_MISSING, message, { objectId: task.id });
      }
      continue;
    }
    const key = cacheKeyFor(project, task, providerId, root);
    const cached = cache.entries[task.id];
    const existingAsset = project.assets.find((asset) => asset.generatedBy === task.id);
    if (!options.force && cached && cached.key === key) {
      const cachedAssets = cached.assets ?? [cached.asset];
      const allExist = cachedAssets.every((asset) =>
        fs.existsSync(path.resolve(root, asset.src || cached.file)),
      );
      if (allExist) {
        for (const cachedAsset of cachedAssets) {
          const asset: Asset = {
            ...cachedAsset,
            src: cachedAsset.src || cached.file,
            provenance: {
              ...cachedAsset.provenance,
              source: 'generated',
              taskId: task.id,
              provider: providerId,
              model: task.model,
            },
          };
          const index = project.assets.findIndex((candidate) => candidate.id === asset.id);
          if (index === -1) project.assets.push(asset);
          else project.assets[index] = asset;
        }
        task.status = 'succeeded';
        skipped.push(task.id);
        continue;
      }
    }
    if (!options.force && existingAsset) {
      const file = path.resolve(root, existingAsset.src);
      if (fs.existsSync(file)) {
        task.status = 'succeeded';
        skipped.push(task.id);
        continue;
      }
    }
    assertQuota(task);
    // A bible reference that cannot resolve would silently vanish from the
    // provider payload; fail before any provider call instead (RFC-0014).
    for (const input of task.inputs) {
      const match = BIBLE_REF.exec(input.ref);
      if (match && !project.bibles?.some((candidate) => candidate.id === match[2])) {
        throw new VhtmlError(
          ErrorCode.REFERENCE_NOT_FOUND,
          `generation "${task.id}" references missing bible "${input.ref}"`,
          { objectId: task.id },
        );
      }
    }

    const composition = project.composition;
    const durationSeconds = task.constraints.duration
      ? toNumber(task.constraints.duration)
      : toNumber(composition.duration);
    const width = task.constraints.width ?? composition.width;
    const height = task.constraints.height ?? composition.height;
    const frameRate = task.constraints.frameRate
      ? task.constraints.frameRate.num / task.constraints.frameRate.den
      : composition.frameRate.num / composition.frameRate.den;
    const sampleRate = task.constraints.sampleRate ?? composition.sampleRate;
    const seed = task.constraints.seed ?? composition.seed;
    try {
      options.onProgress?.({ taskId: task.id, message: `generating ${task.kind} with ${providerId}` });
      const startedAt = performance.now();
      const run = await provider.generate({
        task,
        project,
        root,
        outputDir: generatedDir,
        width,
        height,
        durationSeconds,
        frameRate,
        sampleRate,
        seed,
        signal: options.signal,
        onProgress: (message, percent) => options.onProgress?.({ taskId: task.id, message, percent }),
      });
      const files = Array.isArray(run) ? run : run.files;
      const providerUsage = Array.isArray(run) ? undefined : run.usage;
      const providerJobId = Array.isArray(run) ? undefined : run.providerJobId;
      if (providerJobId && !task.providerJobId) task.providerJobId = providerJobId;
      if (!files.length) throw new VhtmlError(ErrorCode.GENERATION_INVALID_OUTPUT, 'provider produced no files');
      const computeSeconds = (performance.now() - startedAt) / 1000;
      const outputBytes = files.reduce((sum, file) => {
        try {
          return sum + fs.statSync(file.path).size;
        } catch {
          return sum;
        }
      }, 0);
      const usage: GenerationUsage = {
        ...providerUsage,
        computeSeconds: providerUsage?.computeSeconds ?? computeSeconds,
        outputBytes: providerUsage?.outputBytes ?? outputBytes,
        recordedAt: new Date().toISOString(),
      };
      task.usage = { ...(task.usage ?? {}), ...usage };
      accumulate(task.id, usage);
      let index = 0;
      const generatedAssets: Asset[] = [];
      for (const file of files) {
        const absolute = path.resolve(file.path);
        let relative = path.relative(root, absolute);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          const copied = path.join(generatedDir, `${sanitizeId(task.id)}-${index}${path.extname(absolute) || '.bin'}`);
          fs.mkdirSync(path.dirname(copied), { recursive: true });
          fs.copyFileSync(absolute, copied);
          relative = path.relative(root, copied);
        }
        const absoluteFinal = path.resolve(root, relative);
        if (!fs.existsSync(absoluteFinal)) {
          throw new VhtmlError(ErrorCode.GENERATION_INVALID_OUTPUT, `provider output missing: ${relative}`);
        }
        let duration = file.durationSeconds !== undefined
          ? { num: Math.round(file.durationSeconds * 1_000_000), den: 1_000_000 }
          : undefined;
        let widthValue = file.width;
        let heightValue = file.height;
        let sampleRateValue = file.sampleRate;
        let channelsValue = file.channels;
        if (file.kind === 'video' || file.kind === 'audio') {
          try {
            const probe = await probeMedia(absoluteFinal);
            duration = probe.durationSeconds
              ? { num: Math.round(probe.durationSeconds * 1_000_000), den: 1_000_000 }
              : duration;
            widthValue = probe.video?.width ?? widthValue;
            heightValue = probe.video?.height ?? heightValue;
            sampleRateValue = probe.audio?.sampleRate ?? sampleRateValue;
            channelsValue = probe.audio?.channels ?? channelsValue;
          } catch (error) {
            issues.push(`could not probe generated ${file.kind} "${task.id}": ${(error as Error).message}`);
          }
        }
        const id = assetIdFor(task.id, index);
        const asset: Asset = {
          id,
          kind: file.kind,
          src: relative.split(path.sep).join('/'),
          mimeType: file.mimeType,
          duration,
          width: widthValue,
          height: heightValue,
          sampleRate: sampleRateValue,
          channels: channelsValue,
          hash: hashFile(absoluteFinal),
          size: fs.statSync(absoluteFinal).size,
          generatedBy: task.id,
          provenance: {
            source: 'generated',
            taskId: task.id,
            provider: providerId,
            model: task.model,
            promptHash: hashText(task.prompt),
            seed,
            createdAt: new Date().toISOString(),
            generatorVersion: '1.1.3',
            outputHash: hashFile(absoluteFinal),
          },
          metadata: file.metadata,
        };
        const existingIndex = project.assets.findIndex((candidate) => candidate.id === id);
        if (existingIndex === -1) project.assets.push(asset);
        else project.assets[existingIndex] = asset;
        generatedAssets.push(asset);
        index += 1;
      }
      const first = generatedAssets[0]!;
      cache.entries[task.id] = {
        key,
        file: first.src,
        asset: first,
        assets: generatedAssets,
        provider: providerId,
        model: task.model,
        createdAt: new Date().toISOString(),
        hash: first.hash,
      };
      task.status = 'succeeded';
      ran.push(task.id);
      writeCache(cachePath, cache);
      options.onProgress?.({ taskId: task.id, message: `generated ${files.length} file(s)` });
    } catch (error) {
      task.status = 'failed';
      const message = (error as Error).message;
      failed.push({ taskId: task.id, message });
      issues.push(message);
      if (options.failFast !== false) {
        throw error instanceof VhtmlError
          ? error
          : new VhtmlError(ErrorCode.GENERATION_PROVIDER_ERROR, message, { objectId: task.id });
      }
    }
  }
  const usage: GenerationUsageSummary | undefined = usageTasks.length
    ? {
        cost: totals.cost || undefined,
        currency: usageCurrency,
        credits: totals.credits || undefined,
        tokens: totals.tokens || undefined,
        computeSeconds: totals.computeSeconds || undefined,
        outputBytes: totals.outputBytes || undefined,
        tasks: usageTasks,
      }
    : undefined;
  return { project, cachePath, ran, skipped, failed, issues, usage };
}

/** Add generated asset ids so callers can resolve clips that reference gen: ids. */
export function generatedAssetMap(project: Project): Map<string, Asset> {
  const map = new Map<string, Asset>();
  for (const asset of project.assets) {
    if (asset.id.startsWith('gen:')) map.set(asset.id.slice(4).split(':')[0]!, asset);
  }
  return map;
}

/**
 * Load previously materialised generation outputs from the sidecar cache without
 * contacting any provider. Used by validate/render/preview/export.
 */
export function hydrateCachedAssets(
  project: Project,
  root: string,
  cachePath?: string,
): { project: Project; added: string[] } {
  const requested = cachePath && fs.existsSync(cachePath) ? cachePath : undefined;
  const file =
    requested ??
    cacheCandidates(path.resolve(root), DEFAULT_LAYOUT).find((candidate) => fs.existsSync(candidate)) ??
    cacheFilePath(path.resolve(root), DEFAULT_LAYOUT);
  const cache = loadCache(file);
  const added: string[] = [];
  for (const entry of Object.values(cache.entries)) {
    if (!entry?.asset?.id) continue;
    for (const cachedAsset of entry.assets ?? [entry.asset]) {
      if (!cachedAsset?.id) continue;
      if (project.assets.some((asset) => asset.id === cachedAsset.id)) continue;
      const relative = cachedAsset.src || entry.file;
      if (!fs.existsSync(path.resolve(root, relative))) continue;
      const asset: Asset = {
        ...cachedAsset,
        src: relative,
        provenance: {
          ...cachedAsset.provenance,
          source: 'generated',
          taskId: cachedAsset.generatedBy ?? cachedAsset.provenance?.taskId,
          provider: cachedAsset.provenance?.provider ?? entry.provider,
          model: cachedAsset.provenance?.model ?? entry.model,
        },
      };
      project.assets.push(asset);
      added.push(asset.id);
      const task = project.generations.find((candidate) => candidate.id === asset.generatedBy);
      if (task && task.status === 'draft') task.status = 'succeeded';
    }
  }
  return { project, added };
}

export function generationPrompt(task: GenerationTask): string {
  return [
    task.prompt,
    task.negativePrompt ? `Negative: ${task.negativePrompt}` : '',
    task.constraints.duration ? `duration=${toNumber(task.constraints.duration)}s` : '',
    task.constraints.frameRate ? `fps=${formatRate(task.constraints.frameRate)}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Resolve task inputs to portable descriptors for remote providers. `src` is
 * project-relative; a remote adapter is responsible for uploading it and
 * replacing `src` with a signed URL. Unresolved refs remain ref/role only.
 */
export function resolvedGenerationInputs(
  project: Project,
  task: GenerationTask,
): Array<Record<string, unknown>> {
  return task.inputs.map((input) => {
    const descriptor: Record<string, unknown> = { ref: input.ref, role: input.role };
    const resolved = resolveReference(project, input.ref);
    if (!resolved) return descriptor;
    descriptor.kind = resolved.kind;
    descriptor.id = resolved.id;
    if (resolved.kind === 'asset') {
      descriptor.assetId = resolved.asset.id;
      descriptor.src = resolved.asset.src;
      descriptor.mimeType = resolved.asset.mimeType;
      descriptor.hash = resolved.asset.hash;
      descriptor.width = resolved.asset.width;
      descriptor.height = resolved.asset.height;
      descriptor.duration = resolved.asset.duration;
    } else if (resolved.kind === 'generation') {
      descriptor.taskId = resolved.task.id;
      const asset = project.assets.find((candidate) => candidate.generatedBy === resolved.task.id);
      if (asset) {
        descriptor.assetId = asset.id;
        descriptor.src = asset.src;
        descriptor.mimeType = asset.mimeType;
        descriptor.hash = asset.hash;
      }
    } else if (resolved.kind === 'scene') {
      descriptor.sceneId = resolved.scene.id;
    } else if (resolved.kind === 'bible') {
      descriptor.bibleKind = resolved.bible.kind;
      descriptor.bibleId = resolved.bible.id;
      descriptor.bibleVersion = resolved.bible.version;
      descriptor.description = resolved.bible.description;
      descriptor.negative = resolved.bible.negative;
      descriptor.references = resolved.bible.references.map((reference) => {
        const referenceResolved = resolveReference(project, reference.ref);
        const asset = referenceResolved?.kind === 'asset' ? referenceResolved.asset : undefined;
        return {
          ref: reference.ref,
          role: reference.role,
          src: asset?.src,
          mimeType: asset?.mimeType,
          hash: asset?.hash,
        };
      });
    }
    return descriptor;
  });
}

export {
  VENDOR_CATALOG,
  findVendorProfile,
  splitNamespacedParam,
  vendorParams,
  buildVendorPayload,
  type VendorProfile,
  type VendorParamMapping,
  type VendorPayloadOptions,
} from './vendors.ts';
