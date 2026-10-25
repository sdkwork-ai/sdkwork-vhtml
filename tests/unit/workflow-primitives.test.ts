import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations, type EditOperation } from '@sdkwork/vhtml-core/edits';
import { cuesToClips } from '@sdkwork/vhtml-core/captions';
import { toNumber } from '@sdkwork/vhtml-core/time';

const BASE = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="beat" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="6s" /></settings>
  <assets><asset id="v" type="video" src="v.mp4" duration="6s" /></assets>
  <timelines><timeline id="main" duration="6s"><lane id="v" type="video">
    <clip id="take" ref="asset:v" start="0s" duration="6s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

test('clip.splitMulti splits at multiple points with caller-chosen segment ids', () => {
  const parsed = parseVhtml(BASE, { file: 'beat.vhtml', root: process.cwd() });
  const result = applyEditOperations(parsed.document.project, [
    { op: 'clip.splitMulti', clipId: 'take', times: ['1s', '3s'], ids: ['seg-a', 'seg-b'] },
  ] as EditOperation[], { strict: false });
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const clips = result.project.timelines[0]!.tracks[0]!.clips;
  assert.deepEqual(clips.map((clip) => clip.id), ['take', 'seg-a', 'seg-b']);
  assert.deepEqual(clips.map((clip) => toNumber(clip.start)), [0, 1, 3]);
  assert.deepEqual(clips.map((clip) => toNumber(clip.duration)), [1, 2, 3]);
});

test('cuesToClips converts JSON rows, SRT and WebVTT into caption clips', () => {
  const fromJson = cuesToClips([
    { start: 0.5, end: 1.5, text: 'Hello world' },
    { start: 2, duration: 1, text: 'Second', speaker: 'A' },
    { start: Number.NaN, text: 'invalid row skipped' },
  ]);
  assert.equal(fromJson.length, 2);
  assert.equal(toNumber(fromJson[0]!.start), 0.5);
  assert.equal(toNumber(fromJson[0]!.duration), 1);
  assert.equal((fromJson[1] as { speaker?: string }).speaker, 'A');

  const fromSrt = cuesToClips('1\n00:00:01,000 --> 00:00:02,000\nFrom SRT\n');
  assert.equal(fromSrt.length, 1);
  assert.equal(toNumber(fromSrt[0]!.start), 1);
  assert.equal((fromJson[0] as { text: string }).text, 'Hello world');

  const fromVtt = cuesToClips('WEBVTT\n\ncue-x\n00:00.500 --> 00:01.000\nFrom VTT\n');
  assert.equal(fromVtt.length, 1);
  assert.equal(toNumber(fromVtt[0]!.start), 0.5);
});
