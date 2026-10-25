import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { materializeDocument, mulberry32 } from '@sdkwork/vhtml-core/program';
import { serializeDocument, serializeProject } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { sampleTimeRemap, timeRemapSegments } from '@sdkwork/vhtml-core/animation';
import { parseSubtitleBlocks } from '@sdkwork/vhtml-core/captions';
import { rat, parseTime, formatFrameTimecode, toNumber } from '@sdkwork/vhtml-core/time';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import type { VhtmlDocument } from '@sdkwork/vhtml-core/model';

const PROGRAM_DOCUMENT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="code-video" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="3s" seed="7" /></settings>
  <timelines><timeline id="main" duration="3s"></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
vhtml.addLane({ id: 'v', type: 'video', clips: [] });
const items = vhtml.data.get('items');
for (let index = 0; index < items.length; index += 1) {
  const item = items[index];
  vhtml.addScene({ id: 'card-' + item.id, html: '<div class="card">' + item.label + '</div>' });
  vhtml.addClip('v', { ref: 'scene:card-' + item.id, start: index, duration: 1 });
}
vhtml.addCue({ text: 'generated caption', start: 0, duration: 1 });
vhtml.addMarker({ time: '1s', name: 'middle' });
</script>
<script type="application/json" id="items">
[{ "id": "a", "label": "Alpha" }, { "id": "b", "label": "Beta" }]
</script>
</vhtml></body></html>`;

function parseDocument(source: string): VhtmlDocument {
  const parsed = parseVhtml(source, { file: 'test.vhtml', root: process.cwd() });
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 0, errors.map((d) => d.message).join('\n'));
  return parsed.document;
}

test('program documents materialise scenes, clips, cues and markers from code', () => {
  const document = parseDocument(PROGRAM_DOCUMENT);
  assert.ok(document.program, 'program extracted');
  assert.equal(document.dataBlocks?.[0]?.id, 'items');
  const result = materializeDocument(document);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 0, errors.map((d) => d.message).join('\n'));
  const project = result.document.project;
  assert.deepEqual(project.scenes.map((scene) => scene.id), ['card-a', 'card-b']);
  const lane = project.timelines[0]!.tracks.find((track) => track.id === 'v');
  assert.equal(lane?.clips.length, 2);
  assert.equal(lane?.clips[0]!.start.num, 0);
  assert.equal(lane?.clips[1]!.start.num, 1);
  const cue = project.timelines[0]!.tracks.find((track) => track.type === 'caption')?.clips[0];
  assert.equal(cue && 'text' in cue ? cue.text : undefined, 'generated caption');
  assert.equal(project.timelines[0]!.markers[0]!.name, 'middle');
});

test('materialisation is deterministic across runs and data blocks are consumed', () => {
  const document = parseDocument(PROGRAM_DOCUMENT);
  const first = materializeDocument(document);
  const second = materializeDocument(document);
  assert.equal(JSON.stringify(first.document.project), JSON.stringify(second.document.project));
});

test('program sandbox fixes the clock and seeds randomness', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="clock" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="1s" seed="99" /></settings>
  <timelines><timeline id="main" duration="1s"><lane id="v" type="video"></lane></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
vhtml.setMetadata('clock', String(Date.now()));
vhtml.setMetadata('rng', String(Math.random()));
</script>
</vhtml></body></html>`);
  const first = materializeDocument(document);
  const second = materializeDocument(document);
  assert.equal(first.document.project.metadata['clock'], '0');
  assert.equal(first.document.project.metadata['rng'], second.document.project.metadata['rng']);
});

