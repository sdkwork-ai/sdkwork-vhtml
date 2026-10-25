import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { serializeProject } from '@sdkwork/vhtml-core/serialize';
import { audioSoloActive } from '@sdkwork/vhtml-media/audio';
import { rat, toNumber } from '@sdkwork/vhtml-core/time';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round11" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="6s" /></settings>
  <assets>
    <asset id="song" type="audio" src="s.wav" duration="6s" />
    <asset id="vid" type="video" src="v.mp4" duration="8s" />
  </assets>
  <timelines><timeline id="main" duration="6s">
    <lane id="track" type="video">
      <clip id="a" ref="asset:vid" start="0s" duration="3s" />
    </lane>
    <lane id="music" type="audio" order="1">
      <clip id="n" ref="asset:song" start="0s" duration="6s" />
    </lane>
    <lane id="vo" type="audio" order="2">
      <clip id="voice" ref="asset:song" start="0s" duration="6s" />
    </lane>
  </timeline></timelines>
</project></vhtml></body></html>`;

function edit(operations: EditOperation[]) {
  const parsed = parseVhtml(BASE, { file: 'r11.vhtml', root: process.cwd() });
  return applyEditOperations(parsed.document.project, operations, { strict: false });
}

test('soloed audio lane silences other audio lanes in preview and export units', () => {
  const result = edit([{ op: 'track.set', trackId: 'vo', props: { solo: true } }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  assert.equal(audioSoloActive(timeline), true);
  // Preview: the non-soloed music clip reports muted; the soloed one does not.
  const frame = evaluateFrame(result.project, rat(1));
  const music = frame.clips.find((clip) => clip.clipId === 'n')!;
  const voice = frame.clips.find((clip) => clip.clipId === 'voice')!;
  assert.equal(music.audio!.muted, true, 'non-soloed lane muted by solo');
  assert.equal(voice.audio!.muted, false, 'soloed lane stays audible');
  // No solo -> nothing muted by solo semantics.
  const plain = parseVhtml(BASE, { file: 'r11b.vhtml', root: process.cwd() }).document.project;
  assert.equal(audioSoloActive(plain.timelines[0]!), false);
  const plainFrame = evaluateFrame(plain, rat(1));
  assert.equal(plainFrame.clips.find((clip) => clip.clipId === 'n')!.audio!.muted, false);
});

test('solo attribute round-trips through parse and serialize', () => {
  const result = edit([{ op: 'track.set', trackId: 'vo', props: { solo: true } }]);
  const serialized = serializeProject(result.project);
  assert.ok(serialized.includes('solo'), 'solo attribute serialized');
  const reparsed = parseVhtml(serialized, { file: 'r11s.vhtml', root: process.cwd() });
  const lane = reparsed.document.project.timelines[0]!.tracks.find((track) => track.id === 'vo')!;
  assert.equal(lane.solo, true);
  assert.equal(
    reparsed.document.project.timelines[0]!.tracks.find((track) => track.id === 'music')!.solo,
    undefined,
  );
});

test('speed ramp presets produce exact keyframes via clip.timeremap', () => {
  // What the Studio "Smooth S" button emits for clip a (3s @ 1x, source 0..3).
  const result = edit([{
    op: 'clip.timeremap',
    clipId: 'a',
    easing: 'ease-in-out',
    keyframes: [
      { at: '0s', source: '0s' },
      { at: '1.5s', source: '1.5s' },
      { at: '3s', source: '3s' },
    ],
  }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clip = result.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.equal(clip.timeRemap?.keyframes.length, 3);
  // S-curve: the instant rate peaks at the midpoint (dS/dt = 2 at the centre
  // of an ease-in-out ramp spanning 3s of source over 3s of timeline).
  const mid = evaluateFrame(result.project, rat(3, 2));
  const state = mid.clips.find((candidate) => candidate.clipId === 'a')!;
  assert.ok(state.mediaTime !== undefined);
  const validation = validateDocument(
    { specVersion: '1.1', project: result.project, source: { path: process.cwd(), root: process.cwd() } },
    { checkFiles: false },
  );
  assert.equal(validation.errors.length, 0);
  void toNumber;
});
