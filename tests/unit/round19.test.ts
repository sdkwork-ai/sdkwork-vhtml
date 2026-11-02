import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string, file = 'round19.vhtml') {
  return parseVhtml(source, { file, root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round19" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="card" duration="4s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="4s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="4s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('project.set merges metadata (cover-time) and the serializer round-trips it', () => {
  const parsed = parse(BASE_PROJECT);
  const result = applyEditOperations(parsed.document.project, [
    { op: 'project.set', metadata: { 'cover-time': '2.5' } } as never,
    { op: 'project.set', metadata: { 'review.status': 'approved' } } as never,
  ]);
  assert.equal(result.project.metadata['cover-time'], '2.5');
  assert.equal(result.project.metadata['review.status'], 'approved');
  const validation = validateDocument({ specVersion: '1.1', project: result.project });
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));

  const serialized = serializeDocument({ specVersion: '1.1', project: result.project });
  assert.match(serialized, /cover-time="2\.5"/);
  const reparsed = parse(serialized, 'round19-roundtrip.vhtml');
  assert.equal(reparsed.document.project.metadata['cover-time'], '2.5');
  assert.equal(reparsed.document.project.metadata['review.status'], 'approved');
});

test('splitting at marker times yields one segment per gap (一键卡点 op shape)', () => {
  const parsed = parse(BASE_PROJECT);
  const result = applyEditOperations(parsed.document.project, [
    { op: 'marker.add', timelineId: 'main', marker: { id: 'beat-1', time: 1, name: '♪', type: 'marker' } },
    { op: 'marker.add', timelineId: 'main', marker: { id: 'beat-2', time: 2.5, name: '♪', type: 'marker' } },
    // Out-of-range and boundary marker times must be ignored by the caller.
    { op: 'marker.add', timelineId: 'main', marker: { id: 'beat-3', time: 3.75, name: '♪', type: 'marker' } },
    { op: 'clip.splitMulti', clipId: 'c', times: [1, 2.5, 3.75] },
  ] as never[]);
  const validation = validateDocument({ specVersion: '1.1', project: result.project });
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));
  const clips = result.project.timelines[0]!.tracks[0]!.clips;
  assert.equal(clips.length, 4, 'three split points → four segments');
  assert.deepEqual(clips.map((clip) => [toSeconds(clip.start), toSeconds(clip.duration)]), [
    [0, 1], [1, 1.5], [2.5, 1.25], [3.75, 0.25],
  ]);
});

function toSeconds(value: { num: number; den: number }): number {
  return value.num / value.den;
}

test('Studio ships round-11 surfaces: beat split, cover frame, favourites, vertical text + credits roll', () => {
  for (const marker of [
    'splitSelectionAtMarkers',
    'Split at markers (卡点)',
    'clip.splitMulti',
    'exp-cover-set',
    'coverTimeOf',
    "'cover-time'",
    'exp-cover',
    'assetFavoritesOnly',
    'Add to favourites',
    'Credits roll (滚动字幕)',
    'vertical-rl',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-11 marker: ${marker}`);
  }
});
