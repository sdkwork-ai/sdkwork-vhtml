#!/usr/bin/env node
/**
 * verify-export.mjs — post-export QC gate for one media file.
 *
 * Skill: sdkwork-vhtml-video (.sdkwork/skills/sdkwork-vhtml-video)
 * Mirrors the repository delivery gate (scripts/verify-videos.mjs) for a
 * single file.
 *
 * Usage:
 *   node verify-export.mjs <file> [--expect <WxH>] [--min-frames <n>] [--json]
 *
 * Checks (video files):
 *   1. ffprobe sees a video stream with the expected dimensions (when given).
 *   2. Frame count > 0 (>= --min-frames when given).
 *   3. Frame hashes are not all identical — proves the file is not a frozen
 *      or black still.
 * Audio-only files (wav/mp3/m4a): stream presence + duration instead.
 *
 * Exit: 0 verified, 1 failed, 2 usage error.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
let expect;
let minFrames = 0;
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--expect') { expect = argv[++i]; continue; }
  if (arg === '--min-frames') { minFrames = Number(argv[++i]); continue; }
  if (arg.startsWith('--')) continue;
  positionals.push(arg);
}
const file = positionals[0];

const usage = 'usage: node verify-export.mjs <file> [--expect <WxH>] [--min-frames <n>] [--json]';
function fail(message, code, extra) {
  if (json) console.log(JSON.stringify({ ok: false, file, error: message, ...extra }, null, 2));
  else console.error(`error: ${message}`);
  process.exit(code);
}

if (!file) fail(usage, 2);
const target = path.resolve(file);
if (!fs.existsSync(target)) fail(`file not found: ${target}`, 1);

// Resolve ffprobe/ffmpeg: env override → @sdkwork/vhtml-ffmpeg from a repo
// node_modules (walking up) → PATH.
async function resolveTools() {
  if (process.env.VHTML_FFPROBE && process.env.VHTML_FFMPEG) {
    return { ffprobe: process.env.VHTML_FFPROBE, ffmpeg: process.env.VHTML_FFMPEG };
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'node_modules', '@sdkwork', 'vhtml-ffmpeg', 'dist', 'index.js');
    if (fs.existsSync(candidate)) {
      const mod = await import(new URL('file:///' + candidate.replace(/\\/g, '/')).href);
      return { ffprobe: mod.ffprobePath(), ffmpeg: mod.ffmpegPath() };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { ffprobe: 'ffprobe', ffmpeg: 'ffmpeg' };
}

const { ffprobe, ffmpeg } = await resolveTools();
const run = (tool, args) => spawnSync(tool, args, { encoding: 'utf8' });

const AUDIO_EXT = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac']);
const isAudio = AUDIO_EXT.has(path.extname(target).toLowerCase());

const probe = run(ffprobe, [
  '-v', 'error', '-show_entries',
  isAudio
    ? 'stream=codec_name,sample_rate,channels:format=duration'
    : 'stream=width,height,r_frame_rate,nb_frames:format=duration',
  '-of', 'json', target,
]);
if (probe.status !== 0) fail(`ffprobe failed: ${(probe.stderr || '').trim().slice(-400)}`, 1);
let parsed;
try { parsed = JSON.parse(probe.stdout); } catch { fail('ffprobe produced no JSON', 1); }
const stream = parsed.streams?.[0];
if (!stream) fail('no media stream found', 1);
const duration = Number(parsed.format?.duration ?? 0);

const checks = [];
if (isAudio) {
  checks.push({ check: 'stream', ok: Boolean(stream.codec_name), detail: `${stream.codec_name} ${stream.sample_rate}Hz ${stream.channels}ch` });
  checks.push({ check: 'duration', ok: duration > 0, detail: `${duration.toFixed(2)}s` });
} else {
  const dims = `${stream.width}x${stream.height}`;
  checks.push({ check: 'stream', ok: Boolean(stream.width), detail: `${dims} @ ${stream.r_frame_rate}` });
  if (expect) checks.push({ check: 'dimensions', ok: dims === expect, detail: `${dims} (expected ${expect})` });
  const frames = Number(stream.nb_frames) || 0;
  checks.push({ check: 'frames', ok: frames > 0 && frames >= minFrames, detail: `${frames || '?'} frames${minFrames ? ` (min ${minFrames})` : ''}` });

  // Non-frozen proof: per-frame hashes over the whole file.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-qc-'));
  const md5 = path.join(temp, 'frames.framemd5');
  const hashes = run(ffmpeg, ['-v', 'error', '-i', target, '-an', '-f', 'framemd5', md5]);
  const lines = hashes.status === 0 && fs.existsSync(md5)
    ? fs.readFileSync(md5, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('0,'))
    : [];
  const unique = new Set(lines.map((line) => line.split(',').at(-1)?.trim())).size;
  checks.push({ check: 'motion', ok: unique > 1 || frames === 1, detail: `${unique} unique frame hash(es)` });
  fs.rmSync(temp, { recursive: true, force: true });
}

const ok = checks.every((check) => check.ok);
if (json) {
  console.log(JSON.stringify({ ok, file: target, duration, checks }, null, 2));
} else {
  for (const check of checks) console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.check.padEnd(11)} ${check.detail}`);
  console.log(ok ? `\nverify-export: PASS (${path.basename(target)})` : `\nverify-export: FAIL (${path.basename(target)})`);
}
process.exit(ok ? 0 : 1);
