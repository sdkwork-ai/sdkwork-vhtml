/**
 * VHTML Studio server: local preview, timeline editing, save, undo/redo, export.
 * Binds to loopback only; the project root is served read-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { materializeDocument } from '@sdkwork/vhtml-core/program';
import { validateDocument, type ValidationResult } from '@sdkwork/vhtml-core/validate';
import { EditSession, makeClipBase, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { cuesToClips } from '@sdkwork/vhtml-core/captions';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { ErrorCode, VhtmlError, formatDiagnostic, type Diagnostic } from '@sdkwork/vhtml-core/errors';
import { DELIVERY_PRESETS, outputForDelivery } from '@sdkwork/vhtml-core/presets';
import { ffmpegPath, probeMedia, runTool } from '@sdkwork/vhtml-ffmpeg';
import {
  findTimeline,
  findTrack,
  type Asset,
  type Clip,
  type OutputConfig,
  type Project,
  type Timeline,
  type Track,
} from '@sdkwork/vhtml-core/model';
import { gt, lt, parseTime, rat, sub, toNumber, type Rational } from '@sdkwork/vhtml-core/time';
import { buildStageRuntime } from '@sdkwork/vhtml-runtime/build';
import { buildStageHtml } from '@sdkwork/vhtml-runtime/stage';
import { startProjectServer, type ProjectServer } from '@sdkwork/vhtml-runtime/server';
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { exportProject } from '@sdkwork/vhtml-media/export';
import { hydrateCachedAssets, materializeGenerations } from '@sdkwork/vhtml-generation';
import {
  cacheFilePath,
  isInsideRoot,
  resolveProjectInput,
  toPosixRelative,
  writeManifest,
  type ProjectManifest,
} from '@sdkwork/vhtml-project/manifest';
import {
  assetsForStudio,
  collectAssetInventory,
  importAssetFile,
  relinkAsset,
  verifyAssetInventory,
} from '@sdkwork/vhtml-project/assets';
import { STUDIO_HTML } from './client.ts';
import { patchHtmlElement, type HtmlElementPatch } from './html-edit.ts';

export interface StudioAuth {
  username: string;
  password: string;
}

export interface StudioOptions {
  port?: number;
  host?: string;
  open?: boolean;
  chrome?: string;
  /** Basic authentication for every Studio/API/stage request except health. */
  auth?: StudioAuth;
  /** Allow a non-loopback bind without authentication (not recommended). */
  allowInsecure?: boolean;
  /** Open the editor in a Chrome app window (chrome-less standalone frame). */
  appWindow?: boolean;
  /**
   * Embeddable/programmatic mode: skip console output, browser auto-open and
   * process signal handlers; `onStarted` receives an operable handle. Use
   * `startStudioServer` instead of calling this directly.
   */
  detach?: boolean;
  onStarted?: (handle: StudioHandle) => void;
  /**
   * Autosave interval in ms (default 15000, 0 disables). When the session has
   * unsaved edits the model is written to `<entry>.autosave`; on the next
   * start the editor offers recovery through /api/autosave endpoints.
   */
  autosaveMs?: number;
}

export interface StudioHandle {
  url: string;
  /** Same as `url` with `?embed=1` for third-party iframe shells. */
  embedUrl: string;
  origin: string;
  port: number;
  root: string;
  /** Snapshot of the current in-session project model. */
  project: () => Project;
  /** Apply Core edit operations through the same pipeline as the UI. */
  apply: (operations: EditOperation[]) => Promise<{ ok: boolean; changed: string[]; diagnostics: Diagnostic[] }>;
  /** Persist the current session model to the entry file. */
  save: () => void;
  /** Replace the session model by re-parsing a source document. */
  loadDocument: (source: string) => void;
  /** Stop the HTTP server; the host process keeps running. */
  close: () => Promise<void>;
}

function parseAuth(value: string | undefined): StudioAuth | undefined {
  if (!value) return undefined;
  const index = value.indexOf(':');
  if (index <= 0 || index === value.length - 1) {
    throw new Error('auth must be "username:password" (the password may contain ":")');
  }
  return { username: value.slice(0, index), password: value.slice(index + 1) };
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function basicCredentials(header: string | undefined): StudioAuth | undefined {
  if (!header || !/^Basic\s+/i.test(header)) return undefined;
  try {
    const decoded = Buffer.from(header.replace(/^Basic\s+/i, '').trim(), 'base64').toString('utf8');
    const index = decoded.indexOf(':');
    if (index < 0) return undefined;
    return { username: decoded.slice(0, index), password: decoded.slice(index + 1) };
  } catch {
    return undefined;
  }
}

function credentialsEqual(expected: StudioAuth, actual: StudioAuth | undefined): boolean {
  if (!actual) return false;
  const left = Buffer.from(`${expected.username}:${expected.password}`);
  const right = Buffer.from(`${actual.username}:${actual.password}`);
  return left.length === right.length && timingSafeEqual(left, right);
}

interface StudioEffect {
  id: string;
  type: string;
  params: Record<string, string | number | boolean>;
  enabled: boolean;
}

interface StudioKeyframe {
  time: number;
  value: string | number;
  easing?: string;
}

interface StudioAnimation {
  id: string;
  property: string;
  timeBase: string;
  start: number;
  duration: number;
  easing: string;
  fill: string;
  iterations: number | 'infinite';
  direction: string;
  compose: string;
  selector?: string;
  enabled: boolean;
  keyframes: StudioKeyframe[];
}

interface StudioClip {
  id: string;
  kind: Clip['kind'];
  label: string;
  start: number;
  duration: number;
  speed: number;
  opacity: number;
  volume: number;
  pan: number;
  z: number;
  blend: string;
  fit: string;
  ref?: string;
  text?: string;
  speaker?: string;
  style?: Record<string, string>;
  enabled: boolean;
  muted?: boolean;
  sourceIn: number;
  reverse: boolean;
  freeze?: number;
  hasTimeRemap: boolean;
  timeRemap?: { at: number; source: number; easing?: string }[];
  timeRemapEasing?: string;
  crop?: { left: number; right: number; top: number; bottom: number };
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
    anchorX: number;
    anchorY: number;
  };
  effects: StudioEffect[];
  audioEffects: StudioEffect[];
  animations: StudioAnimation[];
  metadata?: Record<string, string>;
  fadeIn?: number;
  fadeOut?: number;
}

interface StudioLane {
  id: string;
  type: Track['type'];
  name: string;
  order: number;
  enabled: boolean;
  muted: boolean;
  solo?: boolean;
  locked: boolean;
  clips: StudioClip[];
  transitions: Array<{ id: string; from: string; to: string; type: string; duration: number }>;
}

interface StudioMarker {
  id: string;
  time: number;
  name?: string;
  type: string;
  color?: string;
}

interface StudioShot {
  id: string;
  order: number;
  title?: string;
  description?: string;
  prompt?: string;
  scene?: string;
  generation?: string;
  asset?: string;
  duration: number;
  status: string;
  tags: string[];
  notes?: string;
  direction?: Record<string, unknown>;
}

interface StudioModel {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  scenes: Array<{ id: string; name: string; src?: string; duration: number }>;
  generations: Array<{ id: string; kind: string; status: string; provider?: string; model?: string; prompt: string }>;
  storyboard: StudioShot[];
  lanes: StudioLane[];
  markers: StudioMarker[];
  timelineId: string;
  outputs: Array<{ id: string; format: string; width: number; height: number }>;
}

