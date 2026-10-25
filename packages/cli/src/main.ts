#!/usr/bin/env node
/**
 * VHTML CLI.
 *
 * Design goals: deterministic output, stable JSON, meaningful exit codes and
 * no hidden network/model calls unless explicitly requested.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { materializeDocument } from '@sdkwork/vhtml-core/program';
import { validateDocument, type ValidationResult } from '@sdkwork/vhtml-core/validate';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import {
  ErrorCode,
  VhtmlError,
  formatDiagnostic,
  toErrorMessage,
  type Diagnostic,
} from '@sdkwork/vhtml-core/errors';
import {
  ZERO,
  add,
  formatRate,
  frameCount,
  frameTime,
  parseFrameRate,
  parseTime,
  rateToNumber,
  sub,
  toNumber,
  type Rational,
} from '@sdkwork/vhtml-core/time';
import { findTimeline, type OutputConfig, type Project, type VhtmlDocument } from '@sdkwork/vhtml-core/model';
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { capabilityReport } from '@sdkwork/vhtml-runtime/capabilities';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';
import { exportProject, type ExportFormat } from '@sdkwork/vhtml-media/export';
import { mixSoundtrack, writeWavFloat } from '@sdkwork/vhtml-media/audio';
import { writeCaptions } from '@sdkwork/vhtml-media/captions';
import { assertFfmpeg, ffmpegVersion, probeMedia } from '@sdkwork/vhtml-ffmpeg';
import { hydrateCachedAssets, materializeGenerations } from '@sdkwork/vhtml-generation';
import { serializeVideoDocument } from '@sdkwork/vhtml-sdk';
import { DELIVERY_PRESETS, outputForDelivery } from '@sdkwork/vhtml-core/presets';
import {
  cacheFilePath,
  defaultManifest,
  ensureProjectLayout,
  isInsideRoot,
  readManifest,
  resolveProjectInput,
  toPosixRelative,
  writeManifest,
  type ProjectLayoutPaths,
  type ProjectManifest,
} from '@sdkwork/vhtml-project/manifest';
import {
  collectAssetInventory,
  importAssetFile,
  verifyAssetInventory,
  type AssetInventory,
} from '@sdkwork/vhtml-project/assets';
import { packProject, packageInfo, unpackProject } from '@sdkwork/vhtml-project/pack';

const VERSION = '1.1.1';

const BOOLEAN_FLAGS = new Set([
  'json', 'open', 'generate', 'force', 'write', 'no-assets', 'burn-captions',
  'quiet', 'verbose', 'help', 'version', 'keep-temp', 'no-normalize', 'strict',
  'all', 'no-generate', 'backup', 'probe', 'full', 'check', 'no-cache',
  'allow-network', 'allow-remote', 'include-renders', 'no-generated', 'missing',
  'unused', 'yes', 'assets', 'dry-run', 'insecure', 'detach',
]);

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
  /** Repeatable flags collected as arrays (currently `param`). */
  multi: Map<string, string[]>;
}

const MULTI_VALUE_FLAGS = new Set(['param']);

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  const multi = new Map<string, string[]>();
  let command = '';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const equals = body.indexOf('=');
      if (equals !== -1) {
        const flagName = body.slice(0, equals);
        const flagValue = body.slice(equals + 1);
        if (MULTI_VALUE_FLAGS.has(flagName)) {
          const list = multi.get(flagName) ?? [];
          list.push(flagValue);
          multi.set(flagName, list);
        } else {
          flags.set(flagName, flagValue);
        }
        continue;
      }
      const name = body;
      if (BOOLEAN_FLAGS.has(name) || name.startsWith('no-')) {
        flags.set(name, true);
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && (next === '-' || !next.startsWith('-'))) {
        if (MULTI_VALUE_FLAGS.has(name)) {
          const list = multi.get(name) ?? [];
          list.push(next);
          multi.set(name, list);
        } else {
          flags.set(name, next);
        }
        index += 1;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length === 2) {
      const name = arg.slice(1);
      const alias = name === 'o' ? 'out' : name === 'j' ? 'json' : name === 'h' ? 'help' : name;
      if (alias === 'json' || alias === 'help') {
        flags.set(alias, true);
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && (next === '-' || !next.startsWith('-'))) {
        flags.set(alias, next);
        index += 1;
      } else {
        flags.set(alias, true);
      }
      continue;
    }
    if (!command) command = arg;
    else positionals.push(arg);
  }
  return { command, positionals, flags, multi };
}

/**
 * Authoring-program parameters from repeated `--param key=value` flags.
 * Values are strings by spec; `k=v=v2` keeps everything after the first `=`.
 */
function programParams(args: ParsedArgs): Record<string, string> | undefined {
  const list = args.multi.get('param');
  if (!list?.length) return undefined;
  const params: Record<string, string> = {};
  for (const entry of list) {
    const equals = entry.indexOf('=');
    if (equals === -1) {
      params[entry] = '';
      continue;
    }
    params[entry.slice(0, equals)] = entry.slice(equals + 1);
  }
  return params;
}

/**
 * Program params for the current CLI invocation, shared by every loadProject
 * call (the CLI executes one command per process).
 */
let activeProgramParams: Record<string, string> | undefined;

function flag(args: ParsedArgs, name: string): string | boolean | undefined {
  return args.flags.get(name);
}

function bool(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (typeof value === 'string') return value !== 'false' && value !== '0';
  return Boolean(value);
}

function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function color(code: number, text: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function printDiagnostics(diagnostics: Diagnostic[], quiet = false): void {
  const seen = new Set<string>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.severity}:${diagnostic.code}:${diagnostic.objectId ?? ''}:${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (quiet && diagnostic.severity === 'info') continue;
    const text = formatDiagnostic(diagnostic, process.cwd());
    if (diagnostic.severity === 'error') console.error(color(31, text));
    else if (diagnostic.severity === 'warning') console.error(color(33, text));
    else if (!quiet) console.error(color(90, text));
  }
}

interface LoadedProject {
  file: string;
  root: string;
  manifest: ProjectManifest;
  layout: ProjectLayoutPaths;
  manifestPath?: string;
  sourcePath?: string;
  document: VhtmlDocument;
  parseDiagnostics: Diagnostic[];
  validation: ValidationResult;
}

function loadProject(
  file?: string,
  options: { checkFiles?: boolean; allowRemote?: boolean; hydrate?: boolean; params?: Record<string, string> } = {},
): LoadedProject {
  const resolved = resolveProjectInput(file);
  const absolute = resolved.entry;
  if (!fs.existsSync(absolute)) {
    throw new VhtmlError(ErrorCode.IO_NOT_FOUND, `project entry not found: ${absolute}`);
  }
  const root = resolved.root;
  const source = fs.readFileSync(absolute, 'utf8');
  const parsed = parseVhtml(source, { file: absolute, root });
  const materialized = materializeDocument(parsed.document, { params: options.params ?? activeProgramParams });
  parsed.document = materialized.document;
  parsed.diagnostics.push(...materialized.diagnostics);
  if (options.hydrate !== false) {
    hydrateCachedAssets(parsed.document.project, root, cacheFilePath(root, resolved.layout));
  }
  const validation = validateDocument(parsed.document, {
    root,
    checkFiles: options.checkFiles ?? true,
    allowRemoteAssets: options.allowRemote ?? false,
    diagnostics: parsed.diagnostics,
  });
  return {
    file: absolute,
    root,
    manifest: resolved.manifest,
    layout: resolved.layout,
    manifestPath: resolved.manifestPath,
    sourcePath: resolved.source,
    document: parsed.document,
    parseDiagnostics: parsed.diagnostics,
    validation,
  };
}

function requireValid(loaded: LoadedProject, quiet = false): void {
  printDiagnostics(loaded.validation.diagnostics, quiet);
  if (!loaded.validation.ok) {
    throw new VhtmlError(ErrorCode.EXPORT_VALIDATION_FAILED, 'project validation failed');
  }
}

function saveLoadedProject(loaded: LoadedProject): void {
  const relativeEntry = path.relative(loaded.root, loaded.file).split(path.sep).join('/');
  if (!loaded.manifestPath) {
    loaded.manifest.id = loaded.document.project.id;
    loaded.manifest.entry = relativeEntry;
    loaded.manifestPath = writeManifest(loaded.root, loaded.manifest);
  } else if (loaded.manifest.entry !== relativeEntry && !fs.existsSync(path.join(loaded.root, loaded.manifest.entry))) {
    loaded.manifest.entry = relativeEntry;
    writeManifest(loaded.root, loaded.manifest);
  }
  fs.writeFileSync(
    loaded.file,
    serializeDocument({
      specVersion: '1.1',
      project: loaded.document.project,
      source: loaded.document.source,
      // Editor round-trips freeze authoring programs: the materialised model
      // is now the source of truth and re-running the program would overwrite
      // manual edits.
      program: undefined,
      dataBlocks: undefined,
    }),
    'utf8',
  );
}

