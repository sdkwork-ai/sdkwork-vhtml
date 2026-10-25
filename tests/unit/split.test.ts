import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { DEFAULT_LAYOUT } from '@sdkwork/vhtml-project/manifest';
import { splitInlineScenes } from '@sdkwork/vhtml-project/split';

const SOURCE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Split</title></head><body>
<vhtml version="1.1"><project id="split-test" version="1.1" title="Split test">
<settings><composition width="640" height="360" frame-rate="30/1" duration="5s" background="#000" /></settings>
<scenes>
  <scene id="hero" duration="5s">
    <style>@import "assets/theme.css";.stage{color:#fff}.bg{background:url(assets/bg.png)}</style>
    <script>console.log('hero scene');</script>
    <div class="stage bg">
      <img src="assets/logo.png" srcset="assets/logo.png 1x, assets/logo@2x.png 2x" style="background:url(assets/card.png)" />
      <span class="eyebrow">Hello split</span>
    </div>
  </scene>
</scenes>
<timelines><timeline id="main" duration="5s"><lane id="visual" type="video"><clip id="hero-clip" ref="scene:hero" start="0s" duration="5s" /></lane></timeline></timelines>
</project></vhtml>
</body></html>`;

test('splitInlineScenes writes an external Scene, rebases URLs and preserves scripts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-split-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), SOURCE);
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    for (const file of ['bg.png', 'logo.png', 'logo@2x.png', 'card.png', 'theme.css']) {
      fs.writeFileSync(path.join(root, 'assets', file), '');
    }
    const entry = path.join(root, 'video.vhtml');
    const parsed = parseVhtml(SOURCE, { file: entry, root });
    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);

    const result = splitInlineScenes({
      root,
      entry,
      document: parsed.document,
      layout: DEFAULT_LAYOUT,
    });
    assert.equal(result.changed, true);
    assert.equal(result.files.length, 1);
    const sceneFile = path.join(root, 'scenes', 'hero.html');
    assert.ok(fs.existsSync(sceneFile));
    const contents = fs.readFileSync(sceneFile, 'utf8');
    assert.match(contents, /@import "\.\.\/assets\/theme\.css"/);
    assert.match(contents, /url\(\.\.\/assets\/bg\.png\)/);
    assert.match(contents, /src="\.\.\/assets\/logo\.png"/);
    assert.match(contents, /srcset="\.\.\/assets\/logo\.png 1x, \.\.\/assets\/logo@2x\.png 2x"/);
    assert.match(contents, /background:url\(\.\.\/assets\/card\.png\)/);
    assert.equal((contents.match(/console\.log\('hero scene'\)/g) ?? []).length, 1);
    assert.doesNotMatch(contents, /<script><script>/);

    const entryText = fs.readFileSync(entry, 'utf8');
    assert.match(entryText, /<scene id="hero" src="scenes\/hero\.html"/);
    assert.doesNotMatch(entryText, /Hello split/);

    const reparse = parseVhtml(entryText, { file: entry, root });
    assert.equal(reparse.document.project.scenes[0]!.src, 'scenes/hero.html');
    assert.match(reparse.document.project.scenes[0]!.html, /Hello split/);
    assert.equal(reparse.document.project.scenes[0]!.css, '@import "/assets/theme.css";.stage{color:#fff}.bg{background:url("/assets/bg.png")}');
    const validation = validateDocument(reparse.document, { root, checkFiles: true });
    assert.equal(validation.errors.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('splitInlineScenes dry-run plans without writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-split-dry-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), SOURCE);
    const entry = path.join(root, 'video.vhtml');
    const parsed = parseVhtml(SOURCE, { file: entry, root });
    const result = splitInlineScenes({
      root,
      entry,
      document: parsed.document,
      layout: DEFAULT_LAYOUT,
      dryRun: true,
    });
    assert.equal(result.changed, true);
    assert.equal(result.files.length, 1);
    assert.equal(fs.existsSync(path.join(root, 'scenes')), false);
    assert.match(fs.readFileSync(entry, 'utf8'), /Hello split/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