interface Job {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  phase: string;
  percent: number;
  frame: number;
  total: number;
  message?: string;
  error?: string;
  file?: string;
  url?: string;
  sizeBytes?: number;
  captions?: string;
  report?: string;
  createdAt: number;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}

function readBody(request: http.IncomingMessage, limit = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function readBodyBuffer(request: http.IncomingMessage, limit = 256 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`upload exceeds ${Math.round(limit / 1024 / 1024)} MiB`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function studioEffect(effect: { id: string; type: string; params: Record<string, string | number | boolean>; enabled: boolean }): StudioEffect {
  return { id: effect.id, type: effect.type, params: { ...effect.params }, enabled: effect.enabled };
}

function studioAnimations(clip: Clip): StudioAnimation[] {
  return clip.animations.map((animation) => ({
    id: animation.id,
    property: animation.property,
    timeBase: animation.timeBase,
    start: toNumber(animation.start),
    duration: toNumber(animation.duration),
    easing: animation.easing,
    fill: animation.fill,
    iterations: animation.iterations,
    direction: animation.direction,
    compose: animation.compose,
    selector: animation.selector,
    enabled: animation.enabled,
    keyframes: animation.keyframes.map((keyframe) => ({
      time: toNumber(keyframe.time),
      value: keyframe.value,
      easing: keyframe.easing,
    })),
  }));
}

function studioModel(project: Project): StudioModel {
  const timeline = findTimeline(project, project.mainTimeline) ?? project.timelines[0];
  const lanes: StudioLane[] = (timeline?.tracks ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      id: track.id,
      type: track.type,
      name: track.name ?? track.id,
      order: track.order,
      enabled: track.enabled,
      muted: track.muted,
      solo: track.solo,
      locked: track.locked,
      clips: track.clips
        .slice()
        .sort((a, b) => toNumber(a.start) - toNumber(b.start))
        .map((clip) => ({
          id: clip.id,
          kind: clip.kind,
          label:
            clip.name ??
            (clip.kind === 'caption' ? clip.text : undefined) ??
            clip.ref ??
            clip.id,
          start: toNumber(clip.start),
          duration: toNumber(clip.duration),
          speed: toNumber(clip.speed),
          opacity: clip.opacity,
          volume: clip.volume,
          pan: clip.pan,
          ref: clip.ref,
          text: clip.kind === 'caption' ? clip.text : undefined,
          speaker: clip.kind === 'caption' ? clip.speaker : undefined,
          style: clip.kind === 'caption' ? clip.style : undefined,
          enabled: clip.enabled,
          muted: clip.kind === 'video' || clip.kind === 'audio' ? clip.muted : undefined,
          sourceIn: toNumber(clip.sourceIn),
          reverse: clip.reverse === true,
          freeze: clip.freeze !== undefined ? toNumber(clip.freeze) : undefined,
          hasTimeRemap: clip.timeRemap !== undefined,
          timeRemap: clip.timeRemap
            ? clip.timeRemap.keyframes.map((keyframe) => ({
              at: toNumber(keyframe.at),
              source: toNumber(keyframe.source),
              easing: keyframe.easing,
            }))
            : undefined,
          timeRemapEasing: clip.timeRemap?.easing,
          crop: clip.crop
            ? { left: clip.crop.left, right: clip.crop.right, top: clip.crop.top, bottom: clip.crop.bottom }
            : undefined,
          z: clip.z,
          blend: clip.blend,
          fit: clip.fit,
          transform: clip.transform
            ? {
              x: clip.transform.x,
              y: clip.transform.y,
              scaleX: clip.transform.scaleX,
              scaleY: clip.transform.scaleY,
              rotate: clip.transform.rotate,
              anchorX: clip.transform.anchorX,
              anchorY: clip.transform.anchorY,
            }
            : { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0, anchorY: 0 },
          effects: (clip.effects ?? []).map(studioEffect),
          audioEffects: (clip.audioEffects ?? []).map(studioEffect),
          animations: studioAnimations(clip),
          metadata: clip.metadata && Object.keys(clip.metadata).length ? { ...clip.metadata } : undefined,
          fadeIn: clip.fadeIn ? toNumber(clip.fadeIn) : undefined,
          fadeOut: clip.fadeOut ? toNumber(clip.fadeOut) : undefined,
        })),
      transitions: track.transitions.map((transition) => ({
        id: transition.id,
        from: transition.fromClipId,
        to: transition.toClipId,
        type: transition.type,
        duration: toNumber(transition.duration),
      })),
    }));
  return {
    id: project.id,
    title: project.title ?? project.id,
    width: project.composition.width,
    height: project.composition.height,
    fps: project.composition.frameRate.num / project.composition.frameRate.den,
    duration: toNumber(timeline?.duration ?? project.composition.duration),
    background: project.composition.background,
    scenes: project.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name ?? scene.id,
      src: scene.src,
      duration: scene.duration ? toNumber(scene.duration) : 0,
    })),
    generations: project.generations.map((task) => ({
      id: task.id,
      kind: task.kind,
      status: task.status,
      provider: task.provider,
      model: task.model,
      prompt: task.prompt,
    })),
    storyboard: (project.storyboard ?? []).map((shot) => ({
      id: shot.id,
      order: shot.order,
      title: shot.title,
      description: shot.description,
      prompt: shot.prompt,
      scene: shot.scene,
      generation: shot.generation,
      asset: shot.asset,
      duration: shot.duration ? toNumber(shot.duration) : 0,
      status: shot.status,
      tags: shot.tags ?? [],
      notes: shot.notes,
      direction: shot.direction as Record<string, unknown> | undefined,
    })),
    lanes,
    markers: (timeline?.markers ?? []).map((marker) => ({
      id: marker.id,
      time: toNumber(marker.time),
      name: marker.name,
      type: marker.type,
      color: marker.color,
    })),
    timelineId: timeline?.id ?? project.mainTimeline,
    outputs: project.outputs.map((output) => ({
      id: output.id,
      format: output.format,
      width: output.width,
      height: output.height,
    })),
  };
}

function parseStudioTime(value: unknown, fps: { num: number; den: number }): Rational | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return rat(Math.round(value * 1_000_000), 1_000_000);
  if (typeof value === 'string') return parseTime(value, { frameRate: fps });
  return undefined;
}

