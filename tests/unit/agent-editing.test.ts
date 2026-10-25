import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { toNumber } from '@sdkwork/vhtml-core/time';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="ai-edit" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="10s" /></settings>
  <assets>
    <asset id="v1" type="video" src="v1.mp4" duration="6s" />
    <asset id="v2" type="video" src="v2.mp4" duration="6s" />
    <asset id="still" type="image" src="still.png" />
  </assets>
  <scenes><scene id="outro" duration="2s"><div>outro</div></scene></scenes>
  <timelines><timeline id="main" duration="10s">
    <lane id="v" type="video">
      <clip id="a" ref="asset:v1" start="0s" duration="3s" />
      <clip id="b" ref="asset:v2" start="3s" duration="3s" />
    </lane>
    <lane id="aud" type="audio" order="1">
      <clip id="narration" ref="asset:v1" start="0s" duration="6s" />
    </lane>
  </timeline></timelines>
  <storyboard>
    <shot id="shot-open" order="1" scene="outro" duration="2s" status="boarded"></shot>
    <shot id="shot-still" order="2" asset="still" duration="1s" status="boarded"></shot>
  </storyboard>
</project></vhtml></body></html>`;

function edit(source: string, operations: EditOperation[]) {
  const parsed = parseVhtml(source, { file: 'ai-edit.vhtml', root: process.cwd() });
  const result = applyEditOperations(parsed.document.project, operations, { strict: false });
  return { result, diagnostics: result.diagnostics };
}

test('timeline.rippleCut removes a range across lanes and closes the gap', () => {
  // Text-based editing: remove the "um" between 1s and 2s on both lanes.
  const { result } = edit(BASE, [
    { op: 'timeline.rippleCut', trackIds: ['v', 'aud'], start: '1s', end: '2s' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  const visual = timeline.tracks[0]!.clips;
  const audio = timeline.tracks[1]!.clips;
  // Clip a: 0..1s stays, 2..3s shifts to 1..2s.
  const kept = visual.find((clip) => clip.id === 'a')!;
  const shifted = visual.find((clip) => clip.id === 'a-keep' || clip.id.startsWith('a-'))!;
  assert.equal(toNumber(kept.start), 0);
  // Ripple closed the gap: the tail segment now plays at 1..2s and its source
  // window starts exactly after the removed region (sourceIn = 2s).
  assert.equal(toNumber(shifted.start), 1);
  assert.equal(toNumber(shifted.duration), 1);
  assert.equal(toNumber(shifted.sourceIn!), 2);
  // b shifted left by 1s: now 2..5s.
  const b = visual.find((clip) => clip.id === 'b')!;
  assert.equal(toNumber(b.start), 2);
  assert.equal(clipEndRelative(b), 5);
  // After the ripple, t=1.5s plays the shifted tail whose source position is
  // 2s + 0.5s local = 2.5s (the removed 1..2s source region is gone).
  const frame = evaluateFrame(result.project, { num: 3, den: 2 });
  const playing = frame.clips.find((clip) => clip.clipId === shifted.id)!;
  assert.ok(Math.abs((playing.mediaTime ?? 0) - 2.5) < 1e-9, `mediaTime ${playing.mediaTime}`);
  assert.ok(evaluateFrame(result.project, { num: 1, den: 1 }).clips.length > 0, 'content continues after the cut');
  function clipEndRelative(clip: { start: { num: number; den: number }; duration: { num: number; den: number } }) {
    return toNumber(clip.start) + toNumber(clip.duration);
  }
});

test('timeline.unnest flattens a compound clip back into the parent lane', () => {
  const { result } = edit(BASE, [
    { op: 'timeline.nest', clipIds: ['a', 'b'], timelineId: 'group' },
    { op: 'timeline.unnest', clipId: 'compound' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  assert.ok(!result.project.timelines.some((candidate) => candidate.id === 'group'), 'sub timeline removed');
  // The parent lane holds the flattened clips again (ids preserved from the sub).
  const ids = timeline.tracks[0]!.clips.map((clip) => clip.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
  assert.equal(toNumber(timeline.tracks[0]!.clips[0]!.start), 0);
  const frame = evaluateFrame(result.project, { num: 1, den: 2 });
  assert.deepEqual(frame.clips.map((clip) => clip.clipId).sort(), ['a', 'narration'], 'visual a + untouched audio narration');
});

test('storyboard.apply materialises shots into clips in order', () => {
  const { result } = edit(BASE, [
    { op: 'storyboard.apply', at: '6s' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  const lane = timeline.tracks[0]!;
  const open = lane.clips.find((clip) => clip.id === 'shot-shot-open')!;
  const still = lane.clips.find((clip) => clip.id === 'shot-shot-still')!;
  assert.ok(open, 'scene shot materialised');
  assert.equal(open.kind, 'scene');
  assert.equal(toNumber(open.start), 6);
  assert.equal(toNumber(open.duration), 2);
  assert.ok(still, 'asset shot materialised');
  assert.equal(still.kind, 'image');
  assert.equal(toNumber(still.start), 8);
  assert.equal((open as { metadata?: Record<string, string> }).metadata?.fromShot, 'shot-open');
  const validation = validateDocument(
    { specVersion: '1.1', project: result.project, source: { path: process.cwd(), root: process.cwd() } },
    { checkFiles: false },
  );
  assert.equal(validation.errors.length, 0, validation.errors.map((d) => d.message).join('\n'));
});

test('storyboard.apply with generation links resolves gen refs to the right clip kind', () => {
  const source = BASE.replace(
    '<shot id="shot-still" order="2" asset="still" duration="1s" status="boarded"></shot>',
    '<shot id="shot-gen" order="2" generation="bg" duration="1s" status="boarded"></shot>',
  ).replace(
    '<scenes>',
    '<generations><generate id="bg" kind="video" provider="procedural"><prompt>gradient</prompt><constraints duration="2s"></constraints></generate></generations><scenes>',
  );
  const { result } = edit(source, [{ op: 'storyboard.apply', shotIds: ['shot-gen'], at: '6s' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clip = result.project.timelines[0]!.tracks[0]!.clips.find((candidate) => candidate.id === 'shot-shot-gen')!;
  assert.equal(clip.kind, 'video');
  assert.equal(clip.ref, 'gen:bg');
});
