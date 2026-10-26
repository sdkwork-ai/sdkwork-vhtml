/**
 * Video export pipeline.
 *
 * Frames are captured by the deterministic Chromium renderer and streamed to
 * FFmpeg. Audio is mixed offline from the Core Model, then muxed. All temporary
 * artifacts live in an isolated directory and are removed unless explicitly
 * retained.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { once } from 'node:events';
import type { OutputConfig, OutputFitMode, Project } from '@sdkwork/vhtml-core/model';
import { findTimeline } from '@sdkwork/vhtml-core/model';
import {
  ZERO,
  add,
  frameCount,
  frameTime,
  gt,
  gte,
  lt,
  sub,
  toNumber,
  type Rational,
} from '@sdkwork/vhtml-core/time';
import { ErrorCode, VhtmlError } from '@sdkwork/vhtml-core/errors';
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { ffmpegPath, probeMedia } from '@sdkwork/vhtml-ffmpeg';
import {
  hasAudibleClips,
  mixSoundtrack,
  normalizeLoudness,
  writeWavFloat,
} from './audio.ts';
import { generateWebVtt } from './captions.ts';

export type ExportFormat = OutputConfig['format'];

export interface ExportProgress {
  phase: 'prepare' | 'audio' | 'render' | 'encode' | 'finalize' | 'done';
  frame: number;
  totalFrames: number;
  percent: number;
  message?: string;
  elapsedMs: number;
}

export interface ExportOptions {
  project: Project;
  root: string;
  output: OutputConfig;
  /** Final file or directory (PNG sequence). */
  outputPath?: string;
  width?: number;
  height?: number;
  frameRate?: Rational;
  /** Override string output.fit for this export. */
  fit?: OutputFitMode;
  rangeStart?: Rational;
  rangeDuration?: Rational;
  crf?: number;
  preset?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  sampleRate?: number;
  channels?: number;
  masterGain?: number;
  normalizeAudio?: boolean;
  loudness?: number;
  captionsPath?: string;
  generateCaptions?: boolean;
  /** Mux timeline chapter markers (type="chapter") into MP4 output. */
  chapters?: boolean;
  /** Internal: prepared ffmetadata file for chapter muxing. */
  chaptersPath?: string;
  reportPath?: string;
  keepTemp?: boolean;
  executablePath?: string;
  headless?: boolean;
  sandbox?: boolean;
  allowNetwork?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportResult {
  path: string;
  format: ExportFormat;
  width: number;
  height: number;
  frameRate: Rational;
  frames: number;
  durationSeconds: number;
  sizeBytes: number;
  elapsedMs: number;
  issues: string[];
  /** SHA-256 of the final media file (not emitted for PNG directories). */
  sha256?: string;
  audioPath?: string;
  captionsPath?: string;
  reportPath?: string;
  probe?: {
    durationSeconds: number;
    videoCodec?: string;
    audioCodec?: string;
    width?: number;
    height?: number;
  };
}

function extensionFor(format: ExportFormat): string {
  switch (format) {
    case 'mp4': return '.mp4';
    case 'webm': return '.webm';
    case 'gif': return '.gif';
    case 'wav': return '.wav';
    case 'mp3': return '.mp3';
    case 'png-sequence': return '';
    default: return '.mp4';
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new VhtmlError(ErrorCode.EXPORT_CANCELLED, 'export was cancelled');
  }
}

function progressReporter(options: ExportOptions, start: number) {
  return (phase: ExportProgress['phase'], frame: number, totalFrames: number, message?: string): void => {
    options.onProgress?.({
      phase,
      frame,
      totalFrames,
      percent: totalFrames > 0 ? Math.min(100, Math.round((frame / totalFrames) * 1000) / 10) : 0,
      message,
      elapsedMs: Date.now() - start,
    });
  };
}

