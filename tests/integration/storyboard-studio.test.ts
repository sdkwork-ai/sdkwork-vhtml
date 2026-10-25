import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function projectSource(): string {
  return `<vhtml version="1.1"><project id="storyboard-studio" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="s1"><div style="position:absolute;inset:0;background:#0b1220;color:#fff">One</div></scene></scenes>
  <storyboard>
    <shot id="shot-1" order="1" title="Opening" scene="s1" duration="1s" status="boarded">
      <description>Opening frame</description>
    </shot>
  </storyboard>
  <timelines><timeline id="main" duration="4s"><lane id="v" type="video"><clip id="c" ref="scene:s1" start="0s" duration="2s"></clip></lane></timeline></timelines>
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError instanceof Error ? lastError : new Error('Studio did not start');
}

test('Studio storyboard API freely adds, edits and reorders shots', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-board-studio-'));
  fs.writeFileSync(path.join(root, 'storyboard.vhtml'), projectSource());
  fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
    version: '1.1',
    id: 'storyboard-studio',
    entry: 'storyboard.vhtml',
    paths: { assets: 'assets', images: 'assets/images', video: 'assets/video', audio: 'assets/audio', fonts: 'assets/fonts', scenes: 'scenes', generated: 'generated', renders: 'renders', cache: '.vhtml/cache' },
  }, null, 2));
  const port = 4300 + Math.floor(Math.random() * 300);
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const child = spawn(process.execPath, [path.join(repo, 'bin', 'vhtml.mjs'), 'serve', root, '--port', String(port), '--no-open'], {
    cwd: repo,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForProject(url);
    const add = await fetch(`${url}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operations: [
          { op: 'storyboard.add', shot: { id: 'shot-2', title: 'Insert', scene: 's1', duration: 2, status: 'idea' }, at: 1 },
          { op: 'storyboard.set', shotId: 'shot-2', props: { title: 'Insert revised', direction: { shot: { camera: 'orbit' } } } },
        ],
      }),
    });
    assert.equal(add.status, 200);
    const addBody = await add.json() as { model: { storyboard: Array<{ id: string; title: string; order: number; direction?: { shot?: { camera?: string } } }> } };
    assert.deepEqual(addBody.model.storyboard.map((shot) => shot.id), ['shot-1', 'shot-2']);
    assert.equal(addBody.model.storyboard[1]!.title, 'Insert revised');
    assert.equal(addBody.model.storyboard[1]!.direction?.shot?.camera, 'orbit');

    const move = await fetch(`${url}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: [{ op: 'storyboard.move', shotId: 'shot-2', to: 0 }] }),
    });
    assert.equal(move.status, 200);
    const moveBody = await move.json() as { model: { storyboard: Array<{ id: string }> } };
    assert.deepEqual(moveBody.model.storyboard.map((shot) => shot.id), ['shot-2', 'shot-1']);

    const remove = await fetch(`${url}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: [{ op: 'storyboard.remove', shotId: 'shot-2' }] }),
    });
    assert.equal(remove.status, 200);
    const removeBody = await remove.json() as { model: { storyboard: Array<{ id: string }> } };
    assert.deepEqual(removeBody.model.storyboard.map((shot) => shot.id), ['shot-1']);

    const invalid = await fetch(`${url}/api/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: [{ op: 'storyboard.set', shotId: 'nope', props: { title: 'x' } }] }),
    });
    assert.equal(invalid.status, 422);
    const saved = fs.readFileSync(path.join(root, 'storyboard.vhtml'), 'utf8');
    assert.match(saved, /<shot id="shot-1"/);
    assert.doesNotMatch(saved, /shot-2/);
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
