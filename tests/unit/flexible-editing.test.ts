import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { toNumber } from '@sdkwork/vhtml-core/time';
import { serializeProject } from '@sdkwork/vhtml-core/serialize';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="flex-edit" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="8s" /></settings>
  <assets>
    <asset id="clip-a" type="video" src="a.mp4" duration="4s" />
    <asset id="clip-b" type="video" src="b.mp4" duration="4s" />
    <asset id="song" type="audio" src="song.wav" duration="8s" />
  </assets>
  <timelines><timeline id="main" duration="8s">
    <lane id="v" type="video">
      <clip id="a" ref="asset:clip-a" start="0s" duration="2s" />
      <clip id="b" ref="asset:clip-b" start="2s" duration="2s" />
    </lane>
  </timeline></timelines>
</project></vhtml></body></html>`;

function edit(source: string, operations: EditOperation[]) {
  const parsed = parseVhtml(source, { file: 'flex.vhtml', root: process.cwd() });
  const result = applyEditOperations(parsed.document.project, operations, { strict: false });
  return result;
}

test('clip.duplicate copies timing, effects and animations with unique ids', () => {
  const result = edit(BASE, [
    { op: 'clip.split', clipId: 'a', at: '1s' },
    { op: 'clip.duplicate', clipId: 'a' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const lane = result.project.timelines[0]!.tracks[0]!;
  const copies = lane.clips.filter((clip) => clip.id === 'a-copy');
  assert.equal(copies.length, 1);
  // Original clip 'a' now ends at 1s; the duplicate starts right after it.
  assert.equal(toNumber(copies[0]!.start), 1);
  assert.equal(toNumber(copies[0]!.duration), 1);
  // Explicit start override works too.
  const explicit = applyEditOperations(
    result.project,
    [{ op: 'clip.duplicate', clipId: 'a', id: 'a-tail', start: '5s' }],
    { strict: false },
  );
  assert.equal(explicit.ok, true);
  const tail = explicit.project.timelines[0]!.tracks[0]!.clips.find((clip) => clip.id === 'a-tail')!;
  assert.equal(toNumber(tail.start), 5);
});

test('clip.detachAudio splits video into muted visual + linked audio clip', () => {
  const result = edit(BASE, [{ op: 'clip.detachAudio', clipId: 'a' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  const audioLane = timeline.tracks.find((track) => track.type === 'audio');
  assert.ok(audioLane, 'audio lane created');
  const detached = audioLane!.clips.find((clip) => clip.id === 'a-audio')!;
  assert.equal(detached.kind, 'audio');
  assert.equal((detached as { metadata?: Record<string, string> }).metadata?.detachedFrom, 'a');
  const visual = timeline.tracks[0]!.clips.find((clip) => clip.id === 'a')!;
  assert.equal((visual as { muted?: boolean }).muted, true);
  assert.equal((visual as { metadata?: Record<string, string> }).metadata?.audioDetachedTo, 'a-audio');
  // Both halves evaluate at the same project time.
  const frame = evaluateFrame(result.project, { num: 1, den: 2 });
  assert.ok(frame.clips.some((clip) => clip.clipId === 'a'));
  assert.ok(frame.clips.some((clip) => clip.clipId === 'a-audio'));
});

test('clip.replace swaps the source while keeping the source window', () => {
  const result = edit(BASE, [
    { op: 'clip.replace', clipId: 'b', ref: 'asset:clip-a' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clip = result.project.timelines[0]!.tracks[0]!.clips.find((candidate) => candidate.id === 'b')!;
  assert.equal(clip.ref, 'asset:clip-a');
  assert.equal(toNumber(clip.start), 2, 'project timing preserved');
  // Incompatible source is rejected.
  const rejected = edit(BASE, [{ op: 'clip.replace', clipId: 'b', ref: 'asset:song' }]);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.some((diagnostic) => diagnostic.code === 'REFERENCE_INCOMPATIBLE'));
});

test('timeline.nest creates a compound clip from a selection', () => {
  const result = edit(BASE, [
    { op: 'timeline.nest', clipIds: ['a', 'b'] },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const timeline = result.project.timelines[0]!;
  assert.equal(timeline.tracks[0]!.clips.length, 1, 'source clips replaced by compound');
  const compound = timeline.tracks[0]!.clips[0]!;
  assert.equal(compound.kind, 'timeline');
  const subId = compound.ref!.replace('timeline:', '');
  const sub = result.project.timelines.find((candidate) => candidate.id === subId)!;
  assert.ok(sub, 'sub timeline created');
  assert.equal(sub.tracks[0]!.clips.length, 2, 'both clips moved into the sub timeline');
  // Inner clips keep their relative order and timing (a at 0, b at 2s offset by the nest start).
  assert.equal(toNumber(sub.tracks[0]!.clips[0]!.start), 0);
  assert.equal(toNumber(sub.tracks[0]!.clips[1]!.start), 2);
  assert.equal(toNumber(compound.duration), 4);
  // The compound clip evaluates through the nested path.
  // Compound maps project time onto the sub timeline: a covers 0..2s, b 2..4s.
  assert.deepEqual(evaluateFrame(result.project, { num: 1, den: 2 }).clips.map((clip) => clip.clipId), ['a']);
  assert.deepEqual(evaluateFrame(result.project, { num: 5, den: 2 }).clips.map((clip) => clip.clipId), ['b']);
  const validation = validateDocument(
    { specVersion: '1.1', project: result.project, source: { path: process.cwd(), root: process.cwd() } },
    { checkFiles: false },
  );
  assert.equal(validation.errors.length, 0, validation.errors.map((d) => d.message).join('\n'));
});

test('transcribe generation kind parses, maps to data assets and round-trips', () => {
  const source = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="asr" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="2s" /></settings>
  <assets><asset id="voice-over" type="audio" src="voice.wav" duration="2s" /></assets>
  <timelines><timeline id="main" duration="2s"></timeline></timelines>
  <generations>
    <generate id="voice-script" kind="transcribe" provider="whisper" model="whisper-large">
      <prompt>verbatim transcript</prompt>
      <constraints language="en" duration="2s"></constraints>
      <gen-input ref="voice-over" role="voice"></gen-input>
      <direction>{"speech":{"language":"en"}}</direction>
      <gen-output role="cues"></gen-output>
    </generate>
  </generations>
</project></vhtml></body></html>`;
  const parsed = parseVhtml(source, { file: 'asr.vhtml', root: process.cwd() });
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0);
  const task = parsed.document.project.generations[0]!;
  assert.equal(task.kind, 'transcribe');
  const serialized = serializeProject(parsed.document.project);
  assert.ok(serialized.includes('kind="transcribe"'));
  const reparsed = parseVhtml(serialized, { file: 'round.vhtml', root: process.cwd() });
  assert.equal(reparsed.document.project.generations[0]!.kind, 'transcribe');
  const validation = validateDocument(
    { ...parsed.document, source: { path: process.cwd(), root: process.cwd() } },
    { checkFiles: false },
  );
  assert.equal(validation.errors.length, 0);
  void os; void path; void fs;
});
