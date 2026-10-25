import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';
import { ffmpegPath, ffprobePath } from '@sdkwork/vhtml-ffmpeg';

function toolsAvailable(): boolean {
  return spawnSync(ffprobePath(), ['-hide_banner', '-version']).status === 0;
}

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="modal-batch" version="1.1">
  <settings><composition width="1920" height="1080" frame-rate="30/1" duration="2s" /></settings>
  <scenes><scene id="s" duration="2s"><div style="position:absolute;inset:0;background:#0b1020"></div></scene></scenes>
  <timelines><timeline id="main" duration="2s"><lane id="v" type="video">
    <clip id="c" ref="s" start="0s" duration="2s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

// Mirrors the Studio export modal's batch loop server contract: sequential
// /api/export jobs with `delivery` overrides, each polled to completion.
test('studio batch loop renders each delivery preset correctly', { skip: !toolsAvailable() && 'FFmpeg not available', timeout: 240_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-modal-batch-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      const origin = studio.url.replace(/\/studio$/, '');
      const runJob = async (delivery: string) => {
        const start = await fetch(`${origin}/api/export`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ delivery, report: true }),
        }).then((r) => r.json());
        assert.ok(start.jobId, `job started for ${delivery}`);
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const job = await fetch(`${origin}/api/job/${encodeURIComponent(start.jobId)}`).then((r) => r.json());
          if (job.status === 'succeeded') return job;
          if (job.status === 'failed') throw new Error(`${delivery}: ${job.error}`);
        }
        throw new Error(`${delivery}: render timed out`);
      };
      const mp4 = await runJob('web-1080p');
      const vertical = await runJob('tiktok');
      assert.ok(mp4.file?.endsWith('.mp4'), `web file ${mp4.file}`);
      assert.ok(vertical.file?.endsWith('.mp4'), `tiktok file ${vertical.file}`);
      const probeMp4 = spawnSync(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path.resolve(root, mp4.file!)], { encoding: 'utf8' });
      const mp4Stream = JSON.parse(probeMp4.stdout).streams?.[0];
      assert.equal(mp4Stream.width, 1920);
      assert.equal(mp4Stream.height, 1080);
      const probeVertical = spawnSync(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path.resolve(root, vertical.file!)], { encoding: 'utf8' });
      const verticalStream = JSON.parse(probeVertical.stdout).streams?.[0];
      assert.equal(verticalStream.width, 1080);
      assert.equal(verticalStream.height, 1920);
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
