import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpegPath, ffprobePath } from '@sdkwork/vhtml-ffmpeg';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="batch-export" version="1.1">
  <settings><composition width="1920" height="1080" frame-rate="30/1" duration="2s" /></settings>
  <scenes><scene id="s" duration="2s"><div style="position:absolute;inset:0;display:grid;place-items:center;background:#0b1020;color:#6ee7ff;font:700 96px system-ui">Batch</div></scene></scenes>
  <timelines><timeline id="main" duration="2s"><lane id="v" type="video">
    <clip id="c" ref="s" start="0s" duration="2s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

function toolsAvailable(): boolean {
  try {
    findChromeExecutable();
  } catch {
    return false;
  }
  return spawnSync(ffmpegPath(), ['-hide_banner', '-version']).status === 0;
}

test('batch export renders multiple delivery presets in one pass', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 300_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-batch-'));
  const workspaceRoot = path.resolve(import.meta.dirname ?? '.', '..', '..');
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const bin = path.join(workspaceRoot, 'bin', 'vhtml.mjs');
    const outDir = path.join(root, 'renders');
    const run = spawnSync(process.execPath, [
      bin, 'export', root, '--batch', 'web-1080p,tiktok,square-1080p',
      '--out-dir', outDir, '--report-dir', path.join(root, 'reports'),
      '--json', '--preset', 'ultrafast', '--crf', '30',
    ], { encoding: 'utf8', timeout: 240_000 });
    assert.equal(run.status, 0, run.stderr?.slice(-600) || run.stdout?.slice(-600));
    const summary = JSON.parse(run.stdout) as { ok: boolean; results: Array<{ preset: string; ok: boolean; path?: string }> };
    assert.equal(summary.ok, true);
    assert.equal(summary.results.length, 3);
    // Each preset produces a correctly-shaped file: web 16:9, tiktok 9:16, square 1:1.
    const expectations: Record<string, [number, number]> = {
      'web-1080p': [1920, 1080],
      'tiktok': [1080, 1920],
      'square-1080p': [1080, 1080],
    };
    for (const entry of summary.results) {
      assert.equal(entry.ok, true, `${entry.preset} rendered`);
      assert.ok(entry.path && fs.existsSync(entry.path!), `${entry.preset} file exists`);
      const probe = spawnSync(ffprobePath(), [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,nb_frames',
        '-of', 'json', entry.path!,
      ], { encoding: 'utf8' });
      const stream = JSON.parse(probe.stdout).streams?.[0];
      const [expectedWidth, expectedHeight] = expectations[entry.preset]!;
      assert.equal(stream.width, expectedWidth, `${entry.preset} width ${stream.width}`);
      assert.equal(stream.height, expectedHeight, `${entry.preset} height ${stream.height}`);
      assert.equal(Number(stream.nb_frames), 60, `${entry.preset} frames @30/2s`);
    }
    // Reports landed for each preset.
    assert.equal(fs.readdirSync(path.join(root, 'reports')).length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
