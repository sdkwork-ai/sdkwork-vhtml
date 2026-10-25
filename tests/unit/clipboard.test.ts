import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { toNumber } from '@sdkwork/vhtml-core/time';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="clip" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="14s" /></settings>
  <assets>
    <asset id="vid" type="video" src="v.mp4" duration="8s" />
    <asset id="song" type="audio" src="s.wav" duration="14s" />
  </assets>
  <timelines><timeline id="main" duration="14s">
    <lane id="track" type="video">
      <clip id="a" ref="asset:vid" start="0s" duration="3s" />
      <clip id="b" ref="asset:vid" start="3s" duration="3s" />
    </lane>
    <lane id="aud" type="audio" order="1">
      <clip id="n" ref="asset:song" start="0s" duration="3s" />
    </lane>
  </timeline></timelines>
</project></vhtml></body></html>`;

function edit(operations: EditOperation[]) {
  const parsed = parseVhtml(BASE, { file: 'clip.vhtml', root: process.cwd() });
  return applyEditOperations(parsed.document.project, operations, { strict: false });
}

test('copy keeps lane types; paste insert places per-type lanes at the anchor', () => {
  // One copy spanning both lanes: visual a + audio n pasted at 7s.
  const result = edit([
    { op: 'timeline.copy', clipIds: ['a', 'n'] },
    { op: 'timeline.paste', at: '7s', idPrefix: 'dup' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  const visual = timeline.tracks[0]!.clips.find((clip) => clip.id === 'dup-1')!;
  const audio = timeline.tracks[1]!.clips.find((clip) => clip.id === 'dup-2')!;
  assert.equal(toNumber(visual.start), 7);
  assert.equal(toNumber(audio.start), 7, 'lane-relative offsets preserved');
  // Originals untouched.
  assert.ok(timeline.tracks[0]!.clips.some((clip) => clip.id === 'a'));
});

test('cut removes with ripple and paste overwrite replaces the target range', () => {
  const result = edit([
    { op: 'timeline.cut', clipIds: ['b'] },
    { op: 'timeline.paste', at: '0s', mode: 'overwrite', idPrefix: 'moved' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clips = result.project.timelines[0]!.tracks[0]!.clips;
  // After ripple-cut of b, a covers 0..3s; overwrite paste at 0s replaces it exactly.
  assert.deepEqual(
    clips.map((clip) => ({ id: clip.id, start: toNumber(clip.start), duration: toNumber(clip.duration) })),
    [{ id: 'moved-1', start: 0, duration: 3 }],
  );
});

test('paste insert pushes overlapping content right without gaps', () => {
  const result = edit([
    { op: 'timeline.copy', clipIds: ['a'] },
    { op: 'timeline.paste', at: '1s', mode: 'insert', idPrefix: 'ins' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clips = result.project.timelines[0]!.tracks[0]!.clips;
  assert.deepEqual(
    clips.map((clip) => ({ id: clip.id, start: toNumber(clip.start), duration: toNumber(clip.duration) })),
    [
      { id: 'a', start: 0, duration: 1 },
      { id: 'ins-1', start: 1, duration: 3 },
      { id: 'a-push', start: 4, duration: 2 },
      { id: 'b', start: 6, duration: 3 },
    ],
  );
  // Whole lane remains contiguous.
  for (let index = 1; index < clips.length; index += 1) {
    const previousEnd = toNumber(clips[index - 1]!.start) + toNumber(clips[index - 1]!.duration);
    assert.equal(toNumber(clips[index]!.start), previousEnd);
  }
});

test('pasted clips evaluate at their new position', () => {
  const result = edit([
    { op: 'timeline.copy', clipIds: ['a', 'n'] },
    { op: 'timeline.paste', at: '7s', idPrefix: 'dup' },
  ]);
  const frame = evaluateFrame(result.project, { num: 15, den: 2 });
  assert.deepEqual(frame.clips.map((clip) => clip.clipId).sort(), ['dup-1', 'dup-2']);
});
