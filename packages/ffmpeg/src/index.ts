/**
 * FFmpeg/ffprobe process helpers. All encoder invocations are centralised here
 * so the language/runtime is not coupled to a specific CLI surface.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

export interface ProcessOptions {
  input?: Buffer | string;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
}

export interface ProcessResult {
  stdout: Buffer;
  stderr: string;
  code: number;
}

export class MediaToolError extends Error {
  readonly command: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  constructor(command: string, stderr: string, exitCode: number | null) {
    super(`${command} failed${exitCode === null ? '' : ` (${exitCode})`}: ${stderr.trim().slice(-4000)}`);
    this.name = 'MediaToolError';
    this.command = command;
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

export function ffmpegPath(): string {
  return process.env.VHTML_FFMPEG ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
}

export function ffprobePath(): string {
  return process.env.VHTML_FFPROBE ?? process.env.FFPROBE_PATH ?? 'ffprobe';
}

export function runTool(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const maxOutput = options.maxOutputBytes ?? 1024 * 1024 * 1024;
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new MediaToolError(command, `timed out after ${options.timeoutMs ?? 120000}ms\n${stderr}`, null));
    }, options.timeoutMs ?? 120_000);
    const abort = (): void => {
      if (settled) return;
      child.kill('SIGKILL');
    };
    options.signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutput) {
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      reject(new MediaToolError(command, `${(error as Error).message}\n${stderr}`, null));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      if (code === 0) {
        resolve({ stdout: Buffer.concat(chunks), stderr, code });
      } else {
        reject(new MediaToolError(command, stderr, code));
      }
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

export interface MediaStreamInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle' | 'data' | 'unknown';
  codec: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  durationSeconds?: number;
  frameRate?: string;
}

export interface MediaProbe {
  file: string;
  durationSeconds: number;
  format: string;
  sizeBytes: number;
  streams: MediaStreamInfo[];
  video?: MediaStreamInfo;
  audio?: MediaStreamInfo;
  raw?: unknown;
}

export async function probeMedia(file: string): Promise<MediaProbe> {
  if (!fs.existsSync(file)) throw new Error(`media file not found: ${file}`);
  const { stdout } = await runTool(
    ffprobePath(),
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { timeoutMs: 30_000, maxOutputBytes: 8 * 1024 * 1024 },
  );
  const json = JSON.parse(stdout.toString('utf8')) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const duration = Number(json.format?.duration ?? 0);
  const streams = (json.streams ?? []).map((stream): MediaStreamInfo => {
    const type = String(stream.codec_type ?? 'unknown') as MediaStreamInfo['type'];
    return {
      index: Number(stream.index ?? 0),
      type,
      codec: String(stream.codec_name ?? 'unknown'),
      width: stream.width ? Number(stream.width) : undefined,
      height: stream.height ? Number(stream.height) : undefined,
      sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined,
      channels: stream.channels ? Number(stream.channels) : undefined,
      durationSeconds: stream.duration ? Number(stream.duration) : undefined,
      frameRate: typeof stream.r_frame_rate === 'string' ? stream.r_frame_rate : undefined,
    };
  });
  return {
    file,
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    format: String(json.format?.format_name ?? ''),
    sizeBytes: Number(json.format?.size ?? 0),
    streams,
    video: streams.find((stream) => stream.type === 'video'),
    audio: streams.find((stream) => stream.type === 'audio'),
    raw: json,
  };
}

let versionCache: string | undefined;
export async function ffmpegVersion(): Promise<string> {
  if (versionCache) return versionCache;
  try {
    const { stdout, stderr } = await runTool(ffmpegPath(), ['-hide_banner', '-version'], { timeoutMs: 10_000 });
    const text = (stdout.toString('utf8') + stderr).split('\n')[0] ?? '';
    versionCache = text.trim();
  } catch {
    versionCache = 'not available';
  }
  return versionCache;
}

export async function assertFfmpeg(): Promise<void> {
  await runTool(ffmpegPath(), ['-hide_banner', '-version'], { timeoutMs: 10_000 });
}
