import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { exportProject } from '@sdkwork/vhtml-media/export';
import { probeMedia } from '@sdkwork/vhtml-ffmpeg';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';
import { ffmpegPath } from '@sdkwork/vhtml-ffmpeg';
import { loadSchema } from '@sdkwork/vhtml-schema';
import { Ajv2020 } from 'ajv/dist/2020.js';

function toolsAvailable(): boolean {
  try {
    findChromeExecutable();
  } catch {
    return false;
  }
  const result = spawnSync(ffmpegPath(), ['-hide_banner', '-version']);
  return result.status === 0;
}

test('exports an MP4 with mixed audio and a WebVTT sidecar', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-export-'));
  try {
    const wav = path.join(root, 'tone.wav');
    const generated = spawnSync(ffmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2',
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav,
    ]);
    assert.equal(generated.status, 0, generated.stderr?.toString());
    const source = `<project id="export-test" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="2s" sample-rate="48000" channels="2" /></settings>
<assets><asset id="tone" type="audio" src="./tone.wav" duration="2s" /></assets>
<scenes><scene id="s" duration="2s"><div style="position:absolute;inset:0;display:grid;place-items:center;background:#0b1020;color:#6ee7ff;font:700 28px system-ui">Export</div></scene></scenes>
<timelines><timeline id="main" duration="2s"><lane id="v" type="video"><clip id="c" ref="s" start="0s" duration="2s" /></lane><lane id="a" type="audio" order="1"><clip id="m" ref="tone" start="0s" duration="2s" volume="0.5" fade-in="0.1s" fade-out="0.2s" /></lane><lane id="cc" type="caption" order="2"><cue id="cue" start="0.1s" duration="1s" text="Exported caption" /></lane></timeline></timelines>
<output id="mp4" format="mp4" width="320" height="180" frame-rate="30/1" /></project>`;
    const parsed = parseVhtml(source, { file: path.join(root, 'project.vhtml'), root });
    const validation = validateDocument(parsed.document, { root, checkFiles: true });
    assert.equal(validation.errors.length, 0);
    const result = await exportProject({
      project: parsed.document.project,
      root,
      output: parsed.document.project.outputs[0]!,
      outputPath: path.join(root, 'out.mp4'),
      rangeStart: parsed.document.project.composition.duration ? { num: 0, den: 1 } : { num: 0, den: 1 },
      rangeDuration: { num: 1, den: 1 },
      frameRate: { num: 30, den: 1 },
      generateCaptions: true,
      captionsPath: path.join(root, 'out.vtt'),
      reportPath: path.join(root, 'report.json'),
      preset: 'ultrafast',
      crf: 30,
      timeoutMs: 60_000,
    });
    assert.equal(result.format, 'mp4');
    assert.equal(result.frames, 30);
    assert.ok(fs.existsSync(result.path));
    assert.ok(fs.statSync(result.path).size > 1000);
    const probe = await probeMedia(result.path);
    assert.ok(probe.video, 'video stream must exist');
    assert.equal(probe.video?.codec, 'h264');
    assert.ok(probe.audio, 'audio stream must exist');
    assert.equal(probe.audio?.codec, 'aac');
    assert.ok(probe.durationSeconds >= 0.9 && probe.durationSeconds <= 1.2, `duration ${probe.durationSeconds}`);
    assert.ok(result.captionsPath && fs.existsSync(result.captionsPath));
    assert.match(result.sha256 ?? '', /^[a-f0-9]{64}$/);
    const report = JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf8')) as {
      schema: string;
      sha256: string;
      provenance: { aiGenerated: boolean; licenses: string[]; generations: unknown[]; assets: Array<{ id: string }> };
    };
    assert.equal(report.schema, 'vhtml.export-report/1');
    assert.equal(report.sha256, result.sha256);
    assert.equal(report.provenance.aiGenerated, false);
    assert.deepEqual(report.provenance.licenses, []);
    assert.deepEqual(report.provenance.generations, []);
    assert.equal(report.provenance.assets.length, 1);
    const validateReport = new Ajv2020({ strict: false, allErrors: true }).compile(loadSchema('export-report'));
    assert.equal(validateReport(report), true, JSON.stringify(validateReport.errors));
    const vtt = fs.readFileSync(result.captionsPath!, 'utf8');
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /Exported caption/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PNG sequence honors delivery fit and dimensions', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-pngfit-'));
  try {
    const source = `<project id="png-fit" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="1s" background="#101018" /></settings>
<scenes><scene id="s" duration="1s"><div style="position:absolute;inset:0;background:#0b1020;color:#6ee7ff;font:700 24px system-ui">PNG</div></scene></scenes>
<timelines><timeline id="main" duration="1s"><lane id="v" type="video"><clip id="c" ref="s" start="0s" duration="1s" /></lane></timeline></timelines>
<output id="frames" format="png-sequence" width="160" height="90" fit="contain" frame-rate="30/1" path="renders/frames" /></project>`;
    const parsed = parseVhtml(source, { file: path.join(root, 'project.vhtml'), root });
    const output = parsed.document.project.outputs[0]!;
    const result = await exportProject({
      project: parsed.document.project,
      root,
      output,
      outputPath: path.join(root, 'frames'),
      rangeDuration: { num: 1, den: 1 },
      timeoutMs: 60_000,
    });
    assert.equal(result.format, 'png-sequence');
    assert.equal(result.width, 160);
    assert.equal(result.height, 90);
    const firstFrame = path.join(root, 'frames', 'frame-000000.png');
    assert.ok(fs.existsSync(firstFrame), 'resampled frame exists');
    assert.ok(!result.issues.some((issue) => issue.includes('delivery fit')), 'no delivery-fit issue remains');
    const probe = await probeMedia(firstFrame);
    assert.equal(probe.video?.width, 160);
    assert.equal(probe.video?.height, 90);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
