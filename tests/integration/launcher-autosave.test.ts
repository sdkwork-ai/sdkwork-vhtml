import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStudioLauncher, scanProjects } from '@sdkwork/vhtml-studio/launcher';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="autosave" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="s" duration="4s"><div style="position:absolute;inset:0;background:#123">v</div></scene></scenes>
  <timelines><timeline id="main" duration="4s"><lane id="v" type="video">
    <clip id="hero" ref="s" start="0s" duration="4s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

test('scanProjects finds VHTML project directories one level deep', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-scan-'));
  try {
    fs.mkdirSync(path.join(root, 'alpha'));
    fs.writeFileSync(path.join(root, 'alpha', 'vhtml.json'), JSON.stringify({ version: '1.1', entry: 'video.vhtml' }));
    fs.writeFileSync(path.join(root, 'alpha', 'video.vhtml'), PROJECT);
    fs.mkdirSync(path.join(root, 'beta'));
    fs.writeFileSync(path.join(root, 'beta', 'beta.vhtml'), PROJECT);
    fs.mkdirSync(path.join(root, 'empty'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    const found = scanProjects(root).map((project) => project.name);
    assert.deepEqual(found, ['alpha', 'beta']);
    assert.equal(fs.existsSync(path.join(root, 'alpha', 'video.vhtml')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('launcher lists, creates and opens projects', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-launcher-'));
  try {
    const launcher = await startStudioLauncher({ projectsDir: root, port: 0, timeoutMs: 20_000 });
    try {
      const listed = await fetch(`${launcher.origin}/api/launcher/projects`).then((r) => r.json());
      assert.equal(listed.projects.length, 0);
      // Create scaffolds a project AND opens an editor for it.
      const created = await fetch(`${launcher.origin}/api/launcher/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'my-film' }),
      }).then((r) => r.json());
      assert.equal(created.ok, true, created.error);
      assert.ok(fs.existsSync(path.join(root, 'my-film', 'vhtml.json')));
      assert.ok(launcher.opened().length === 1, 'opened editor tracked');
      // The opened editor serves the scaffolded project.
      const model = await fetch(`${created.url.replace(/\/studio$/, '')}/api/project`).then((r) => r.json());
      assert.equal(model.project.id, 'my-film');
      // Open an existing project by path.
      fs.mkdirSync(path.join(root, 'existing'));
      fs.writeFileSync(path.join(root, 'existing', 'video.vhtml'), PROJECT);
      const opened = await fetch(`${launcher.origin}/api/launcher/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dir: path.join(root, 'existing') }),
      }).then((r) => r.json());
      assert.equal(opened.ok, true, opened.error);
      assert.equal(launcher.opened().length, 2);
      // Rejects non-projects and bad names.
      const bad = await fetch(`${launcher.origin}/api/launcher/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dir: path.join(root, 'empty') }),
      }).then((r) => r.json());
      assert.equal(bad.ok, false);
    } finally {
      await launcher.closeAll();
      await launcher.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('autosave persists unsaved edits and the editor offers recovery', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-autosave-'));
  try {
    const entry = path.join(root, 'video.vhtml');
    fs.writeFileSync(entry, PROJECT);
    // Fast autosave tick so the test does not wait 15s.
    const studio = await startStudioServer(root, { port: 0, open: false, autosaveMs: 60, timeoutMs: 20_000 });
    const origin = studio.url.replace(/\/studio$/, '');
    const apply = async (operations: unknown[]) =>
      fetch(`${origin}/api/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operations }),
      }).then((r) => r.json());
    const applied = await apply([{ op: 'clip.set', clipId: 'hero', props: { opacity: 0.25 } }]);
    assert.equal(applied.ok, true, JSON.stringify(applied.diagnostics ?? applied));
    // Wait for the autosave tick.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const autosaveFile = `${entry}.autosave`;
    assert.ok(fs.existsSync(autosaveFile), 'checkpoint written after the revision changed');
    assert.ok(fs.readFileSync(autosaveFile, 'utf8').includes('opacity="0.25"'));
    const status = await fetch(`${origin}/api/autosave`).then((r) => r.json());
    assert.equal(status.available, true);
    await studio.close();

    // A fresh session over the same entry offers the recovery.
    const reopened = await startStudioServer(root, { port: 0, open: false, autosaveMs: 0, timeoutMs: 20_000 });
    try {
      const reopenedOrigin = reopened.url.replace(/\/studio$/, '');
      const available = await fetch(`${reopenedOrigin}/api/autosave`).then((r) => r.json());
      assert.equal(available.available, true);
      const restored = await fetch(`${reopenedOrigin}/api/autosave/restore`, { method: 'POST' }).then((r) => r.json());
      assert.equal(restored.ok, true, restored.error);
      const hero = restored.model.lanes[0].clips[0];
      assert.equal(hero.opacity, 0.25, 'restored model carries the unsaved edit');
      // Discard removes the file.
      await fetch(`${reopenedOrigin}/api/autosave/discard`, { method: 'POST' });
      assert.equal(fs.existsSync(autosaveFile), false);
    } finally {
      await reopened.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
