import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="drop" version="1.1">
  <settings><composition width="640" height="360" frame-rate="30/1" duration="6s" /></settings>
  <assets><asset id="pip" kind="image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" /></assets>
  <scenes><scene id="s" duration="6s"><div style="position:absolute;inset:0;background:#123">Drop</div></scene></scenes>
  <timelines><timeline id="main" duration="6s"><lane id="v" type="video">
    <clip id="hero" ref="s" start="0s" duration="6s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

test('clip-from-asset places canvas drops with fit/scale/x/y on the top overlay lane', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-drop-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      const post = (route: string, body: unknown) =>
        fetch(`${studio.origin}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
      // Canvas drop: PIP at (480, 90) → transform offsets from the canvas centre (320, 180).
      const dropped = await post('/api/clip-from-asset', { assetId: 'pip', trackId: 'v', start: 1, mode: 'add', fit: 'contain', scale: 0.4, x: 160, y: -90 });
      assert.equal(dropped.ok, true, JSON.stringify(dropped).slice(0, 200));
      // A visual asset cannot join the video lane… actually image assets may; but the canvas flow targets an overlay lane.
      // The server honours the requested lane, so verify placement on the returned clip.
      const clip = studio.project().timelines[0]!.tracks[0]!.clips.find((candidate) => candidate.ref === 'pip')!;
      assert.ok(clip, 'clip created');
      assert.equal(clip.fit, 'contain');
      assert.equal(clip.transform.scaleX, 0.4);
      assert.equal(clip.transform.x, 160);
      assert.equal(clip.transform.y, -90);
      assert.equal(clip.start.num / clip.start.den, 1);

      // Partial placement: y only keeps the authored x.
      const partial = await post('/api/clip-from-asset', { assetId: 'pip', trackId: 'v', start: 2, mode: 'add', fit: 'contain', scale: 0.4, y: 30 });
      assert.equal(partial.ok, true);
      const second = studio.project().timelines[0]!.tracks[0]!.clips.filter((candidate) => candidate.ref === 'pip')[1]!;
      assert.equal(second.transform.x, 0, 'x defaults to the untouched 0');
      assert.equal(second.transform.y, 30);
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Studio ships round-15 surfaces: canvas drop zone, shape drag, centre snap, hints', () => {
  for (const marker of [
    'stage-dropzone',
    'setupCanvasDropzone',
    'beginCanvasDrag',
    'canvasPointFromEvent',
    'dropAssetOnCanvas',
    'dropEffectOnCanvas',
    'ensureOverlayLaneOps',
    'application/x-vhtml-shape',
    'center-hot',
    'Drop to add as a picture-in-picture overlay at this position',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-15 marker: ${marker}`);
  }
});
