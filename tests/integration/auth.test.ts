import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startProjectServer } from '@sdkwork/vhtml-runtime/server';

test('project server health is public while stage/static/API require authorization', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-auth-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>private</h1>');
  const expected = `Basic ${Buffer.from('user:secret').toString('base64')}`;
  const server = await startProjectServer({
    root,
    stage: () => '<!doctype html><title>stage</title>',
    authorize: (request) => request.headers.authorization === expected,
  });
  try {
    const health = await fetch(`${server.origin}/__vhtml/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'vhtml-studio' });

    const stage = await fetch(`${server.origin}/__vhtml/stage.html`);
    assert.equal(stage.status, 401);
    assert.match(stage.headers.get('www-authenticate') ?? '', /^Basic /);

    const staticFile = await fetch(`${server.origin}/index.html`);
    assert.equal(staticFile.status, 401);

    const authorized = await fetch(`${server.origin}/__vhtml/stage.html`, {
      headers: { authorization: expected },
    });
    assert.equal(authorized.status, 200);
    assert.match(await authorized.text(), /stage/);

    const file = await fetch(`${server.origin}/index.html`, { headers: { authorization: expected } });
    assert.equal(file.status, 200);
    assert.match(await file.text(), /private/);
  } finally {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
