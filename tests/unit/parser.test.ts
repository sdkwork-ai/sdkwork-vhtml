import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';

const DOC = `<!doctype html>
<html><head><title>Fixture</title><style>body{background:#000}</style></head>
<body><vhtml version="1.1"><project id="fixture" version="1.1" title="Fixture">
<settings><composition width="640" height="360" frame-rate="30/1" duration="4s" background="#05070d" /></settings>
<assets>
  <asset id="a" type="image" src="./a.png" width="640" height="360" />
  <asset id="b" type="video" src="./b.mp4" duration="4s" />
  <asset id="m" type="audio" src="./m.wav" duration="4s" />
</assets>
<scenes>
  <scene id="intro" duration="2s">
    <style>.hero{color:#6ee7ff}</style>
    <div class="hero"><h1>Hello</h1></div>
    <script>window.introRan = true;</script>
  </scene>
  <scene id="outro"><div style="color:white">Bye</div></scene>
</scenes>
<timelines><timeline id="main" duration="4s">
  <lane id="visuals" type="video" order="0">
    <clip id="c1" ref="a" start="0s" duration="4s" />
    <clip id="c2" ref="scene:intro" start="1s" duration="2s" opacity="0.9">
      <transform scale="1.1" y="10%" />
      <animate property="opacity" from="0" to="1" start="0s" duration="0.5s" />
      <effect type="vignette" amount="0.5" />
    </clip>
    <transition from="c1" to="c2" type="crossfade" duration="0.5s" />
  </lane>
  <lane id="captions" type="caption" order="1" caption-style="font-size:36px">
    <cue id="cue1" start="0.5s" duration="2s" text="Write code." speaker="narrator" />
  </lane>
  <lane id="music" type="audio" order="2">
    <clip id="m1" ref="m" start="0s" duration="4s" volume="-6dB" fade-in="0.5s" />
  </lane>
</timeline></timelines>
<generate id="gen" kind="image" provider="procedural"><prompt>cover</prompt><constraints width="640" height="360" /></generate>
<output id="final" format="mp4" width="640" height="360" frame-rate="30/1" />
</project></vhtml></body></html>`;

test('parses VHTML with self-closing tags, scenes, transitions, cues and generations', () => {
  const { document, diagnostics } = parseVhtml(DOC, { file: 'D:/tmp/fixture.vhtml' });
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  const project = document.project;
  assert.equal(project.assets.length, 3);
  assert.equal(project.scenes.length, 2);
  assert.equal(project.scenes[0]!.css, '.hero{color:#6ee7ff}');
  assert.match(project.scenes[0]!.html, /class="hero"/);
  assert.doesNotMatch(project.scenes[0]!.html, /<script>/);
  assert.equal(project.scenes[0]!.scripts?.length, 1);
  assert.equal(project.timelines[0]!.tracks.length, 3);
  const visual = project.timelines[0]!.tracks[0]!;
  assert.equal(visual.clips.length, 2);
  assert.equal(visual.clips[1]!.kind, 'scene');
  assert.equal(visual.clips[1]!.animations.length, 1);
  assert.equal(visual.transitions.length, 1);
  assert.equal(project.timelines[0]!.tracks[1]!.clips[0]!.kind, 'caption');
  assert.equal(project.generations[0]!.id, 'gen');
  assert.equal(project.outputs[0]!.format, 'mp4');
  assert.equal(project.styles.length, 1);
});

test('serializes a canonical document and round-trips semantic fields', () => {
  const { document } = parseVhtml(DOC, { file: 'D:/tmp/fixture.vhtml' });
  const output = serializeDocument(document);
  assert.match(output, /<project id="fixture"/);
  assert.match(output, /<lane id="visuals"/);
  assert.doesNotMatch(output, /<asset[^>]*\/>/);
  const second = parseVhtml(output, { file: 'D:/tmp/fixture2.vhtml' });
  assert.equal(second.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  const a = document.project;
  const b = second.document.project;
  assert.deepEqual(
    a.assets.map((asset) => [asset.id, asset.kind, asset.src, asset.duration]),
    b.assets.map((asset) => [asset.id, asset.kind, asset.src, asset.duration]),
  );
  assert.deepEqual(
    a.timelines[0]!.tracks.map((track) => [track.id, track.type, track.clips.map((clip) => [clip.id, clip.kind, clip.start, clip.duration, clip.sourceIn, clip.sourceOut])]),
    b.timelines[0]!.tracks.map((track) => [track.id, track.type, track.clips.map((clip) => [clip.id, clip.kind, clip.start, clip.duration, clip.sourceIn, clip.sourceOut])]),
  );
  assert.equal(b.timelines[0]!.tracks[0]!.transitions[0]!.type, 'crossfade');
  assert.equal(b.scenes[0]!.scripts?.length, 1);
});

test('legacy track and caption elements are diagnosed clearly', () => {
  const legacy = `<project id="legacy" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings><timelines><timeline id="main"><track id="v"><clip id="c" ref="x" start="0s" duration="1s" /></track></timeline></timelines></project>`;
  const { diagnostics } = parseVhtml(legacy, { file: 'D:/tmp/legacy.vhtml' });
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'PARSE_HTML_AMBIGUITY' && /<lane>/.test(diagnostic.message)));
});

test('validator accepts the fixture and reports missing generated assets', () => {
  const { document } = parseVhtml(DOC, { file: 'D:/tmp/fixture.vhtml' });
  const result = validateDocument(document, { root: 'D:/tmp', checkFiles: false });
  assert.equal(result.errors.length, 0);
  assert.ok(result.diagnostics.some((diagnostic) => /generation/.test(diagnostic.message)));
});
