import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';
import { ffmpegPath, ffprobePath } from '@sdkwork/vhtml-ffmpeg';

function toolsAvailable(): boolean {
  try {
    fs.accessSync(process.execPath);
  } catch {
    return false;
  }
  return spawnSync(ffprobePath(), ['-hide_banner', '-version']).status === 0;
}

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="sweep" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="10s" sample-rate="48000" channels="2" /></settings>
  <assets>
    <asset id="v1" type="video" src="v1.mp4" duration="8s" />
    <asset id="v2" type="video" src="v2.mp4" duration="8s" />
    <asset id="song" type="audio" src="song.wav" duration="10s" />
  </assets>
  <scenes><scene id="outro" duration="2s"><div style="position:absolute;inset:0;background:#231">outro</div></scene></scenes>
  <timelines><timeline id="main" duration="10s">
    <lane id="track" type="video">
      <clip id="a" ref="asset:v1" start="0s" duration="3s" />
      <clip id="b" ref="asset:v2" start="3s" duration="3s" />
    </lane>
    <lane id="aud" type="audio" order="1">
      <clip id="music" ref="asset:song" start="0s" duration="6s" />
    </lane>
  </timeline>
  <marker id="ch1" at="1s" name="Intro" type="chapter"></marker>
  </timelines>
