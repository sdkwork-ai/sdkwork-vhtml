import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { evaluateFrame, adjustFilterUrl, adjustToneCurve, adjustValues, type AdjustValues } from '@sdkwork/vhtml-runtime/evaluate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';
import { VISUAL_EFFECT_TYPES, ADJUST_PARAMS } from '@sdkwork/vhtml-core/model';

function parse(source: string) {
  return parseVhtml(source, { file: 'round17.vhtml', root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round17" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

function projectWithAdjust(params: Record<string, number>) {
  const doc = parse(BASE_PROJECT);
  const result = applyEditOperations(doc.document.project, [{
    op: 'effect.add',
    clipId: 'c',
    effect: { id: 'fx-adjust', type: 'adjust', params, enabled: true },
  } as never]);
  return { doc, result };
}

function layerOf(frame: ReturnType<typeof evaluateFrame>) {
  return frame.clips.find((candidate) => candidate.clipId === 'c');
}

test('adjust effect validates and renders as CSS multipliers plus an SVG filter chain', () => {
  const { doc, result } = projectWithAdjust({ brightness: 50, contrast: -20, saturation: 100, temperature: 40, tint: -30, sharpen: 50, highlights: 25, shadows: -25, fade: 30 });
  const validation = validateDocument(doc.document);
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));
  const frame = evaluateFrame(result.project, { num: 1, den: 2 });
  const layer = layerOf(frame);
  assert.ok(layer);
  assert.ok(layer!.style.filter.includes('brightness(1.25)'), `brightness ±50% mapping (${layer!.style.filter})`);
  assert.ok(layer!.style.filter.includes('contrast(0.9)'), `contrast ±50% mapping (${layer!.style.filter})`);
  assert.ok(layer!.style.filter.includes('saturate(2)'), `saturation 0..2 mapping (${layer!.style.filter})`);
  const dataUri = /url\("data:image\/svg\+xml[^"]+"/.exec(layer!.style.filter)?.[0];
  assert.ok(dataUri, 'adjust renders an SVG data-URI filter');
  assert.ok(dataUri!.includes('feColorMatrix'), 'temperature/tint ride feColorMatrix');
  assert.ok(dataUri!.includes('feComponentTransfer'), 'highlights/shadows/fade ride the tone table');
  assert.ok(dataUri!.includes('feConvolveMatrix'), 'sharpen rides feConvolveMatrix');
  assert.ok(dataUri!.includes('sRGB'), 'the chain declares sRGB interpolation');
});

test('one-sided adjust params render overlays; all-zero adjust leaves no filter residue', () => {
  const vignette = projectWithAdjust({ vignette: 40, grain: 50 });
  const vLayer = layerOf(evaluateFrame(vignette.result.project, { num: 1, den: 2 }))!;
  assert.equal(vLayer.style.overlays.length, 2, 'vignette + grain render as overlays');
  assert.ok(vLayer.style.overlays[0]!.background.startsWith('radial-gradient'));
  assert.equal(vLayer.style.overlays[1]!.blendMode, 'overlay');

  const neutral = projectWithAdjust({ brightness: 0, contrast: 0, sharpen: 0 });
  const nLayer = layerOf(evaluateFrame(neutral.result.project, { num: 1, den: 2 }))!;
  assert.equal(nLayer.style.filter, 'none', 'a fully neutral adjust filter is dropped');
  assert.equal(nLayer.style.overlays.length, 0, 'a fully neutral adjust leaves no overlays');
});

test('tone curve is monotonic per contribution and fade lifts the black point', () => {
  const neutral = adjustToneCurve(0.5, 0, 0, 0);
  assert.equal(neutral, 0.5);
  // Shadows lift the low end more than the high end; highlights the reverse.
  const shadows = adjustToneCurve(0.25, 0, 1, 0) - 0.25;
  const shadowsHigh = adjustToneCurve(0.75, 0, 1, 0) - 0.75;
  assert.ok(shadows > shadowsHigh, `shadows act on shadows (${shadows.toFixed(3)} vs ${shadowsHigh.toFixed(3)})`);
  const highlights = adjustToneCurve(0.75, 1, 0, 0) - 0.75;
  const highlightsLow = adjustToneCurve(0.25, 1, 0, 0) - 0.25;
  assert.ok(highlights > highlightsLow, `highlights act on highlights (${highlights.toFixed(3)} vs ${highlightsLow.toFixed(3)})`);
  // Fade at 1 maps 0 → ~0.25 (matte black point).
  const lifted = adjustToneCurve(0, 0, 0, 1);
  assert.ok(lifted > 0.24 && lifted < 0.26, `fade lifts blacks (${lifted.toFixed(3)})`);
  for (let x = 0; x <= 1; x += 0.125) {
    const value = adjustToneCurve(x, 0.8, -0.8, 0.4);
    assert.ok(value >= 0 && value <= 1, `tone curve stays in range at x=${x}`);
  }
});

test('adjustFilterUrl stays CSS-string-safe and drops when nothing is set', () => {
  assert.equal(adjustFilterUrl({
    brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
    sharpen: 0, highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0,
  }), undefined);
  const url = adjustFilterUrl({ ...zeroAdjust(), temperature: 1, sharpen: 1 });
  assert.ok(url!.startsWith('url("data:image/svg+xml;utf8,') && url!.endsWith('#a")'), url!);
  assert.ok(!url!.includes('<'), 'angle brackets are percent-encoded inside the data URI');
  assert.ok(!url!.includes(' '), 'spaces are percent-encoded inside the data URI');
});

function zeroAdjust(): AdjustValues {
  return {
    brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
    sharpen: 0, highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0,
  };
}

test('ADJUST_PARAMS is the single 11-slider vocabulary, aligned with the runtime', () => {
  assert.equal(ADJUST_PARAMS.length, 11);
  const runtimeParams = Object.keys(adjustValues({ id: 'x', type: 'adjust', params: {}, enabled: true }));
  assert.deepEqual(runtimeParams.sort(), [...ADJUST_PARAMS].sort());
  assert.ok(VISUAL_EFFECT_TYPES.has('adjust'));
});

test('Studio ships round-9 surfaces: adjust panel, text style, beats, keyframe paste', () => {
  for (const marker of [
    'Adjust · colour & tone (调节)',
    "type: 'adjust'",
    'ADJUST_LOOKS',
    'Text style (文本样式)',
    'TEXT_PRESETS',
    '-webkit-text-stroke',
    'Auto beat (自动踩点)',
    '/api/media/beats',
    'Paste keyframes',
    'previewClip',
    'colorParamControl',
    'EyeDropper',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-9 marker: ${marker}`);
  }
});