function resolveRange(
  text: string | undefined,
  fps: { num: number; den: number },
  timelineDuration: Rational,
): { start: Rational; duration: Rational } | undefined {
  if (!text) return undefined;
  const value = text.trim();
  if (value.includes('+')) {
    const [startRaw, durationRaw] = value.split('+');
    if (!startRaw || !durationRaw) throw new Error(`invalid range "${text}"`);
    return {
      start: parseTime(startRaw, { frameRate: fps }),
      duration: parseTime(durationRaw, { frameRate: fps }),
    };
  }
  if (value.includes(':')) {
    const [startRaw, endRaw] = value.split(':');
    if (!startRaw || !endRaw) throw new Error(`invalid range "${text}"`);
    const start = parseTime(startRaw, { frameRate: fps });
    const end = parseTime(endRaw, { frameRate: fps });
    return { start, duration: sub(end, start) };
  }
  const start = parseTime(value, { frameRate: fps });
  return { start, duration: sub(timelineDuration, start) };
}

function outputFor(project: Project, args: ParsedArgs): OutputConfig {
  const id = stringFlag(args, 'output-id');
  let output = id ? project.outputs.find((candidate) => candidate.id === id) : project.outputs[0];
  if (!output) {
    output = {
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
    };
  } else {
    output = structuredClone(output);
  }
  const delivery = stringFlag(args, 'delivery');
  if (delivery) output = outputForDelivery(project, delivery, { baseOutputId: id });
  const format = stringFlag(args, 'format') as ExportFormat | undefined;
  if (format) output.format = format;
  const width = stringFlag(args, 'width');
  if (width) output.width = Number(width);
  const height = stringFlag(args, 'height');
  if (height) output.height = Number(height);
  const fps = stringFlag(args, 'fps');
  if (fps) output.frameRate = parseFrameRate(fps);
  return output;
}

function printSummary(project: Project): void {
  console.log(`${color(36, project.title ?? project.id)}  (${project.id})`);
  console.log(`  composition  ${project.composition.width}x${project.composition.height} @ ${formatRate(project.composition.frameRate)} fps, ${(toNumber(project.composition.duration)).toFixed(3)}s, ${project.composition.sampleRate} Hz/${project.composition.channels}ch`);
  console.log(`  assets       ${project.assets.length}`);
  console.log(`  scenes       ${project.scenes.length}`);
  console.log(`  generations  ${project.generations.length}`);
  console.log(`  timelines    ${project.timelines.length} (main: ${project.mainTimeline})`);
  for (const timeline of project.timelines) {
    console.log(`    ${timeline.id}  ${(toNumber(timeline.duration)).toFixed(3)}s  ${timeline.tracks.length} lane(s)`);
    for (const track of [...timeline.tracks].sort((a, b) => a.order - b.order)) {
      console.log(`      [${track.type}] ${track.id}  ${track.clips.length} clip(s), ${track.transitions.length} transition(s)`);
      for (const clip of track.clips.slice(0, 8)) {
        console.log(`        ${clip.id}  ${clip.kind}  ${(toNumber(clip.start)).toFixed(3)}s + ${(toNumber(clip.duration)).toFixed(3)}s  ${clip.ref ?? ''}`);
      }
      if (track.clips.length > 8) console.log(`        … ${track.clips.length - 8} more`);
    }
  }
  for (const output of project.outputs) {
    console.log(`  output       ${output.id}: ${output.format} ${output.width}x${output.height} @ ${formatRate(output.frameRate)}`);
  }
}

async function commandValidate(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const loaded = loadProject(file, {
    checkFiles: !bool(args, 'no-assets'),
    hydrate: !bool(args, 'no-cache'),
  });
  const diagnostics = loaded.validation.diagnostics;
  const json = bool(args, 'json');
  if (json) {
    console.log(JSON.stringify({
      ok: loaded.validation.ok,
      file: loaded.file,
      errors: loaded.validation.errors.length,
      warnings: loaded.validation.warnings.length,
      diagnostics,
    }, null, 2));
  } else {
    printDiagnostics(diagnostics);
    const summary = loaded.validation.ok
      ? color(32, `valid (${loaded.validation.warnings.length} warning(s))`)
      : color(31, `invalid (${loaded.validation.errors.length} error(s))`);
    console.log(`${path.relative(process.cwd(), loaded.file)}: ${summary}`);
  }
  return loaded.validation.ok ? 0 : 1;
}

async function commandInspect(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const loaded = loadProject(file, {
    checkFiles: bool(args, 'probe'),
    hydrate: !bool(args, 'no-cache'),
  });
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ project: loaded.document.project, diagnostics: loaded.validation.diagnostics }, null, 2));
    return loaded.validation.ok ? 0 : 1;
  }
  printSummary(loaded.document.project);
  if (loaded.validation.warnings.length) {
    console.log(color(33, `\n${loaded.validation.warnings.length} warning(s):`));
    printDiagnostics(loaded.validation.warnings);
  }
  return loaded.validation.ok ? 0 : 1;
}

