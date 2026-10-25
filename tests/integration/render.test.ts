import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';

function chromeAvailable(): boolean {
  try {
    findChromeExecutable();
    return true;
  } catch {
    return false;
  }
}

const SOURCE = `<project id="render-test" version="1.1"><settings><composition width="640" height="360" frame-rate="30/1" duration="2s" background="#05070d" /></settings>
<scenes><scene id="s" duration="2s">
<style>@keyframes rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}.box{position:absolute;inset:0;display:grid;place-items:center;color:#6ee7ff;font:700 64px system-ui;animation:rise 1s ease-out both}</style>
<div class="box">Deterministic</div>
</scene></scenes>
<timelines><timeline id="main" duration="2s"><lane id="v" type="video"><clip id="c" ref="s" start="0s" duration="2s"><animate property="opacity" from="0.2" to="1" duration="0.4s" /></clip></lane></timeline></timelines></project>`;

test('Chromium frame sampling is repeatable and time-aware', { skip: !chromeAvailable() && 'Chrome is not installed' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-render-'));
  try {
    const parsed = parseVhtml(SOURCE, { file: path.join(root, 'project.vhtml'), root });
    const validation = validateDocument(parsed.document, { root, checkFiles: false });
    assert.equal(validation.errors.length, 0);
    const renderer = new VhtmlRenderer({ project: parsed.document.project, root, timeoutMs: 60_000 });
    try {
      await renderer.open();
      const hash = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
      const first = await renderer.sampleFrame(3);
      const firstAgain = await renderer.sampleFrame(3);
      const later = await renderer.sampleFrame(27);
      assert.equal(first.png.subarray(1, 4).toString('ascii'), 'PNG');
      assert.equal(first.width, 640);
      assert.equal(first.height, 360);
      assert.equal(hash(first.png), hash(firstAgain.png));
      assert.notEqual(hash(first.png), hash(later.png));
      assert.deepEqual(first.issues, []);
    } finally {
      await renderer.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
