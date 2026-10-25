import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument, serializeProject } from '@sdkwork/vhtml-core/serialize';
import { generationKindToAssetKind, type GenerationTask } from '@sdkwork/vhtml-core/model';
import { materializeGenerations, orderGenerationTasks, providerCatalog, resolvedGenerationInputs } from '@sdkwork/vhtml-generation';
import { loadSchema } from '@sdkwork/vhtml-schema';
import { Ajv2020 } from 'ajv/dist/2020.js';

function task(id: string, kind: GenerationTask['kind'], inputs: GenerationTask['inputs'] = []): GenerationTask {
  return {
    id,
    kind,
    prompt: `prompt ${id}`,
    inputs,
    constraints: {},
    params: {},
    outputs: [],
    status: 'draft',
  };
}

test('generation tasks are ordered topologically and cycles fail', () => {
  const project = {
    id: 'gen-order',
    version: '1.1',
    composition: { width: 640, height: 360, frameRate: { num: 30, den: 1 }, duration: { num: 5, den: 1 }, sampleRate: 48000, channels: 2, background: '#000', colorSpace: 'srgb' as const, seed: 1, deviceScaleFactor: 1 },
    assets: [], scenes: [], timelines: [], generations: [
      task('shot-video', 'video', [{ ref: 'gen:first-frame', role: 'first-frame' }]),
      task('first-frame', 'image'),
      task('voice', 'speech', [{ ref: 'gen:translated', role: 'script' }]),
      task('translated', 'translation'),
    ], outputs: [], styles: [], animations: [], metadata: {}, mainTimeline: 'main',
  };
  const ordered = orderGenerationTasks(project, ['shot-video', 'voice']).map((item) => item.id);
  assert.deepEqual(ordered, ['first-frame', 'shot-video', 'translated', 'voice']);

  const cyclic = {
    ...project,
    generations: [
      task('a', 'video', [{ ref: 'gen:b', role: 'reference-video' }]),
      task('b', 'image', [{ ref: 'gen:a', role: 'reference-image' }]),
    ],
  };
  assert.throws(() => orderGenerationTasks(cyclic), /cycle/i);
});

test('providers declare modern AI capabilities', () => {
  const providers = providerCatalog();
  assert.ok(providers.some((provider) => provider.id === 'http'));
  const http = providers.find((provider) => provider.id === 'http')!;
  for (const kind of ['image', 'video', 'speech', 'music', 'sfx', 'avatar', 'lipsync', 'dub', 'matte', 'translation', 'storyboard']) {
    assert.ok(http.kinds.includes(kind as never), `http provider should declare ${kind}`);
  }
  assert.equal(generationKindToAssetKind('sfx'), 'audio');
  assert.equal(generationKindToAssetKind('avatar'), 'video');
  assert.equal(generationKindToAssetKind('matte'), 'image');
  assert.equal(generationKindToAssetKind('translation'), 'data');
});

test('generation direction, review, rights and safety round-trip', () => {  const source = `<project id="gen-rich" version="1.1"><settings><composition width="640" height="360" frame-rate="30/1" duration="5s" /></settings>
  <generations>
    <generate id="voice" kind="speech" provider="http" model="tts-1">
      <prompt>A warm narration</prompt>
      <direction>{"speech":{"language":"en","voice":"narrator","emotion":"warm","pace":"measured","consent":"voice-doc-1"}}</direction>
      <review status="approved" reviewer="editor">Ready</review>
      <rights license="CC-BY" consent="voice-doc-1" likeness="synthetic" voice-cloning="consented" commercial-use="true" ai-disclosure="true"></rights>
      <safety rating="general" moderated="true">Clean</safety>
    </generate>
    <generate id="shot" kind="video" model="video-1">
      <prompt>A slow push in</prompt>
      <direction>{"shot":{"framing":"medium","camera":"slow push in","lighting":"neon"},"video":{"firstFrame":"gen:cover","loop":true}}</direction>
      <gen-input ref="gen:cover" role="first-frame"></gen-input>
    </generate>
  </generations>
  <scenes><scene id="s"><div>ok</div></scene></scenes>
  <timelines><timeline id="main" duration="5s"><lane id="v" type="video"></lane></timeline></timelines>
  </project>`;
  const parsed = parseVhtml(source, { file: 'D:/tmp/gen.vhtml' });
  assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  const voice = parsed.document.project.generations[0]!;
  assert.equal(voice.review?.status, 'approved');
  assert.equal(voice.rights?.voiceCloning, 'consented');
  assert.equal(voice.safety?.moderated, true);
  assert.equal((voice.direction?.speech as Record<string, unknown>).emotion, 'warm');
  const shot = parsed.document.project.generations[1]!;
  assert.equal((shot.direction?.shot as Record<string, unknown>).camera, 'slow push in');

  const serialized = serializeDocument(parsed.document);
  assert.match(serialized, /<direction>/);
  assert.match(serialized, /<review[^>]*status="approved"/);
  assert.match(serialized, /<rights[^>]*voice-cloning="consented"/);
  const reparsed = parseVhtml(serialized, { file: 'D:/tmp/gen-roundtrip.vhtml' });
  assert.equal(reparsed.document.project.generations[0]!.review?.status, 'approved');
  assert.equal((reparsed.document.project.generations[1]!.direction?.video as Record<string, unknown>).loop, true);
});