async function commandRender(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const loaded = loadProject(file, { checkFiles: true });
  requireValid(loaded, bool(args, 'quiet'));
  const project = loaded.document.project;
  const timelineId = stringFlag(args, 'timeline') ?? project.mainTimeline;
  const timeline = findTimeline(project, timelineId);
  if (!timeline) throw new Error(`timeline "${timelineId}" does not exist`);
  const frameRaw = stringFlag(args, 'frame');
  const timeRaw = stringFlag(args, 'time');
  let requestedTime = ZERO;
  let frameIndex = 0;
  if (timeRaw) {
    requestedTime = parseTime(timeRaw, { frameRate: project.composition.frameRate });
    frameIndex = Math.floor(toNumber(requestedTime) * rateToNumber(project.composition.frameRate));
  } else if (frameRaw) {
    frameIndex = Number(frameRaw);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) throw new Error(`invalid frame index "${frameRaw}"`);
    requestedTime = frameTime(frameIndex, project.composition.frameRate);
  }
  if (toNumber(requestedTime) > toNumber(timeline.duration)) {
    throw new Error(`requested time ${toNumber(requestedTime).toFixed(3)}s is outside the timeline`);
  }
  const outputPath = stringFlag(args, 'out')
    ? path.resolve(stringFlag(args, 'out')!)
    : path.resolve(loaded.root, loaded.layout.renders, `${project.id}-frame-${frameIndex}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const renderer = new VhtmlRenderer({
    project,
    root: loaded.root,
    timelineId,
    executablePath: stringFlag(args, 'chrome'),
    headless: true,
    allowNetwork: bool(args, 'allow-network'),
    timeoutMs: Number(stringFlag(args, 'timeout') ?? 30_000),
  });
  try {
    await renderer.open();
    const captured = await renderer.sampleFrame(frameIndex);
    fs.writeFileSync(outputPath, captured.png);
    if (bool(args, 'json')) {
      console.log(JSON.stringify({
        ok: true,
        path: outputPath,
        frame: frameIndex,
        time: captured.time,
        width: captured.width,
        height: captured.height,
        issues: captured.issues,
        browser: renderer.version,
      }, null, 2));
    } else {
      console.log(`${color(32, 'rendered')} ${path.relative(process.cwd(), outputPath)} (${captured.width}x${captured.height}, frame ${frameIndex})`);
      for (const issue of captured.issues) console.error(color(33, `warning: ${issue}`));
    }
  } finally {
    await renderer.close();
  }
  return 0;
}

/**
 * Batch delivery: `vhtml export . --batch web-1080p,tiktok,reels --out-dir renders`
 * runs one render per preset (shared generation pass), writing
 * `<out-dir>/<project>-<preset>.<ext>`. Exit non-zero if any render fails.
 */
async function commandExportBatch(args: ParsedArgs, batchRaw: string): Promise<number> {
  const presetIds = batchRaw.split(',').map((id) => id.trim()).filter(Boolean);
  const { DELIVERY_PRESETS } = await import('@sdkwork/vhtml-core');
  const unknown = presetIds.filter((id) => !DELIVERY_PRESETS.some((preset) => preset.id === id));
  if (unknown.length) {
    throw new Error(`unknown delivery preset(s): ${unknown.join(', ')}; expected: ${DELIVERY_PRESETS.map((preset) => preset.id).join(', ')}`);
  }
  if (presetIds.length < 2) {
    console.error('batch expects at least two comma-separated presets (single preset works without --batch)');
  }
  const loaded = loadProject(args.positionals[0], { checkFiles: true, allowRemote: bool(args, 'allow-network') });
  if (loaded.validation.errors.length) {
    printDiagnostics(loaded.validation.errors);
    return 1;
  }
  let project = loaded.document.project;
  const needsGeneration = project.generations.some(
    (task) => !project.assets.some((asset) => asset.generatedBy === task.id),
  );
  if (needsGeneration && !bool(args, 'no-generate')) {
    const generated = await materializeGenerations({
      project,
      root: loaded.root,
      provider: stringFlag(args, 'provider'),
      force: bool(args, 'force'),
      cachePath: cacheFilePath(loaded.root, loaded.layout),
      generatedDir: loaded.layout.generated,
    });
    project = generated.project;
    if (generated.failed.length) {
      for (const failure of generated.failed) console.error(color(31, `${failure.taskId}: ${failure.message}`));
      return 1;
    }
  }
  const outDir = path.resolve(stringFlag(args, 'out-dir') ?? path.join(loaded.root, loaded.layout.renders));
  fs.mkdirSync(outDir, { recursive: true });
  const reportDir = stringFlag(args, 'report-dir') ? path.resolve(stringFlag(args, 'report-dir')!) : undefined;
  if (reportDir) fs.mkdirSync(reportDir, { recursive: true });
  const loudness = stringFlag(args, 'loudness') !== undefined ? Number(stringFlag(args, 'loudness')) : undefined;
  const results: Array<{ preset: string; ok: boolean; path?: string; error?: string }> = [];
  let failures = 0;
  for (const presetId of presetIds) {
    const output = outputForDelivery(project, presetId, { id: `batch-${presetId}` });
    const extension = output.format === 'png-sequence' ? 'png' : output.format;
    const targetPath = path.join(outDir, `${project.id}-${presetId}.${extension}`);
    console.error(color(90, `[batch ${presetId}] rendering…`));
    try {
      const result = await exportProject({
        project,
        root: loaded.root,
        output,
        outputPath: targetPath,
        preset: stringFlag(args, 'preset'),
        crf: stringFlag(args, 'crf') !== undefined ? Number(stringFlag(args, 'crf')) : undefined,
        loudness,
        chapters: bool(args, 'chapters'),
        reportPath: reportDir ? path.join(reportDir, `${project.id}-${presetId}.report.json`) : undefined,
        timeoutMs: 30 * 60_000,
      });
      results.push({ preset: presetId, ok: true, path: result.path });
      console.error(color(32, `[batch ${presetId}] ${path.relative(process.cwd(), result.path)} (${result.durationSeconds.toFixed(2)}s)`));
    } catch (error) {
      failures += 1;
      results.push({ preset: presetId, ok: false, error: (error as Error).message });
      console.error(color(31, `[batch ${presetId}] failed: ${(error as Error).message}`));
    }
  }
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: failures === 0, outDir, results }, null, 2));
  } else {
    console.log(failures === 0 ? color(32, `batch complete: ${results.length} delivery file(s) in ${path.relative(process.cwd(), outDir)}`) : color(31, `batch finished with ${failures} failure(s)`));
  }
  return failures === 0 ? 0 : 1;
}

async function commandExport(args: ParsedArgs): Promise<number> {
  // Batch mode: one project -> multiple delivery presets in one pass.
  const batchRaw = stringFlag(args, 'batch');
  if (batchRaw) return await commandExportBatch(args, batchRaw);
  const file = args.positionals[0];
  const loaded = loadProject(file, { checkFiles: true, allowRemote: bool(args, 'allow-network') });
  const project = loaded.document.project;
  if (loaded.validation.errors.length) {
    printDiagnostics(loaded.validation.errors);
    return 1;
  }
  const needsGeneration = project.generations.some(
    (task) => !project.assets.some((asset) => asset.generatedBy === task.id),
  );
  if (needsGeneration && !bool(args, 'no-generate')) {
    const generated = await materializeGenerations({
      project,
      root: loaded.root,
      taskIds: stringFlag(args, 'task') ? [stringFlag(args, 'task')!] : undefined,
      provider: stringFlag(args, 'provider'),
      force: bool(args, 'force'),
      cachePath: cacheFilePath(loaded.root, loaded.layout),
      generatedDir: loaded.layout.generated,
      onProgress: (event) => {
        if (!bool(args, 'json')) console.error(color(90, `[generate ${event.taskId}] ${event.message}`));
      },
    });
    loaded.document.project = generated.project;
    if (generated.failed.length) {
      for (const failure of generated.failed) console.error(color(31, `${failure.taskId}: ${failure.message}`));
      return 1;
    }
    const generatedValidation = validateDocument(
      { specVersion: '1.1', project: loaded.document.project },
      { root: loaded.root, checkFiles: true },
    );
    if (!generatedValidation.ok) {
      printDiagnostics(generatedValidation.errors);
      return 1;
    }
  }
  const output = outputFor(loaded.document.project, args);
  const timeline = findTimeline(loaded.document.project, output.timeline) ?? loaded.document.project.timelines[0]!;
  const range = resolveRange(stringFlag(args, 'range'), output.frameRate, timeline.duration);
  const fps = output.frameRate;
  const defaultOut = path.join(
    loaded.layout.renders,
    output.format === 'png-sequence'
      ? `${loaded.document.project.id}-png`
      : `${loaded.document.project.id}.${output.format}`,
  );
  const outFlag = stringFlag(args, 'out');
  const outCandidate = outFlag ?? output.path ?? defaultOut;
  const outPath = path.isAbsolute(outCandidate)
    ? outCandidate
    : path.resolve(outFlag ? process.cwd() : loaded.root, outCandidate);
  const progressEnabled = !bool(args, 'quiet') && !bool(args, 'json') && process.stderr.isTTY;
  const result = await exportProject({
    project: loaded.document.project,
    root: loaded.root,
    output,
    outputPath: outPath,
    rangeStart: range?.start,
    rangeDuration: range?.duration,
    frameRate: fps,
    width: output.width,
    height: output.height,
    crf: stringFlag(args, 'crf') ? Number(stringFlag(args, 'crf')) : undefined,
    preset: stringFlag(args, 'preset'),
    videoBitrate: stringFlag(args, 'video-bitrate'),
    audioBitrate: stringFlag(args, 'audio-bitrate'),
    sampleRate: stringFlag(args, 'sample-rate') ? Number(stringFlag(args, 'sample-rate')) : output.sampleRate,
    channels: output.channels,
    loudness: stringFlag(args, 'loudness') ? Number(stringFlag(args, 'loudness')) : undefined,
    normalizeAudio: !bool(args, 'no-normalize'),
    captionsPath: stringFlag(args, 'captions') ?? output.captionsPath,
    generateCaptions: bool(args, 'captions') || Boolean(output.captionsPath),
    chapters: bool(args, 'chapters'),
    reportPath: stringFlag(args, 'report'),
    keepTemp: bool(args, 'keep-temp'),
    executablePath: stringFlag(args, 'chrome'),
    allowNetwork: bool(args, 'allow-network'),
    timeoutMs: Number(stringFlag(args, 'timeout') ?? 30_000),
    onProgress: progressEnabled
      ? (progress) => {
          if (progress.phase === 'render' && progress.frame % 10 !== 0 && progress.frame !== progress.totalFrames) return;
          if (progress.phase === 'render') process.stderr.write(`\r${progress.percent.toFixed(1)}%  frame ${progress.frame}/${progress.totalFrames}  ${(progress.elapsedMs / 1000).toFixed(1)}s`);
          if (progress.phase === 'done') process.stderr.write('\n');
        }
      : undefined,
  });
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } else {
    console.log(`${color(32, 'exported')} ${path.relative(process.cwd(), result.path)}`);
    console.log(`  ${result.format} ${result.width}x${result.height} @ ${formatRate(result.frameRate)}  ${result.frames} frames  ${(result.durationSeconds).toFixed(2)}s  ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MiB`);
    for (const issue of result.issues) console.error(color(33, `warning: ${issue}`));
    if (result.captionsPath) console.log(`  captions ${path.relative(process.cwd(), result.captionsPath)}`);
  }
  return 0;
}

/**
 * Freeze a program document: materialise the inline authoring program and
 * write the canonical declarative .vhtml with the program stripped. Keeping
 * the program would make the next load re-run it over the already
 * materialised model, so freezing is unconditional; keep the source in
 * version control instead.
 */
async function commandBuildProgramDocument(args: ParsedArgs, entry: string, root: string): Promise<number> {
  const source = fs.readFileSync(entry, 'utf8');
  const parsed = parseVhtml(source, { file: entry, root });
  const materialized = materializeDocument(parsed.document);
  const diagnostics = [...parsed.diagnostics, ...materialized.diagnostics];
  const document = { ...materialized.document, program: undefined, dataBlocks: undefined };
  const outFlag = stringFlag(args, 'out');
  const out = path.resolve(outFlag ?? entry);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serializeDocument(document), 'utf8');
  const validation = validateDocument(document, { root, checkFiles: false, diagnostics });
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: validation.ok && diagnostics.every((d) => d.severity !== 'error'), out, diagnostics: [...diagnostics, ...validation.diagnostics] }, null, 2));
  } else {
    console.log(`${color(32, 'built')} ${path.relative(process.cwd(), out)} (program frozen)`);
    printDiagnostics([...diagnostics, ...validation.diagnostics], bool(args, 'quiet'));
  }
  return diagnostics.some((d) => d.severity === 'error') || !validation.ok ? 1 : 0;
}

async function commandBuild(args: ParsedArgs): Promise<number> {
  const targetArg = args.positionals[0] ?? process.cwd();
  const target = path.resolve(targetArg);
  if (!fs.existsSync(target)) throw new Error(`entry or project not found: ${targetArg}`);
  const isDirectory = fs.statSync(target).isDirectory();
  const root = isDirectory ? target : path.dirname(target);
  const manifest = readManifest(root).manifest;
  if (isDirectory && manifest.detached) {
    throw new Error(
      'project is detached: the .vhtml entry is canonical. ' +
      'Pass the source file explicitly (vhtml build video.ts) only when you intend to regenerate it.',
    );
  }
  let source: string | undefined;
  if (isDirectory) {
    source = manifest.source ? path.join(root, manifest.source) : undefined;
    if (!source || !fs.existsSync(source)) {
      const fallback = path.join(root, 'video.ts');
      if (fs.existsSync(fallback)) source = fallback;
    }
  } else if (/\.(?:ts|mts|cts|js|mjs|cjs)$/i.test(target)) {
    source = target;
  } else if (/\.vhtml$/i.test(target)) {
    return commandBuildProgramDocument(args, target, root);
  } else {
    throw new Error('build expects a TypeScript/JavaScript source, a .vhtml entry or a project directory');
  }
  if (!source || !fs.existsSync(source)) {
    throw new Error(`source not found${manifest.source ? `: ${manifest.source}` : ''}; pass video.ts or configure vhtml.json source`);
  }
  const module = await import(`${pathToFileURL(source).href}?t=${Date.now()}`);
  let value = module.default ?? module.project ?? module.video;
  if (typeof value === 'function') value = await value();
  if (value && typeof value === 'object' && 'project' in value && 'specVersion' in value) {
    value = (value as VhtmlDocument).project;
  }
  if (!value || typeof value !== 'object' || !('composition' in value)) {
    throw new Error('entry must export a Project or VhtmlDocument as default (or as `project`)');
  }
  const project = value as Project;
  const document: VhtmlDocument = { specVersion: project.version ?? '1.1', project };
  const outFlag = stringFlag(args, 'out');
  const outRelative = outFlag ?? manifest.build?.out ?? manifest.entry ?? `${project.id}.vhtml`;
  const out = path.resolve(root, outRelative);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serializeVideoDocument(project), 'utf8');
  if (fs.existsSync(path.join(root, 'vhtml.json')) && isInsideRoot(root, out)) {
    const relativeOut = toPosixRelative(root, out);
    if (manifest.entry !== relativeOut || manifest.build?.out !== relativeOut) {
      manifest.entry = relativeOut;
      manifest.build = { ...(manifest.build ?? {}), out: relativeOut };
      writeManifest(root, manifest);
    }
  }
  const validation = validateDocument(document, { root, checkFiles: false });
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: validation.ok, out, root, diagnostics: validation.diagnostics }, null, 2));
  } else {
    console.log(`${color(32, 'built')} ${path.relative(process.cwd(), out)}`);
    printDiagnostics(validation.diagnostics, bool(args, 'quiet'));
  }
  return validation.ok ? 0 : 1;
}

async function commandEdit(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const opsFile = stringFlag(args, 'ops');
  if (!opsFile) throw new Error("usage: vhtml edit [project] --ops edits.json|- [--out project.vhtml]; '-' reads operations from stdin");
  const loaded = loadProject(file, { checkFiles: false });
  const opsText = (
    opsFile === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(opsFile), 'utf8')
  ).replace(/^\uFEFF/, '');
  const raw = JSON.parse(opsText) as EditOperation[] | { operations?: EditOperation[]; ops?: EditOperation[] };
  const operations = Array.isArray(raw) ? raw : raw.operations ?? raw.ops ?? [];
  const result = applyEditOperations(loaded.document.project, operations, { strict: bool(args, 'strict') });
  printDiagnostics(result.diagnostics, bool(args, 'quiet'));
  if (!result.ok) return 1;
  const editedValidation = validateDocument(
    { specVersion: '1.1', project: result.project },
    { root: loaded.root, checkFiles: false },
  );
  if (!editedValidation.ok) {
    printDiagnostics(editedValidation.errors);
    return 1;
  }
  const out = path.resolve(stringFlag(args, 'out') ?? loaded.file);
  if (bool(args, 'backup') && out === loaded.file) {
    fs.copyFileSync(loaded.file, `${loaded.file}.bak`);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serializeDocument({ specVersion: '1.1', project: result.project }), 'utf8');
  if (bool(args, 'json')) console.log(JSON.stringify({ ok: true, out, changed: result.changed, diagnostics: result.diagnostics }, null, 2));
  else console.log(`${color(32, 'edited')} ${path.relative(process.cwd(), out)} (${result.changed.length} object(s))`);
  return 0;
}

async function commandGenerate(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const loaded = loadProject(file, { checkFiles: false, hydrate: false });
  const result = await materializeGenerations({
    project: loaded.document.project,
    root: loaded.root,
    taskIds: bool(args, 'all') ? undefined : stringFlag(args, 'task') ? [stringFlag(args, 'task')!] : undefined,
    provider: stringFlag(args, 'provider'),
    force: bool(args, 'force'),
    cachePath: cacheFilePath(loaded.root, loaded.layout),
    generatedDir: loaded.layout.generated,
    onProgress: (event) => {
      if (!bool(args, 'json')) console.error(color(90, `[${event.taskId}] ${event.message}`));
    },
  });
  if (bool(args, 'write') && result.ran.length) {
    fs.writeFileSync(loaded.file, serializeDocument({ specVersion: '1.1', project: result.project }), 'utf8');
  }
  if (bool(args, 'json')) {
    console.log(JSON.stringify({
      ok: result.failed.length === 0,
      ran: result.ran,
      skipped: result.skipped,
      failed: result.failed,
      issues: result.issues,
      assets: result.project.assets.filter((asset) => asset.generatedBy),
      cache: result.cachePath,
    }, null, 2));
  } else {
    console.log(`${color(32, 'generated')} ${result.ran.length}, reused ${result.skipped.length}, failed ${result.failed.length}`);
    for (const asset of result.project.assets.filter((candidate) => candidate.generatedBy)) {
      console.log(`  ${asset.id}  ${asset.kind}  ${asset.src}`);
    }
  }
  return result.failed.length ? 1 : 0;
}

async function commandAudio(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const loaded = loadProject(file, { checkFiles: true });
  requireValid(loaded, bool(args, 'quiet'));
  const project = loaded.document.project;
  const timeline = findTimeline(project, stringFlag(args, 'timeline') ?? project.mainTimeline) ?? project.timelines[0]!;
  const range = resolveRange(stringFlag(args, 'range'), project.composition.frameRate, timeline.duration) ?? {
    start: ZERO,
    duration: timeline.duration,
  };
  const sampleRate = Number(stringFlag(args, 'sample-rate') ?? project.composition.sampleRate);
  const channels = Number(stringFlag(args, 'channels') ?? project.composition.channels);
  const out = stringFlag(args, 'out')
    ? path.resolve(stringFlag(args, 'out')!)
    : path.resolve(loaded.root, loaded.layout.renders, `${project.id}-soundtrack.wav`);
  const mixed = await mixSoundtrack({
    project,
    root: loaded.root,
    timelineId: timeline.id,
    rangeStart: range.start,
    rangeDuration: range.duration,
    sampleRate,
    channels,
    normalize: !bool(args, 'no-normalize'),
  });
  writeWavFloat(out, mixed.samples, mixed.channels, mixed.sampleRate);
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: true, out, frames: mixed.frames, sampleRate: mixed.sampleRate, channels: mixed.channels, peak: mixed.peak, issues: mixed.issues }, null, 2));
  } else {
    console.log(`${color(32, 'mixed')} ${path.relative(process.cwd(), out)} (${(mixed.durationSeconds).toFixed(3)}s, ${mixed.sampleRate} Hz, peak ${(20 * Math.log10(mixed.peak || 1e-9)).toFixed(1)} dBFS)`);
    for (const issue of mixed.issues) console.error(color(33, `warning: ${issue}`));
  }
  return 0;
}

async function commandCaptions(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0];
  const loaded = loadProject(file, { checkFiles: false });
  const fromGen = stringFlag(args, 'from-gen');
  if (fromGen) {
    const laneId = stringFlag(args, 'lane');
    const { cuesToClips } = await import('@sdkwork/vhtml-core/captions');
    const task = loaded.document.project.generations.find((candidate) => candidate.id === fromGen);
    if (!task) throw new VhtmlError(ErrorCode.GENERATION_TASK_NOT_FOUND, `generation task "${fromGen}" not found`);
    // The cues asset must be materialised: read its output file from the project.
    const asset = loaded.document.project.assets.find(
      (candidate) => candidate.id === `gen:${fromGen}` || candidate.generatedBy === fromGen,
    );
    if (!asset) {
      throw new VhtmlError(
        ErrorCode.ASSET_UNAVAILABLE,
        `generation "${fromGen}" has no materialised cues asset; run vhtml generate first`,
      );
    }
    const cueFile = path.resolve(loaded.root, asset.src);
    const raw = fs.readFileSync(cueFile, 'utf8');
    const trimmed = raw.trim();
    let data: unknown = trimmed;
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        data = JSON.parse(trimmed);
        const parsedRows = Array.isArray(data) ? data : (data as { cues?: unknown[] }).cues;
        if (Array.isArray(parsedRows)) data = parsedRows;
        else data = trimmed;
      } catch {
        data = trimmed;
      }
    }
    const clips = cuesToClips(data, { idPrefix: fromGen });
    if (!clips.length) throw new VhtmlError(ErrorCode.GENERATION_INVALID_OUTPUT, `generation "${fromGen}" produced no usable cues`);
    const timeline = findTimeline(loaded.document.project, loaded.document.project.mainTimeline)!;
    let lane = laneId
      ? timeline.tracks.find((candidate) => candidate.id === laneId)
      : timeline.tracks.find((candidate) => candidate.type === 'caption');
    if (laneId && !lane) {
      lane = {
        id: laneId,
        type: 'caption',
        name: laneId,
        order: timeline.tracks.length,
        enabled: true,
        muted: false,
        locked: false,
        volume: 1,
        pan: 0,
        opacity: 1,
        blend: 'normal',
        clips: [],
        transitions: [],
      };
      timeline.tracks.push(lane);
    }
    if (!lane) {
      lane = {
        id: 'captions',
        type: 'caption',
        name: 'Captions',
        order: timeline.tracks.length,
        enabled: true,
        muted: false,
        locked: false,
        volume: 1,
        pan: 0,
        opacity: 1,
        blend: 'normal',
        clips: [],
        transitions: [],
      };
      timeline.tracks.push(lane);
    }
    const operations: EditOperation[] = clips.map((clip) => ({ op: 'clip.add', trackId: lane!.id, clip }));
    const result = applyEditOperations(loaded.document.project, operations, { strict: false });
    if (!result.ok) {
      printDiagnostics(result.diagnostics);
      return 1;
    }
    fs.writeFileSync(loaded.file, serializeDocument({ specVersion: '1.1', project: result.project }), 'utf8');
    if (bool(args, 'json')) {
      console.log(JSON.stringify({ ok: true, from: fromGen, lane: lane.id, cues: clips.length }, null, 2));
    } else {
      console.log(`${color(32, 'captions')} ${clips.length} cue(s) from "${fromGen}" -> lane "${lane.id}"`);
    }
    return 0;
  }
  const project = loaded.document.project;
  const out = stringFlag(args, 'out')
    ? path.resolve(stringFlag(args, 'out')!)
    : path.resolve(loaded.root, loaded.layout.renders, `${project.id}.vtt`);
  const timeline = findTimeline(project, stringFlag(args, 'timeline') ?? project.mainTimeline) ?? project.timelines[0]!;
  const range = resolveRange(stringFlag(args, 'range'), project.composition.frameRate, timeline.duration);
  const written = writeCaptions(project, out, {
    timelineId: timeline.id,
    rangeStart: range?.start,
    rangeDuration: range?.duration,
    format: out.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt',
  });
  if (bool(args, 'json')) console.log(JSON.stringify({ ok: true, path: written }, null, 2));
  else console.log(`${color(32, 'captions')} ${path.relative(process.cwd(), written)}`);
  return 0;
}

async function commandProviders(args: ParsedArgs): Promise<number> {
  const generation = await import('@sdkwork/vhtml-generation');
  const catalog = generation.providerCatalog();
  if (bool(args, 'known')) {
    const known = generation.VENDOR_CATALOG;
    if (bool(args, 'json')) {
      console.log(JSON.stringify({ vendors: known }, null, 2));
    } else {
      for (const vendor of known) {
        console.log(`${vendor.id}  ${vendor.label}`);
        console.log(`  kinds: ${vendor.kinds.join(', ')}`);
        console.log(`  modes: ${vendor.modes.join(', ')}`);
        console.log(`  docs: ${vendor.docs}`);
        for (const mapping of vendor.mapping) {
          console.log(`  ${mapping.vendor} -> ${mapping.vhtml}${mapping.note ? `  (${mapping.note})` : ''}`);
        }
      }
    }
    return 0;
  }
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ providers: catalog }, null, 2));
  } else {
    for (const provider of catalog) {
      console.log(`${provider.id}  ${provider.capabilities.kinds.join(', ')}`);
      if (provider.capabilities.models?.length) console.log(`  models: ${provider.capabilities.models.join(', ')}`);
      if (provider.capabilities.inputRoles?.length) console.log(`  input roles: ${provider.capabilities.inputRoles.join(', ')}`);
      if (provider.capabilities.notes) console.log(`  ${provider.capabilities.notes}`);
    }
  }
  return 0;
}

async function commandCapabilities(args: ParsedArgs): Promise<number> {  let chrome = 'not found';
  let chromePath: string | undefined;
  try {
    chromePath = findChromeExecutable(stringFlag(args, 'chrome'));
    chrome = chromePath;
  } catch (error) {
    chrome = (error as Error).message;
  }
  const report = capabilityReport({ ffmpegVersion: await ffmpegVersion(), browserVersion: chrome });
  if (bool(args, 'json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`${report.implementation} ${report.version} (VHTML ${report.specVersion})`);
    console.log(`profiles: parser=${report.profiles.parser} web=${report.profiles.webRenderer} media=${report.profiles.mediaRenderer} full=${report.profiles.fullRuntime}`);
    console.log(`formats: ${report.formats.join(', ')}`);
    console.log(`delivery: ${report.deliveryPresets.map((preset) => preset.id).join(', ')}`);
    console.log(`generation: ${report.generationKinds.join(', ')}`);
    console.log(`ffmpeg: ${report.environment.platform === 'win32' ? '' : ''}${await ffmpegVersion()}`);
    console.log(`chrome: ${chrome}`);
    console.log(`node: ${report.environment.node}  cpus: ${report.environment.cpus}`);
    console.log('\nlimitations:');
    for (const limitation of report.limitations) console.log(`  - ${limitation}`);
  }
  return chromePath ? 0 : 1;
}

async function commandDoctor(args: ParsedArgs): Promise<number> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  checks.push({ name: 'node', ok: Number(process.versions.node.split('.')[0]) >= 22, detail: process.version });
  let ffmpeg = await ffmpegVersion();
  checks.push({ name: 'ffmpeg', ok: !ffmpeg.includes('not available'), detail: ffmpeg });
  try {
    const version = await (async () => {
      const { runTool, ffprobePath } = await import('@sdkwork/vhtml-ffmpeg');
      const result = await runTool(ffprobePath(), ['-version'], { timeoutMs: 10_000 });
      return result.stdout.toString('utf8').split('\n')[0] ?? 'ffprobe';
    })();
    checks.push({ name: 'ffprobe', ok: true, detail: version });
  } catch (error) {
    checks.push({ name: 'ffprobe', ok: false, detail: (error as Error).message });
  }
  try {
    const chrome = findChromeExecutable(stringFlag(args, 'chrome'));
    checks.push({ name: 'chrome', ok: fs.existsSync(chrome), detail: chrome });
  } catch (error) {
    checks.push({ name: 'chrome', ok: false, detail: (error as Error).message });
  }
  try {
    await assertFfmpeg();
    checks.push({ name: 'ffmpeg-exec', ok: true, detail: 'ok' });
  } catch (error) {
    checks.push({ name: 'ffmpeg-exec', ok: false, detail: (error as Error).message });
  }
  const temp = os.tmpdir();
  checks.push({ name: 'temp-dir', ok: fs.existsSync(temp), detail: temp });
  checks.push({ name: 'cwd', ok: true, detail: process.cwd() });
  if (bool(args, 'json')) console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));
  else {
    for (const check of checks) {
      console.log(`${check.ok ? color(32, 'ok  ') : color(31, 'fail')} ${check.name.padEnd(12)} ${check.detail}`);
    }
  }
  return checks.every((check) => check.ok) ? 0 : 1;
}

async function commandInit(args: ParsedArgs): Promise<number> {
  const dir = path.resolve(args.positionals[0] ?? '.');
  const template = stringFlag(args, 'template') ?? 'promo';
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !bool(args, 'force')) {
    throw new Error(`directory is not empty: ${dir} (use --force to add files)`);
  }
  const id =
    template === 'hello'
      ? 'hello-vhtml'
      : path.basename(dir).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z_]+/, '') || 'vhtml-project';
  const manifest = defaultManifest(id);
  manifest.title = template === 'hello' ? 'Hello VHTML' : `${id} — VHTML project`;
  ensureProjectLayout(dir, manifest);
  fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'generated'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });
  for (const assetDir of ['assets/images', 'assets/video', 'assets/audio', 'assets/fonts']) {
    fs.mkdirSync(path.join(dir, assetDir), { recursive: true });
    fs.writeFileSync(path.join(dir, assetDir, '.gitkeep'), '');
  }
  fs.writeFileSync(
    path.join(dir, '.gitignore'),
    ['.vhtml/', 'generated/', 'renders/', 'node_modules/', '*.vhtmlpkg', 'vhtml.generated.json', '.DS_Store', ''].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({
      name: id.toLowerCase(),
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'vhtml build',
        validate: 'vhtml validate',
        preview: 'vhtml preview --open',
        export: 'vhtml export',
      },
      devDependencies: {
        '@sdkwork/vhtml': `^${VERSION}`,
      },
    }, null, 2)}\n`,
    'utf8',
  );

  const externalScene = `<style>
  .stage {
    position: absolute; inset: 0; display: grid; place-items: center;
    color: #fff; font-family: system-ui, sans-serif; text-align: center;
  }
  .eyebrow { font-size: 28px; letter-spacing: .42em; color: #6ee7ff; margin-bottom: 24px; }
  h1 { font-size: 128px; margin: 0; letter-spacing: -4px; }
  p { font-size: 36px; color: #9fb3d9; margin-top: 20px; }
</style>
<div class="stage">
  <div>
    <div class="eyebrow">CODE-DRIVEN VIDEO</div>
    <h1>Hello VHTML</h1>
    <p>Deterministic HTML frames, real editing, one project directory.</p>
  </div>
</div>
`;
  fs.writeFileSync(path.join(dir, 'scenes', 'intro.html'), externalScene, 'utf8');

  const sample = `import { defineVideo, clip, lane, animate, caption } from '@sdkwork/vhtml/sdk';

/**
 * Code-authored VHTML project.
 *
 *   vhtml build            # compiles this file to video.vhtml
 *   vhtml preview          # opens the Studio
 *   vhtml export           # renders renders/${id}.mp4
 */
export default defineVideo({
  id: '${id}',
  title: ${JSON.stringify(manifest.title)},
  width: 1920,
  height: 1080,
  fps: '30/1',
  duration: '6s',
  background: '#080d18',
  scenes: [
    {
      id: 'intro',
      // Scene HTML/CSS lives outside the timeline project and is hot-managed.
      src: 'scenes/intro.html',
      duration: '6s',
    },
  ],
  lanes: [
    lane('video', 'visual', [
      clip('scene:intro', {
        start: 0,
        duration: '6s',
        animations: [
          animate({ property: 'opacity', from: 0, to: 1, duration: '0.8s', easing: 'ease-out' }),
        ],
      }),
    ]),
  ],
  captions: [
    caption('Write code. Render a video.', '1s', { duration: '3s' }),
  ],
  outputs: [{ format: 'mp4', path: 'renders/${id}.mp4', crf: 20 }],
});
`;
  fs.writeFileSync(path.join(dir, 'video.ts'), sample, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${manifest.title}\n\n## Install\n\n\`\`\`bash\npnpm install\n# or: npm install\n\`\`\`\n\n## Layout\n\n\`\`\`text\n${path.basename(dir)}/\n  package.json        project scripts + @sdkwork/vhtml dependency\n  vhtml.json          project manifest (entry / paths / settings)\n  video.ts            code-first source\n  video.vhtml         canonical project after build\n  scenes/intro.html   external HTML Scene fragment\n  assets/             hand-authored media (images / video / audio / fonts)\n  generated/          provider outputs\n  renders/            exports\n  .vhtml/cache/       generated-asset cache\n\`\`\`\n\n## Commands\n\n\`\`\`bash\npnpm build\npnpm preview\npnpm export\npnpm exec vhtml assets list\npnpm exec vhtml pack --out ${id}.vhtmlpkg\n\`\`\`\n\n## Using another editor\n\nInstall \`@sdkwork/vhtml\` in this project and open it with the CLI:\n\`\`\`bash\npnpm add -D @sdkwork/vhtml\npnpm exec vhtml preview --open\n\`\`\`\n`,
    'utf8',
  );
  if (!bool(args, 'json')) {
    console.log(`${color(32, 'created')} ${path.relative(process.cwd(), dir)}`);
    console.log('  vhtml.json');
    console.log('  package.json');
    console.log('  video.ts');
    console.log('  scenes/intro.html');
    console.log('  assets/ generated/ renders/ .vhtml/cache/');
    console.log('  README.md');
  } else {
    console.log(JSON.stringify({ ok: true, dir, template, manifest }, null, 2));
  }
  return 0;
}

