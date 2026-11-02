import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { VISUAL_EFFECT_TYPES } from '@sdkwork/vhtml-core/model';
import { evaluateFrame, collectCaptions, typewriterText } from '@sdkwork/vhtml-runtime/evaluate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string, file = 'round20.vhtml') {
  return parseVhtml(source, { file, root: process.cwd() });
}

const STICKER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><circle cx='60' cy='60' r='46' fill='#6ee7ff'/></svg>");

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round20" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <assets><asset id="sticker" kind="svg" src="${STICKER_SVG}" width="120" height="120" /></assets>
  <scenes><scene id="card" duration="4s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="4s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="4s"></clip></lane>
    <lane id="fx" type="overlay" order="1"><clip id="s" ref="sticker" kind="svg" start="0s" duration="3s" fit="contain"></clip></lane>
    <lane id="subs" type="caption">
      <cue id="cue" start="0s" duration="4s" text="你好世界"><effect id="tw" type="typewriter" cps="2" delay="0.5" cursor="|" /></cue>
    </lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('typewriter reveals caption text by code point after the delay and trails the cursor until complete', () => {
  const parsed = parse(PROJECT);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => d.message).join('\n'));
  assert.ok(VISUAL_EFFECT_TYPES.has('typewriter'));
  const validation = validateDocument(parsed.document);
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));
  const project = parsed.document.project;
  const captionAt = (seconds: number): string => {
    const frame = evaluateFrame(project, { num: Math.round(seconds * 30), den: 30 });
    const cue = frame.clips.find((clip) => clip.clipId === 'cue')!;
    return cue.caption!.text;
  };
  assert.equal(captionAt(0), '|', 'nothing typed before the delay — only the cursor');
  assert.equal(captionAt(1.5), '你好|', '2 cps × 1 s after the 0.5 s delay → two CJK glyphs, cursor trailing');
  assert.equal(captionAt(2.4), '你好世|');
  assert.equal(captionAt(2.5), '你好世界', 'complete text drops the cursor');
  assert.equal(captionAt(3.9), '你好世界');

  // The subtitle sidecar never sees the partial text.
  const cues = collectCaptions(project);
  assert.equal(cues.length, 1);
  assert.equal(cues[0]!.text, '你好世界');
});

test('typewriterText ignores disabled effects and typewriter on non-caption clips reports no issue', () => {
  const parsed = parse(PROJECT);
  const project = parsed.document.project;
  const cue = project.timelines[0]!.tracks.find((track) => track.id === 'subs')!.clips[0]!;
  const disabled = { ...cue, effects: cue.effects.map((fx) => ({ ...fx, enabled: false })) };
  assert.equal(typewriterText(disabled as never, { num: 0, den: 1 }, project.extensions), '你好世界');

  const withEffect = applyEditOperations(project, [{
    op: 'effect.add', clipId: 'c', effect: { id: 'tw-on-scene', type: 'typewriter', params: { cps: 5 }, enabled: true },
  } as never]);
  const frame = evaluateFrame(withEffect.project, { num: 1, den: 1 });
  assert.ok(!frame.issues.some((issue) => /typewriter/.test(issue)), frame.issues.join('\n'));
});

test('data-URI SVG stickers validate and render as contained overlay clips', () => {
  const parsed = parse(PROJECT);
  const validation = validateDocument(parsed.document, { root: process.cwd(), checkFiles: true });
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));
  const scaled = applyEditOperations(parsed.document.project, [{
    op: 'clip.set', clipId: 's', props: { transform: { x: 0, y: 0, scaleX: 0.32, scaleY: 0.32, rotate: 0, anchorX: 0.5, anchorY: 0.5 } },
  } as never]);
  const frame = evaluateFrame(scaled.project, { num: 1, den: 1 });
  const sticker = frame.clips.find((clip) => clip.clipId === 's')!;
  assert.equal(sticker.kind, 'svg');
  assert.ok(sticker.style.transform.includes('scale(0.32, 0.32)'), sticker.style.transform);
  assert.equal(sticker.style.zIndex, 1000, 'overlay lane renders above the video lane band');
});

test('Studio ships round-12 surfaces: typewriter, shapes, Q/W trim, chapters', () => {
  for (const marker of [
    "'typewriter'",
    'setTypewriter',
    'Typewriter (打字机)',
    'SHAPE_LIBRARY',
    'insertShape',
    'Shapes & stickers (形状 · 贴纸)',
    'trimSelectionToPlayhead',
    "event.key === 'q'",
    "event.key === 'w'",
    'exp-chapters',
    'Mark as chapter (章节)',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-12 marker: ${marker}`);
  }
});
