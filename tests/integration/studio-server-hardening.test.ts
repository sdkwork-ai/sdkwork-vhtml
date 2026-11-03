import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';

function projectSource(): string {
  return `<vhtml version="1.1"><project id="hardening" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="6s" /></settings>
  <scenes><scene id="s1"><div style="position:absolute;inset:0;background:#0b1220;color:#fff">One</div></scene></scenes>
  <timelines><timeline id="main" duration="6s"><lane id="v" type="video"><clip id="c" ref="scene:s1" start="0s" duration="2s"></clip></lane></timeline></timelines>
  </project></vhtml>`;
}

async function waitForProject(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/project`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError instanceof Error ? lastError : new Error('Studio did not start');
}

test('studio server hardening: validation, atomic saves, conflict warning, job cancel route', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-hardening-'));
  const entry = path.join(root, 'video.vhtml');
  fs.writeFileSync(entry, projectSource(), 'utf8');
  const studio = await startStudioServer(root, { port: 0, open: false, autosaveMs: 0, timeoutMs: 20_000 });
  try {
    await waitForProject(studio.origin);

    // Non-array operations must be a 400, not a 500.
    const badType = await fetch(`${studio.origin}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: studio.url },
      body: JSON.stringify({ operations: 'clip.set' }),
    });
    assert.equal(badType.status, 400);

    // Malformed JSON must be a 400, not a 500.
    const badJson = await fetch(`${studio.origin}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: studio.url },
      body: '{"operations": [',
    });
    assert.equal(badJson.status, 400);

    // A valid edit round-trips and the save leaves no temp files behind.
    const edit = await fetch(`${studio.origin}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: studio.url },
      body: JSON.stringify({ operations: [{ op: 'clip.set', clipId: 'c', props: { name: 'renamed' } }] }),
    });
    assert.equal(edit.status, 200);
    const leftovers = fs.readdirSync(root).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'atomic saves must not leave temp files');

    // External write to the entry is detected on the next save.
    const external = fs.readFileSync(entry, 'utf8').replace('One', 'Two');
    fs.writeFileSync(entry, external, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterExternal = await fetch(`${studio.origin}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: studio.url },
      body: JSON.stringify({ operations: [{ op: 'clip.set', clipId: 'c', props: { name: 'third' } }] }),
    });
    assert.equal(afterExternal.status, 200);
    const body = (await afterExternal.json()) as { diagnostics?: Array<{ code: string; message: string }> };
    assert.ok(
      (body.diagnostics ?? []).some((diagnostic) => diagnostic.code === 'STUDIO_EXTERNAL_CHANGE'),
      'external entry change must surface a conflict warning',
    );

    // Cancelling an unknown job is a 404; the route exists next to GET.
    const cancelUnknown = await fetch(`${studio.origin}/api/job/does-not-exist`, { method: 'DELETE' });
    assert.equal(cancelUnknown.status, 404);
  } finally {
    studio.close();
  }
});
