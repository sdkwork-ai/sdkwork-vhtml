import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string) {
  return parseVhtml(source, { file: 'round16.vhtml', root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round16" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

function entranceAnimation(): Record<string, unknown> {
  return {
    op: 'clip.set',
    clipId: 'c',
    props: {
      animations: [
        {
          id: 'anim-slide', property: 'x', timeBase: 'clip', start: 0, duration: 0.45,
          keyframes: [{ time: 0, value: -160 }, { time: 0.45, value: 0 }],
          easing: 'ease-out', iterations: 1, direction: 'normal', fill: 'both', compose: 'add', enabled: true,
        },
      ],
    },
  };
}

test('entrance animation preset validates and composes additively over the base transform', () => {
  const doc = parse(BASE_PROJECT);
  const result = applyEditOperations(doc.document.project, [entranceAnimation() as never]);
  const clip = result.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.equal(clip.animations.length, 1);
  assert.equal(clip.animations[0]!.compose, 'add');
  const validation = validateDocument(doc.document);
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));

  // At t=0 the add composition offsets the base x by -160; at t=0.45 it is
  // back at the authored position.
  const startFrame = evaluateFrame(result.project, { num: 0, den: 1 });
  const midFrame = evaluateFrame(result.project, { num: 9, den: 20 });
  const startLayer = startFrame.clips.find((candidate) => candidate.clipId === 'c');
  const midLayer = midFrame.clips.find((candidate) => candidate.clipId === 'c');
  assert.ok(startLayer && midLayer);
  const startX = Number(/translate\((-?[\d.]+)px/.exec(startLayer.style.transform)?.[1]);
  const midX = Number(/translate\((-?[\d.]+)px/.exec(midLayer.style.transform)?.[1]);
  assert.ok(startX < -120, `slide starts offset (x=${startX})`);
  assert.ok(Math.abs(midX) < 2, `slide settles at the authored position (x=${midX})`);
});

test('exit animation starts in the back half of the clip', () => {
  const doc = parse(BASE_PROJECT);
  const result = applyEditOperations(doc.document.project, [{
    op: 'clip.set',
    clipId: 'c',
    props: {
      animations: [{
        id: 'anim-fade-out', property: 'opacity', timeBase: 'clip', start: 0.55, duration: 0.45,
        keyframes: [{ time: 0, value: 1 }, { time: 0.45, value: 0 }],
        easing: 'ease-in', iterations: 1, direction: 'normal', fill: 'both', compose: 'replace', enabled: true,
      }],
    },
  } as never]);
  const validation = validateDocument(doc.document);
  assert.equal(validation.errors.length, 0);
  const earlyFrame = evaluateFrame(result.project, { num: 1, den: 4 });
  const lateFrame = evaluateFrame(result.project, { num: 19, den: 20 });
  const early = earlyFrame.clips.find((candidate) => candidate.clipId === 'c')!;
  const late = lateFrame.clips.find((candidate) => candidate.clipId === 'c')!;
  assert.equal(early.style.opacity, 1, 'fade-out holds before its start (fill both)');
  assert.ok(Number(late.style.opacity) < 0.2, `fade-out ends near zero (${late.style.opacity})`);
});

test('Studio ships round-8 animation surfaces', () => {
  for (const marker of ['Animation presets (动画预设)', 'Entrance (入场)', 'Bounce in (弹跳进入)', 'Pulse (脉冲)', 'applyAnimationPreset', 'ANIMATION_PRESETS', "compose:'add'"]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-8 marker: ${marker}`);
  }
  // Double-click enters compound clips; nested clip count badge.
  for (const marker of ['nestedClips', 'enterCompoundClip(clip)']) {
    assert.ok(STUDIO_HTML.includes(marker), `compound nav marker: ${marker}`);
  }
});
