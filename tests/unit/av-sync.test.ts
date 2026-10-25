import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { rat, toNumber } from '@sdkwork/vhtml-core/time';

function parseDocument(source: string) {
  const parsed = parseVhtml(source, { file: 'sync.vhtml', root: process.cwd() });
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 0, errors.map((d) => d.message).join('\n'));
  return parsed.document;
}

test('compound clips shift all inner audio by their audio-offset', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="wrap-offset" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="2s" /></settings>
  <assets><asset id="tone" type="audio" src="a.wav" duration="4s" /></assets>
  <timelines>
    <timeline id="main" duration="2s"><lane id="v" type="video">
      <clip id="wrap" kind="timeline" ref="timeline:sub" start="0s" duration="2s" audio-offset="0.25s" />
    </lane></timeline>
    <timeline id="sub" duration="2s"><lane id="sa" type="audio">
      <clip id="inner" ref="asset:tone" start="0s" duration="2s" />
    </lane></timeline>
  </timelines>
</project></vhtml></body></html>`);
  const frame = evaluateFrame(document.project, rat(1));
  const inner = frame.clips.find((clip) => clip.clipId === 'inner')!;
  assert.ok(inner.audio, 'inner audio state present');
  assert.ok(
    Math.abs(inner.audio!.sourceTime - 1.25) < 1e-9,
    `inner sourceTime ${inner.audio!.sourceTime}`,
  );
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.equal(validation.errors.length, 0);
  assert.equal(
    validation.warnings.filter((warning) => warning.message.includes('audio-offset')).length,
    0,
    'timeline clips legitimately carry audio-offset',
  );
});

test('scene and nested-timeline clips evaluate time remaps like media clips', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="scene-remap" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="4s" /></settings>
  <scenes><scene id="anim" duration="4s"><div>a</div></scene></scenes>
  <timelines><timeline id="main" duration="4s"><lane id="v" type="video">
    <clip id="c" ref="scene:anim" start="0s" duration="4s">
      <timeremap>
        <remap at="0s" source="0s" />
        <remap at="2s" source="3s" />
        <remap at="4s" source="3.5s" />
      </timeremap>
    </clip>
  </lane></timeline></timelines>
</project></vhtml></body></html>`);
  // t=1 on the 0->3s ramp over 0..2s: scene time 1.5
  const early = evaluateFrame(document.project, rat(1));
  const earlyState = early.clips[0]!;
  assert.ok(Math.abs(earlyState.sceneTime - 1.5) < 1e-6, `sceneTime ${earlyState.sceneTime}`);
  // t=3 on the 3s->3.5s ramp over 2..4s: scene time 3.25
  const late = evaluateFrame(document.project, rat(3));
  assert.ok(Math.abs(late.clips[0]!.sceneTime - 3.25) < 1e-6, `sceneTime ${late.clips[0]!.sceneTime}`);
});

test('leaf audio offsets compose multiplicatively through wrapper chains', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="stacked-offset" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="4s" /></settings>
  <assets><asset id="tone" type="audio" src="a.wav" duration="8s" /></assets>
  <timelines>
    <timeline id="main" duration="4s"><lane id="v" type="video">
      <clip id="wrap" kind="timeline" ref="timeline:sub" start="1s" duration="3s" audio-offset="0.1s" />
    </lane></timeline>
    <timeline id="sub" duration="4s"><lane id="sv" type="video">
      <clip id="mid" kind="timeline" ref="timeline:leaf" start="0s" duration="4s" audio-offset="0.2s" />
    </lane></timeline>
    <timeline id="leaf" duration="4s"><lane id="la" type="audio">
      <clip id="tone-clip" ref="asset:tone" start="0s" duration="4s" audio-offset="0.3s" />
    </lane></timeline>
  </timelines>
</project></vhtml></body></html>`);
  // t=1: wrapper local 0 -> sub time 0 -> leaf local 0.
  // Offsets sum along the audio path: 0.1 (wrap) + 0.2 (mid) + 0.3 (leaf) = 0.6.
  const frame = evaluateFrame(document.project, rat(1));
  const leaf = frame.clips.find((clip) => clip.clipId === 'tone-clip')!;
  assert.ok(leaf.audio, 'leaf audio present');
  assert.ok(
    Math.abs(leaf.audio!.sourceTime - 0.6) < 1e-9,
    `stacked sourceTime ${leaf.audio!.sourceTime}`,
  );
});

test('frame timecode starts compose with audio-offset in one clip', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="tc-offset" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30000/1001" duration="3s" /></settings>
  <assets><asset id="av" type="video" src="av.mp4" duration="6s" /></assets>
  <timelines><timeline id="main" duration="3s"><lane id="a" type="audio">
    <clip id="c" ref="asset:av" start="00:00:01:15" duration="1s" audio-offset="-0.05s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`);
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.equal(validation.errors.length, 0, validation.errors.map((d) => d.message).join('\n'));
  const start = toNumber(document.project.timelines[0]!.tracks[0]!.clips[0]!.start);
  assert.ok(Math.abs(start - (1 + (15 * 1001) / 30000)) < 1e-9, `start ${start}`);
  const frame = evaluateFrame(document.project, rat(2));
  const state = frame.clips[0]!;
  // local time = 2 - 1.5005 = 0.4995; audio = 0.4995 - 0.05 = 0.4495
  assert.ok(Math.abs(state.audio!.sourceTime - 0.4495) < 1e-6, `audio ${state.audio!.sourceTime}`);
});
