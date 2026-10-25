import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';

function projectWithClip(clipXml: string): string {
  return `<!doctype html><html><body><vhtml version="1.1">
<project id="crop-test" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="2s" /></settings>
  <scenes><scene id="s" duration="2s"><div style="position:absolute;inset:0;background:#224488"></div></scene></scenes>
  <timelines><timeline id="main" duration="2s"><lane id="v" type="video">${clipXml}</lane></timeline></timelines>
</project></vhtml></body></html>`;
}

function frameOf(projectSource: string) {
  const parsed = parseVhtml(projectSource, { file: 'test.vhtml', root: process.cwd() });
  const frame = evaluateFrame(parsed.document.project, { num: 500_000, den: 1_000_000 });
  assert.ok(frame.clips.length >= 1, 'clip is active in the frame');
  return frame;
}

test('crop renders as an inset clip-path region reveal', () => {
  const frame = frameOf(projectWithClip('<clip id="c" ref="s" start="0s" duration="2s"><crop left="10%" top="25%" right="30%" bottom="5%" /></clip>'));
  assert.equal(frame.clips[0]!.style.clipPath, 'inset(25% 30% 5% 10%)');
});

test('fractional crop attributes are accepted like percentages', () => {
  const frame = frameOf(projectWithClip('<clip id="c" ref="s" start="0s" duration="2s"><crop left="0.1" right="0.1" top="0" bottom="0" /></clip>'));
  assert.equal(frame.clips[0]!.style.clipPath, 'inset(0% 10% 0% 10%)');
});

test('clips without crop render without a clip-path', () => {
  const frame = frameOf(projectWithClip('<clip id="c" ref="s" start="0s" duration="2s" />'));
  assert.equal(frame.clips[0]!.style.clipPath, undefined);
});

test('a mask effect owns the clip-path channel and the conflict is explicit', () => {
  const frame = frameOf(projectWithClip(
    '<clip id="c" ref="s" start="0s" duration="2s"><effect type="mask" shape="circle" /><crop left="10%" right="10%" top="10%" bottom="10%" /></clip>',
  ));
  assert.equal(frame.clips[0]!.style.clipPath, 'circle(50% at 50% 50%)');
  assert.ok(frame.issues.some((issue) => issue.includes('crop') && issue.includes('mask')), 'explicit crop/mask conflict issue');
});
