import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { exportProject } from '@sdkwork/vhtml-media/export';
import { probeMedia, ffprobePath } from '@sdkwork/vhtml-ffmpeg';
import { findChromeExecutable } from '@sdkwork/vhtml-runtime/chrome';

function toolsAvailable(): boolean {
  try {
    findChromeExecutable();
  } catch {
    return false;
  }
  return spawnSync(ffprobePath(), ['-hide_banner', '-version']).status === 0;
}

const CHAPTER_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="chapters" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="s" duration="4s"><div style="position:absolute;inset:0;background:#0b1020"></div></scene></scenes>
  <timelines><timeline id="main" duration="4s">
    <lane id="v" type="video"><clip id="c" ref="s" start="0s" duration="4s" /></lane>
    <marker id="m1" at="0.5s" name="Intro" type="chapter"></marker>
    <marker id="m2" at="2s" name="Deep dive" type="chapter"></marker>
  </timeline></timelines>
  <output id="mp4" format="mp4" width="320" height="180" frame-rate="30/1" />
</project></vhtml></body></html>`;

const NO_CHAPTER_PROJECT = CHAPTER_PROJECT.replace(
  'name="Intro" type="chapter"',
  'name="note" type="marker"',
).replace(
  'name="Deep dive" type="chapter"',
  'name="note-2" type="marker"',
);

test('export muxes chapter markers into MP4 chapter atoms', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-chapters-'));
  try {
    const parsed = parseVhtml(CHAPTER_PROJECT, { file: path.join(root, 'video.vhtml'), root });
    const result = await exportProject({
      project: parsed.document.project,
      root,
      output: { ...parsed.document.project.outputs[0]! },
      outputPath: path.join(root, 'out.mp4'),
      chapters: true,
      preset: 'ultrafast',
      crf: 30,
      timeoutMs: 60_000,
    });
    assert.ok(fs.existsSync(result.path));
    const probe = await probeMedia(result.path);
    assert.ok(probe.video, 'video stream exists');
    const chapters = spawnSync(ffprobePath(), [
      '-v', 'error', '-i', result.path,
      '-show_chapters', '-of', 'json',
    ], { encoding: 'utf8' });
    const data = JSON.parse(chapters.stdout) as { chapters: Array<{ id: number; start_time: number; end_time: number; tags?: { title?: string } }> };
    assert.equal(data.chapters.length, 2, `expected 2 chapters, got ${JSON.stringify(data.chapters)}`);
    assert.equal(data.chapters[0]!.tags?.title, 'Intro');
    assert.equal(data.chapters[1]!.tags?.title, 'Deep dive');
    assert.ok(Math.abs(data.chapters[1]!.start_time - 2) < 0.05, `chapter 2 starts at ${data.chapters[1]!.start_time}`);
    assert.ok(Math.abs(data.chapters[1]!.end_time - 4) < 0.05, 'last chapter ends at export end');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('chapter muxing is skipped with an issue when the timeline has no chapter markers', { skip: !toolsAvailable() && 'Chrome/FFmpeg not available', timeout: 180_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-nochapters-'));
  try {
    const parsed = parseVhtml(NO_CHAPTER_PROJECT, { file: path.join(root, 'video.vhtml'), root });
    assert.equal(parsed.document.project.timelines[0]!.markers.filter((marker) => marker.type === 'chapter').length, 0);
    const result = await exportProject({
      project: parsed.document.project,
      root,
      output: { ...parsed.document.project.outputs[0]! },
      outputPath: path.join(root, 'out.mp4'),
      chapters: true,
      preset: 'ultrafast',
      crf: 30,
      timeoutMs: 60_000,
    });
    assert.ok(result.issues.some((issue) => issue.includes('chapter')), 'explicit skip issue reported');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