function expandImportFiles(inputs: string[]): string[] {
  const files: string[] = [];
  const visit = (file: string): void => {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file, { withFileTypes: true })) {
        if (['node_modules', '.git', '.vhtml', '.vhtml-cache'].includes(entry.name)) continue;
        visit(path.join(file, entry.name));
      }
    } else if (stat.isFile()) {
      files.push(file);
    }
  };
  for (const input of inputs) {
    const absolute = path.resolve(input);
    if (!fs.existsSync(absolute)) throw new Error(`import file not found: ${input}`);
    visit(absolute);
  }
  return files;
}

function printInventory(inventory: AssetInventory, filters: { missing?: boolean; unused?: boolean } = {}): void {
  console.log(`project root: ${inventory.root}`);
  console.log(
    `references ${inventory.summary.references} · local ${inventory.summary.local} · missing ${inventory.summary.missing} · external ${inventory.summary.external} · assets ${inventory.summary.assets} · unused ${inventory.summary.unusedAssets}`,
  );
  if (!filters.unused) {
    if (inventory.missing.length) {
      console.log('\nmissing:');
      for (const ref of inventory.missing) console.log(`  [${ref.origin}] ${ref.ref}  (${ref.owner})`);
    }
    if (inventory.external.length) {
      console.log('\nexternal:');
      for (const ref of inventory.external) console.log(`  [${ref.origin}] ${ref.ref}  (${ref.owner})`);
    }
    if (inventory.outsideRoot.length) {
      console.log('\noutside project root:');
      for (const ref of inventory.outsideRoot) console.log(`  [${ref.origin}] ${ref.ref}  (${ref.owner})`);
    }
  }
  if (!filters.missing) {
    console.log('\nassets:');
    for (const entry of inventory.assets) {
      console.log(
        `  ${entry.asset.id.padEnd(24)} ${entry.asset.kind.padEnd(9)} ${entry.used ? 'used  ' : 'unused'} ${String(entry.asset.size ?? '').padStart(9)}  ${entry.asset.src}`,
      );
    }
  }
}

