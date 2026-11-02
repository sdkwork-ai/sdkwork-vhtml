import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { VISUAL_EFFECT_TYPES } from '@sdkwork/vhtml-core/model';
import { evaluateFrame, parseCurvePoints, sampleCurve, curvesFilterUrl } from '@sdkwork/vhtml-runtime/evaluate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string) {
  return parseVhtml(source, { file: 'round22.vhtml', root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round22" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('curve points parse with pinned endpoints and sample as a monotone cubic without overshoot', () => {
  assert.equal(parseCurvePoints(''), undefined);
  assert.equal(parseCurvePoints('0.5,0.5'), undefined, 'one point is not a curve');
  const pinned = parseCurvePoints('0.75,0.82;0.25,0.18')!;
  assert.deepEqual(pinned, [[0, 0.18], [0.25, 0.18], [0.75, 0.82], [1, 0.82]], 'sorted and pinned to x=0 / x=1');

  const identity = parseCurvePoints('0,0;1,1')!;
  for (let i = 0; i <= 10; i++) assert.ok(Math.abs(sampleCurve(identity, i / 10) - i / 10) < 1e-9);

  const s = parseCurvePoints('0,0;0.25,0.18;0.75,0.82;1,1')!;
  assert.ok(sampleCurve(s, 0.25) < 0.25 && sampleCurve(s, 0.75) > 0.75, 'S-curve deepens shadows and lifts highlights');
  assert.ok(Math.abs(sampleCurve(s, 0.5) - 0.5) < 0.02, 'symmetric S stays near the midpoint');
  let previous = -1;
  for (let i = 0; i <= 64; i++) {
    const value = sampleCurve(s, i / 64);
    assert.ok(value >= previous - 1e-9 && value >= 0 && value <= 1, `monotone, in range at ${i / 64}`);
    previous = value;
  }
  const lift = parseCurvePoints('0,0.08;0.5,0.55;1,1')!;
  assert.ok(Math.abs(sampleCurve(lift, 0) - 0.08) < 1e-9, 'lifted black point');
});

test('curves effect renders one feComponentTransfer tone table chain; identity curves render nothing', () => {
  assert.ok(VISUAL_EFFECT_TYPES.has('curves') && VISUAL_EFFECT_TYPES.has('border'));
  assert.equal(curvesFilterUrl({ id: 'x', type: 'curves', params: { master: '0,0;1,1' }, enabled: true }), undefined);
  const url = curvesFilterUrl({ id: 'x', type: 'curves', params: { master: '0,0;0.25,0.18;0.75,0.82;1,1', r: '0,0;1,0.9' }, enabled: true })!;
  assert.ok(url.startsWith('url("data:image/svg+xml;utf8,') && url.endsWith('#c")'), url.slice(0, 60));
  const decoded = decodeURIComponent(url.slice('url("'.length, -2));
  assert.ok(decoded.includes("<feComponentTransfer><feFuncR type='table'"), 'component transfer tables');
  const tables = [...decoded.matchAll(/tableValues='([^']+)'/g)].map((m) => m[1]!.split(' ').map(Number));
  assert.equal(tables.length, 3);
  for (const table of tables) assert.equal(table.length, 33, '33-entry tables');
  assert.ok(tables[0]![32]! < tables[1]![32]!, 'the R curve caps red (0.9) after the master curve while G stays at 1');

  const doc = parse(BASE_PROJECT);
  const result = applyEditOperations(doc.document.project, [
    { op: 'effect.add', clipId: 'c', effect: { id: 'fx-curves', type: 'curves', params: { master: '0,0;0.25,0.18;0.75,0.82;1,1' }, enabled: true } },
    { op: 'effect.add', clipId: 'c', effect: { id: 'fx-border', type: 'border', params: { width: 6, color: '#ffffff' }, enabled: true } },
  ] as never[]);
  const validation = validateDocument(doc.document);
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));
  const layer = evaluateFrame(result.project, { num: 1, den: 2 }).clips.find((clip) => clip.clipId === 'c')!;
  assert.ok(layer.style.filter.includes('%3CfeComponentTransfer'), layer.style.filter.slice(0, 80));
  assert.equal(layer.style.css?.['border'], '6px solid #ffffff', 'border effect rides the layer css');
});

test('Studio ships round-14 surfaces: curves editor, border, marker snapping, crop ratio presets', () => {
  for (const marker of [
    'renderCurvesSection',
    'CURVE_PRESETS',
    'Curves (曲线)',
    'sampleCurveClient',
    "'border'",
    'Border (边框)',
    'timelineMarkers().forEach(function(marker){ edges.push(marker.time); });',
    'Centred crop to ',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-14 marker: ${marker}`);
  }
});
