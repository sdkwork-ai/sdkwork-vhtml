import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string) {
  return parseVhtml(source, { file: 'round15.vhtml', root: process.cwd() });
}

function projectWithMask(effectXml: string): string {
  return `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round15" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s">${effectXml}</clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;
}

test('mask feather round-trips and renders a gradient mask-image (circle)', () => {
  const doc = parse(projectWithMask('<effect id="m" type="mask" shape="circle" size="60" cx="50" cy="50" angle="0" feather="0.25" points="50% 20%, 79% 35%, 79% 65%, 50% 80%, 21% 65%, 21% 35%"></effect>'));
  assert.equal(doc.diagnostics.filter((d) => d.severity === 'error').length, 0, doc.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const clip = doc.document.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.equal(clip.effects[0]!.params.feather, 0.25);

  const reparsed = parse(serializeDocument(doc.document));
  assert.equal(reparsed.document.project.timelines[0]!.tracks[0]!.clips[0]!.effects[0]!.params.feather, 0.25);

  const frame = evaluateFrame(doc.document.project, { num: 0, den: 1 });
  const layer = frame.clips.find((candidate) => candidate.clipId === 'c');
  assert.ok(layer, 'layer evaluated');
  // Screen-round circle on 16:9: 30% x radius, 30% * 16/9 y radius.
  assert.match(layer!.style.maskImage ?? '', /radial-gradient\(30% 53\.333% at 50% 50%, #000 75%, transparent 100%\)/);
  assert.equal(layer!.style.clipPath ?? 'none', 'none', 'feathered mask leaves clip-path empty');
});

test('feathered rect mask renders two intersecting linear gradients', () => {
  const doc = parse(projectWithMask('<effect id="m" type="mask" shape="rect" size="60" cx="50" cy="50" angle="0" feather="0.2"></effect>'));
  const frame = evaluateFrame(doc.document.project, { num: 0, den: 1 });
  const layer = frame.clips.find((candidate) => candidate.clipId === 'c')!;
  assert.ok(layer.style.maskImage?.includes('linear-gradient(90deg'), 'horizontal ramp');
  assert.ok(layer.style.maskImage?.includes('linear-gradient(180deg'), 'vertical ramp');
  assert.equal(layer.style.maskComposite, 'intersect');
});

test('rotated ellipse and polygon-only shapes keep the hard clip-path', () => {
  const rotated = parse(projectWithMask('<effect id="m" type="mask" shape="ellipse" size="60" cx="50" cy="50" angle="30" feather="0.3"></effect>'));
  const rotatedFrame = evaluateFrame(rotated.document.project, { num: 0, den: 1 });
  assert.equal(rotatedFrame.clips[0]!.style.maskImage ?? '', '', 'rotated ellipse not gradient-feathered');

  const polygon = parse(projectWithMask('<effect id="m" type="mask" shape="star" size="60" cx="50" cy="50" angle="0" feather="0.3" points="50% 20%, 61% 35%, 79% 35%, 65% 50%, 70% 65%, 50% 60%, 30% 65%, 35% 50%, 21% 35%, 39% 35%"></effect>'));
  const polygonFrame = evaluateFrame(polygon.document.project, { num: 0, den: 1 });
  assert.match(polygonFrame.clips[0]!.style.clipPath ?? '', /^polygon\(/, 'star keeps polygon clip-path');
  assert.equal(polygonFrame.clips[0]!.style.maskImage ?? '', '');
});

test('Studio ships round-7 surfaces', () => {
  for (const marker of ['Feather % (羽化)', 'Search assets…', 'No assets match the search.', 'Reset transform', '24000/1001', '60000/1001', 'assetSearch']) {
    assert.ok(STUDIO_HTML.includes(marker), `round-7 marker: ${marker}`);
  }
});
