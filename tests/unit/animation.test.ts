import test from 'node:test';
import assert from 'node:assert/strict';
import { animate } from '@sdkwork/vhtml-sdk';
import { sampleAnimation, sampleProperties, interpolateValue, easingFunction, parseColor } from '@sdkwork/vhtml-core/animation';
import { rat } from '@sdkwork/vhtml-core/time';

test('keyframe interpolation and easing are deterministic', () => {
  const animation = animate({ property: 'opacity', from: 0, to: 1, duration: '1s', easing: 'linear', fill: 'none' });
  assert.equal(Number(sampleAnimation(animation, rat(0)).value), 0);
  const mid = sampleAnimation(animation, rat(1, 2));
  assert.equal(mid.active, true);
  assert.equal(mid.value, '0.5');
  assert.equal(sampleAnimation(animation, rat(2)).active, false);
  const filled = { ...animation, fill: 'forwards' as const };
  assert.equal(sampleAnimation(filled, rat(2)).value, '1');
});

test('multiple keyframes use per-keyframe easing', () => {
  const animation = animate({
    property: 'x',
    keyframes: [
      { at: '0s', value: 0 },
      { at: '1s', value: 100, easing: 'linear' },
      { at: '2s', value: 0 },
    ],
    duration: '2s',
  });
  assert.equal(sampleAnimation(animation, rat(1, 1)).value, '100');
  assert.equal(sampleAnimation(animation, rat(3, 2)).value, '50');
});

test('compose semantics add values', () => {
  const animations = [
    animate({ property: 'x', from: 10, to: 10, duration: '1s' }),
    { ...animate({ property: 'x', from: 5, to: 5, duration: '1s' }), compose: 'add' as const },
  ];
  const values = sampleProperties(animations, rat(1, 2), { x: 0 });
  assert.equal(values.x, '15');
});

test('colors and numeric units interpolate', () => {
  assert.equal(interpolateValue('#000000', '#ffffff', 0.5), 'rgba(128, 128, 128, 1)');
  assert.equal(interpolateValue('10px', '20px', 0.25), '12.5px');
  assert.deepEqual(parseColor('#6ee7ff'), { r: 110, g: 231, b: 255, a: 1 });
  assert.ok(Math.abs(easingFunction('ease-in-out')(0.5) - 0.5) < 0.001);
});

test('iterations and alternate direction are handled', () => {
  const animation = {
    ...animate({ property: 'opacity', from: 0, to: 1, duration: '1s' }),
    iterations: 2,
    direction: 'alternate' as const,
    fill: 'none' as const,
  };
  assert.equal(sampleAnimation(animation, rat(3, 2)).value, '0.5');
  assert.equal(sampleAnimation(animation, rat(1, 2)).value, '0.5');
  assert.equal(sampleAnimation(animation, rat(3, 2)).active, true);
});
