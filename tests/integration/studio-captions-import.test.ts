import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function projectSource(): string {
  return `<vhtml version="1.1"><project id="caption-import" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="6s" /></settings>
  <scenes><scene id="s1"><div style="position:absolute;inset:0;background:#0b1220;color:#fff">One</div></scene></scenes>
  <timelines><timeline id="main" duration="6s"><lane id="v" type="video"><clip id="c" ref="scene:s1" start="0s" duration="4s"></clip></lane></timeline></timelines>
  </project></vhtml>`;
}

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:02,500',
  'Hello timeline',
  '',
  '2',
  '00:00:03,000 --> 00:00:04,500',
  'Second cue',
  '',
].join('\n');

async function waitForProject(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/project`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError instanceof Error ? lastError : new Error('Studio did not start');
}

test('Studio captions import: SRT text becomes caption clips on a caption lane', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-caption-import-'));
  fs.writeFileSync(path.join(root, 'captions.vhtml'), projectSource());
  fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
    version: '1.1',
    id: 'caption-import',
    entry: 'captions.vhtml',
    paths: { assets: 'assets', images: 'assets/images', video: 'assets/video', audio: 'assets/audio', fonts: 'assets/fonts', scenes: 'scenes', generated: 'generated', renders: 'renders', cache: '.vhtml/cache' },
  }, null, 2));
  const port = 4900 + Math.floor(Math.random() * 300);
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const child = spawn(process.execPath, [path.join(repo, 'bin', 'vhtml.mjs'), 'serve', root, '--port', String(port), '--no-open'], {
    cwd: repo,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForProject(url);

    // Empty payload is rejected.
    const empty = await fetch(`${url}/api/captions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });
    assert.equal(empty.status, 400);

    // SRT import creates the caption lane and both cues at their timestamps.
    const first = await (await fetch(`${url}/api/captions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: SRT }),
    })).json() as { ok?: boolean; added?: number; model?: { lanes: Array<{ type: string; clips: Array<{ id: string; kind: string; start: number; duration: number; text?: string }> }> }; error?: string };
    assert.equal(first.ok, true, first.error);
    assert.equal(first.added, 2);
    const captionLane = first.model?.lanes.find((lane) => lane.type === 'caption');
    assert.ok(captionLane, 'caption lane created');
    assert.equal(captionLane.clips.length, 2);
    assert.equal(captionLane.clips[0]?.kind, 'caption');
    assert.equal(captionLane.clips[0]?.start, 1);
    assert.ok(Math.abs(captionLane.clips[0]!.duration - 1.5) < 1e-6);
    assert.equal(captionLane.clips[1]?.start, 3);

    // A second import does not collide on clip ids.
    const second = await (await fetch(`${url}/api/captions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: SRT }),
    })).json() as { ok?: boolean; added?: number; model?: { lanes: Array<{ type: string; clips: Array<{ id: string }> }> }; error?: string };
    assert.equal(second.ok, true, second.error);
    assert.equal(second.added, 2);
    const lane2 = second.model?.lanes.find((lane) => lane.type === 'caption');
    const ids = lane2?.clips.map((clip) => clip.id) ?? [];
    assert.equal(new Set(ids).size, ids.length, 'imported cue ids stay unique');

    // Garbage input fails with a structured error, project untouched.
    const bad = await fetch(`${url}/api/captions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'this is not a subtitle file' }),
    });
    assert.equal(bad.status, 422);
    const badBody = await bad.json() as { error?: string };
    assert.ok(badBody.error);

    // The saved file round-trips the imported cues.
    const saved = fs.readFileSync(path.join(root, 'captions.vhtml'), 'utf8');
    assert.match(saved, /Hello timeline/);
  } finally {
    child.kill();
  }
});
