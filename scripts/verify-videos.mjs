#!/usr/bin/env node
/**
 * Regression smoke test: export one second of every example, then verify the
 * video stream, frame count and that the result is not a frozen/black still.
 *
 *   node scripts/verify-videos.mjs [--keep] [--json]
 *
 * This is intentionally separate from `pnpm test`: it is a delivery/QC gate and
 * needs Chromium + FFmpeg.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpegPath, ffprobePath } from '@sdkwork/vhtml-ffmpeg';

const root = path.resolve(import.meta.dirname, '..');
const keep = process.argv.includes('--keep');
const json = process.argv.includes('--json');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-videos-'));
const rows = [];
let failed = 0;

const examples = fs.readdirSync(path.join(root, 'examples'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

try {
  for (const name of examples) {
    const project = path.join(root, 'examples', name);
    const out = path.join(temp, `${name}.mp4`);
    const args = [path.join(root, 'bin', 'vhtml.mjs'), 'export', project, '--range', '0s+1s', '--out', out];
    if (name === '06-ai-storyboard' || name === '08-code-video') args.push('--generate');
    const exported = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    if (exported.status !== 0 || !fs.existsSync(out)) {
      failed += 1;
      rows.push({ example: name, ok: false, error: (exported.stderr || exported.stdout || '').slice(-800) });
      continue;
    }
    const probe = spawnSync(ffprobePath(), [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,nb_frames',
      '-of', 'json', out,
    ], { encoding: 'utf8' });
    let stream;
    try {
      stream = JSON.parse(probe.stdout).streams?.[0];
    } catch {
      stream = undefined;
    }
    if (!stream) {
      failed += 1;
      rows.push({ example: name, ok: false, error: 'no video stream' });
      continue;
    }
    const md5 = path.join(temp, `${name}.framemd5`);
    const hashes = spawnSync(ffmpegPath(), ['-v', 'error', '-i', out, '-an', '-f', 'framemd5', md5]);
    const lines = hashes.status === 0 && fs.existsSync(md5)
      ? fs.readFileSync(md5, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('0,'))
      : [];
    const unique = new Set(lines.map((line) => line.split(',').at(-1)?.trim())).size;
    const frames = Number(stream.nb_frames) || lines.length;
    const ok = frames > 0 && unique > 0;
    if (!ok) failed += 1;
    rows.push({
      example: name,
      ok,
      width: stream.width,
      height: stream.height,
      fps: stream.r_frame_rate,
      frames,
      unique,
      bytes: fs.statSync(out).size,
    });
  }
} finally {
  if (!keep) fs.rmSync(temp, { recursive: true, force: true });
}

if (json) {
  console.log(JSON.stringify({ ok: failed === 0, temp: keep ? temp : undefined, rows }, null, 2));
} else {
  for (const row of rows) {
    if (!row.ok) {
      console.log(`FAIL  ${row.example}  ${row.error ?? 'invalid video'}`);
    } else {
      console.log(`ok    ${row.example}  ${row.width}x${row.height}  ${row.fps}  ${row.frames} frames  ${row.unique} unique  ${row.bytes} bytes`);
    }
  }
  console.log(failed === 0 ? `\nall ${rows.length} example video(s) verified` : `\n${failed} example video(s) failed`);
}
process.exit(failed === 0 ? 0 : 1);
