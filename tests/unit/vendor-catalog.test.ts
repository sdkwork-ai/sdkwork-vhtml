import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import {
  VENDOR_CATALOG,
  buildVendorPayload,
  vendorParams,
} from '@sdkwork/vhtml-generation/vendors';

function parseDocument(source: string) {
  const parsed = parseVhtml(source, { file: 'vendor.vhtml', root: process.cwd() });
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 0, errors.map((d) => d.message).join('\n'));
  return parsed.document;
}

test('catalog expanded to image, music and speech vendors across modalities', () => {
  const byId = new Map(VENDOR_CATALOG.map((vendor) => [vendor.id, vendor]));
  for (const id of ['stability-svd', 'hunyuan', 'firefly', 'flux', 'stability-image', 'openai-image', 'midjourney', 'ideogram', 'qwen-image', 'suno', 'stable-audio', 'musicgen', 'openai-tts', 'azure-tts']) {
    assert.ok(byId.has(id), `catalog includes ${id}`);
  }
  assert.ok(VENDOR_CATALOG.filter((vendor) => vendor.kinds.includes('image')).length >= 6, 'image vendors');
  assert.ok(VENDOR_CATALOG.filter((vendor) => vendor.kinds.includes('music')).length >= 3, 'music vendors');
  assert.ok(VENDOR_CATALOG.filter((vendor) => vendor.kinds.includes('video')).length >= 12, 'video vendors');
});

const MULTI_VENDOR_DOCUMENT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="multi-vendor" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
  <generations>
    <generate id="hero" kind="video" provider="kling" model="kling-v2">
      <prompt>slow push in</prompt>
      <constraints resolution="1080p" duration="5s" aspect-ratio="16:9" seed="7"></constraints>
      <direction>{"video":{"cameraMove":"push-in","motionStrength":0.5,"withAudio":false}}</direction>
      <params kling.mode="pro" kling.cfgScale="0.7" veo.personGeneration="allow_all" watermark="false"></params>
      <gen-input ref="gen:cover" role="first-frame"></gen-input>
    </generate>
  </generations>
</project></vhtml></body></html>`;

test('vendorParams extracts only the addressed vendor namespace', () => {
  const document = parseDocument(MULTI_VENDOR_DOCUMENT);
  const task = document.project.generations[0]!;
  // HTML attribute names are case-insensitive, so namespace keys are stored
  // lowercased; numeric attribute values are converted to numbers.
  assert.deepEqual(vendorParams(task, 'kling'), { mode: 'pro', cfgscale: 0.7 });
  assert.deepEqual(vendorParams(task, 'veo'), { persongeneration: 'allow_all' });
  assert.deepEqual(vendorParams(task, 'runway'), {});
});

test('buildVendorPayload flattens constraints, isolates namespace params and describes inputs', () => {
  const document = parseDocument(MULTI_VENDOR_DOCUMENT);
  const task = document.project.generations[0]!;
  const payload = buildVendorPayload(task, document.project, {
    resolveSrc: () => ({ src: 'generated/cover.png', mimeType: 'image/png' }),
  });
  assert.equal(payload.schema, 'vhtml.generation/1.1');
  assert.equal(payload.kind, 'video');
  assert.equal(payload.model, 'kling-v2');
  const constraints = payload.constraints as Record<string, unknown>;
  assert.equal(constraints.resolution, '1080p');
  assert.equal(constraints.durationSeconds, 5);
  assert.equal(constraints.seed, 7);
  assert.deepEqual(payload.params, { mode: 'pro', cfgscale: 0.7 });
  const inputs = payload.inputs as Array<{ role: string; src?: string }>;
  assert.equal(inputs[0]!.role, 'first-frame');
  assert.equal(inputs[0]!.src, 'generated/cover.png');
  // Other vendors' namespaced params never leak into the envelope.
  assert.ok(!JSON.stringify(payload).includes('personGeneration'));
});

test('direction vocabularies produce soft warnings outside recommended values', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="vocab" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
  <generations>
    <generate id="a" kind="video">
      <prompt>x</prompt>
      <direction>{"video":{"cameraMove":"dolly-zoom","motionStrength":1.5},"music":{"instrumental":true,"vocals":"female"}}</direction>
    </generate>
  </generations>
</project></vhtml></body></html>`);
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  const warnings = validation.warnings.map((warning) => warning.message);
  assert.ok(warnings.some((message) => message.includes('cameraMove')), 'cameraMove vocabulary warning');
  assert.ok(warnings.some((message) => message.includes('motionStrength')), 'motionStrength range warning');
  assert.ok(warnings.some((message) => message.includes('instrumental')), 'instrumental conflict warning');
  // In-vocabulary values produce no warnings.
  const ok = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="vocab-ok" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
  <generations>
    <generate id="b" kind="video">
      <prompt>x</prompt>
      <direction>{"video":{"cameraMove":"orbit","motionStrength":0.3}}</direction>
    </generate>
  </generations>
</project></vhtml></body></html>`);
  const okValidation = validateDocument({ ...ok, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.equal(okValidation.warnings.filter((w) => w.message.includes('cameraMove') || w.message.includes('motionStrength')).length, 0);
});