async function commandAssets(args: ParsedArgs): Promise<number> {
  const sub = args.positionals[0];
  const rest = args.positionals.slice(1);
  if (!sub || !['list', 'verify', 'import', 'relink'].includes(sub)) {
    throw new Error('usage: vhtml assets list|verify|import|relink [project] …');
  }
  if (sub === 'relink') {
    let projectInput = stringFlag(args, 'project');
    if (!projectInput && rest.length >= 3) projectInput = rest.shift();
    const [assetId, nextSrc] = rest;
    if (!assetId || !nextSrc) throw new Error('usage: vhtml assets relink [project] <assetId> <path>');
    const loaded = loadProject(projectInput, { checkFiles: false });
    const asset = (await import('@sdkwork/vhtml-project/assets')).relinkAsset(loaded.document.project, loaded.root, assetId, nextSrc);
    saveLoadedProject(loaded);
    const validation = validateDocument(loaded.document, { root: loaded.root, checkFiles: true });
    printDiagnostics(validation.diagnostics, bool(args, 'quiet'));
    if (bool(args, 'json')) console.log(JSON.stringify({ ok: validation.ok, asset, diagnostics: validation.diagnostics }, null, 2));
    else console.log(`${color(validation.ok ? 32 : 31, 'relinked')} ${asset.id} → ${asset.src}`);
    return validation.ok ? 0 : 1;
  }
  if (sub === 'import') {
    let projectInput = stringFlag(args, 'project');
    if (!projectInput) {
      const first = rest[0];
      if (first && fs.existsSync(path.resolve(first))) {
        const absoluteFirst = path.resolve(first);
        const stat = fs.statSync(absoluteFirst);
        const looksLikeProject =
          first.endsWith('.vhtml') ||
          path.basename(first) === 'vhtml.json' ||
          (stat.isDirectory() && (
            fs.existsSync(path.join(absoluteFirst, 'vhtml.json')) ||
            fs.readdirSync(absoluteFirst).filter((name) => name.endsWith('.vhtml')).length === 1
          ));
        if (looksLikeProject) projectInput = rest.shift();
      }
    }
    const loaded = loadProject(projectInput, { checkFiles: false });
    const inputFiles = expandImportFiles(rest);
    if (!inputFiles.length) throw new Error('no files to import');
    if (stringFlag(args, 'id') && inputFiles.length > 1) throw new Error('--id can only be used with one file');
    const imported = [];
    for (const sourcePath of inputFiles) {
      const asset = await importAssetFile({
        project: loaded.document.project,
        root: loaded.root,
        layout: loaded.layout,
        sourcePath,
        filename: path.basename(sourcePath),
        destination: stringFlag(args, 'to'),
        id: inputFiles.length === 1 ? stringFlag(args, 'id') : undefined,
      });
      if (!loaded.document.project.assets.some((candidate) => candidate.id === asset.id)) {
        loaded.document.project.assets.push(asset);
      }
      imported.push(asset);
    }
    saveLoadedProject(loaded);
    const validation = validateDocument(loaded.document, { root: loaded.root, checkFiles: true });
    printDiagnostics(validation.diagnostics, bool(args, 'quiet'));
    for (const asset of imported) console.error(color(90, `imported ${asset.id} → ${asset.src}`));
    if (bool(args, 'json')) console.log(JSON.stringify({ ok: validation.ok, imported, diagnostics: validation.diagnostics }, null, 2));
    else console.log(`${color(validation.ok ? 32 : 31, 'imported')} ${imported.length} file(s) into ${path.relative(process.cwd(), loaded.root)}`);
    return validation.ok ? 0 : 1;
  }

  let projectInput = stringFlag(args, 'project') ?? rest[0];
  const loaded = loadProject(projectInput, { checkFiles: false });
  const inventory = collectAssetInventory(loaded.document.project, loaded.root, loaded.layout);
  if (sub === 'verify') {
    const diagnostics = verifyAssetInventory(inventory, { allowRemote: bool(args, 'allow-remote') });
    printDiagnostics(diagnostics, bool(args, 'quiet'));
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    if (bool(args, 'json')) {
      console.log(JSON.stringify({ ok: errors === 0, summary: inventory.summary, missing: inventory.missing, diagnostics }, null, 2));
    } else {
      console.log(errors === 0 ? color(32, 'assets verified') : color(31, `assets verification failed (${errors} error(s))`));
    }
    return errors === 0 ? 0 : 1;
  }
  if (bool(args, 'json')) {
    const payload = {
      ...inventory,
      assets: inventory.assets.map((entry) => ({
        ...entry,
        asset: { ...entry.asset, src: entry.asset.src },
      })),
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printInventory(inventory, { missing: bool(args, 'missing'), unused: bool(args, 'unused') });
  }
  return 0;
}

function parseBasicAuth(value: string | undefined): { username: string; password: string } | undefined {
  if (!value) return undefined;
  const index = value.indexOf(':');
  if (index <= 0 || index === value.length - 1) {
    throw new Error('auth must be "username:password" (the password may contain ":")');
  }
  return { username: value.slice(0, index), password: value.slice(index + 1) };
}

async function commandLauncher(args: ParsedArgs): Promise<number> {
  const { startStudioLauncher } = await import('@sdkwork/vhtml-studio/launcher');
  const auth = stringFlag(args, 'auth');
  const credentials = auth && auth.includes(':')
    ? { username: auth.slice(0, auth.indexOf(':')), password: auth.slice(auth.indexOf(':') + 1) }
    : undefined;
  const launcher = await startStudioLauncher({
    projectsDir: process.cwd(),
    host: stringFlag(args, 'host') ?? process.env.VHTML_HOST ?? '127.0.0.1',
    chrome: stringFlag(args, 'chrome'),
    appWindow: bool(args, 'app') || args.command === 'studio',
    auth: credentials,
  });
  console.log(`VHTML Studio launcher  ${launcher.url}`);
  console.log(`projects: ${process.cwd()}`);
  console.log('Opened editors stay running until this process exits (Ctrl+C).');
  await new Promise<void>(() => { /* supervise until signal */ });
  return 0;
}

async function commandStudio(args: ParsedArgs): Promise<number> {
  const input = args.positionals[0] ?? process.env.VHTML_PROJECT;
  const token = stringFlag(args, 'token') ?? process.env.VHTML_TOKEN;
  const auth = parseBasicAuth(stringFlag(args, 'auth') ?? process.env.VHTML_AUTH) ??
    (token ? { username: 'vhtml', password: token } : undefined);
  const { startStudio } = await import('@sdkwork/vhtml-studio/server');
  return await startStudio(input, {
    port: stringFlag(args, 'port') ? Number(stringFlag(args, 'port')) : undefined,
    host: stringFlag(args, 'host'),
    auth,
    allowInsecure: bool(args, 'insecure'),
    open: bool(args, 'no-open') ? false : args.flags.has('open') ? bool(args, 'open') : undefined,
    chrome: stringFlag(args, 'chrome'),
  });
}

async function commandSplit(args: ParsedArgs): Promise<number> {
  const loaded = loadProject(args.positionals[0], { checkFiles: false });
  const inlineScenes = loaded.document.project.scenes.filter((scene) => !scene.src);
  if (!inlineScenes.length) {
    if (bool(args, 'json')) {
      console.log(JSON.stringify({ ok: true, changed: false, files: [], skipped: loaded.document.project.scenes.map((scene) => ({ sceneId: scene.id, reason: 'already external' })) }, null, 2));
    } else {
      console.log('no inline Scenes to split (all Scenes are already external)');
    }
    return 0;
  }
  if (loaded.sourcePath && !bool(args, 'force')) {
    if (!bool(args, 'detach')) {
      throw new Error(
        `project has a generated source (${path.relative(loaded.root, loaded.sourcePath)}); ` +
        'pass --detach to make the split durable, or --force to split the entry with a warning.',
      );
    }
  }
  const { splitInlineScenes } = await import('@sdkwork/vhtml-project/split');
  const result = splitInlineScenes({
    root: loaded.root,
    entry: loaded.file,
    document: loaded.document,
    layout: loaded.layout,
    scenesDir: stringFlag(args, 'to'),
    force: bool(args, 'force'),
    dryRun: bool(args, 'dry-run'),
  });
  if (loaded.sourcePath && !bool(args, 'detach')) {
    result.warnings.push(
      `source ${path.relative(loaded.root, loaded.sourcePath)} is still generated; ` +
      'the next build can overwrite the split entry',
    );
  }
  if (loaded.sourcePath && bool(args, 'detach') && bool(args, 'dry-run')) {
    result.warnings.push('dry-run: vhtml.json will not be detached until files are written');
  }
  if (!result.changed) {
    if (bool(args, 'json')) console.log(JSON.stringify({ ok: true, changed: false, files: [], skipped: result.skipped }, null, 2));
    else console.log('no inline Scenes to split');
    return 0;
  }
  let validation = loaded.validation;
  if (!bool(args, 'dry-run')) {
    const nextSource = fs.readFileSync(loaded.file, 'utf8');
    const reparsed = parseVhtml(nextSource, { file: loaded.file, root: loaded.root });
    validation = validateDocument(reparsed.document, {
      root: loaded.root,
      checkFiles: true,
      diagnostics: reparsed.diagnostics,
    });
    printDiagnostics(validation.diagnostics, bool(args, 'quiet'));
    if (bool(args, 'detach') && loaded.sourcePath && validation.ok) {
      if (!loaded.manifestPath) throw new Error('--detach requires a vhtml.json manifest');
      delete loaded.manifest.source;
      loaded.manifest.detached = true;
      writeManifest(loaded.root, loaded.manifest);
      result.warnings.push(
        `detached ${path.relative(loaded.root, loaded.sourcePath ?? 'video.ts')}; ` +
        'the .vhtml entry is now canonical (pass a source file explicitly to rebuild)',
      );
    }
  }
  if (bool(args, 'json')) {
    console.log(JSON.stringify({
      ok: bool(args, 'dry-run') ? true : validation.ok,
      changed: result.changed,
      entry: loaded.file,
      files: result.files,
      skipped: result.skipped,
      warnings: result.warnings,
      diagnostics: validation.diagnostics,
    }, null, 2));
  } else {
    for (const file of result.files) console.log(`${color(32, 'split')} ${file.sceneId} → ${file.src}`);
    for (const skipped of result.skipped) console.log(`${color(90, 'skip ')} ${skipped.sceneId}: ${skipped.reason}`);
    for (const warning of result.warnings) console.warn(color(33, `warning: ${warning}`));
    console.log(`${color(validation.ok ? 32 : 31, validation.ok ? 'modular project ready' : 'split validation failed')} (${result.files.length} file(s))`);
  }
  return bool(args, 'dry-run') ? 0 : validation.ok ? 0 : 1;
}

async function commandPack(args: ParsedArgs): Promise<number> {
  const input = args.positionals[0];
  const resolved = resolveProjectInput(input);
  const rawBaseName = resolved.manifest.id ?? path.basename(resolved.root);
  const baseName = rawBaseName.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  const out = path.resolve(stringFlag(args, 'out') ?? path.join(resolved.root, `${baseName}.vhtmlpkg`));
  const result = packProject({
    root: resolved.root,
    entry: resolved.entry,
    manifest: resolved.manifest,
    out,
    includeGenerated: !bool(args, 'no-generated'),
    includeRenders: bool(args, 'include-renders'),
  });
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } else {
    console.log(`${color(32, 'packed')} ${path.relative(process.cwd(), result.path)}`);
    console.log(`  ${result.files} files · ${(result.uncompressedBytes / 1024 / 1024).toFixed(2)} MiB → ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MiB`);
  }
  return 0;
}

