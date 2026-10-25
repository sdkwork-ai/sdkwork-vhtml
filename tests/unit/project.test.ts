import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { zipSync } from 'fflate';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { collectAssetInventory, importAssetFile, verifyAssetInventory, assetsForStudio } from '@sdkwork/vhtml-project/assets';
import { defaultManifest, ensureProjectLayout, resolveProjectInput } from '@sdkwork/vhtml-project/manifest';
import { packProject, unpackProject } from '@sdkwork/vhtml-project/pack';
import { createEmptyProject } from '@sdkwork/vhtml-core/model';
import { loadSchema } from '@sdkwork/vhtml-schema';

function tempDir(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vhtml-${name}-`));
  return dir;
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

const MINIMAL_PROJECT = `<vhtml version="1.1"><project id="layout-demo" version="1.1" title="Layout demo">
  <settings><composition width="640" height="360" frame-rate="30/1" duration="4s" /></settings>
  <assets></assets>
  <scenes>
    <scene id="hero" src="scenes/hero.html" duration="4s"></scene>
  </scenes>
  <timelines><timeline id="main" duration="4s"><lane id="visual" type="video"><clip id="hero-clip" ref="scene:hero" start="0s" duration="4s" /></lane></timeline></timelines>
  <outputs><output id="mp4" format="mp4" path="renders/out.mp4" /></outputs>
</project></vhtml>`;

test('project manifest discovers entries, sources and standard directories', () => {
  const dir = tempDir('manifest');
  const manifest = defaultManifest('demo');
  write(path.join(dir, 'video.vhtml'), MINIMAL_PROJECT);
  write(path.join(dir, 'video.ts'), 'export default {};');
  ensureProjectLayout(dir, manifest);

  const schema = loadSchema('project');
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateManifest = ajv.compile(schema);
  assert.equal(validateManifest(manifest), true, JSON.stringify(validateManifest.errors));
  assert.equal(validateManifest({ ...manifest, entry: '../escape.vhtml' }), false);

  const resolved = resolveProjectInput(dir);
  assert.equal(resolved.root, dir);
  assert.equal(resolved.entry, path.join(dir, 'video.vhtml'));
  assert.equal(resolved.source, path.join(dir, 'video.ts'));
  assert.equal(resolved.layout.images, 'assets/images');
  assert.equal(resolved.layout.cache, '.vhtml/cache');
  for (const key of ['assets/images', 'assets/video', 'assets/audio', 'assets/fonts', 'scenes', 'generated', 'renders', '.vhtml/cache']) {
    assert.ok(fs.existsSync(path.join(dir, key)), `${key} should exist`);
  }

  const fileResolved = resolveProjectInput(path.join(dir, 'video.vhtml'));
  assert.equal(fileResolved.root, dir);
  assert.equal(fileResolved.entry, path.join(dir, 'video.vhtml'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('external Scene fragments rebase URLs, extract CSS/scripts and preserve src on serialization', () => {
  const dir = tempDir('external-scene');
  write(path.join(dir, 'scenes', 'hero.html'), `<style>.stage { background: url('./bg.png'); } h1 { color: #fff; }</style>
<div class="stage"><img src="./logo.svg" srcset="./logo.svg 1x, ./logo@2x.svg 2x"><h1>External</h1></div>
<link rel="stylesheet" href="./theme.css">
<script src="./hero.js"></script>
<script>window.__external = true;</script>`);
  write(path.join(dir, 'scenes', 'theme.css'), '.stage { background: url("./theme.png"); }');
  for (const file of ['logo.svg', 'logo@2x.svg', 'bg.png', 'theme.png', 'hero.js']) {
    write(path.join(dir, 'scenes', file), file.endsWith('.js') ? 'window.__hero = true;' : '<svg xmlns="http://www.w3.org/2000/svg"/>');
  }
  const parsed = parseVhtml(MINIMAL_PROJECT, { file: path.join(dir, 'video.vhtml'), root: dir });
  assert.equal(parsed.diagnostics.filter((item) => item.severity === 'error').length, 0);
  const scene = parsed.document.project.scenes[0]!;
  assert.equal(scene.src, 'scenes/hero.html');
  assert.match(scene.html, /\/scenes\/logo\.svg/);
  assert.match(scene.html, /\/scenes\/logo@2x\.svg/);
  assert.match(scene.html, /\/scenes\/theme\.css/);
  assert.match(scene.css ?? '', /\/scenes\/bg\.png/);
  assert.ok(scene.scripts?.some((script) => script.includes('/scenes/hero.js')));
  assert.ok(scene.scripts?.some((script) => script.includes('__external')));

  const output = serializeDocument(parsed.document);
  assert.match(output, /<scene[^>]*src="scenes\/hero\.html"/);
  assert.doesNotMatch(output, /logo\.svg/);

  const validation = validateDocument(parsed.document, { root: dir, checkFiles: true });
  assert.equal(validation.ok, true, validation.errors.map((error) => error.message).join('\n'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('encoded nested Scene paths, spaces and percent-encoded assets load correctly', () => {
  const dir = tempDir('encoded-scene');
  write(path.join(dir, 'scenes', 'sub', 'nested scene.html'), `<style>.stage { background: url("../../assets/images/bg%20file.svg"); }</style>
<div class="stage"><img src="../../assets/images/logo%20file.svg" alt="logo"></div>`);
  write(path.join(dir, 'assets', 'images', 'logo file.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  write(path.join(dir, 'assets', 'images', 'bg file.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const source = MINIMAL_PROJECT
    .replace('scenes/hero.html', 'scenes/sub/nested%20scene.html')
    .replace('<assets></assets>', '<assets><asset id="logo" type="image" src="assets/images/logo%20file.svg" /></assets>');
  const parsed = parseVhtml(source, { file: path.join(dir, 'video.vhtml'), root: dir });
  assert.equal(parsed.diagnostics.filter((item) => item.severity === 'error').length, 0);
  const scene = parsed.document.project.scenes[0]!;
  assert.equal(scene.src, 'scenes/sub/nested%20scene.html');
  assert.match(scene.html, /\/assets\/images\/logo%20file\.svg/);
  assert.match(scene.css ?? '', /\/assets\/images\/bg%20file\.svg/);
  const validation = validateDocument(parsed.document, { root: dir, checkFiles: true });
  assert.equal(validation.ok, true, validation.errors.map((error) => error.message).join('\n'));
  const studio = assetsForStudio(parsed.document.project, dir, defaultManifest().paths);
  assert.equal(studio.assets[0]!.exists, true);
  assert.equal(studio.assets[0]!.url, '/assets/images/logo%20file.svg');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('encoded #/? filenames work and remote Scene URLs are rejected', () => {
  const dir = tempDir('hash-scene');
  write(path.join(dir, 'scenes', 'hash#scene.html'), '<div class="stage">hash</div>');
  const source = MINIMAL_PROJECT.replace('scenes/hero.html', 'scenes/hash%23scene.html?version=2#start');
  const parsed = parseVhtml(source, { file: path.join(dir, 'video.vhtml'), root: dir });
  assert.equal(parsed.diagnostics.filter((item) => item.severity === 'error').length, 0);
  assert.equal(parsed.document.project.scenes[0]!.src, 'scenes/hash%23scene.html?version=2#start');
  const validation = validateDocument(parsed.document, { root: dir, checkFiles: true });
  assert.equal(validation.ok, true, validation.errors.map((error) => error.message).join('\n'));

  const remote = parseVhtml(MINIMAL_PROJECT.replace('scenes/hero.html', 'https://example.com/scene.html'), {
    file: path.join(dir, 'remote.vhtml'),
    root: dir,
  });
  assert.ok(remote.diagnostics.some((item) => item.code === 'SECURITY_PATH_ESCAPE'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('assets with percent-encoded paths resolve, exist and produce a single-encoded URL', () => {
  const dir = tempDir('encoded-asset');
  write(path.join(dir, 'assets', 'images', 'logo file.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const project = createEmptyProject('encoded');
  project.assets.push({ id: 'logo', kind: 'svg', src: 'assets/images/logo%20file.svg' });
  const studio = assetsForStudio(project, dir, defaultManifest().paths);
  assert.equal(studio.assets[0]!.exists, true);
  assert.equal(studio.assets[0]!.url, '/assets/images/logo%20file.svg');
  project.assets[0]!.src = 'assets/images/logo%20file.svg?v=2#hero';
  const versioned = assetsForStudio(project, dir, defaultManifest().paths);
  assert.equal(versioned.assets[0]!.exists, true);
  assert.equal(versioned.assets[0]!.url, '/assets/images/logo%20file.svg?v=2#hero');
  const inventory = collectAssetInventory(project, dir, defaultManifest().paths);
  assert.equal(inventory.assets[0]!.exists, true);
});

test('asset inventory reports missing, outside and unused references', () => {
  const dir = tempDir('inventory');
  write(path.join(dir, 'assets', 'used.png'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const project = {
    id: 'inventory', version: '1.1', composition: { width: 640, height: 360, frameRate: { num: 30, den: 1 }, duration: { num: 4, den: 1 }, background: '#000', colorSpace: 'srgb', seed: 1, sampleRate: 48000, channels: 2 } as never,
    assets: [
      { id: 'used', kind: 'image' as const, src: 'assets/used.png' },
      { id: 'unused', kind: 'image' as const, src: 'assets/unused.png' },
    ],
    scenes: [{ id: 's', html: '<img src="assets/missing.png"><img src="../outside.png">' }],
    timelines: [], generations: [], outputs: [], styles: [], animations: [], metadata: {}, mainTimeline: 'main',
  };
  const inventory = collectAssetInventory(project as never, dir, defaultManifest().paths);
  assert.ok(inventory.missing.some((ref) => ref.ref === 'assets/unused.png' && ref.origin === 'asset'));
  assert.ok(inventory.missing.some((ref) => ref.ref === 'assets/missing.png' && ref.origin === 'scene-html'));
  assert.ok(inventory.outsideRoot.some((ref) => ref.ref === '../outside.png'));
  assert.ok(inventory.unused.some((entry) => entry.asset.id === 'unused'));
  assert.equal(inventory.summary.missing, 3);
  const diagnostics = verifyAssetInventory(inventory);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.severity === 'error'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('asset import copies into the layout, probes SVG dimensions and dedupes by hash', async () => {
  const dir = tempDir('import');
  write(path.join(dir, 'video.vhtml'), MINIMAL_PROJECT);
  const project = parseVhtml(MINIMAL_PROJECT, { file: path.join(dir, 'video.vhtml'), root: dir }).document.project;
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60"/></svg>');
  const asset = await importAssetFile({
    project, root: dir, data: svg, filename: 'logo.svg', destination: 'assets/images', id: 'logo',
  });
  assert.equal(asset.id, 'logo');
  assert.equal(asset.kind, 'svg');
  assert.equal(asset.width, 120);
  assert.equal(asset.height, 60);
  assert.equal(asset.src, 'assets/images/logo.svg');
  assert.ok(fs.existsSync(path.join(dir, asset.src)));
  project.assets.push(asset);
  const duplicate = await importAssetFile({ project, root: dir, data: svg, filename: 'again.svg', destination: 'assets/images' });
  assert.equal(duplicate.id, 'logo');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('portable package round-trips manifest, entry, scenes and assets', () => {
  const dir = tempDir('pack');
  write(path.join(dir, 'video.vhtml'), MINIMAL_PROJECT.replace('scenes/hero.html', 'scenes/hero.html'));
  write(path.join(dir, 'scenes', 'hero.html'), '<h1>Packed</h1>');
  write(path.join(dir, 'assets', 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ensureProjectLayout(dir, defaultManifest('pack-demo'));
  write(path.join(dir, '.vhtml', 'cache', 'generated.json'), '{"version":1,"entries":{}}\n');
  const out = path.join(tempDir('pack-out'), 'demo.vhtmlpkg');
  const packed = packProject({ root: dir, entry: path.join(dir, 'video.vhtml'), out });
  assert.ok(fs.existsSync(out));
  assert.ok(packed.files >= 4);

  const destination = path.join(tempDir('unpack'), 'restored');
  const unpacked = unpackProject(out, { outDir: destination });
  assert.equal(unpacked.manifest.entry, 'video.vhtml');
  assert.ok(fs.existsSync(path.join(destination, 'assets', 'images', 'logo.svg')));
  assert.ok(fs.existsSync(path.join(destination, 'scenes', 'hero.html')));
  assert.ok(fs.existsSync(path.join(destination, '.vhtml', 'cache', 'generated.json')));
  assert.equal(resolveProjectInput(destination).entry, path.join(destination, 'video.vhtml'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
});

test('package extraction rejects path traversal entries', () => {
  const dir = tempDir('zip-slip');
  const pkg = path.join(dir, 'evil.vhtmlpkg');
  fs.writeFileSync(pkg, zipSync({ '../escape.txt': new Uint8Array([1, 2, 3]) }));
  assert.throws(
    () => unpackProject(pkg, { outDir: path.join(dir, 'out'), force: true }),
    /unsafe package entry/,
  );
  assert.equal(fs.existsSync(path.join(dir, 'escape.txt')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
