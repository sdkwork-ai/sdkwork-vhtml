import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { DEFAULT_LAYOUT } from '@sdkwork/vhtml-project/manifest';
import { splitInlineScenes } from '@sdkwork/vhtml-project/split';
import { exportProject } from '@sdkwork/vhtml-media/export';
import { probeMedia, ffmpegPath } from '@sdkwork/vhtml-ffmpeg';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';

function toolsAvailable(): boolean {
  try {
    findChromeExecutable();
  } catch {
    return false;
  }
  return spawnSync(ffmpegPath(), ['-hide_banner', '-version']).status === 0;
}

const SOURCE = `<vhtml version="1.1"><project id="split-export" version="1.1" title="Split export">
<settings><composition width="320" height="180" frame-rate="5/1" duration="0.4s" background="#0b1220" /></settings>
<scenes>
  <scene id="hero" duration="0.4s">
    <style>.stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:14px;color:#fff;font:700 24px system-ui}
    .badge{width:64px;height:64px}</style>
    <div class="stage"><img class="badge" src="assets/badge.svg" alt="badge" /><span>Split and render</span></div>
  </scene>
</scenes>
<timelines><timeline id="main" duration="0.4s"><lane id="visual" type="video"><clip id="hero-clip" ref="scene:hero" start="0s" duration="0.4s" /></lane></timeline></timelines>
<outputs><output id="mp4" format="mp4" width="320" height="180" frame-rate="5/1" fit="contain" /></outputs>
</project></vhtml>`;

test('split a project into external Scene files, then export a playable MP4', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-split-export-'));
  try {
    const entry = path.join(root, 'video.vhtml');
    fs.writeFileSync(entry, SOURCE);
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'assets', 'badge.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#6ee7ff"/></svg>',
    );

    const parsed = parseVhtml(SOURCE, { file: entry, root });
    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    const split = splitInlineScenes({ root, entry, document: parsed.document, layout: DEFAULT_LAYOUT });
    assert.equal(split.changed, true);
    assert.equal(split.files.length, 1);
    assert.match(fs.readFileSync(path.join(root, 'scenes', 'hero.html'), 'utf8'), /src="\.\.\/assets\/badge\.svg"/);
    assert.match(fs.readFileSync(entry, 'utf8'), /src="scenes\/hero\.html"/);

    const reparsed = parseVhtml(fs.readFileSync(entry, 'utf8'), { file: entry, root });
    const validation = validateDocument(reparsed.document, { root, checkFiles: true });
    assert.equal(validation.errors.length, 0, validation.errors.map((diagnostic) => diagnostic.message).join('\n'));
    assert.equal(reparsed.document.project.scenes[0]!.src, 'scenes/hero.html');

    const outputPath = path.join(root, 'renders', 'split.mp4');
    const exported = await exportProject({
      project: reparsed.document.project,
      root,
      output: reparsed.document.project.outputs[0]!,
      outputPath,
      rangeStart: { num: 0, den: 1 },
      rangeDuration: { num: 4, den: 10 },
      frameRate: { num: 5, den: 1 },
      preset: 'ultrafast',
      crf: 30,
      timeoutMs: 60_000,
    });
    assert.equal(exported.frames, 2);
    assert.ok(fs.existsSync(exported.path));
    assert.ok(fs.statSync(exported.path).size > 1000);
    const probe = await probeMedia(exported.path);
    assert.equal(probe.video?.width, 320);
    assert.equal(probe.video?.height, 180);
    assert.equal(probe.video?.codec, 'h264');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--detach makes a generated source project durable, then exports video', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 }, () => {
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const root = fs.mkdtempSync(path.join(repo, 'tests', '.tmp-detach-'));
  try {
    fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
      version: '1.1',
      id: 'detach-e2e',
      entry: 'video.vhtml',
      source: 'video.ts',
      paths: DEFAULT_LAYOUT,
      build: { out: 'video.vhtml' },
    }, null, 2));
    fs.writeFileSync(path.join(root, 'video.ts'), `import { defineVideo, lane, clip } from '@sdkwork/vhtml/sdk';
export default defineVideo({
  id: 'detach-e2e', width: 320, height: 180, fps: '5/1', duration: '0.4s',
  scenes: [{ id: 's', html: '<div style="position:absolute;inset:0;display:grid;place-items:center;background:#0b1220;color:#6ee7ff;font:700 24px system-ui">Detached</div>' }],
  lanes: [lane('video', 'v', [clip('scene:s', { start: 0, duration: '0.4s' })])],
  outputs: [{ format: 'mp4', width: 320, height: 180, frameRate: '5/1' }],
});
`);
    const bin = path.join(repo, 'bin', 'vhtml.mjs');
    const run = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(run('build', '.').status, 0);
    const split = run('split', '.', '--detach', '--json');
    assert.equal(split.status, 0, split.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vhtml.json'), 'utf8')) as { detached?: boolean; source?: string };
    assert.equal(manifest.detached, true);
    assert.equal(manifest.source, undefined);
    assert.ok(fs.existsSync(path.join(root, 'scenes', 's.html')));
    assert.notEqual(run('build', '.').status, 0, 'directory build must not regenerate a detached project');

    const out = path.join(root, 'renders', 'detached.mp4');
    const exported = run('export', '.', '--range', '0s+0.4s', '--out', out, '--json');
    assert.equal(exported.status, 0, exported.stderr);
    assert.ok(fs.existsSync(out));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
