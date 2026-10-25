import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { toNumber } from '@sdkwork/vhtml-core/time';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="nle" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="12s" /></settings>
  <assets><asset id="vid" type="video" src="v.mp4" duration="8s" /></assets>
  <timelines><timeline id="main" duration="12s"><lane id="track" type="video">
    <clip id="a" ref="asset:vid" start="0s" duration="3s" />
    <clip id="b" ref="asset:vid" start="3s" duration="3s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

const newClip = (id: string, durationSeconds: number, sourceIn: number) => ({
  id,
  kind: 'video' as const,
  ref: 'asset:vid',
  start: { num: 0, den: 1 },
  duration: { num: durationSeconds, den: 1 },
  sourceIn: { num: sourceIn, den: 1 },
  speed: { num: 1, den: 1 },
  reverse: false,
  enabled: true,
  z: 0,
  opacity: 1,
  blend: 'normal' as const,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0.5, anchorY: 0.5 },
  fit: 'cover' as const,
  effects: [],
  animations: [],
  volume: 1,
  pan: 0,
  audioEffects: [],
});

function edit(operations: EditOperation[]) {
  const parsed = parseVhtml(BASE, { file: 'nle.vhtml', root: process.cwd() });
  return applyEditOperations(parsed.document.project, operations, { strict: false });
}

const shape = (result: { project: { timelines: Array<{ tracks: Array<{ clips: Array<{ id: string; start: { num: number; den: number }; duration: { num: number; den: number } }> }> }> } }) =>
  result.project.timelines[0]!.tracks[0]!.clips.map((clip) => ({
    id: clip.id,
    start: toNumber(clip.start),
    duration: toNumber(clip.duration),
  }));

test('timeline.insert splits spanning clips and pushes later content right', () => {
  const result = edit([{ op: 'timeline.insert', laneId: 'track', at: '1s', clip: newClip('ins', 2, 4) }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  assert.deepEqual(shape(result), [
    { id: 'a', start: 0, duration: 1 },
    { id: 'ins', start: 1, duration: 2 },
    { id: 'a-push', start: 3, duration: 2 },
    { id: 'b', start: 5, duration: 3 },
  ]);
  // The timeline stays contiguous: no gaps, no overlaps.
  const clips = result.project.timelines[0]!.tracks[0]!.clips;
  for (let index = 1; index < clips.length; index += 1) {
    const previousEnd = toNumber(clips[index - 1]!.start) + toNumber(clips[index - 1]!.duration);
    assert.equal(toNumber(clips[index]!.start), previousEnd, `clip ${clips[index]!.id} adjacency`);
  }
});

test('timeline.overwrite replaces the target range and keeps the rest', () => {
  const result = edit([{ op: 'timeline.overwrite', laneId: 'track', at: '0.5s', clip: newClip('ovr', 2, 6) }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  assert.deepEqual(shape(result), [
    { id: 'a', start: 0, duration: 0.5 },
    { id: 'ovr', start: 0.5, duration: 2 },
    { id: 'a-tail', start: 2.5, duration: 0.5 },
    { id: 'b', start: 3, duration: 3 },
  ]);
});

test('clip.link moves linked clips together and unlink detaches them', () => {
  const linked = edit([
    { op: 'clip.link', clipIds: ['a', 'b'] },
    { op: 'clip.move', clipId: 'a', start: '2s' },
  ]);
  assert.equal(linked.ok, true, linked.diagnostics.map((d) => d.message).join('\n'));
  assert.deepEqual(shape(linked).map((entry) => entry.start), [2, 5], 'b follows a by the same delta');

  const unlinked = applyEditOperations(linked.project, [{ op: 'clip.unlink', clipId: 'a' }], { strict: false });
  assert.equal(unlinked.ok, true);
  const solo = applyEditOperations(unlinked.project, [{ op: 'clip.move', clipId: 'a', start: '6s' }], { strict: false });
  // clip.move keeps the array time-ordered, so assert per id.
  const soloClips = solo.project.timelines[0]!.tracks[0]!.clips;
  assert.equal(toNumber(soloClips.find((clip) => clip.id === 'a')!.start), 6, 'a moved alone');
  assert.equal(toNumber(soloClips.find((clip) => clip.id === 'b')!.start), 5, 'b stayed put after unlink');
});

test('linked propagation keeps both halves of a detached audio pair aligned', () => {
  const detached = edit([
    { op: 'clip.detachAudio', clipId: 'a' },
    { op: 'clip.link', clipIds: ['a', 'a-audio'] },
    { op: 'clip.move', clipId: 'a', start: '4s' },
  ]);
  assert.equal(detached.ok, true, detached.diagnostics.map((d) => d.message).join('\n'));
  const timeline = detached.project.timelines[0]!;
  const visual = timeline.tracks[0]!.clips.find((clip) => clip.id === 'a')!;
  const audio = timeline.tracks.find((track) => track.type === 'audio')!.clips.find((clip) => clip.id === 'a-audio')!;
  assert.equal(toNumber(visual.start), 4);
  assert.equal(toNumber(audio.start), 4, 'linked audio follows the visual move');
  const frame = evaluateFrame(detached.project, { num: 9, den: 2 });
  assert.deepEqual(frame.clips.map((clip) => clip.clipId).sort(), ['a', 'a-audio', 'b']);
});
