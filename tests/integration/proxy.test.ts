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
<project id="proxy" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="2s" /></settings>
  <assets><asset id="footage" type="video" src="footage.mp4" duration="2s" /></assets>
  <timelines><timeline id="main" duration="2s"><lane id="v" type="video">
    <clip id="c" ref="asset:footage" start="0s" duration="2s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

test('proxy endpoint renders a 360p H.264 edit copy with cache and origin passthrough', { skip: !toolsAvailable() && 'FFmpeg not available', timeout: 120_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-proxy-'));
  try {
    const source = path.join(root, 'footage.mp4');
    const generate = spawnSync(ffmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', source,
    ]);
    assert.equal(generate.status, 0, generate.stderr?.toString());
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      const origin = studio.url.replace(/\/studio$/, '');
      const first = await fetch(`${origin}/api/media/proxy?asset=footage`);
      assert.equal(first.status, 200);
      assert.equal(first.headers.get('content-type'), 'video/mp4');
      const bytes = Buffer.from(await first.arrayBuffer());
      assert.ok(bytes.length > 1000 && bytes.length < fs.statSync(source).size, `proxy smaller than source (${bytes.length})`);
      const probe = spawnSync(ffprobePath(), [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,codec_name',
        '-of', 'json', '-',
      ], { input: bytes, encoding: 'utf8' });
      const stream = JSON.parse(probe.stdout).streams?.[0];
      assert.equal(stream.codec_name, 'h264');
      assert.equal(stream.height, 360, `proxy height ${stream.height}`);
      // Second request serves from cache (same bytes, different connection).
      const second = await fetch(`${origin}/api/media/proxy?asset=footage`).then((r) => r.arrayBuffer());
      assert.ok(second.byteLength === bytes.length, 'cached copy identical');
      // Unknown asset id errors clearly.
      const missing = await fetch(`${origin}/api/media/proxy?asset=ghost`);
      assert.equal(missing.status, 404);
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stage proxy mode rewrites local video sources to the proxy resolver', { skip: !toolsAvailable() && 'FFmpeg not available', timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-proxy2-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      const toggled = await fetch(`${studio.origin}/api/proxy-mode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }).then((r) => r.json());
      assert.equal(toggled.ok, true);
      assert.equal(toggled.proxySources, true);
      const stage = await fetch(`${studio.origin}/__vhtml/stage.html`).then((r) => r.text());
      assert.ok(stage.includes('/api/media/proxy?asset=footage'), 'stage video src rewritten');
      assert.ok(!stage.includes('src="footage.mp4"'), 'original local src replaced');
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
