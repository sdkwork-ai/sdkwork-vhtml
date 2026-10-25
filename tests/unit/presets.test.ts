import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { DELIVERY_PRESETS, getDeliveryPreset, outputForDelivery } from '@sdkwork/vhtml-core/presets';

const SOURCE = `<project id="preset-test" version="1.1"><settings><composition width="1920" height="1080" frame-rate="30/1" duration="5s" /></settings>
<scenes><scene id="s"><div>Hi</div></scene></scenes>
<timelines><timeline id="main" duration="5s"><lane id="v" type="video"><clip id="c" ref="scene:s" start="0s" duration="5s" /></lane></timeline></timelines>
<outputs><output id="vertical" format="mp4" width="1080" height="1920" frame-rate="30/1" fit="cover" video-bitrate="10M" /></outputs>
</project>`;

test('delivery presets are unique, even-sized and reference real formats', () => {
  const ids = new Set<string>();
  for (const preset of DELIVERY_PRESETS) {
    assert.equal(ids.has(preset.id), false, `duplicate preset ${preset.id}`);
    ids.add(preset.id);
    assert.equal(preset.width % 2, 0, `${preset.id} width must be even for yuv420p`);
    assert.equal(preset.height % 2, 0, `${preset.id} height must be even for yuv420p`);
    assert.match(preset.aspectRatio, /^\d+(?:\.\d+)?:\d+$/);
    assert.ok(preset.safeArea.left >= 0 && preset.safeArea.top >= 0);
  }
  assert.ok(ids.has('tiktok'));
  assert.ok(ids.has('cinema-4k'));
  assert.equal(getDeliveryPreset('missing'), undefined);
});

test('outputForDelivery derives dimensions, fit, bitrate and metadata', () => {
  const parsed = parseVhtml(SOURCE, { file: 'D:/tmp/preset.vhtml' });
  assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  const output = outputForDelivery(parsed.document.project, 'tiktok');
  assert.equal(output.id, 'tiktok');
  assert.equal(output.format, 'mp4');
  assert.equal(output.width, 1080);
  assert.equal(output.height, 1920);
  assert.equal(output.fit, 'cover');
  assert.equal(output.videoBitrate, '10M');
  assert.equal(output.metadata?.deliveryPreset, 'tiktok');
  assert.equal(output.metadata?.aspectRatio, '9:16');
  assert.equal(output.path, undefined);
  const validation = validateDocument({ specVersion: '1.1', project: parsed.document.project }, { root: 'D:/tmp', checkFiles: false });
  assert.equal(validation.errors.length, 0);
});

test('output fit round-trips through parser and serializer', () => {
  const parsed = parseVhtml(SOURCE, { file: 'D:/tmp/preset.vhtml' });
  assert.equal(parsed.document.project.outputs[0]!.fit, 'cover');
  const text = serializeDocument(parsed.document);
  assert.match(text, /<output[^>]*\bfit="cover"/);
  const reparsed = parseVhtml(text, { file: 'D:/tmp/preset-roundtrip.vhtml' });
  assert.equal(reparsed.document.project.outputs[0]!.fit, 'cover');
});