</project></vhtml></body></html>`;

test('full functional sweep: every editing primitive through the Studio pipeline', { skip: !toolsAvailable() && 'FFmpeg not available', timeout: 120_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-sweep-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, autosaveMs: 0, timeoutMs: 20_000 });
    const origin = studio.url.replace(/\/studio$/, '');
    const apply = async (operations: unknown[]) => {
      const body = await fetch(`${origin}/api/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operations }),
      }).then((r) => r.json());
      assert.equal(body.ok, true, `op failed: ${JSON.stringify(operations)} -> ${JSON.stringify(body.diagnostics ?? body)}`);
      return body;
    };
    const clips = () => {
      const model = studio.project();
      return model.timelines[0]!.tracks[0]!.clips.map((clip) => ({
        id: clip.id,
        start: clip.start.num / clip.start.den,
        duration: clip.duration.num / clip.duration.den,
      }));
    };

    // 1. trim
    await apply([{ op: 'clip.trim', clipId: 'a', duration: '2.5s' }]);
    assert.equal(clips()[0]!.duration, 2.5);
    // 2. split
    await apply([{ op: 'clip.split', clipId: 'b', at: '4.5s' }]);
    assert.equal(clips().length, 3);
    // 3. move
    await apply([{ op: 'clip.move', clipId: 'b', start: '3s' }]);
    assert.equal(clips()[1]!.start, 3);
    // 4. duplicate
    await apply([{ op: 'clip.duplicate', clipId: 'b' }]);
    assert.ok(clips().some((clip) => clip.id === 'b-copy'));
    await apply([{ op: 'clip.remove', clipId: 'b-copy' }]);
    // 5. speed
    await apply([{ op: 'clip.speed', clipId: 'b', speed: 2 }]);
    assert.equal(clips()[1]!.duration, 0.75, '2x halves the post-split duration (1.5s -> 0.75s)');
    await apply([{ op: 'clip.speed', clipId: 'b', speed: 1 }]);
    // 6. timeremap (ramp)
    await apply([{ op: 'clip.timeremap', clipId: 'b', keyframes: [
      { at: '0s', source: '0s' }, { at: '1.5s', source: '1.5s' }, { at: '3s', source: '3s' },
    ] }]);
    await apply([{ op: 'clip.timeremap.clear', clipId: 'b' }]);
    // 7. detach audio + link + unlink
    await apply([{ op: 'clip.detachAudio', clipId: 'a' }]);
    const audioLane = studio.project().timelines[0]!.tracks.find((track) => track.type === 'audio')!;
    assert.ok(audioLane.clips.some((clip) => clip.metadata?.detachedFrom === 'a'));
    await apply([{ op: 'clip.link', clipIds: ['a', 'b'] }]);
    await apply([{ op: 'clip.unlink', clipId: 'a' }]);
    // 8. effects + animations
    await apply([
      { op: 'effect.add', clipId: 'b', effect: { id: 'fx1', type: 'blur', params: { amount: 6 }, enabled: true } },
      { op: 'animation.add', animation: { id: 'an1', property: 'opacity', timeBase: 'clip', start: { num: 0, den: 1 }, duration: { num: 1, den: 1 }, easing: 'linear', iterations: 1, direction: 'normal', fill: 'both', compose: 'replace', enabled: true, keyframes: [{ time: { num: 0, den: 1 }, value: '0' }, { time: { num: 1, den: 1 }, value: '1' }] }, clipId: 'b' },
    ]);
    // 9. transitions (need overlap): slide b under a's tail (a ends 2.5)
    await apply([{ op: 'clip.move', clipId: 'b', start: '2s' }]);
    await apply([{ op: 'transition.add', trackId: 'track', transition: { fromClipId: 'a', toClipId: 'b', type: 'crossfade', duration: '0.5s', easing: 'ease-in-out', direction: 'left', color: '#000000', params: {} } }]);
    // 10. markers
    await apply([{ op: 'marker.add', timelineId: 'main', marker: { id: 'mk2', time: '5s', name: 'Mid', type: 'marker' } }]);
    // 11. clipboard copy/paste
    await apply([
      { op: 'timeline.copy', clipIds: ['a'] },
      { op: 'timeline.paste', at: '8s', mode: 'overwrite', idPrefix: 'clip-paste' },
    ]);
    // 12. nest + unnest
    const nest = await apply([{ op: 'timeline.nest', clipIds: ['a', 'b'] }]);
    assert.equal(nest.ok, true);
    const nested = studio.project().timelines[0]!.tracks[0]!.clips.find((clip) => clip.kind === 'timeline')!;
    await apply([{ op: 'timeline.unnest', clipId: nested.id }]);
    // 13. rippleCut
    await apply([{ op: 'timeline.rippleCut', trackIds: ['track'], start: '5s', end: '6s' }]);
    // 14. splitMulti
    await apply([{ op: 'clip.splitMulti', clipId: 'music', times: ['2s', '4s'] }]);
    // 15. batch move
    await apply([{ op: 'timeline.moveBatch', clipIds: ['a', 'b'], start: '0s' }]);
    // 16. composition + metadata
    await apply([{ op: 'composition.set', composition: { background: '#0a1020' } }]);
    // Final: model must still be valid.
    const finalModel = studio.project();
    assert.ok(finalModel.timelines[0]!.tracks.length >= 2);
    await studio.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('media endpoints: peaks, poster, proxy all functional', { skip: !toolsAvailable() && 'FFmpeg not available', timeout: 120_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-media-'));
  try {
    const source = path.join(root, 'v1.mp4');
    const generate = spawnSync(ffmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', source,
    ]);
    assert.equal(generate.status, 0, generate.stderr?.toString());
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, autosaveMs: 0, timeoutMs: 20_000 });
    const origin = studio.url.replace(/\/studio$/, '');
    try {
      const peaks = await fetch(`${origin}/api/media/peaks?asset=v1`).then((r) => r.json());
      assert.equal(peaks.ok, true);
      assert.ok(peaks.buckets.length > 10, 'peak buckets');
      const poster = await fetch(`${origin}/api/media/poster?asset=v1&t=0.5`);
      assert.equal(poster.status, 200);
      assert.equal(poster.headers.get('content-type'), 'image/jpeg');
      const proxy = await fetch(`${origin}/api/media/proxy?asset=v1`);
      assert.equal(proxy.status, 200);
      const proxyBytes = Buffer.from(await proxy.arrayBuffer());
      const probe = spawnSync(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'json', '-'], { input: proxyBytes, encoding: 'utf8' });
      assert.equal(JSON.parse(probe.stdout).streams?.[0]?.height, 360);
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
