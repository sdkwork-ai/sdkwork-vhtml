import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { findClip } from '@sdkwork/vhtml-core/model';
import { toNumber } from '@sdkwork/vhtml-core/time';

const SOURCE = `<project id="anim-sanitize" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="6s" /></settings>
<scenes><scene id="s" duration="4s"><div>Hello</div></scene></scenes>
<timelines><timeline id="main" duration="6s"><lane id="v" type="video"><clip id="a" ref="s" start="0s" duration="4s" /></lane></timeline></timelines></project>`;

function load() {
  const result = parseVhtml(SOURCE, { file: 'anim-sanitize.vhtml' });
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  return result.document.project;
}

test('clip.set animations normalizes degenerate projection round-trips', () => {
  const project = load();
  const result = applyEditOperations(project, [
    {
      op: 'clip.set',
      clipId: 'a',
      props: {
        animations: [
          {
            id: 'degenerate',
            property: 'opacity',
            // Simulates an older projection that lost these fields:
            start: undefined,
            duration: undefined,
            timeBase: 'clip',
            easing: 'ease-out',
            iterations: 0,
            direction: undefined,
            fill: undefined,
            compose: undefined,
            enabled: true,
            keyframes: [
              { time: undefined, value: '0' },
              { time: 0.7, value: '1' },
            ],
          } as never,
        ],
      },
    },
  ]);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const clip = findClip(result.project, 'a')!.clip;
  const animation = clip.animations.find((candidate) => candidate.id === 'degenerate')!;
  assert.ok(animation, 'degenerate animation survived as a valid object');
  assert.equal(toNumber(animation.start), 0);
  assert.equal(toNumber(animation.duration), 0.7);
  assert.equal(animation.iterations, 1);
  assert.equal(animation.direction, 'normal');
  assert.equal(animation.compose, 'replace');
  assert.equal(animation.fill, 'both');
  assert.deepEqual(animation.keyframes.map((keyframe) => toNumber(keyframe.time)), [0, 0.7]);
});

test('clip.set animations drops animations without property or keyframes', () => {
  const project = load();
  const result = applyEditOperations(project, [
    {
      op: 'clip.set',
      clipId: 'a',
      props: {
        animations: [
          { id: 'no-prop', property: '', keyframes: [{ time: 0, value: 1 }] },
          { id: 'no-kf', property: 'opacity', keyframes: [] },
          { id: 'good', property: 'opacity', keyframes: [{ time: 0, value: 1 }] },
        ],
      } as never,
    },
  ]);
  assert.equal(result.ok, true);
  const clip = findClip(result.project, 'a')!.clip;
  assert.deepEqual(clip.animations.map((animation) => animation.id), ['good']);
});