function outputPathFor(options: ExportOptions): { path: string; isDirectory: boolean } {
  const format = options.output.format;
  const defaultName = `${options.project.id}${extensionFor(format)}`;
  let target = options.outputPath ?? options.output.path ?? defaultName;
  if (!path.isAbsolute(target)) target = path.resolve(options.root, target);
  if (format === 'png-sequence') {
    if (path.extname(target).toLowerCase() === '.png') target = path.dirname(target);
    return { path: target, isDirectory: true };
  }
  if (!path.extname(target)) target += extensionFor(format);
  return { path: target, isDirectory: false };
}

interface EncoderHandle {
  process: ReturnType<typeof spawn>;
  write: (buffer: Buffer) => Promise<void>;
  finish: () => Promise<void>;
  stderr: () => string;
}

function spawnEncoder(args: string[], signal?: AbortSignal): EncoderHandle {
  const child = spawn(ffmpegPath(), args, {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
    if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
  });
  let failure: Error | undefined;
  const exited = new Promise<void>((resolve, reject) => {
    child.on('error', (error) => {
      failure = error;
      reject(new VhtmlError(ErrorCode.EXPORT_ENCODER_FAILED, `FFmpeg failed to start: ${(error as Error).message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(
        new VhtmlError(
          ErrorCode.EXPORT_ENCODER_FAILED,
          `FFmpeg exited with code ${code}: ${stderr.trim().split('\n').slice(-8).join('\n')}`,
        ),
      );
    });
  });
  exited.catch(() => undefined);
  const abort = (): void => {
    child.kill('SIGKILL');
  };
  signal?.addEventListener('abort', abort, { once: true });

  return {
    process: child,
    async write(buffer: Buffer): Promise<void> {
      if (failure) throw failure;
      if (!child.stdin || child.stdin.destroyed) {
        throw new VhtmlError(ErrorCode.EXPORT_ENCODER_FAILED, `FFmpeg input closed: ${stderr.slice(-2000)}`);
      }
      const ok = child.stdin.write(buffer);
      if (!ok) await once(child.stdin as Writable, 'drain');
    },
    async finish(): Promise<void> {
      child.stdin?.end();
      await exited;
      signal?.removeEventListener('abort', abort);
    },
    stderr: () => stderr,
  };
}

function ffmpegColor(value: string | undefined): string {
  if (!value) return 'black';
  const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value.trim());
  return hex ? `0x${hex[1]}` : value.trim() || 'black';
}

function outputScaleFilter(width: number, height: number, fit: OutputFitMode | undefined, background: string | undefined): string {
  if (fit === 'cover') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1`;
  }
  if (fit === 'contain') {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${ffmpegColor(background)},setsar=1`;
  }
  return `scale=${width}:${height}:flags=lanczos,setsar=1`;
}

/** ffmetadata text for MP4 chapter muxing; times are milliseconds. */
export function chaptersMetadataFile(
  markers: Array<{ time: Rational; name?: string; type?: string }>,
  rangeStart: Rational,
  rangeDuration: Rational,
): string | undefined {
  const chapters = markers
    .filter((marker) => marker.type === 'chapter')
    .map((marker) => ({ startMs: Math.round((toNumber(marker.time) - toNumber(rangeStart)) * 1000), name: marker.name ?? `Chapter` }))
    .filter((chapter) => chapter.startMs >= 0)
    .sort((a, b) => a.startMs - b.startMs);
  if (!chapters.length) return undefined;
  const totalMs = Math.round(toNumber(rangeDuration) * 1000);
  const lines: string[] = [';FFMETADATA1'];
  for (let index = 0; index < chapters.length; index += 1) {
    const start = chapters[index]!.startMs;
    const end = index + 1 < chapters.length ? chapters[index + 1]!.startMs : totalMs;
    if (end <= start) continue;
    lines.push('[CHAPTER]');
    lines.push('TIMEBASE=1/1000');
    lines.push(`START=${start}`);
    lines.push(`END=${end}`);
    lines.push(`title=${chapters[index]!.name}`);
  }
  if (lines.length <= 1) return undefined;
  return lines.join('\n') + '\n';
}

function buildEncoderArgs(
  options: ExportOptions,
  outputPath: string,
  fps: Rational,
  width: number,
  height: number,
  audioPath: string | undefined,
): string[] {
  const output = options.output;
  const format = output.format;
  const fpsValue = `${fps.num}/${fps.den}`;
  const args = ['-nostdin', '-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', fpsValue, '-i', 'pipe:0'];
  if (audioPath) args.push('-i', audioPath);
  if (options.chaptersPath) args.push('-i', options.chaptersPath);
  const scale = outputScaleFilter(width, height, options.fit ?? output.fit, output.background ?? options.project.composition.background);
  if (format === 'mp4') {
    args.push(
      '-vf', scale,
      '-c:v', output.videoCodec || 'libx264',
      '-preset', options.preset ?? output.preset ?? 'medium',
      '-crf', String(options.crf ?? output.crf ?? 18),
      '-pix_fmt', output.pixelFormat || 'yuv420p',
      '-g', String(Math.max(1, Math.round((fps.num / fps.den) * 2))),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    );
    if (options.chaptersPath) {
    args.push('-map_metadata', String((audioPath ? 2 : 1)), '-map_chapters', String((audioPath ? 2 : 1)));
  }
  if (options.videoBitrate ?? output.videoBitrate) args.push('-b:v', String(options.videoBitrate ?? output.videoBitrate));
    if (audioPath) {
      args.push(
        '-c:a', output.audioCodec || 'aac',
        '-b:a', options.audioBitrate ?? output.audioBitrate ?? '192k',
        '-ar', String(options.sampleRate ?? output.sampleRate),
        '-ac', String(Math.min(2, options.channels ?? output.channels)),
        '-shortest',
      );
    }
    args.push('-movflags', '+faststart');
  } else if (format === 'webm') {
    args.push(
      '-vf', scale,
      '-c:v', output.videoCodec || 'libvpx-vp9',
      '-b:v', '0',
      '-crf', String(options.crf ?? output.crf ?? 32),
      '-row-mt', '1',
      '-cpu-used', '2',
      '-pix_fmt', 'yuv420p',
    );
    if (options.chaptersPath) {
    args.push('-map_metadata', String((audioPath ? 2 : 1)), '-map_chapters', String((audioPath ? 2 : 1)));
  }
  if (options.videoBitrate ?? output.videoBitrate) args.push('-b:v', String(options.videoBitrate ?? output.videoBitrate));
    if (audioPath) {
      args.push(
        '-c:a', output.audioCodec || 'libopus',
        '-b:a', options.audioBitrate ?? output.audioBitrate ?? '160k',
        '-ar', String(options.sampleRate ?? output.sampleRate),
        '-ac', String(Math.min(2, options.channels ?? output.channels)),
        '-shortest',
      );
    }
  } else if (format === 'gif') {
    const gifFps = Math.min(30, Math.max(1, Math.round(fps.num / fps.den)));
    args.push(
      '-filter_complex',
      `[0:v]fps=${gifFps},${scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`,
      '-loop', '0',
    );
  }
  args.push(outputPath);
  return args;
}

async function encodeAudioOnly(
  options: ExportOptions,
  wavPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const format = options.output.format;
  if (format === 'wav' && options.loudness === undefined) {
    fs.copyFileSync(wavPath, outputPath);
    return;
  }
  const args = ['-nostdin', '-hide_banner', '-v', 'error', '-y', '-i', wavPath];
  if (options.loudness !== undefined) args.push('-af', `loudnorm=I=${options.loudness}:TP=-1.5:LRA=11`);
  if (format === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-b:a', options.audioBitrate ?? options.output.audioBitrate ?? '192k');
  } else if (format === 'wav') {
    args.push('-c:a', 'pcm_s16le');
  } else {
    args.push('-c:a', options.output.audioCodec || 'aac', '-b:a', options.audioBitrate ?? '192k');
  }
  args.push(outputPath);
  await runEncoder(args, signal);
}

function runEncoder(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const abort = (): void => {
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => reject(new VhtmlError(ErrorCode.EXPORT_ENCODER_FAILED, (error as Error).message)));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0) resolve();
      else reject(new VhtmlError(ErrorCode.EXPORT_ENCODER_FAILED, `FFmpeg exited with ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

export async function exportProject(options: ExportOptions): Promise<ExportResult> {
  const started = Date.now();
  const report = progressReporter(options, started);
  const output = options.output;
  const timeline = findTimeline(options.project, output.timeline) ?? findTimeline(options.project, options.project.mainTimeline);
  if (!timeline) throw new VhtmlError(ErrorCode.EXPORT_VALIDATION_FAILED, 'project has no timeline to export');
  const format = output.format;
  if (format === 'webm') {
    if (output.videoCodec === 'libx264' || output.videoCodec === 'h264' || !output.videoCodec) output.videoCodec = 'libvpx-vp9';
    if (output.audioCodec === 'aac' || !output.audioCodec) output.audioCodec = 'libopus';
  } else if (format === 'mp4') {
    if (output.videoCodec.startsWith('libvpx') || !output.videoCodec) output.videoCodec = 'libx264';
    if (output.audioCodec === 'libopus' || !output.audioCodec) output.audioCodec = 'aac';
  } else if (format === 'gif') {
    output.videoCodec = 'gif';
    output.audioCodec = 'none';
  } else if (format === 'wav') {
    output.videoCodec = 'none';
    output.audioCodec = output.audioCodec === 'none' ? 'pcm_s16le' : output.audioCodec;
  } else if (format === 'mp3') {
    output.videoCodec = 'none';
    output.audioCodec = 'libmp3lame';
  }
  const width = options.width ?? output.width;
  const height = options.height ?? output.height;
  const fps = options.frameRate ?? output.frameRate;
  const rangeStart = options.rangeStart ?? output.rangeStart ?? ZERO;
  const requestedRange = options.rangeDuration ?? output.rangeDuration ?? timeline.duration;
  if (lt(requestedRange, ZERO) || requestedRange.num === 0) {
    throw new VhtmlError(ErrorCode.EXPORT_VALIDATION_FAILED, 'export range has no duration');
  }
  if (gte(rangeStart, timeline.duration)) {
    throw new VhtmlError(ErrorCode.EXPORT_VALIDATION_FAILED, 'export range starts after the timeline');
  }
  let rangeDuration = requestedRange;
  if (gt(add(rangeStart, rangeDuration), timeline.duration)) {
    rangeDuration = sub(timeline.duration, rangeStart);
  }
  if (output.pixelFormat === 'yuv420p' && (width % 2 !== 0 || height % 2 !== 0)) {
    throw new VhtmlError(ErrorCode.EXPORT_VALIDATION_FAILED, 'yuv420p output requires even dimensions');
  }
  const totalFrames = frameCount(rangeDuration, fps);
  if (totalFrames <= 0) throw new VhtmlError(ErrorCode.EXPORT_VALIDATION_FAILED, 'export range is shorter than one frame');
  const target = outputPathFor(options);
  fs.mkdirSync(target.isDirectory ? target.path : path.dirname(target.path), { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-export-'));
  const issues: string[] = [];
  const sampleRate = options.sampleRate ?? output.sampleRate;
  const requestedChannels = options.channels ?? output.channels;
  const channels = Math.min(2, requestedChannels);
  if (requestedChannels > 2) {
    issues.push(`audio channels ${requestedChannels} are downmixed to stereo in this encoder profile`);
  }
  if (output.colorSpace === 'display-p3') {
    issues.push('Display-P3 output is tagged as BT.709 by the current FFmpeg profile; HDR/WCG delivery needs a dedicated pipeline');
  }
  let audioPath: string | undefined;
  let captionsPath: string | undefined;

  try {
    report('prepare', 0, totalFrames, 'validating output');
    assertNotAborted(options.signal);
    if (options.generateCaptions || options.captionsPath || output.captionsPath) {
      const requested = options.captionsPath ?? output.captionsPath ?? `${target.path}.vtt`;
      captionsPath = path.resolve(requested);
      fs.mkdirSync(path.dirname(captionsPath), { recursive: true });
      fs.writeFileSync(captionsPath, generateWebVtt(options.project, output.timeline, rangeStart, rangeDuration), 'utf8');
    }

    const audioWav = path.join(tempRoot, 'soundtrack.wav');
    if (format !== 'gif' && hasAudibleClips(options.project, output.timeline)) {
      report('audio', 0, totalFrames, 'mixing audio');
      const mixed = await mixSoundtrack({
        project: options.project,
        root: options.root,
        timelineId: output.timeline,
        rangeStart,
        rangeDuration,
        sampleRate,
        channels,
        masterGain: options.masterGain,
        normalize: options.normalizeAudio ?? true,
        signal: options.signal,
      });
      issues.push(...mixed.issues);
      writeWavFloat(audioWav, mixed.samples, mixed.channels, mixed.sampleRate);
      if (options.loudness !== undefined) {
        await normalizeLoudness(audioWav, options.loudness, options.signal);
      }
      audioPath = audioWav;
    }

    if (format === 'wav' || format === 'mp3') {
      report('audio', 0, totalFrames, 'writing audio');
      if (!audioPath) {
        const frames = Math.round(toNumber(rangeDuration) * sampleRate);
        const silence = new Float32Array(frames * channels);
        writeWavFloat(audioWav, silence, channels, sampleRate);
        audioPath = audioWav;
      }
      await encodeAudioOnly(options, audioWav, target.path, options.signal);
      report('done', totalFrames, totalFrames, 'complete');
      const stat = fs.statSync(target.path);
      const probe = await probeMedia(target.path).catch(() => undefined);
      return {
        path: target.path,
        format,
        width,
        height,
        frameRate: fps,
        frames: totalFrames,
        durationSeconds: toNumber(rangeDuration),
        sizeBytes: stat.size,
        elapsedMs: Date.now() - started,
        issues,
        audioPath: options.keepTemp ? audioPath : undefined,
        captionsPath,
        probe: probe
          ? {
              durationSeconds: probe.durationSeconds,
              audioCodec: probe.audio?.codec,
            }
          : undefined,
      };
    }

    if (format === 'png-sequence') {
      const renderer = new VhtmlRenderer({
        project: options.project,
        root: options.root,
        timelineId: output.timeline,
        executablePath: options.executablePath,
        headless: options.headless,
        sandbox: options.sandbox,
        allowNetwork: options.allowNetwork,
        timeoutMs: options.timeoutMs,
      });
      try {
        await renderer.open();
        for (let frame = 0; frame < totalFrames; frame += 1) {
          assertNotAborted(options.signal);
          const time = add(rangeStart, frameTime(frame, fps));
          const captured = await renderer.sampleTime(toNumber(time));
          issues.push(...captured.issues);
          const file = path.join(target.path, `frame-${String(frame).padStart(6, '0')}.png`);
          fs.writeFileSync(file, captured.png);
          report('render', frame + 1, totalFrames, `frame ${frame + 1}/${totalFrames}`);
        }
      } finally {
        await renderer.close();
      }
      // Delivery fit/dimensions apply to PNG sequences too: resample the
      // composition-sized frames with the same Lanczos cover/contain/stretch
      // filter the video encoders use (audit gap: PNG fit was previously
      // ignored and reported as an issue).
      const needsResample = width !== options.project.composition.width
        || height !== options.project.composition.height
        || (options.fit ?? output.fit) !== undefined;
      if (needsResample && totalFrames > 0) {
        report('encode', 0, totalFrames, 'resampling frames to delivery size');
        const scaledDir = path.join(tempRoot, 'png-delivery');
        fs.mkdirSync(scaledDir, { recursive: true });
        const filter = outputScaleFilter(width, height, options.fit ?? output.fit, output.background ?? options.project.composition.background);
        await runEncoder([
          '-nostdin', '-hide_banner', '-v', 'error', '-y',
          '-framerate', `${fps.num}/${fps.den}`,
          '-start_number', '0',
          '-i', path.join(target.path, 'frame-%06d.png'),
          '-frames:v', String(totalFrames),
          '-vf', filter,
          '-start_number', '0',
          path.join(scaledDir, 'frame-%06d.png'),
        ], options.signal);
        for (let frame = 0; frame < totalFrames; frame += 1) {
          const scaled = path.join(scaledDir, `frame-${String(frame).padStart(6, '0')}.png`);
          if (!fs.existsSync(scaled)) {
            throw new VhtmlError(ErrorCode.EXPORT_ENCODER_FAILED, `delivery resampling produced no frame ${frame}`);
          }
          fs.copyFileSync(scaled, path.join(target.path, `frame-${String(frame).padStart(6, '0')}.png`));
        }
        report('encode', totalFrames, totalFrames, 'delivery resampling complete');
      }
      if (audioPath) {
        const audioOut = path.join(target.path, 'soundtrack.wav');
        fs.copyFileSync(audioPath, audioOut);
        audioPath = audioOut;
      }
      report('done', totalFrames, totalFrames, 'complete');
      return {
        path: target.path,
        format,
        width,
        height,
        frameRate: fps,
        frames: totalFrames,
        durationSeconds: toNumber(rangeDuration),
        sizeBytes: 0,
        elapsedMs: Date.now() - started,
        issues,
        audioPath,
        captionsPath,
      };
    }

    let chaptersPath: string | undefined;
    if (options.chapters && format === 'mp4') {
      const metadata = chaptersMetadataFile(timeline.markers, rangeStart, rangeDuration);
      if (metadata) {
        chaptersPath = path.join(tempRoot, 'chapters.ffmeta');
        fs.writeFileSync(chaptersPath, metadata, 'utf8');
        options = { ...options, chaptersPath };
      } else {
        issues.push('no chapter markers (type="chapter") on the timeline; skipping chapter muxing');
      }
    }
    const encoderArgs = buildEncoderArgs(options, target.path, fps, width, height, audioPath);
    const encoder = spawnEncoder(encoderArgs, options.signal);
    const renderer = new VhtmlRenderer({
      project: options.project,
      root: options.root,
      timelineId: output.timeline,
      executablePath: options.executablePath,
      headless: options.headless,
      sandbox: options.sandbox,
      allowNetwork: options.allowNetwork,
      timeoutMs: options.timeoutMs,
    });
    try {
      report('render', 0, totalFrames, 'opening Chromium');
      await renderer.open();
      for (let frame = 0; frame < totalFrames; frame += 1) {
        assertNotAborted(options.signal);
        const time = add(rangeStart, frameTime(frame, fps));
        const captured = await renderer.sampleTime(toNumber(time));
        issues.push(...captured.issues);
        await encoder.write(captured.png);
        report('render', frame + 1, totalFrames, `frame ${frame + 1}/${totalFrames}`);
      }
      report('encode', totalFrames, totalFrames, 'finalising');
      await encoder.finish();
    } finally {
      await renderer.close();
      if (!encoder.process.killed && encoder.process.exitCode === null) {
        try {
          encoder.process.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
    if (!fs.existsSync(target.path) || fs.statSync(target.path).size === 0) {
      throw new VhtmlError(ErrorCode.EXPORT_ENCODER_FAILED, `encoder produced no output for ${target.path}`);
    }
    const stat = fs.statSync(target.path);
    const probe = await probeMedia(target.path).catch(() => undefined);
    const result: ExportResult = {
      path: target.path,
      format,
      width,
      height,
      frameRate: fps,
      frames: totalFrames,
      durationSeconds: toNumber(rangeDuration),
      sizeBytes: stat.size,
      elapsedMs: Date.now() - started,
      issues: dedupeIssues(issues),
      sha256: fs.statSync(target.path).isFile() ? await sha256File(target.path) : undefined,
      audioPath: options.keepTemp ? audioPath : undefined,
      captionsPath,
      probe: probe
        ? {
            durationSeconds: probe.durationSeconds,
            videoCodec: probe.video?.codec,
            audioCodec: probe.audio?.codec,
            width: probe.video?.width,
            height: probe.video?.height,
          }
        : undefined,
    };
    if (options.reportPath) {
      const reportPath = path.resolve(options.reportPath);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(exportReport(result, options), null, 2), 'utf8');
      result.reportPath = reportPath;
    }
    report('done', totalFrames, totalFrames, 'complete');
    return result;
  } finally {
    if (!options.keepTemp) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function exportReport(result: ExportResult, options: ExportOptions): Record<string, unknown> {
  const generatedAssets = options.project.assets.filter(
    (asset) => asset.provenance?.source === 'generated' || Boolean(asset.generatedBy),
  );
  const licenses = uniqueStrings([
    ...options.project.assets.map((asset) => asset.license?.name ?? asset.license?.url),
    ...options.project.generations.map((task) => task.rights?.license),
  ]);
  const consents = uniqueStrings(options.project.generations.map((task) => task.rights?.consent));
  // RFC-0013 usage ledger: per-task records plus run totals over the same
  // currency family recorded on the tasks.
  const usageTasks = options.project.generations.filter((task) => task.usage);
  const usageTotals = usageTasks.reduce(
    (totals, task) => ({
      cost: totals.cost + (task.usage?.cost ?? 0),
      credits: totals.credits + (task.usage?.credits ?? 0),
      tokens: totals.tokens + (task.usage?.tokens ?? 0),
      computeSeconds: totals.computeSeconds + (task.usage?.computeSeconds ?? 0),
      outputBytes: totals.outputBytes + (task.usage?.outputBytes ?? 0),
    }),
    { cost: 0, credits: 0, tokens: 0, computeSeconds: 0, outputBytes: 0 },
  );
  return {
    schema: 'vhtml.export-report/1',
    vhtml: '1.1',
    exportedAt: new Date().toISOString(),
    project: options.project.id,
    title: options.project.title,
    output: options.output.id,
    format: result.format,
    width: result.width,
    height: result.height,
    frameRate: `${result.frameRate.num}/${result.frameRate.den}`,
    frames: result.frames,
    durationSeconds: result.durationSeconds,
    sizeBytes: result.sizeBytes,
    elapsedMs: result.elapsedMs,
    path: result.path,
    sha256: result.sha256,
    audioPath: result.audioPath,
    captionsPath: result.captionsPath,
    probe: result.probe,
    issues: result.issues,
    delivery: {
      preset: options.output.metadata?.deliveryPreset,
      label: options.output.metadata?.deliveryLabel,
      aspectRatio: options.output.metadata?.aspectRatio,
      safeArea: options.output.metadata?.safeArea,
      platforms: options.output.metadata?.platforms?.split(',').filter(Boolean),
    },
    provenance: {
      aiGenerated: generatedAssets.length > 0 || options.project.generations.length > 0,
      assets: options.project.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        src: asset.src,
        hash: asset.hash,
        license: asset.license?.name ?? asset.license?.url,
        generatedBy: asset.generatedBy,
      })),
      generatedAssets: generatedAssets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        src: asset.src,
        generatedBy: asset.generatedBy,
        provider: asset.provenance?.provider,
        model: asset.provenance?.model,
        hash: asset.hash,
      })),
      generations: options.project.generations.map((task) => ({
        id: task.id,
        kind: task.kind,
        provider: task.provider,
        model: task.model,
        status: task.status,
        usage: task.usage,
        review: task.review?.status,
        rights: task.rights,
        safety: task.safety,
      })),
      usageTotals,
      licenses,
      consents,
      aiDisclosure: options.project.generations.some((task) => task.rights?.aiDisclosure === true),
    },
  };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function sha256File(file: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', () => resolve(undefined));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function dedupeIssues(issues: string[]): string[] {
  return Array.from(new Set(issues.filter(Boolean))).slice(0, 100);
}

function normalize(value: Rational): Rational {
  const gcd = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  };
  const divisor = gcd(value.num, value.den);
  return { num: value.num / divisor, den: value.den / divisor };
}