async function commandUnpack(args: ParsedArgs): Promise<number> {
  const packagePath = args.positionals[0];
  if (!packagePath) throw new Error('usage: vhtml unpack <project.vhtmlpkg> --out <dir>');
  const defaultName = path.basename(packagePath).replace(/\.vhtmlpkg$/i, '') || 'unpacked';
  const outDir = path.resolve(stringFlag(args, 'out') ?? defaultName);
  const result = unpackProject(packagePath, { outDir, force: bool(args, 'force') });
  if (bool(args, 'json')) {
    console.log(JSON.stringify({ ok: true, root: result.root, entry: result.entry, files: result.files }, null, 2));
  } else {
    console.log(`${color(32, 'unpacked')} ${path.relative(process.cwd(), result.root)}`);
    console.log(`  ${result.files} files · entry ${path.relative(result.root, result.entry)}`);
    const info = packageInfo(packagePath);
    console.log(`  package ${info.name} · ${info.files.length} recorded files`);
  }
  return 0;
}


function help(): string {
  return `VHTML ${VERSION} — HTML-compatible code-driven video

Usage: vhtml <command> [options]

Commands:
  init [dir]                 Scaffold a project directory + vhtml.json
  build [source|project]     Compile an SDK project to .vhtml
  validate [project]         Parse, validate and report diagnostics
  inspect [project]          Print the resolved project model
  render [project]           Render one deterministic frame to PNG
  export [project]           Export MP4/WebM/GIF/PNG/WAV/MP3
  studio [project]           Standalone editor window (Chrome app mode; --app);
                             without [project] serves the project launcher
  preview [project]          Open the interactive Studio (--app for chrome-less;
                             embed via <url>?embed=1)
  serve [project]            Studio for local/LAN/cloud deployment (auth + host)
  split [project]            Move inline Scenes into scenes/*.html
  generate [project]         Materialise AI/procedural assets
  captions [--from-gen <id>] Materialise a transcribe task's cues into caption clips
                             (--lane to choose the caption lane), then write
                             WebVTT/SRT sidecars as before
  providers                  List generation providers and capabilities
  providers --known          Known vendor profiles (Runway/Luma/Kling/Pika/Hailuo/
                             Veo/Sora/Wan/Vidu/PixVerse/Seedance/ElevenLabs) with
                             parameter mappings; --json for machine output
  edit [project]             Apply timeline edit operations from JSON
  audio [project]            Mix the soundtrack to WAV
  captions [project]         Write a WebVTT/SRT sidecar
  assets list|verify|import|relink
                             Inventory, verify, import and relink external files
  import [project] <files>   Alias for assets import
  pack [project]             Create a portable .vhtmlpkg (ZIP)
  unpack <package>           Extract a .vhtmlpkg
  capabilities               Print the runtime capability matrix
  doctor                     Check Node, FFmpeg and Chrome

A [project] argument may be a directory containing vhtml.json, a .vhtml entry,
or omitted to use the current directory.

Common options:
  --out <path>      Output file/directory
  --json            Machine-readable output
  --quiet           Suppress info/warnings
  --help            This help

Asset / package options:
  --to <dir>        Import destination (relative to project root)
  --id <id>         Asset id for a single import
  --project <dir>   Project directory for asset commands
  --allow-remote    Allow remote asset URLs during verification
  --include-renders  Include renders/ in a package
  --no-generated    Exclude generated/ from a package
  --to <dir>        Split destination (default: paths.scenes)
  --force           Overwrite existing Scene files / split a generated entry
  --detach          For generated projects: make .vhtml canonical, stop rebuilding from source
  --dry-run         Plan a split without writing files

Studio / deployment:
  --host 0.0.0.0    Bind address (default 127.0.0.1; env VHTML_HOST)
  --port 4173       Port (env VHTML_PORT)
  --auth u:p        HTTP Basic auth for remote Studio (env VHTML_AUTH)
  --token <token>   Basic auth with username "vhtml" (env VHTML_TOKEN)
  --insecure        Allow a non-loopback bind without auth (trusted proxy only)
  --no-open         Do not open a browser
  VHTML_PROJECT     Default project for serve/preview

Export options:
  --range 1s:4s     Start:end, or 1s+3s for start+duration
  --fps 30/1        Output frame rate (exact rational)
  --format mp4      mp4 | webm | gif | png-sequence | wav | mp3
  --delivery <id>   Delivery profile: ${DELIVERY_PRESETS.map((preset) => preset.id).join(' | ')}
  --batch <list>    Render multiple delivery presets in one pass
                    (e.g. --batch web-1080p,tiktok,reels; with --out-dir/--report-dir)
  --crf 18          Quality
  --preset medium   x264 preset
  --loudness -14    EBU R128 normalisation
  --captions <file> Write WebVTT sidecar
  --generate        Materialise generation tasks before export
  --report <file>   Write a JSON export report
`;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  activeProgramParams = programParams(args);
  if (bool(args, 'version') || args.command === 'version') {
    console.log(VERSION);
    return 0;
  }
  if (bool(args, 'help') || args.command === 'help' || !args.command) {
    console.log(help());
    return args.command || bool(args, 'help') ? 0 : 1;
  }
  try {
    switch (args.command) {
      case 'init': return await commandInit(args);
      case 'build': return await commandBuild(args);
      case 'validate': return await commandValidate(args);
      case 'inspect': return await commandInspect(args);
      case 'render': return await commandRender(args);
      case 'export': return await commandExport(args);
      case 'generate': return await commandGenerate(args);
      case 'providers': return await commandProviders(args);
      case 'edit': return await commandEdit(args);
      case 'audio': return await commandAudio(args);
      case 'captions': return await commandCaptions(args);
      case 'assets': return await commandAssets(args);
      case 'import': return await commandAssets({ ...args, positionals: ['import', ...args.positionals] });
      case 'split': return await commandSplit(args);
      case 'pack': return await commandPack(args);
      case 'unpack': return await commandUnpack(args);
      case 'capabilities': return await commandCapabilities(args);
      case 'doctor': return await commandDoctor(args);
      case 'preview':
      case 'serve':
      case 'studio':
        if (!args.positionals[0] && args.command === 'studio') return await commandLauncher(args);
        return await commandStudio(args);
      default:
        console.error(`unknown command "${args.command}"\n`);
        console.log(help());
        return 2;
    }
  } catch (error) {
    if (error instanceof VhtmlError) {
      for (const diagnostic of error.diagnostics) console.error(color(31, formatDiagnostic(diagnostic, process.cwd())));
      if (error.diagnostics.length === 0) console.error(color(31, `${error.code}: ${error.message}`));
    } else {
      console.error(color(31, `error: ${toErrorMessage(error)}`));
    }
    if (bool(args, 'verbose') && error instanceof Error) console.error(error.stack);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