test('remote provider inputs resolve assets to portable descriptors', () => {
  const source = `<project id="input-resolve" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <assets><asset id="portrait" type="image" src="assets/portrait.png" /></assets>
  <generations><generate id="avatar" kind="avatar"><prompt>speak</prompt><gen-input ref="portrait" role="portrait"></gen-input></generate></generations>
  <scenes><scene id="s"><div>ok</div></scene></scenes>
  <timelines><timeline id="main" duration="1s"><lane id="v" type="video"></lane></timeline></timelines></project>`;
  const parsed = parseVhtml(source, { file: 'D:/tmp/input.vhtml' });
  const project = parsed.document.project;
  project.assets[0]!.hash = 'sha256:portrait';
  const descriptors = resolvedGenerationInputs(project, project.generations[0]!);
  assert.equal(descriptors[0]!.kind, 'asset');
  assert.equal(descriptors[0]!.assetId, 'portrait');
  assert.equal(descriptors[0]!.src, 'assets/portrait.png');
  assert.equal(descriptors[0]!.hash, 'sha256:portrait');
});

test('provider request/response schemas validate AI generation payloads', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const request = ajv.compile(loadSchema('provider-request'));
  assert.equal(request({
    schema: 'vhtml.generation/1.1',
    taskId: 'hero',
    kind: 'video',
    prompt: 'slow push in',
    constraints: { duration: { num: 5, den: 1 }, width: 1080, height: 1920 },
    params: { quality: 'high' },
    direction: { shot: { camera: 'slow push in' }, video: { loop: false } },
    inputs: [{ ref: 'gen:cover', role: 'first-frame', kind: 'asset', assetId: 'cover', src: 'generated/cover.svg', mimeType: 'image/svg+xml', hash: 'sha256:cover' }],
    rights: { commercialUse: true },
    seed: 42,
  }), true, JSON.stringify(request.errors));
  assert.equal(request({ taskId: 'hero', kind: 'unknown', prompt: 'x', constraints: {}, params: {}, inputs: [], seed: 1 }), false);

  const response = ajv.compile(loadSchema('provider-response'));
  assert.equal(response({ outputs: [{ url: 'https://example.com/hero.mp4', kind: 'video', width: 1080, height: 1920 }] }), true);
  assert.equal(response({ jobId: 'job-1', statusUrl: 'https://example.com/jobs/1' }), true);
  assert.equal(response({ error: 'missing output' }), false);
});