function openBrowser(url: string, chromePath?: string, appWindow?: boolean): void {
  if (appWindow && chromePath) {
    // Standalone app window: chrome-less Chromium frame around the editor.
    try {
      const child = spawn(chromePath, ['--app=' + url, '--window-size=1440,900'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return;
    } catch {
      /* fall through to default opener */
    }
  }
  const command =
    process.platform === 'win32'
      ? { file: 'cmd.exe', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { file: 'open', args: [url] }
        : { file: 'xdg-open', args: [url] };
  try {
    const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch {
    /* ignore */
  }
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join('\n');
}

function nextStudioId(project: Project, base: string): string {
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
  let id = base;
  let counter = 2;
  while (used.has(id)) id = `${base}-${counter++}`;
  return id;
}

function clipFromAsset(
  project: Project,
  asset: Asset,
  track: Track,
  start: Rational,
  requestedDuration?: Rational,
): Clip | string {
  const isAudioLane = track.type === 'audio';
  let kind: Clip['kind'];
  if (asset.kind === 'audio') kind = 'audio';
  else if (asset.kind === 'video') kind = isAudioLane ? 'audio' : 'video';
  else if (asset.kind === 'image') kind = 'image';
  else if (asset.kind === 'svg') kind = 'svg';
  else if (asset.kind === 'captions') return 'caption assets must be added as cues';
  else return `asset kind "${asset.kind}" cannot be placed on a timeline`;
  if (isAudioLane && kind !== 'audio') return 'audio lanes accept only audio or video sources';
  if ((track.type === 'video' || track.type === 'overlay') && kind === 'audio') return 'audio clips require an audio lane';
  if (track.type === 'caption' || track.type === 'data') return `${track.type} lanes cannot contain media clips`;
  const fallback = kind === 'image' || kind === 'svg' ? rat(3) : asset.duration ?? rat(5);
  let duration = requestedDuration ?? fallback;
  if (!gt(duration, { num: 0, den: 1 })) return 'clip duration must be positive';
  if ((kind === 'video' || kind === 'audio') && asset.duration && gt(duration, asset.duration)) {
    duration = asset.duration;
  }
  const id = nextStudioId(project, `clip-${asset.id.replace(/[^A-Za-z0-9_-]+/g, '-')}`);
  const base = makeClipBase({
    id,
    kind,
    ref: asset.id,
    start,
    duration,
    sourceIn: { num: 0, den: 1 },
    speed: rat(1),
  });
  if (kind === 'video' || kind === 'audio') {
    const sourceOut = asset.duration && lt(duration, asset.duration) ? duration : asset.duration;
    return {
      ...base,
      kind,
      ref: asset.id,
      sourceOut,
      muted: false,
    } as Clip;
  }
  return { ...base, kind, ref: asset.id } as Clip;
}

function resolveAssetFile(project: Project, root: string, assetId: string): { asset: Asset; file: string } | string {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) return `asset not found: ${assetId}`;
  const clean = asset.src.split('#')[0]!.split('?')[0]!;
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  const file = path.resolve(root, decoded);
  if (!isInsideRoot(root, file)) return `asset path escapes the project root: ${asset.src}`;
  if (!fs.existsSync(file)) return `asset file is missing: ${asset.src}`;
  return { asset, file };
}

const PEAK_BUCKETS = 2400;

/** Decode a media file to mono 8 kHz PCM and reduce it to normalized peak buckets. */
async function audioPeaks(file: string): Promise<{ buckets: number[]; durationSeconds: number }> {
  const decoded = await runTool(
    ffmpegPath(),
    ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
    { timeoutMs: 120_000, maxOutputBytes: 512 * 1024 * 1024 },
  );
  const sampleCount = Math.floor(decoded.stdout.length / 2);
  const per = Math.max(1, Math.floor(sampleCount / PEAK_BUCKETS));
  const buckets: number[] = [];
  for (let bucket = 0; bucket < PEAK_BUCKETS; bucket++) {
    let peak = 0;
    const first = bucket * per;
    const last = Math.min(sampleCount, first + per);
    for (let i = first; i < last; i++) {
      const value = Math.abs(decoded.stdout.readInt16LE(i * 2)) / 32768;
      if (value > peak) peak = value;
    }
    buckets.push(Math.round(peak * 1000) / 1000);
  }
  return { buckets, durationSeconds: sampleCount / 8000 };
}

/** Extract a single scaled JPEG frame for clip/asset thumbnails. */
async function posterFrame(file: string, atSeconds: number): Promise<Buffer> {
  const result = await runTool(
    ffmpegPath(),
    ['-v', 'error', '-ss', String(Math.max(0, atSeconds)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', '-f', 'image2', '-'],
    { timeoutMs: 60_000, maxOutputBytes: 16 * 1024 * 1024 },
  );
  if (!result.stdout.length) throw new Error('no frame could be decoded');
  return result.stdout;
}

function project_duration(project: Project): Rational {
  const timeline = findTimeline(project, project.mainTimeline) ?? project.timelines[0];
  return timeline?.duration ?? project.composition.duration;
}

function mediaCacheKey(parts: string[]): string {
  return createHash('md5').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * One in-flight media computation per cache file: parallel timeline renders
 * request the same poster/peaks URL repeatedly, and duplicate concurrent
 * ffmpeg spawns are wasteful and flaky under load.
 */
const mediaInFlight = new Map<string, Promise<unknown>>();
function onceByKey<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const existing = mediaInFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = compute().finally(() => mediaInFlight.delete(key));
  mediaInFlight.set(key, promise);
  return promise;
}

async function withOneRetry<T>(compute: () => Promise<T>): Promise<T> {
  try {
    return await compute();
  } catch (error) {
    // Transient ffmpeg cold-start/IO failures: one immediate retry, then surface.
    return compute().catch(() => {
      throw error;
    });
  }
}

export async function startStudio(input: string | undefined, options: StudioOptions = {}): Promise<number> {
  let resolved;
  try {
    resolved = resolveProjectInput(input);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  const root = resolved.root;
  const entry = resolved.entry;
  const layout = resolved.layout;
  const manifest: ProjectManifest = resolved.manifest;
  let manifestPath = resolved.manifestPath;

  let auth: StudioAuth | undefined;
  try {
    auth = options.auth ??
      parseAuth(process.env.VHTML_AUTH) ??
      (process.env.VHTML_TOKEN ? { username: 'vhtml', password: process.env.VHTML_TOKEN } : undefined);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  const host = options.host ?? process.env.VHTML_HOST ?? '127.0.0.1';
  if (!isLoopbackHost(host) && !auth && !options.allowInsecure) {
    console.error(`Refusing to bind Studio to ${host} without authentication.`);
    console.error('Set VHTML_AUTH=user:password, pass --auth user:password, or use --insecure behind a trusted proxy.');
    return 1;
  }
  const environmentPort = process.env.VHTML_PORT ? Number(process.env.VHTML_PORT) : undefined;
  const port = options.port ?? (Number.isFinite(environmentPort) ? environmentPort : undefined) ?? manifest.preview?.port ?? 4173;

  if (!fs.existsSync(entry)) {
    console.error(`VHTML entry not found: ${entry}`);
    return 1;
  }
  const source = fs.readFileSync(entry, 'utf8');
  const parsed = parseVhtml(source, { file: entry, root });
  {
    const materialized = materializeDocument(parsed.document);
    parsed.document = materialized.document;
    parsed.diagnostics.push(...materialized.diagnostics);
  }
  if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    console.error(formatDiagnostics(parsed.diagnostics));
    console.error('Cannot start studio: project has parse errors.');
    return 1;
  }
  hydrateCachedAssets(parsed.document.project, root, cacheFilePath(root, layout));
  const validation = validateDocument(parsed.document, {
    root,
    checkFiles: true,
    diagnostics: parsed.diagnostics,
  });
  if (validation.errors.length) {
    console.error(formatDiagnostics(validation.errors));
    console.error('Studio is opening in repair mode: export and some edits will remain blocked until the diagnostics are resolved.');
  }

  const runtimeSource = await buildStageRuntime();
  let proxySources = false;
  let stageHtml = buildStageHtml({
    project: parsed.document.project,
    timelineId: parsed.document.project.mainTimeline,
    mode: 'preview',
    runtimeSource,
  });
  let session = new EditSession(parsed.document.project);
  let documentSource = parsed.document.source;
  let revision = 0;
  let latestDiagnostics = validation.diagnostics;
  const jobs = new Map<string, Job>();
  const mediaCacheDir = path.join(root, layout.cache, 'studio-media');

  const rebuildStage = (): void => {
    stageHtml = buildStageHtml({
      project: session.project,
      timelineId: session.project.mainTimeline,
      mode: 'preview',
      runtimeSource,
      proxySources,
    });
  };

  const save = (): void => {
    const relativeEntry = toPosixRelative(root, entry);
    if (!manifestPath) {
      manifest.entry = relativeEntry;
      manifest.id = session.project.id;
      manifest.title = manifest.title ?? session.project.title;
      manifestPath = writeManifest(root, manifest);
    } else if (!fs.existsSync(path.join(root, manifest.entry))) {
      manifest.entry = relativeEntry;
      writeManifest(root, manifest);
    }
    fs.writeFileSync(
      entry,
      serializeDocument({ specVersion: '1.1', project: session.project, source: documentSource }),
      'utf8',
    );
      dirty = false;
  };

  const responseForProject = (extra: Record<string, unknown> = {}) => ({
    model: studioModel(session.project),
    /** Raw Core Model snapshot for embed hosts (studioModel is the projection). */
    project: structuredClone(session.project),
    revision,
    diagnostics: latestDiagnostics,
    canUndo: session.canUndo,
    canRedo: session.canRedo,
    root,
    entry: toPosixRelative(root, entry),
    layout,
    ...extra,
  });

  let dirty = false;
  const applyAndSave = (operations: EditOperation[], options: { checkFiles?: boolean } = {}) => {
    const result = session.apply(operations, { autoExtend: true });
    if (!result.ok) {
      return { status: 422, body: { ok: false, message: 'edit rejected', diagnostics: result.diagnostics } };
    }
    const nextValidation = validateDocument(
      { specVersion: '1.1', project: session.project },
      { root, checkFiles: options.checkFiles ?? false },
    );
    latestDiagnostics = nextValidation.diagnostics;
    if (!nextValidation.ok) {
      session.undo();
      return { status: 422, body: { ok: false, message: 'edit made the project invalid', diagnostics: nextValidation.diagnostics } };
    }
    dirty = true;
    save();
    rebuildStage();
    revision += 1;
    return { status: 200, body: responseForProject({ ok: true, changed: result.changed }) };
  };

  /** Re-read the entry and external Scene files; reset the edit session. */
  const reloadFromDisk = (): { status: number; body: Record<string, unknown> } => {
    try {
      const nextSource = fs.readFileSync(entry, 'utf8');
      const nextParsed = parseVhtml(nextSource, { file: entry, root });
      {
        const materialized = materializeDocument(nextParsed.document);
        nextParsed.document = materialized.document;
        nextParsed.diagnostics.push(...materialized.diagnostics);
      }
      if (nextParsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        return { status: 422, body: { ok: false, message: 'reload failed', diagnostics: nextParsed.diagnostics } };
      }
      hydrateCachedAssets(nextParsed.document.project, root, cacheFilePath(root, layout));
      documentSource = { path: entry, root, raw: nextSource };
      session = new EditSession(nextParsed.document.project);
      latestDiagnostics = validateDocument(nextParsed.document, { root, checkFiles: true }).diagnostics;
      rebuildStage();
      revision += 1;
      return { status: 200, body: responseForProject({ ok: true, reloaded: true }) };
    } catch (error) {
      return { status: 422, body: { ok: false, message: (error as Error).message } };
    }
  };

  const server: ProjectServer = await startProjectServer({
    root,
    host,
    port,
    authorize: auth ? (request) => credentialsEqual(auth, basicCredentials(request.headers.authorization)) : undefined,
    stage: () => stageHtml,
    api: async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const requestOrigin = request.headers.origin;
      if (requestOrigin) {
        try {
          const forwarded = request.headers['x-forwarded-host'];
          const expectedHost = (Array.isArray(forwarded) ? forwarded[0] : forwarded ?? request.headers.host ?? '')
            .split(',')[0]!
            .trim();
          if (new URL(requestOrigin).host !== expectedHost) {
            sendJson(response, 403, { error: 'cross_origin_request_rejected' });
            return true;
          }
        } catch {
          sendJson(response, 403, { error: 'cross_origin_request_rejected' });
          return true;
        }
      }
      if (url.pathname === '/' || url.pathname === '/studio') {
        const html = STUDIO_HTML;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(html) });
        response.end(html);
        return true;
      }
      if (!url.pathname.startsWith('/api/')) return false;
      try {
        if (request.method === 'POST' && url.pathname === '/api/proxy-mode') {
          const body = JSON.parse((await readBody(request)) || '{}') as { enabled?: boolean };
          proxySources = Boolean(body.enabled);
          rebuildStage();
          revision += 1;
          sendJson(response, 200, { ok: true, proxySources });
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/autosave') {
          sendJson(response, 200, {
            ok: true,
            available: fs.existsSync(autosavePath),
            savedAt: fs.existsSync(autosavePath) ? fs.statSync(autosavePath).mtime.toISOString() : undefined,
          });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/autosave/restore') {
          if (!fs.existsSync(autosavePath)) {
            sendJson(response, 404, { ok: false, error: 'no autosave file' });
            return true;
          }
          try {
            handle.loadDocument(fs.readFileSync(autosavePath, 'utf8'));
            sendJson(response, 200, { ok: true, ...responseForProject() });
          } catch (error) {
            sendJson(response, 422, { ok: false, error: (error as Error).message });
          }
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/autosave/discard') {
          if (fs.existsSync(autosavePath)) fs.rmSync(autosavePath);
          sendJson(response, 200, { ok: true });
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/project') {
          sendJson(response, 200, responseForProject());
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/assets') {
          const data = assetsForStudio(session.project, root, layout);
          const inventory = collectAssetInventory(session.project, root, layout);
          sendJson(response, 200, {
            ok: true,
            ...data,
            summary: inventory.summary,
            missing: inventory.missing,
            outsideRoot: inventory.outsideRoot,
            diagnostics: verifyAssetInventory(inventory),
          });
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/inventory') {
          const inventory = collectAssetInventory(session.project, root, layout);
          sendJson(response, 200, {
            ok: true,
            ...inventory,
            diagnostics: verifyAssetInventory(inventory),
          });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/assets/upload') {
          const encodedName = request.headers['x-filename'];
          const rawName = Array.isArray(encodedName) ? encodedName[0] : encodedName;
          if (!rawName) {
            sendJson(response, 400, { error: 'missing x-filename header' });
            return true;
          }
          let filename: string;
          try {
            filename = path.basename(decodeURIComponent(rawName));
          } catch {
            filename = path.basename(rawName);
          }
          const data = await readBodyBuffer(request);
          if (!data.length) {
            sendJson(response, 400, { error: 'empty upload' });
            return true;
          }
          let asset: Asset;
          try {
            asset = await importAssetFile({
              project: session.project,
              root,
              layout,
              data,
              filename,
              destination: typeof request.headers['x-destination'] === 'string'
                ? request.headers['x-destination']
                : undefined,
            });
          } catch (error) {
            sendJson(response, 400, { error: (error as Error).message });
            return true;
          }
          if (session.project.assets.some((candidate) => candidate.id === asset.id)) {
            sendJson(response, 200, { ...responseForProject({ ok: true, asset, unchanged: true }) });
            return true;
          }
          const outcome = applyAndSave([{ op: 'asset.add', asset }]);
          sendJson(response, outcome.status, { ...outcome.body, asset });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/assets/relink') {
          const body = JSON.parse((await readBody(request)) || '{}') as { assetId?: string; src?: string };
          if (!body.assetId || !body.src) {
            sendJson(response, 400, { error: 'assetId and src are required' });
            return true;
          }
          try {
            const probe = structuredClone(session.project);
            const updated = relinkAsset(probe, root, body.assetId, body.src);
            const outcome = applyAndSave(
              [{ op: 'asset.set', assetId: updated.id, props: { src: updated.src } }],
              { checkFiles: false },
            );
            sendJson(response, outcome.status, { ...outcome.body, asset: updated });
            return true;
          } catch (error) {
            sendJson(response, 400, { error: (error as Error).message });
            return true;
          }
        }
        if (request.method === 'POST' && url.pathname === '/api/clip-from-asset') {
          const body = JSON.parse((await readBody(request)) || '{}') as {
            assetId?: string;
            trackId?: string;
            start?: number | string;
            duration?: number | string;
            mode?: string;
          };
          if (!body.assetId || !body.trackId) {
            sendJson(response, 400, { error: 'assetId and trackId are required' });
            return true;
          }
          const asset = session.project.assets.find((candidate) => candidate.id === body.assetId);
          if (!asset) {
            sendJson(response, 404, { error: `asset not found: ${body.assetId}` });
            return true;
          }
          const locatedTrack = findTrack(session.project, body.trackId);
          if (!locatedTrack) {
            sendJson(response, 404, { error: `lane not found: ${body.trackId}` });
            return true;
          }
          const start = parseStudioTime(body.start, session.project.composition.frameRate) ?? rat(0);
          const duration = parseStudioTime(body.duration, session.project.composition.frameRate);
          const clip = clipFromAsset(session.project, asset, locatedTrack.track, start, duration);
          if (typeof clip === 'string') {
            sendJson(response, 400, { error: clip });
            return true;
          }
          const placeMode = body.mode === 'insert' || body.mode === 'overwrite' ? body.mode : 'add';
          const outcome = placeMode === 'add'
            ? applyAndSave([{ op: 'clip.add', trackId: body.trackId, clip }])
            : applyAndSave([{ op: placeMode === 'insert' ? 'timeline.insert' : 'timeline.overwrite', laneId: body.trackId, at: body.start, clip }]);
          sendJson(response, outcome.status, { ...outcome.body, clip });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/caption') {
          const body = JSON.parse((await readBody(request)) || '{}') as {
            text?: string;
            start?: number | string;
            duration?: number | string;
            style?: Record<string, string>;
          };
          const text = (body.text ?? '').trim();
          if (!text) {
            sendJson(response, 400, { error: 'text is required' });
            return true;
          }
          const timeline = findTimeline(session.project, session.project.mainTimeline) ?? session.project.timelines[0];
          if (!timeline) {
            sendJson(response, 400, { error: 'project has no timeline' });
            return true;
          }
          let track = timeline.tracks.find((candidate) => candidate.type === 'caption');
          const operations: EditOperation[] = [];
          let trackId: string;
          if (!track) {
            trackId = nextStudioId(session.project, 'captions');
            operations.push({
              op: 'track.add',
              timelineId: timeline.id,
              track: {
                id: trackId,
                type: 'caption',
                name: 'Captions',
                order: timeline.tracks.reduce((max, candidate) => Math.max(max, candidate.order), 0) + 1,
              },
            });
          } else {
            trackId = track.id;
          }
          const start = parseStudioTime(body.start, session.project.composition.frameRate) ?? rat(0);
          const duration = parseStudioTime(body.duration, session.project.composition.frameRate) ?? rat(2);
          const base = makeClipBase({
            id: nextStudioId(session.project, 'cue'),
            kind: 'caption',
            start,
            duration,
          });
          const clip = { ...base, kind: 'caption', text, style: body.style } as Clip;
          operations.push({ op: 'clip.add', trackId, clip });
          const outcome = applyAndSave(operations);
          sendJson(response, outcome.status, { ...outcome.body, clip });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/captions/import') {
          const body = JSON.parse((await readBody(request)) || '{}') as { text?: string; laneId?: string };
          const source = (body.text ?? '').trim();
          if (!source) {
            sendJson(response, 400, { error: 'text is required' });
            return true;
          }
          const timeline = findTimeline(session.project, session.project.mainTimeline) ?? session.project.timelines[0];
          if (!timeline) {
            sendJson(response, 400, { error: 'project has no timeline' });
            return true;
          }
          let clips: Clip[];
          try {
            // The normative converter accepts cue JSON, SRT and WebVTT.
            clips = cuesToClips(source, { idPrefix: 'cue-import' });
          } catch (error) {
            sendJson(response, 422, { error: `could not parse captions: ${String((error as Error).message ?? error)}` });
            return true;
          }
          if (!clips.length) {
            sendJson(response, 422, { error: 'no cues recognised — paste SRT, WebVTT or cue JSON' });
            return true;
          }
          const operations: EditOperation[] = [];
          let track = body.laneId ? timeline.tracks.find((candidate) => candidate.id === body.laneId) : undefined;
          if (!track) track = timeline.tracks.find((candidate) => candidate.type === 'caption');
          let trackId: string;
          if (!track || track.type !== 'caption') {
            trackId = nextStudioId(session.project, 'captions');
            operations.push({
              op: 'track.add',
              timelineId: timeline.id,
              track: {
                id: trackId,
                type: 'caption',
                name: 'Captions',
                order: timeline.tracks.reduce((max, candidate) => Math.max(max, candidate.order), 0) + 1,
              },
            });
          } else {
            trackId = track.id;
          }
          const takenIds = new Set(timeline.tracks.flatMap((candidate) => candidate.clips.map((clip) => clip.id)));
          for (const cue of clips) {
            let id = cue.id;
            if (takenIds.has(id)) {
              let suffix = 2;
              while (takenIds.has(`cue-import-${suffix}`)) suffix += 1;
              id = `cue-import-${suffix}`;
            }
            takenIds.add(id);
            operations.push({ op: 'clip.add', trackId, clip: { ...cue, id } as Clip });
          }
          const outcome = applyAndSave(operations);
          sendJson(response, outcome.status, { ...outcome.body, added: clips.length });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/reload') {
          const outcome = reloadFromDisk();
          sendJson(response, outcome.status, outcome.body);
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/element') {
          const body = JSON.parse((await readBody(request)) || '{}') as {
            sceneId?: string;
            path?: number[];
            patch?: HtmlElementPatch;
          };
          if (!body.sceneId || !Array.isArray(body.path) || !body.patch || typeof body.patch !== 'object') {
            sendJson(response, 400, { error: 'sceneId, path and patch are required' });
            return true;
          }
          const scene = session.project.scenes.find((candidate) => candidate.id === body.sceneId);
          if (!scene) {
            sendJson(response, 404, { error: `scene not found: ${body.sceneId}` });
            return true;
          }
          try {
            if (scene.src) {
              const cleanSrc = scene.src.split('#')[0]!.split('?')[0]!;
              let decoded = cleanSrc;
              try {
                decoded = decodeURIComponent(cleanSrc);
              } catch {
                /* keep raw */
              }
              const file = path.resolve(root, decoded);
              if (!isInsideRoot(root, file)) {
                sendJson(response, 400, { error: `external Scene escapes the project root: ${scene.src}` });
                return true;
              }
              const realFile = fs.realpathSync(file);
              if (!isInsideRoot(fs.realpathSync(root), realFile)) {
                sendJson(response, 400, { error: `external Scene resolves outside the project root: ${scene.src}` });
                return true;
              }
              const original = fs.readFileSync(realFile, 'utf8');
              const updated = patchHtmlElement(original, body.path, body.patch);
              const temporary = `${realFile}.vhtml-edit-${process.pid}-${Date.now()}`;
              fs.writeFileSync(temporary, updated, 'utf8');
              fs.renameSync(temporary, realFile);
              const reloaded = reloadFromDisk();
              if (reloaded.status !== 200) {
                fs.writeFileSync(realFile, original, 'utf8');
                sendJson(response, reloaded.status, reloaded.body);
                return true;
              }
              sendJson(response, 200, {
                ...reloaded.body,
                ok: true,
                external: true,
                undoable: false,
                sceneId: scene.id,
                path: body.path,
              });
              return true;
            }
            const updated = patchHtmlElement(scene.html, body.path, body.patch);
            const outcome = applyAndSave([
              { op: 'scene.set', sceneId: scene.id, props: { html: updated } },
            ]);
            sendJson(response, outcome.status, {
              ...outcome.body,
              external: false,
              undoable: true,
              sceneId: scene.id,
              path: body.path,
            });
            return true;
          } catch (error) {
            sendJson(response, 400, { error: (error as Error).message });
            return true;
          }
        }
        if (request.method === 'POST' && url.pathname === '/api/edit') {
          const body = JSON.parse((await readBody(request)) || '{}') as { operations?: EditOperation[] };
          const outcome = applyAndSave(body.operations ?? []);
          sendJson(response, outcome.status, outcome.body);
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/undo') {
          if (!session.canUndo) {
            sendJson(response, 200, { ok: false, message: 'nothing to undo', ...responseForProject() });
            return true;
          }
          session.undo();
          save();
          rebuildStage();
          revision += 1;
          latestDiagnostics = validateDocument({ specVersion: '1.1', project: session.project }, { root, checkFiles: false }).diagnostics;
          sendJson(response, 200, { ok: true, ...responseForProject() });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/redo') {
          if (!session.canRedo) {
            sendJson(response, 200, { ok: false, message: 'nothing to redo', ...responseForProject() });
            return true;
          }
          session.redo();
          save();
          rebuildStage();
          revision += 1;
          latestDiagnostics = validateDocument({ specVersion: '1.1', project: session.project }, { root, checkFiles: false }).diagnostics;
          sendJson(response, 200, { ok: true, ...responseForProject() });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/generate') {
          const body = JSON.parse((await readBody(request)) || '{}') as { taskIds?: string[]; force?: boolean };
          const { materializeGenerations } = await import('@sdkwork/vhtml-generation');
          const generated = await materializeGenerations({
            project: session.project,
            root,
            taskIds: body.taskIds,
            force: body.force,
            cachePath: cacheFilePath(root, layout),
          });
          if (generated.failed.length) {
            sendJson(response, 422, {
              ok: false,
              message: 'generation failed for some tasks',
              failed: generated.failed,
              ran: generated.ran,
              ...responseForProject(),
            });
            return true;
          }
          session = new EditSession(generated.project);
          save();
          rebuildStage();
          revision += 1;
          latestDiagnostics = validateDocument({ specVersion: '1.1', project: session.project }, { root, checkFiles: false }).diagnostics;
          sendJson(response, 200, {
            ok: true,
            ran: generated.ran,
            skipped: generated.skipped,
            issues: generated.issues,
            ...responseForProject(),
          });
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/export') {
          const payload = JSON.parse((await readBody(request)) || '{}') as {
            format?: string;
            width?: number;
            height?: number;
            crf?: number;
            start?: number;
            duration?: number;
            delivery?: string;
            burnCaptions?: boolean;
            captions?: boolean;
            loudness?: number;
            report?: boolean;
          };
          const project = structuredClone(session.project);
          let output: OutputConfig;
          if (payload.delivery) {
            try {
              output = outputForDelivery(project, payload.delivery, { id: 'studio-delivery' });
            } catch (error) {
              sendJson(response, 400, { error: (error as Error).message });
              return true;
            }
            if (payload.format) output.format = payload.format as typeof output.format;
          } else {
            output = structuredClone(
              project.outputs[0] ?? {
                id: 'mp4',
                timeline: project.mainTimeline,
                format: 'mp4',
                width: project.composition.width,
                height: project.composition.height,
                frameRate: project.composition.frameRate,
                videoCodec: 'libx264',
                audioCodec: 'aac',
                sampleRate: project.composition.sampleRate,
                channels: project.composition.channels,
                pixelFormat: 'yuv420p',
                colorSpace: project.composition.colorSpace,
                background: project.composition.background,
                burnCaptions: false,
              },
            );
            if (payload.format) output.format = payload.format as typeof output.format;
            if (payload.width) output.width = Math.max(16, Math.round(payload.width));
            if (payload.height) output.height = Math.max(16, Math.round(payload.height));
          }
          if (payload.crf !== undefined) output.crf = payload.crf;
          output.burnCaptions = Boolean(payload.burnCaptions);
          const timeline = findTimeline(project, output.timeline) ?? project.timelines[0];
          const start = payload.start
            ? rat(Math.round(payload.start * 1_000_000), 1_000_000)
            : undefined;
          const duration = payload.duration
            ? rat(Math.round(payload.duration * 1_000_000), 1_000_000)
            : timeline
              ? sub(timeline.duration, start ?? { num: 0, den: 1 })
              : undefined;
          if (!duration || duration.num <= 0) {
            sendJson(response, 400, { error: 'no timeline duration' });
            return true;
          }
          const extension =
            output.format === 'webm' ? 'webm' :
            output.format === 'gif' ? 'gif' :
            output.format === 'wav' ? 'wav' :
            output.format === 'mp3' ? 'mp3' :
            output.format === 'png-sequence' ? '' : 'mp4';
          const preflight = validateDocument(
            { specVersion: '1.1', project },
            { root, checkFiles: true },
          );
          if (!preflight.ok) {
            sendJson(response, 422, {
              error: 'project has blocking diagnostics; fix assets before export',
              diagnostics: preflight.errors,
            });
            return true;
          }
          const taskId = `studio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const fileStem = payload.delivery
            ? `${project.id}-${payload.delivery}`
            : `${project.id}-${taskId}`;
          const relativeOut = path.join(layout.renders, `${fileStem}${extension ? `.${extension}` : ''}`);
          const absoluteOut = path.join(root, relativeOut);
          const job: Job = {
            id: taskId,
            status: 'running',
            phase: 'prepare',
            percent: 0,
            frame: 0,
            total: 0,
            createdAt: Date.now(),
          };
          jobs.set(taskId, job);
          sendJson(response, 200, { jobId: taskId });
          void (async () => {
            try {
              if (project.generations.some((task) => !project.assets.some((asset) => asset.generatedBy === task.id))) {
                const generated = await materializeGenerations({
                  project,
                  root,
                  failFast: true,
                  cachePath: cacheFilePath(root, layout),
                  generatedDir: layout.generated,
                });
                project.assets = generated.project.assets;
              }
              const result = await exportProject({
                project,
                root,
                output,
                outputPath: absoluteOut,
                frameRate: output.frameRate,
                rangeStart: start,
                rangeDuration: duration,
                crf: payload.crf,
                generateCaptions: Boolean(payload.captions),
                loudness: typeof payload.loudness === 'number' ? payload.loudness : undefined,
                reportPath: payload.report ? `${absoluteOut}.report.json` : undefined,
                timeoutMs: 30_000,
                executablePath: options.chrome ?? manifest.preview?.chrome,
                onProgress: (progress) => {
                  job.phase = progress.phase;
                  job.percent = progress.percent;
                  job.frame = progress.frame;
                  job.total = progress.totalFrames;
                  job.message = progress.message;
                },
              });
              job.status = 'succeeded';
              job.phase = 'done';
              job.percent = 100;
              job.sizeBytes = result.sizeBytes;
              job.file = path.relative(root, result.path);
              job.url = '/' + job.file.split(path.sep).join('/');
              if (result.captionsPath) {
                job.captions = '/' + path.relative(root, result.captionsPath).split(path.sep).join('/');
              }
              if (result.reportPath) {
                job.report = '/' + path.relative(root, result.reportPath).split(path.sep).join('/');
              }
            } catch (error) {
              job.status = 'failed';
              job.error = (error as Error).message;
            }
          })();
          return true;
        }
        if (request.method === 'GET' && url.pathname.startsWith('/api/job/')) {
          const id = decodeURIComponent(url.pathname.slice('/api/job/'.length));
          const job = jobs.get(id);
          if (!job) {
            sendJson(response, 404, { error: 'job_not_found' });
            return true;
          }
          sendJson(response, 200, job);
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/presets') {
          sendJson(response, 200, {
            ok: true,
            presets: DELIVERY_PRESETS.map((preset) => ({
              id: preset.id,
              label: preset.label,
              description: preset.description,
              format: preset.format,
              width: preset.width,
              height: preset.height,
              aspectRatio: preset.aspectRatio,
            })),
          });
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/media/peaks') {
          const assetId = url.searchParams.get('asset') ?? '';
          const found = resolveAssetFile(session.project, root, assetId);
          if (typeof found === 'string') {
            sendJson(response, 404, { error: found });
            return true;
          }
          const { asset, file } = found;
          const stat = fs.statSync(file);
          const key = mediaCacheKey([asset.id, String(stat.mtimeMs), String(stat.size)]);
          const cacheFile = path.join(mediaCacheDir, `peaks-${key}.json`);
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { buckets: number[]; durationSeconds: number };
            sendJson(response, 200, { ok: true, assetId, cached: true, ...cached });
            return true;
          } catch {
            /* recompute below */
          }
          try {
            const peaks = await onceByKey(`peaks:${cacheFile}`, () => withOneRetry(() => audioPeaks(file)));
            fs.mkdirSync(mediaCacheDir, { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify(peaks), 'utf8');
            sendJson(response, 200, { ok: true, assetId, cached: false, ...peaks });
          } catch (error) {
            // Video-only sources have no audio stream to decode: report silence
            // instead of an error so the client simply draws no waveform.
            if ((error as Error).message.includes('does not contain any stream')) {
              const silent = { buckets: [] as number[], durationSeconds: 0 };
              fs.mkdirSync(mediaCacheDir, { recursive: true });
              fs.writeFileSync(cacheFile, JSON.stringify(silent), 'utf8');
              sendJson(response, 200, { ok: true, assetId, cached: false, silent: true, ...silent });
              return true;
            }
            sendJson(response, 502, { error: `waveform failed: ${(error as Error).message}` });
          }
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/media/poster') {
          const assetId = url.searchParams.get('asset') ?? '';
          const at = Math.max(0, Number(url.searchParams.get('t') ?? '0') || 0);
          const found = resolveAssetFile(session.project, root, assetId);
          if (typeof found === 'string') {
            sendJson(response, 404, { error: found });
            return true;
          }
          const { asset, file } = found;
          const stat = fs.statSync(file);
          const key = mediaCacheKey([asset.id, at.toFixed(3), String(stat.mtimeMs), String(stat.size)]);
          const cacheFile = path.join(mediaCacheDir, `poster-${key}.jpg`);
          const respond = (data: Buffer): void => {
            response.writeHead(200, {
              'content-type': 'image/jpeg',
              'cache-control': 'no-store',
              'content-length': data.length,
            });
            response.end(data);
          };
          try {
            respond(fs.readFileSync(cacheFile));
            return true;
          } catch {
            /* recompute below */
          }
          try {
            const data = await onceByKey(`poster:${cacheFile}`, () => withOneRetry(() => posterFrame(file, at)));
            fs.mkdirSync(mediaCacheDir, { recursive: true });
            fs.writeFileSync(cacheFile, data);
            respond(data);
          } catch (error) {
            sendJson(response, 502, { error: `poster failed: ${(error as Error).message}` });
          }
          return true;
        }
        if (request.method === 'GET' && url.pathname === '/api/media/proxy') {
          // Edit-friendly proxy: 360p H.264 (veryfast, yuv420p, faststart),
          // content-addressed under the media cache. Remote/data assets are
          // passed through untouched.
          const assetId = url.searchParams.get('asset') ?? '';
          const found = resolveAssetFile(session.project, root, assetId);
          if (typeof found === 'string') {
            sendJson(response, 404, { error: found });
            return true;
          }
          const { asset, file } = found;
          const stat = fs.statSync(file);
          const key = mediaCacheKey([asset.id, 'proxy360', String(stat.mtimeMs), String(stat.size)]);
          const cacheFile = path.join(mediaCacheDir, `proxy-${key}.mp4`);
          const respond = (data: Buffer): void => {
            response.writeHead(200, {
              'content-type': 'video/mp4',
              'cache-control': 'no-store',
              'content-length': data.length,
            });
            response.end(data);
          };
          if (fs.existsSync(cacheFile)) {
            respond(fs.readFileSync(cacheFile));
            return true;
          }
          try {
            fs.mkdirSync(mediaCacheDir, { recursive: true });
            const data = await onceByKey(`proxy:${cacheFile}`, async () => {
              const result = await runTool(
                ffmpegPath(),
                [
                  '-nostdin', '-v', 'error', '-y',
                  '-i', file,
                  '-vf', 'scale=-2:360',
                  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
                  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                  '-an',
                  cacheFile,
                ],
                { timeoutMs: 300_000, maxOutputBytes: 256 * 1024 * 1024 },
              );
              void result;
              return fs.readFileSync(cacheFile);
            });
            respond(data);
          } catch (error) {
            sendJson(response, 502, { error: `proxy failed: ${(error as Error).message}` });
          }
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/snapshot') {
          const body = JSON.parse((await readBody(request)) || '{}') as { time?: number };
          const at = Math.max(0, Math.min(
            toNumber(findTimeline(session.project, session.project.mainTimeline)?.duration ?? project_duration(session.project)),
            Number(body.time) || 0,
          ));
          const snapshotId = `snapshot-${Date.now().toString(36)}`;
          const relativeOut = path.join(layout.renders, `${snapshotId}.png`);
          const absoluteOut = path.join(root, relativeOut);
          const job: Job = {
            id: snapshotId,
            status: 'running',
            phase: 'render',
            percent: 10,
            frame: 0,
            total: 1,
            createdAt: Date.now(),
          };
          jobs.set(snapshotId, job);
          sendJson(response, 200, { jobId: snapshotId });
          const projectClone = structuredClone(session.project);
          void (async () => {
            const renderer = new VhtmlRenderer({
              project: projectClone,
              root,
              timelineId: projectClone.mainTimeline,
              executablePath: options.chrome ?? manifest.preview?.chrome,
              timeoutMs: 30_000,
            });
            try {
              const captured = await renderer.sampleTime(at);
              fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
              fs.writeFileSync(absoluteOut, captured.png);
              job.status = 'succeeded';
              job.phase = 'done';
              job.percent = 100;
              job.file = relativeOut.split(path.sep).join('/');
              job.url = '/' + job.file;
              job.sizeBytes = captured.png.length;
            } catch (error) {
              job.status = 'failed';
              job.error = (error as Error).message;
            } finally {
              void renderer.close().catch(() => {});
            }
          })();
          return true;
        }
        if (request.method === 'POST' && url.pathname === '/api/clipboard') {
          const body = JSON.parse((await readBody(request)) || '{}') as {
            action?: 'copy' | 'paste' | 'clear';
            clipIds?: string[];
            start?: number | string;
            trackId?: string;
          };
          const action = body.action ?? 'copy';
          if (action === 'clear') {
            sendJson(response, 200, { ok: true, count: 0 });
            return true;
          }
          const timelineForClipboard = findTimeline(session.project, session.project.mainTimeline) ?? session.project.timelines[0];
          if (!timelineForClipboard) {
            sendJson(response, 400, { error: 'project has no timeline' });
            return true;
          }
          const operations: EditOperation[] = [];
          if (action === 'copy') {
            operations.push({ op: 'timeline.copy', clipIds: body.clipIds ?? [] });
          } else {
            operations.push({
              op: 'timeline.paste',
              at: parseStudioTime(body.start, session.project.composition.frameRate) ?? rat(0),
              laneId: body.trackId,
              mode: 'add',
              idPrefix: 'pasted',
            });
          }
          const outcome = applyAndSave(operations);
          sendJson(response, outcome.status, outcome.body);
          return true;
        }
        sendJson(response, 404, { error: 'not_found' });
        return true;
      } catch (error) {
        sendJson(response, 500, { error: (error as Error).message });
        return true;
      }
    },
  });

  const finalServer = server;
  const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  const originHost = displayHost.includes(':') ? `[${displayHost}]` : displayHost;
  const origin = `http://${originHost}:${finalServer.port}`;
  const url = `${origin}/studio`;

  const autosavePath = `${entry}.autosave`;
  const autosaveMs = Math.max(0, options.autosaveMs ?? (Number(process.env.VHTML_AUTOSAVE_MS) || 15_000));
  // Rolling checkpoint: whenever the session revision changed since the last
  // snapshot, write the model to `<entry>.autosave`. Edits already persist to
  // the entry immediately; the checkpoint guards against a crash mid-save and
  // gives the next session a restorable point in time.
  let lastCheckpointRevision = -1;
  const autosaveTimer = autosaveMs > 0
    ? setInterval(() => {
        if (lastCheckpointRevision === revision) return;
        lastCheckpointRevision = revision;
        try {
          fs.writeFileSync(autosavePath, serializeDocument({ specVersion: '1.1', project: session.project }), 'utf8');
        } catch {
          /* transient IO; the next tick retries */
        }
      }, autosaveMs)
    : undefined;
  autosaveTimer?.unref();

  const handle: StudioHandle = {
    url,
    embedUrl: `${url}?embed=1`,
    origin,
    port: finalServer.port,
    root,
    project: () => session.project,
    apply: async (operations: EditOperation[]) => {
      const outcome = applyAndSave(operations);
      return {
        ok: outcome.status === 200,
        changed: outcome.status === 200 ? ((outcome.body as { changed?: string[] }).changed ?? []) : [],
        diagnostics: outcome.status === 200
          ? ((outcome.body as { diagnostics?: Diagnostic[] }).diagnostics ?? [])
          : ((outcome.body as { diagnostics?: Diagnostic[] }).diagnostics ?? []),
      };
    },
    save: () => save(),
    loadDocument: (source: string) => {
      const nextParsed = parseVhtml(source, { file: entry, root });
      {
        const materialized = materializeDocument(nextParsed.document);
        nextParsed.document = materialized.document;
        nextParsed.diagnostics.push(...materialized.diagnostics);
      }
      if (nextParsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        throw new VhtmlError(
          ErrorCode.PARSE_INVALID_DOCUMENT,
          `loadDocument failed: ${(nextParsed.diagnostics.find((d) => d.severity === 'error') as Diagnostic).message}`,
        );
      }
      hydrateCachedAssets(nextParsed.document.project, root, cacheFilePath(root, layout));
      session = new EditSession(nextParsed.document.project);
      documentSource = nextParsed.document.source;
      stageHtml = buildStageHtml({
        project: session.project,
        timelineId: session.project.mainTimeline,
        mode: 'preview',
        runtimeSource,
      });
      save();
      rebuildStage();
      revision += 1;
    },
    close: () => finalServer.close(),
  };

  if (options.detach) {
    // Embeddable/programmatic mode: no console output, no browser auto-open,
    // no signal handlers — the host process owns the lifecycle.
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [id, job] of jobs) {
        if (now - job.createdAt > 60 * 60 * 1000) jobs.delete(id);
      }
    }, 60_000);
    cleanup.unref();
    options.onStarted?.(handle);
    return 0;
  }

  console.log(`VHTML Studio  ${url}`);
  console.log(`embed:   ${handle.embedUrl}`);
  console.log(`project: ${path.relative(process.cwd(), entry)}`);
  console.log(`root:    ${path.relative(process.cwd(), root) || '.'}`);
  console.log(`stage:   ${origin}/__vhtml/stage.html`);
  console.log(`auth:    ${auth ? `basic (${auth.username})` : 'disabled'}`);
  if (!isLoopbackHost(host)) console.log(`bind:    ${host} (remote access enabled)`);
  console.log('Press Ctrl+C to stop.');
  if (options.open ?? manifest.preview?.open) openBrowser(url, options.chrome, options.appWindow);

  const shutdown = (): void => {
    void finalServer.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.createdAt > 60 * 60 * 1000) jobs.delete(id);
    }
  }, 60_000);
  cleanup.unref();
  options.onStarted?.(handle);
  return 0;
}

/**
 * Programmatic/embedding entry point: start the Studio for a project and get
 * an operable handle back (apply edits, save, reload, close). Unlike
 * `startStudio` this never installs signal handlers or prints to the console —
 * the host application owns the process lifecycle.
 *
 * ```ts
 * const studio = await startStudioServer('./my-video', { port: 0 });
 * await studio.apply([{ op: 'clip.set', clipId: 'hero', props: { opacity: 0.5 } }]);
 * console.log(studio.url, studio.embedUrl);
 * await studio.close();
 * ```
 */
export async function startStudioServer(
  input: string | undefined,
  options: Omit<StudioOptions, 'detach'> & { timeoutMs?: number } = {},
): Promise<StudioHandle> {
  return new Promise<StudioHandle>((resolve, reject) => {
    let settled = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error(`Studio did not start within ${options.timeoutMs}ms`));
          }
        }, options.timeoutMs)
      : undefined;
    void startStudio(input, {
      ...options,
      detach: true,
      onStarted: (handle) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(handle);
      },
    }).then((exitCode) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new Error(`Studio exited early with code ${exitCode}`));
    }, reject);
  });
}
