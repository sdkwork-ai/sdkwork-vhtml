import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="history" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="s" duration="4s"><div style="position:absolute;inset:0;background:#123;color:#fff">History</div></scene></scenes>
  <timelines><timeline id="main" duration="4s"><lane id="v" type="video">
    <clip id="hero" ref="s" start="0s" duration="4s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`;

interface HistoryEntry { id: string; savedAt: string; revision: number; label?: string; sizeBytes: number }

test('version history snapshots saves, pins labelled versions and restores with a safety copy', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-history-'));
  try {
    fs.writeFileSync(path.join(root, 'video.vhtml'), PROJECT);
    const studio = await startStudioServer(root, { port: 0, open: false, timeoutMs: 20_000 });
    try {
      const json = async (route: string, body?: unknown) =>
        fetch(`${studio.origin}${route}`, body === undefined
          ? undefined
          : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

      // The first save after an edit lands a snapshot (no throttle yet).
      const applied = await studio.apply([{ op: 'clip.set', clipId: 'hero', props: { opacity: 0.5 } }]);
      assert.equal(applied.ok, true, JSON.stringify(applied.diagnostics));
      const first = (await json('/api/history')) as { ok: boolean; entries: HistoryEntry[]; keep: number };
      assert.equal(first.ok, true);
      assert.ok(first.entries.length >= 1, 'a snapshot exists after the first save');
      assert.equal(first.keep, 40);
      const historyDir = path.join(root, '.vhtml', 'cache', 'studio-history');
      assert.ok(fs.existsSync(path.join(historyDir, `${first.entries[0]!.id}.vhtml`)), 'snapshot file lives under the project cache');

      // Pin a labelled version of the opacity=0.5 state (forced: bypasses the 20 s gap).
      const pinned = (await json('/api/history/snapshot', { label: 'half opacity' })) as { ok: boolean; id: string; entries: HistoryEntry[] };
      assert.equal(pinned.ok, true);
      assert.ok(pinned.id.endsWith('-half-opacity'), pinned.id);
      assert.equal(pinned.entries[0]!.label, 'half opacity');

      // Edit further, then restore the pinned version.
      const second = await studio.apply([{ op: 'clip.set', clipId: 'hero', props: { opacity: 0.2 } }]);
      assert.equal(second.ok, true);
      assert.equal(studio.project().timelines[0]!.tracks[0]!.clips[0]!.opacity, 0.2);
      const restored = (await json('/api/history/restore', { id: pinned.id })) as { ok: boolean; restored: string; entries: HistoryEntry[]; project: { timelines: Array<{ tracks: Array<{ clips: Array<{ opacity: number }> }> }> } };
      assert.equal(restored.ok, true);
      assert.equal(restored.restored, pinned.id);
      assert.equal(studio.project().timelines[0]!.tracks[0]!.clips[0]!.opacity, 0.5, 'session model is the pinned state');
      assert.equal(restored.project.timelines[0]!.tracks[0]!.clips[0]!.opacity, 0.5);
      assert.ok(fs.readFileSync(path.join(root, 'video.vhtml'), 'utf8').includes('opacity="0.5"'), 'entry file rewritten');
      assert.ok(restored.entries.some((entry) => entry.label === 'before restore'), 'the pre-restore state was snapshotted first');

      // Bad ids are rejected, unknown ids are 404.
      const bad = await fetch(`${studio.origin}/api/history/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: '../escape' }) });
      assert.equal(bad.status, 400);
      const missing = await fetch(`${studio.origin}/api/history/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: '1-r1-nope' }) });
      assert.equal(missing.status, 404);
    } finally {
      await studio.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
