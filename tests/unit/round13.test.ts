import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { AUDIO_EFFECT_TYPES, VISUAL_EFFECT_TYPES } from '@sdkwork/vhtml-core/model';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string) {
  return parseVhtml(source, { file: 'round13.vhtml', root: process.cwd() });
}

const MASK_POINTS = 'evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 20% 10%, 80% 10%, 80% 90%, 20% 90%';

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round13" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('built-in audio effect canon includes normalize and denoise', () => {
  assert.ok(AUDIO_EFFECT_TYPES.has('normalize'));
  assert.ok(AUDIO_EFFECT_TYPES.has('denoise'));
  // The visual canon is untouched by the audio additions.
  assert.ok(VISUAL_EFFECT_TYPES.has('mask'));
});

test('shape mask effect round-trips through parser/serializer and validates clean', () => {
  const doc = parse(BASE_PROJECT.replace(
    '<clip id="c" ref="scene:card" start="0s" duration="1s"></clip>',
    `<clip id="c" ref="scene:card" start="0s" duration="1s"><effect id="m1" type="mask" shape="rect" size="60" cx="50" cy="50" angle="0" points="${MASK_POINTS}"></effect></clip>`,
  ));
  assert.equal(doc.diagnostics.filter((d) => d.severity === 'error').length, 0, doc.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const clip = doc.document.project.timelines[0]!.tracks[0]!.clips[0]!;
  const mask = clip.effects.find((effect) => effect.type === 'mask');
  assert.ok(mask, 'mask effect parsed');
  assert.equal(mask!.params.points, MASK_POINTS);
  assert.equal(mask!.params.shape, 'rect');

  const validation = validateDocument(doc.document);
  assert.equal(validation.warnings.filter((issue) => issue.code === 'RENDER_UNSUPPORTED_FEATURE').length, 0,
    'polygon mask is a built-in visual effect');

  const reparsed = parse(serializeDocument(doc.document));
  const maskAgain = reparsed.document.project.timelines[0]!.tracks[0]!.clips[0]!.effects.find((effect) => effect.type === 'mask');
  assert.equal(maskAgain!.params.points, MASK_POINTS, 'points survive a serialize/parse cycle');
});

test('per-clip normalize and denoise audio effects validate as built-ins', () => {
  const doc = parse(BASE_PROJECT.replace(
    '<clip id="c" ref="scene:card" start="0s" duration="1s"></clip>',
    '<clip id="c" ref="scene:card" start="0s" duration="1s">' +
      '<audio-effect id="nz" type="normalize" lufs="-16"></audio-effect>' +
      '<audio-effect id="dn" type="denoise" strength="12" floor="-25"></audio-effect>' +
    '</clip>',
  ));
  assert.equal(doc.diagnostics.filter((d) => d.severity === 'error').length, 0, doc.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const validation = validateDocument(doc.document);
  const unknown = validation.warnings.filter((issue) => issue.message.includes('unknown audio effect'));
  assert.equal(unknown.length, 0, 'normalize/denoise are known built-ins');
});

test('unknown audio effect types still warn (whitelist stays authoritative)', () => {
  const doc = parse(BASE_PROJECT.replace(
    '<clip id="c" ref="scene:card" start="0s" duration="1s"></clip>',
    '<clip id="c" ref="scene:card" start="0s" duration="1s"><audio-effect id="x" type="teleport"></audio-effect></clip>',
  ));
  const validation = validateDocument(doc.document);
  assert.ok(validation.warnings.some((issue) => issue.message.includes('unknown audio effect "teleport"')));
});

test('edit operations can attach normalize/denoise to a clip (studio parity)', () => {
  const doc = parse(BASE_PROJECT);
  const next = applyEditOperations(doc.document.project, [
    { op: 'effect.add', clipId: 'c', audio: true, effect: { id: 'fx-1', type: 'denoise', params: { strength: 14, floor: -30 }, enabled: true } },
    { op: 'effect.add', clipId: 'c', audio: true, effect: { id: 'fx-2', type: 'normalize', params: { lufs: -14 }, enabled: true } },
  ]);
  const clip = next.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.deepEqual(clip.audioEffects.map((effect) => effect.type).sort(), ['denoise', 'normalize']);
});

test('Studio surface ships the round-5 editing tools', () => {
  // Mask studio: shape presets, geometry fields, invert, context entry.
  for (const marker of ['Mask · shape & region (蒙版)', 'Linear wipe', 'Mirror half', 'Invert mask (reveal outside)', 'Add mask (circle)', 'computeMaskPoints']) {
    assert.ok(STUDIO_HTML.includes(marker), `mask studio marker: ${marker}`);
  }
  // Layout presets (PiP / splits / grid).
  for (const marker of ['Picture-in-picture · bottom-right', 'Split left/right', 'Grid 2×2', 'applyLayoutPreset']) {
    assert.ok(STUDIO_HTML.includes(marker), `layout preset marker: ${marker}`);
  }
  // Camera moves (Ken Burns).
  for (const marker of ['Camera move · Ken Burns (运镜)', 'addKenBurns']) {
    assert.ok(STUDIO_HTML.includes(marker), `camera move marker: ${marker}`);
  }
  // Per-clip loudness normalize + denoise catalog entries.
  for (const marker of ['Loudness normalize (统一响度)', 'Denoise (智能降噪)']) {
    assert.ok(STUDIO_HTML.includes(marker), `audio catalog marker: ${marker}`);
  }
});