test('manifest provider registers multiple outputs for stems and variants', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-gen-multi-'));
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
      'base64',
    );
    fs.writeFileSync(path.join(root, 'left.png'), png);
    fs.writeFileSync(path.join(root, 'right.png'), png);
    const manifest = path.join(root, 'manifest.json');
    fs.writeFileSync(manifest, JSON.stringify({ pair: ['left.png', { file: 'right.png', role: 'right' }] }));
    const project = {
      id: 'gen-multi', version: '1.1',
      composition: { width: 640, height: 360, frameRate: { num: 30, den: 1 }, duration: { num: 5, den: 1 }, sampleRate: 48000, channels: 2, background: '#000', colorSpace: 'srgb' as const, seed: 1, deviceScaleFactor: 1 },
      assets: [], scenes: [], timelines: [], outputs: [], styles: [], animations: [], metadata: {}, mainTimeline: 'main',
      generations: [{ ...task('pair', 'image'), provider: 'manifest', params: { manifest } }],
    };
    const result = await materializeGenerations({
      project,
      root,
      cachePath: path.join(root, 'cache.json'),
      generatedDir: 'generated',
    });
    assert.deepEqual(result.ran, ['pair']);
    assert.ok(result.project.assets.some((asset) => asset.id === 'gen:pair'));
    assert.ok(result.project.assets.some((asset) => asset.id === 'gen:pair:1'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('materialising a task runs its generation dependencies first', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-gen-chain-'));
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
      'base64',
    );
    fs.writeFileSync(path.join(root, 'a.png'), png);
    fs.writeFileSync(path.join(root, 'b.png'), png);
    const manifest = path.join(root, 'manifest.json');
    fs.writeFileSync(manifest, JSON.stringify({ a: 'a.png', b: 'b.png' }));
    const project = {
      id: 'gen-chain', version: '1.1',
      composition: { width: 640, height: 360, frameRate: { num: 30, den: 1 }, duration: { num: 5, den: 1 }, sampleRate: 48000, channels: 2, background: '#000', colorSpace: 'srgb' as const, seed: 1, deviceScaleFactor: 1 },
      assets: [], scenes: [], timelines: [], outputs: [], styles: [], animations: [], metadata: {}, mainTimeline: 'main',
      generations: [
        { ...task('b', 'image', [{ ref: 'gen:a', role: 'reference-image' }]), provider: 'manifest', params: { manifest } },
        { ...task('a', 'image'), provider: 'manifest', params: { manifest } },
      ],
    };
    const result = await materializeGenerations({
      project,
      root,
      taskIds: ['b'],
      cachePath: path.join(root, 'cache.json'),
      generatedDir: 'generated',
    });
    assert.deepEqual(result.ran, ['a', 'b']);
    assert.ok(result.project.assets.some((asset) => asset.id === 'gen:a'));
    assert.ok(result.project.assets.some((asset) => asset.id === 'gen:b'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('vendor catalog covers the major video vendors with parameter mappings', async () => {
  const { VENDOR_CATALOG, findVendorProfile, splitNamespacedParam } = await import('@sdkwork/vhtml-generation/vendors');
  const ids = VENDOR_CATALOG.map((vendor) => vendor.id);
  assert.equal(new Set(ids).size, ids.length, 'vendor ids unique');
  for (const id of ['runway', 'luma', 'kling', 'pika', 'hailuo', 'veo', 'sora', 'wan', 'vidu', 'pixverse', 'seedance']) {
    assert.ok(ids.includes(id), `catalog includes ${id}`);
  }
  for (const vendor of VENDOR_CATALOG) {
    assert.ok(vendor.docs.startsWith('https://'), `${vendor.id} docs url`);
    assert.ok(vendor.kinds.length > 0, `${vendor.id} kinds`);
    assert.ok(vendor.mapping.length > 0, `${vendor.id} mappings`);
    for (const mapping of vendor.mapping) {
      assert.ok(mapping.vendor.length > 0 && mapping.vhtml.length > 0, `${vendor.id} mapping rows`);
    }
  }
  assert.equal(findVendorProfile('KLING')?.id, 'kling');
  assert.deepEqual(splitNamespacedParam('runway.watermark'), { vendor: 'runway', param: 'watermark' });
  assert.deepEqual(splitNamespacedParam('plainParam'), { param: 'plainParam' });
});

test('cross-vendor direction fields parse, serialize and round-trip', () => {
  const source = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="vendor-fields" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
  <generations>
    <generate id="hero" kind="video" provider="veo">
      <prompt>slow push in on the stage</prompt>
      <constraints resolution="1080p" duration="8s" aspect-ratio="16:9" seed="7" steps="40" guidance="3.5"></constraints>
      <direction>{"video":{"cameraMove":"push-in","motionStrength":0.6,"withAudio":true,"loop":false},"music":{"lyrics":"Verses about light","instrumental":false},"speech":{"rate":1.1},"edit":{"operation":"extend"}}</direction>
    </generate>
  </generations>
</project></vhtml></body></html>`;
  const parsed = parseVhtml(source, { file: 'vendors.vhtml', root: process.cwd() });
  const parseErrors = parsed.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(parseErrors.length, 0, parseErrors.map((d) => d.message).join('\n'));
  const task = parsed.document.project.generations[0]!;
  assert.equal(task.constraints.resolution, '1080p');
  assert.equal(task.direction?.video?.cameraMove, 'push-in');
  assert.equal(task.direction?.video?.motionStrength, 0.6);
  assert.equal(task.direction?.video?.withAudio, true);
  assert.equal(task.direction?.music?.lyrics, 'Verses about light');
  assert.equal(task.direction?.music?.instrumental, false);
  assert.equal(task.direction?.speech?.rate, 1.1);
  assert.equal(task.direction?.edit?.operation, 'extend');
  assert.equal(task.constraints.steps, 40);
  assert.equal(task.constraints.guidance, 3.5);
  const serialized = serializeProject(parsed.document.project);
  // Direction JSON is emitted HTML-escaped inside <direction>…</direction>.
  assert.ok(serialized.includes('&quot;cameraMove&quot;:&quot;push-in&quot;'));
  assert.ok(serialized.includes('resolution="1080p"'));
  const reparsed = parseVhtml(serialized, { file: 'round.vhtml', root: process.cwd() });
  assert.deepEqual(
    reparsed.document.project.generations[0]!.direction?.video,
    task.direction?.video,
  );
});