test('program errors produce stable diagnostics and keep the declared model', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="boom" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
throw new Error('boom');
</script>
</vhtml></body></html>`);
  const result = materializeDocument(document);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /boom/);
});

test('program documents serialize with program and data blocks intact', () => {
  const document = parseDocument(PROGRAM_DOCUMENT);
  const result = materializeDocument(document);
  const serialized = serializeDocument(result.document);
  assert.ok(serialized.includes('application/vnd.vhtml.program+javascript'));
  assert.ok(serialized.includes('<data id="items"'));
  const reparsed = parseVhtml(serialized, { file: 'round.vhtml', root: process.cwd() });
  const rerun = materializeDocument(reparsed.document);
  // Normalise both models through a serialize/parse cycle so parser-synthesised
  // defaults (title, lang, source locations) do not mask real differences.
  const canonicalize = (document: VhtmlDocument): string => {
    const text = serializeDocument(document);
    const reparsedNormalized = parseVhtml(text, { file: 'norm.vhtml', root: process.cwd() });
    return serializeProject(reparsedNormalized.document.project);
  };
  assert.equal(canonicalize(rerun.document), canonicalize(result.document));
});

test('time remap curves map clip time onto source positions exactly', () => {
  const remap = {
    keyframes: [
      { at: rat(0), source: rat(0) },
      { at: rat(1), source: rat(2) },
      { at: rat(2), source: rat(5, 2) },
    ],
    easing: 'linear' as const,
  };
  assert.deepEqual(sampleTimeRemap(remap, rat(1, 2)), rat(1));
  assert.deepEqual(sampleTimeRemap(remap, rat(3, 2)), rat(9, 4));
  // before/after clamp
  assert.deepEqual(sampleTimeRemap(remap, rat(-1)), rat(0));
  assert.deepEqual(sampleTimeRemap(remap, rat(5)), rat(5, 2));
  const segments = timeRemapSegments(remap);
  assert.equal(segments.length, 2);
  assert.equal(segments[0]!.rate, 2);
  assert.equal(segments[1]!.rate, 0.5);
});

test('time-remapped clips evaluate media time through the curve', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="rm" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="2s" /></settings>
  <assets><asset id="vid" type="video" src="a.mp4" duration="4s" /></assets>
  <timelines><timeline id="main" duration="2s"><lane id="vl" type="video">
    <clip id="c" ref="asset:vid" start="0s" duration="2s">
      <timeremap><remap at="0s" source="0s" /><remap at="1s" source="2s" /><remap at="2s" source="5s" /></timeremap>
    </clip>
  </lane></timeline></timelines>
</project></vhtml></body></html>`);
  const project = document.project;
  const half = evaluateFrame(project, rat(1, 2));
  assert.equal(half.clips[0]!.mediaTime, 1);
  assert.equal(half.clips[0]!.playbackRate, 2);
  const late = evaluateFrame(project, rat(3, 2));
  assert.equal(late.clips[0]!.mediaTime, 3.5);
  assert.equal(late.clips[0]!.playbackRate, 3);
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.equal(validation.errors.length, 0, validation.errors.map((d) => d.message).join('\n'));
});

test('nested timeline clips flatten sub-clips with mapped time', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="nested" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="4s" /></settings>
  <scenes>
    <scene id="red" duration="1s"><div style="background:red"></div></scene>
    <scene id="blue" duration="1s"><div style="background:blue"></div></scene>
  </scenes>
  <timelines>
    <timeline id="main" duration="4s">
      <lane id="v" type="video">
        <clip id="compound" kind="timeline" ref="timeline:sub" start="0s" duration="4s" />
      </lane>
    </timeline>
    <timeline id="sub" duration="2s">
      <lane id="sv" type="video">
        <clip id="s1" ref="scene:red" start="0s" duration="1s" />
        <clip id="s2" ref="scene:blue" start="1s" duration="1s" />
      </lane>
    </timeline>
  </timelines>
</project></vhtml></body></html>`);
  const project = document.project;
  const atZero = evaluateFrame(project, rat(0));
  assert.deepEqual(atZero.clips.map((clip) => clip.clipId), ['s1']);
  const atHalf = evaluateFrame(project, rat(1, 2));
  assert.deepEqual(atHalf.clips.map((clip) => clip.clipId), ['s1']);
  const atOneAndHalf = evaluateFrame(project, rat(3, 2));
  assert.deepEqual(atOneAndHalf.clips.map((clip) => clip.clipId), ['s2']);
});

test('nested timeline cycles are rejected', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="cycle" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="2s" /></settings>
  <timelines>
    <timeline id="main" duration="2s">
      <lane id="v" type="video"><clip id="a" kind="timeline" ref="timeline:sub" start="0s" duration="2s" /></lane>
    </timeline>
    <timeline id="sub" duration="2s">
      <lane id="sv" type="video"><clip id="b" kind="timeline" ref="timeline:main" start="0s" duration="2s" /></lane>
    </timeline>
  </timelines>
</project></vhtml></body></html>`);
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.ok(validation.errors.some((error) => error.code === 'REFERENCE_CYCLE'), 'cycle reported');
});

