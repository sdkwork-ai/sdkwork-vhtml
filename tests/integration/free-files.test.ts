import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
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

test('exports an external Scene whose path, assets and CSS contain spaces and percent-encoding', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 120_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-free-files-'));
  try {
    fs.mkdirSync(path.join(root, 'scenes', 'sub'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets', 'images'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'images', 'logo file.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="38" fill="#6ee7ff"/></svg>');
    fs.writeFileSync(path.join(root, 'assets', 'images', 'bg file.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#10233e"/></svg>');
    fs.writeFileSync(
      path.join(root, 'scenes', 'sub', 'nested scene.html'),
      '<style>.stage{position:absolute;inset:0;display:grid;place-items:center;background:url("../../assets/images/bg%20file.svg");color:#fff;font:700 22px system-ui}</style><div class="stage"><img src="../../assets/images/logo%20file.svg" alt="logo"><span>Free files</span></div>',
    );
    const source = `<project id="free-files" version="1.1"><settings><composition width="320" height="180" frame-rate="5/1" duration="0.4s" /></settings>
    <assets><asset id="logo" type="image" src="assets/images/logo%20file.svg" /></assets>
    <scenes><scene id="hero" src="scenes/sub/nested%20scene.html" duration="0.4s"></scene></scenes>
    <timelines><timeline id="main" duration="0.4s"><lane id="v" type="video"><clip id="c" ref="scene:hero" start="0s" duration="0.4s"></clip></lane></timeline></timelines>
    <outputs><output id="mp4" format="mp4" width="320" height="180" frame-rate="5/1" fit="contain" /></outputs></project>`;
    const parsed = parseVhtml(source, { file: path.join(root, 'video.vhtml'), root });
    const validation = validateDocument(parsed.document, { root, checkFiles: true });
    assert.equal(validation.ok, true, validation.errors.map((error) => error.message).join('\n'));
    const outputPath = path.join(root, 'renders', 'free.mp4');
    const exported = await exportProject({
      project: parsed.document.project,
      root,
      output: parsed.document.project.outputs[0]!,
      outputPath,
      rangeStart: { num: 0, den: 1 },
      rangeDuration: { num: 2, den: 5 },
      frameRate: { num: 5, den: 1 },
      preset: 'ultrafast',
      crf: 30,
      timeoutMs: 60_000,
    });
    assert.equal(exported.issues.length, 0);
    assert.equal(exported.frames, 2);
    assert.ok(fs.statSync(exported.path).size > 1000);
    const probe = await probeMedia(exported.path);
    assert.equal(probe.video?.width, 320);
    assert.equal(probe.video?.height, 180);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
