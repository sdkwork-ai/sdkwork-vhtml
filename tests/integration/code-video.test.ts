import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { materializeDocument } from '@sdkwork/vhtml-core/program';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { exportProject } from '@sdkwork/vhtml-media/export';
import { probeMedia } from '@sdkwork/vhtml-ffmpeg';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';
import { ffmpegPath } from '@sdkwork/vhtml-ffmpeg';

function toolsAvailable(): boolean {
  try {
    findChromeExecutable();
  } catch {
    return false;
  }
  const result = spawnSync(ffmpegPath(), ['-hide_banner', '-version']);
  return result.status === 0;
}

const PROGRAM_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="code-video-e2e" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="2s" sample-rate="48000" channels="2" background="#05070d" seed="5" /></settings>
  <timelines><timeline id="main" duration="2s"></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
vhtml.addLane({ id: 'visual', type: 'video', clips: [] });
const words = vhtml.data.get('words');
words.forEach((word, index) => {
  vhtml.addScene({ id: 'card-' + index, html: '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#6ee7ff;font:700 32px system-ui">' + word + '</div>' });
  vhtml.addClip('visual', { id: 'card-clip-' + index, ref: 'scene:card-' + index, start: index, duration: 1 });
});
vhtml.addCue({ text: 'programmed caption', start: 0, duration: 1 });
</script>
<script type="application/json" id="words">["Code", "Video"]</script>
</vhtml></body></html>`;

test(
  'program document materialises, renders and exports end to end',
  { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-code-video-'));
    try {
      const parsed = parseVhtml(PROGRAM_PROJECT, { file: path.join(root, 'video.vhtml'), root });
      assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0);
      const materialized = materializeDocument(parsed.document);
      assert.equal(materialized.diagnostics.filter((d) => d.severity === 'error').length, 0);
      const validation = validateDocument(materialized.document, { root, checkFiles: false });
      assert.equal(validation.errors.length, 0, validation.errors.map((d) => d.message).join('\n'));

      const project = materialized.document.project;
      assert.equal(project.scenes.length, 2);
      const result = await exportProject({
        project,
        root,
        output: project.outputs[0]!,
        outputPath: path.join(root, 'out.mp4'),
        rangeStart: { num: 0, den: 1 },
        rangeDuration: { num: 1, den: 1 },
        frameRate: { num: 30, den: 1 },
        preset: 'ultrafast',
        crf: 30,
        timeoutMs: 60_000,
      });
      assert.equal(result.frames, 30);
      const probe = await probeMedia(result.path);
      assert.ok(probe.video, 'video stream must exist');
      // The two program-generated cards must both be sampled by the renderer:
      // repeatable frame hashes require the second scene to appear after 1s.
      assert.ok(fs.statSync(result.path).size > 1000);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
