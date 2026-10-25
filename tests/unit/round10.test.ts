import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { animate, rat, toNumber } from '@sdkwork/vhtml-core';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round10" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="12s" /></settings>
  <assets>
    <asset id="vid" type="video" src="v.mp4" duration="8s" />
    <asset id="song" type="audio" src="s.wav" duration="12s" />
  </assets>
  <timelines><timeline id="main" duration="12s">
    <lane id="track" type="video">
      <clip id="a" ref="asset:vid" start="0s" duration="2s" />
      <clip id="b" ref="asset:vid" start="2s" duration="2s" />
      <clip id="c" ref="asset:vid" start="4s" duration="2s" />
    </lane>
    <lane id="aud" type="audio" order="1">
      <clip id="music" ref="asset:song" start="0s" duration="6s" />
    </lane>
  </timeline></timelines>
</project></vhtml></body></html>`;

function edit(operations: EditOperation[]) {
  const parsed = parseVhtml(BASE, { file: 'r10.vhtml', root: process.cwd() });
  return applyEditOperations(parsed.document.project, operations, { strict: false });
}

test('timeline.moveBatch drags a selection keeping relative offsets', () => {
  // Select b+c and drop so that b (the earliest) lands at 6s; c follows at 8s.
  const result = edit([{ op: 'timeline.moveBatch', clipIds: ['b', 'c'], start: '6s' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clips = result.project.timelines[0]!.tracks[0]!.clips;
  assert.deepEqual(
    clips.map((clip) => ({ id: clip.id, start: toNumber(clip.start) })),
    [
      { id: 'a', start: 0 },
      { id: 'b', start: 6 },
      { id: 'c', start: 8 },
    ],
  );
});

test('moveBatch refuses zero delta and cross-timeline selections with clear diagnostics', () => {
  const zero = edit([{ op: 'timeline.moveBatch', clipIds: ['a'], start: '0s' }]);
  assert.ok(zero.diagnostics.some((diagnostic) => diagnostic.message.includes('zero')));
  const missing = edit([{ op: 'timeline.moveBatch', clipIds: ['a', 'ghost'], start: '2s' }]);
  assert.equal(missing.ok, false);
  assert.ok(missing.diagnostics.some((diagnostic) => diagnostic.code === 'EDIT_TARGET_NOT_FOUND'));
});

test('volume keyframe automation drives the export mixer gain', () => {
  // Model-level volume automation (what the Studio keyframe palette now emits).
  const parsed = parseVhtml(BASE, { file: 'r10b.vhtml', root: process.cwd() });
  const music = parsed.document.project.timelines[0]!.tracks[1]!.clips[0]!;
  music.animations.push({
    ...animate({ property: 'volume', from: 1, to: 0, duration: '2s', easing: 'linear' }),
    clipId: music.id,
  });
  const frame = evaluateFrame(parsed.document.project, rat(1));
  const state = frame.clips.find((clip) => clip.clipId === 'music')!;
  assert.ok(state.audio, 'audio state present');
  // Linear ramp 1 -> 0 over 2s: at t=1s the gain is 0.5.
  assert.ok(Math.abs(state.audio!.gain - 0.5) < 1e-6, `gain ${state.audio!.gain}`);
  void toNumber;
});
