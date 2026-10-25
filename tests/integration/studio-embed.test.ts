import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="embed" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="s" duration="4s"><div style="position:absolute;inset:0;background:#123;color:#fff">Embed</div></scene></scenes>
  <timelines><timeline id="main" duration="4s"><lane id="v" type="video">
    <clip id="hero" ref="s" start="0s" duration="4s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

test('startStudioServer exposes a programmable handle for embedding', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-embed-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      assert.ok(studio.port > 0, 'random port assigned');
      assert.equal(studio.embedUrl, `${studio.url}?embed=1`);
      // Model is served for the host shell.
      const model = await fetch(`${studio.origin}/api/project`).then((r) => r.json());
      assert.equal(model.project.id, 'embed');
      // Apply ops through the same pipeline as the UI.
      const applied = await studio.apply([{ op: 'clip.set', clipId: 'hero', props: { opacity: 0.5 } }]);
      assert.equal(applied.ok, true, JSON.stringify(applied.diagnostics));
      assert.ok(applied.changed.includes('hero'));
      // Project snapshot reflects the edit.
      const hero = studio.project().timelines[0]!.tracks[0]!.clips[0]!;
      assert.equal(hero.opacity, 0.5);
      // save() persists the session model to the entry file.
      studio.save();
      const written = fs.readFileSync(path.join(root, 'video.vhtml'), 'utf8');
      assert.ok(written.includes('opacity="0.5"'));
      // loadDocument replaces the session model.
      studio.loadDocument(PROJECT.replace('Embed', 'Replaced'));
      assert.equal(studio.project().scenes[0]!.html.includes('Replaced'), true);
    } finally {
      await studio.close();
    }
    // Server is closed: further requests fail.
    await assert.rejects(() => fetch(`${studio.origin}/api/project`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('embed mode page ships the postMessage bridge surface', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-embed2-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      const page = await fetch(studio.embedUrl).then((r) => r.text());
      assert.ok(page.includes("body.embed header"), 'embed CSS hides the host-inappropriate chrome');
      assert.ok(page.includes("vhtml:command"), 'inbound command protocol');
      assert.ok(page.includes("vhtml:event"), 'outbound event protocol');
      assert.ok(page.includes("applyOps"), 'applyOps command');
      // Non-embed page must NOT auto-activate the bridge listener branches? The
      // listener is present but gated by EMBED at runtime; assert the flag.
      assert.ok(page.includes("get('embed') === '1'"), 'embed flag is runtime-gated');
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