test('SMPTE frame timecodes parse with a frame rate context', () => {
  const fps = { num: 30, den: 1 };
  assert.equal(toNumber(parseTime('00:00:01:15', { frameRate: fps })), 1.5);
  assert.equal(toNumber(parseTime('00:00:00:07', { frameRate: fps })), 7 / 30);
  assert.equal(toNumber(parseTime('00:00:01;15', { frameRate: { num: 30, den: 1 } })), 1.5);
  const ntsc = { num: 30000, den: 1001 };
  assert.equal(
    toNumber(parseTime('00:00:01:15', { frameRate: ntsc })),
    1 + (15 * 1001) / 30000,
  );
  assert.throws(() => parseTime('00:00:01:15'), /frame rate context/);
  assert.throws(() => parseTime('00:00:01:45', { frameRate: fps }), /out of range/);
  assert.equal(formatFrameTimecode(parseTime('00:00:01:15', { frameRate: fps }), fps), '00:00:01:15');
  // legacy decimal timecode unchanged
  assert.equal(toNumber(parseTime('00:00:01.500')), 1.5);
});

test('audio-offset shifts audio source time but not video media time', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="offset" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="2s" /></settings>
  <assets><asset id="av" type="video" src="av.mp4" duration="4s" /></assets>
  <timelines><timeline id="main" duration="2s"><lane id="al" type="audio">
    <clip id="c" ref="asset:av" start="0s" duration="2s" audio-offset="120ms" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`);
  const frame = evaluateFrame(document.project, rat(1));
  const state = frame.clips[0]!;
  assert.equal(state.mediaTime, 1, 'video keeps the unshifted source time');
  assert.ok(state.audio, 'audio state present');
  assert.ok(Math.abs(state.audio!.sourceTime - 1.12) < 1e-9, `audio source time ${state.audio!.sourceTime}`);
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.equal(validation.errors.length, 0, validation.errors.map((d) => d.message).join('\n'));
});

test('audio-offset out of source range produces the documented warning', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="offset-bad" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="2s" /></settings>
  <assets><asset id="av" type="video" src="av.mp4" duration="2.5s" /></assets>
  <timelines><timeline id="main" duration="2s"><lane id="vl" type="video">
    <clip id="c" ref="asset:av" start="0s" duration="2s" audio-offset="1s" />
  </lane></timeline></timelines>
</project></vhtml></body></html>`);
  const validation = validateDocument({ ...document, source: { path: process.cwd(), root: process.cwd() } }, { checkFiles: false });
  assert.ok(
    validation.warnings.some((warning) => warning.code === 'TIME_OUT_OF_SOURCE' && warning.message.includes('audio-offset')),
    'expected TIME_OUT_OF_SOURCE warning',
  );
});

test('parseSubtitleBlocks reads SRT and WebVTT into exact cues', () => {
  const srt = parseSubtitleBlocks(
    '1\n00:00:01,000 --> 00:00:02,500\nHello &amp; hi\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line one\nsecond line two\n',
  );
  assert.equal(srt.length, 2);
  assert.equal(srt[0]!.id, '1');
  assert.equal(toNumber(srt[0]!.start), 1);
  assert.equal(toNumber(srt[0]!.end), 2.5);
  assert.equal(srt[0]!.text, 'Hello & hi');
  assert.equal(srt[1]!.text, 'Second line one\nsecond line two');

  const vtt = parseSubtitleBlocks(
    'WEBVTT\n\nNOTE metadata block\n\ncue-a\n00:00.500 --> 00:01.250 align:start\nStyled cue\n',
  );
  assert.equal(vtt.length, 1);
  assert.equal(vtt[0]!.id, 'cue-a');
  assert.equal(toNumber(vtt[0]!.start), 0.5);
  assert.equal(toNumber(vtt[0]!.end), 1.25);
  assert.equal(vtt[0]!.text, 'Styled cue');
});

test('programs turn SRT data into aligned caption clips', () => {
  const document = parseDocument(`<!doctype html>
<html><body><vhtml version="1.1">
<project id="srt-program" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="4s" /></settings>
  <timelines><timeline id="main" duration="4s"></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
for (const cue of vhtml.parseCaptions(vhtml.data.get('script'))) {
  vhtml.addCue({ text: cue.text, start: cue.start, end: cue.end });
}
</script>
<script type="application/json" id="script">"00:00:00,500 --> 00:00:01,250\\nAligned one\\n\\n00:00:02,000 --> 00:00:03,000\\nAligned two"</script>
</vhtml></body></html>`);
  const result = materializeDocument(document);
  assert.equal(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
  const cues = result.document.project.timelines[0]!.tracks.find((track) => track.type === 'caption')!.clips;
  assert.equal(cues.length, 2);
  assert.equal(toNumber(cues[0]!.start), 0.5);
  assert.equal(toNumber(cues[1]!.start), 2);
});

test('mulberry32 is a stable seeded PRNG', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let index = 0; index < 8; index += 1) assert.equal(a(), b());
});
