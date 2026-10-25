import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZERO,
  add,
  eq,
  formatRate,
  formatTime,
  formatTimecode,
  frameCount,
  frameIndexAt,
  frameTime,
  parseFrameRate,
  parseTime,
  rat,
  sub,
  toNumber,
} from '@sdkwork/vhtml-core/time';

test('parses the normative time grammar', () => {
  assert.deepEqual(parseTime('1.5s'), rat(3, 2));
  assert.deepEqual(parseTime('250ms'), rat(1, 4));
  assert.deepEqual(parseTime('00:00:02.500'), rat(5, 2));
  assert.deepEqual(parseTime('10f', { frameRate: rat(30) }), rat(1, 3));
  assert.deepEqual(parseTime('1/3s'), rat(1, 3));
  assert.deepEqual(parseTime('0'), ZERO);
  assert.throws(() => parseTime('12'), /VHTML_TIME_INVALID/);
  assert.throws(() => parseTime('10f'), /frame rate/);
  assert.throws(() => parseTime('1.2.3s'), /VHTML_TIME_INVALID/);
});

test('frame budget and sample times follow the exact half-open rule', () => {
  assert.equal(frameCount(rat(8), rat(30)), 240);
  assert.equal(frameCount(rat(10), rat(30000, 1001)), 300);
  assert.equal(frameCount(rat(1, 30), rat(30)), 1);
  assert.deepEqual(frameTime(45, rat(30)), rat(3, 2));
  assert.equal(frameIndexAt(rat(3, 2), rat(30)), 45);
  assert.equal(frameIndexAt(sub(rat(3, 2), rat(1, 1000)), rat(30)), 44);
  assert.equal(toNumber(frameTime(1, rat(30000, 1001))), 1001 / 30000);
});

test('canonical time formatting is exact and parseable', () => {
  assert.equal(formatTime(rat(3, 2)), '1.5s');
  assert.equal(formatTime(rat(1, 3)), '1/3s');
  assert.equal(formatTime(formatTimeToRational('0.1s')), '0.1s');
  assert.equal(formatTime(parseTime('00:01:02.250')), '62.25s');
  assert.equal(formatTimecode(rat(3, 2)), '00:00:01.500');
});

function formatTimeToRational(text: string) {
  return parseTime(text);
}

test('frame rates are exact rationals', () => {
  assert.deepEqual(parseFrameRate('30000/1001'), rat(30000, 1001));
  assert.deepEqual(parseFrameRate('29.97'), rat(2997, 100));
  assert.equal(formatRate(rat(30000, 1001)), '30000/1001');
  assert.equal(formatRate(rat(30)), '30');
});

test('rational arithmetic is exact', () => {
  assert.deepEqual(add(rat(1, 3), rat(1, 6)), rat(1, 2));
  assert.deepEqual(sub(rat(1, 3), rat(1, 3)), ZERO);
  assert.ok(eq(rat(2, 4), rat(1, 2)));
});
