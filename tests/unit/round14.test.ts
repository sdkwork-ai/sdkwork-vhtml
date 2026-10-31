import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string) {
  return parseVhtml(source, { file: 'round14.vhtml', root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round14" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('mirror flip round-trips: negative scale-x parses, validates and serializes', () => {
  const doc = parse(BASE_PROJECT.replace(
    '<clip id="c" ref="scene:card" start="0s" duration="1s"></clip>',
    '<clip id="c" ref="scene:card" start="0s" duration="1s"><transform scale-x="-1"></transform></clip>',
  ));
  assert.equal(doc.diagnostics.filter((d) => d.severity === 'error').length, 0,
    doc.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const clip = doc.document.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.equal(clip.transform.scaleX, -1, 'flip survives parsing');
  // Zero scale stays rejected.
  const zero = parse(BASE_PROJECT.replace(
    '<clip id="c" ref="scene:card" start="0s" duration="1s"></clip>',
    '<clip id="c" ref="scene:card" start="0s" duration="1s"><transform scale-x="0"></transform></clip>',
  ));
  assert.ok(zero.diagnostics.some((d) => d.severity === 'error'), 'zero scale rejected');
  // A round-trip keeps the mirror.
  const reparsed = parse(serializeDocument(doc.document));
  assert.equal(reparsed.document.project.timelines[0]!.tracks[0]!.clips[0]!.transform.scaleX, -1);
});

test('timeline.nest creates a nested timeline the studio can target', () => {
  const doc = parse(BASE_PROJECT);
  const result = applyEditOperations(doc.document.project, [
    { op: 'timeline.nest', clipIds: ['c'], timelineId: 'sub', clipId: 'compound-1' },
  ]);
  const compound = result.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.equal(compound.kind, 'timeline');
  assert.equal(compound.ref, 'timeline:sub');
  // The nested timeline exists with the moved clip.
  const nested = result.project.timelines.find((timeline) => timeline.id === 'sub');
  assert.ok(nested, 'nested timeline created');
  assert.equal(nested!.tracks[0]!.clips[0]!.id, 'c');
  assert.ok(serializeDocument({ specVersion: '1.1', project: result.project }));
});

test('Studio client ships compound clip navigation', () => {
  // The projection carries timelineId/mainTimelineId (server side); the
  // client navigates via /api/timeline/select and shows the back button.
  for (const marker of ['enterCompoundClip', 'selectEditingTimeline', 'timeline-back', 'updateTimelineChrome']) {
    assert.ok(STUDIO_HTML.includes(marker), `compound clip navigation marker: ${marker}`);
  }
});

test('Studio ships round-6 editing tools', () => {
  // Copy/paste attributes.
  for (const marker of ['Copy attributes', 'Paste attributes', 'attributeClipboard', 'reIdEffects']) {
    assert.ok(STUDIO_HTML.includes(marker), `attribute clipboard marker: ${marker}`);
  }
  // Curve speed presets (CapCut 曲线变速).
  for (const marker of ['Montage (蒙太奇)', 'Hero moment (英雄时刻)', 'Bullet time (子弹时间)', 'Jump cut (跳接)', 'Flash in (闪进)', 'SPEED_CURVE_PRESETS']) {
    assert.ok(STUDIO_HTML.includes(marker), `curve speed marker: ${marker}`);
  }
  // Flip / rotate quick transforms.
  for (const marker of ['Flip horizontally', 'Flip vertically', 'flipSelected', 'rotateSelected']) {
    assert.ok(STUDIO_HTML.includes(marker), `flip/rotate marker: ${marker}`);
  }
});
