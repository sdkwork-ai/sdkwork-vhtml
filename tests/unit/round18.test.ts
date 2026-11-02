import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { buildStageHtml } from '@sdkwork/vhtml-runtime/stage';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string, file = 'round18.vhtml') {
  return parseVhtml(source, { file, root: process.cwd() });
}

function project(lanes: string) {
  return `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round18" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes>
    <scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene>
    <scene id="badge" duration="1s"><div style="position:absolute;inset:20%;background:#fa0">badge</div></scene>
  </scenes>
  <timelines><timeline id="main" duration="1s">
${lanes}
  </timeline></timelines>
</project>
</vhtml></body></html>`;
}

const ADJUSTMENT_LAYER = project(`
    <lane id="v" type="video">
      <clip id="c" ref="scene:card" start="0s" duration="1s"></clip>
      <effect id="lane-grade" type="adjust" contrast="40" temperature="30" vignette="50" />
    </lane>
    <lane id="top" type="overlay" order="1">
      <clip id="b" ref="scene:badge" start="0s" duration="1s"></clip>
      <effect type="blur" amount="6" />
    </lane>
    <lane id="subs" type="caption"><cue id="cue" start="0s" duration="1s" text="hi" /></lane>`);

test('lane-level <effect> parses into Track.effects, validates and round-trips through the serializer', () => {
  const parsed = parse(ADJUSTMENT_LAYER);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => d.message).join('\n'));
  const lane = parsed.document.project.timelines[0]!.tracks.find((track) => track.id === 'v')!;
  assert.equal(lane.effects?.length, 1);
  assert.equal(lane.effects![0]!.type, 'adjust');
  assert.equal(lane.effects![0]!.params.contrast, 40);
  const validation = validateDocument(parsed.document);
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));

  const serialized = serializeDocument(parsed.document);
  assert.match(serialized, /<lane id="v"[^>]*>[\s\S]*<effect[^>]*type="adjust"[^>]*contrast="40"/);
  const reparsed = parse(serialized, 'round18-roundtrip.vhtml');
  const again = reparsed.document.project.timelines[0]!.tracks.find((track) => track.id === 'v')!;
  assert.deepEqual(again.effects!.map((fx) => [fx.type, fx.params.contrast, fx.params.temperature]), [['adjust', 40, 30]]);
});

test('lane effects on non-visual lanes are rejected by the parser', () => {
  const bad = project(`
    <lane id="subs" type="caption">
      <cue id="cue" start="0s" duration="1s" text="hi" />
      <effect type="blur" amount="3" />
    </lane>`);
  const parsed = parse(bad, 'round18-bad.vhtml');
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  assert.ok(errors.some((d) => /adjustment layer/.test(d.message)), errors.map((d) => d.message).join('\n'));
});

test('evaluateFrame emits adjustment layers at the top of each lane band and leaves clips untouched', () => {
  const parsed = parse(ADJUSTMENT_LAYER);
  const frame = evaluateFrame(parsed.document.project, { num: 1, den: 2 });
  assert.equal(frame.trackEffects.length, 2);
  const grade = frame.trackEffects.find((lane) => lane.trackId === 'v')!;
  const top = frame.trackEffects.find((lane) => lane.trackId === 'top')!;
  assert.equal(grade.zIndex, 999, 'bottom lane layer rides above its own clips (z 0..998)');
  assert.equal(top.zIndex, 1999, 'overlay lane layer rides in the next band');
  assert.ok(grade.filter.includes('contrast(1.2)'), grade.filter);
  assert.ok(grade.filter.includes('feColorMatrix'), 'temperature rides the SVG chain on the lane too');
  assert.equal(grade.overlays.length, 1, 'vignette renders as a lane overlay');
  assert.ok(top.filter.startsWith('blur(6px)'), top.filter);
  const clip = frame.clips.find((candidate) => candidate.clipId === 'c')!;
  assert.equal(clip.style.filter, 'none', 'lane effects never leak into the clip filter');
  assert.equal(clip.style.zIndex, 0);
  const cue = frame.clips.find((candidate) => candidate.clipId === 'cue')!;
  assert.ok(cue.style.zIndex >= 900_000, 'captions stay above every adjustment layer');
});

test('stage markup carries one adjustment-layer host per visual lane', () => {
  const parsed = parse(ADJUSTMENT_LAYER);
  const html = buildStageHtml({ project: parsed.document.project, mode: 'preview', runtimeSource: '', includeAudio: false });
  assert.ok(html.includes('class="vhtml-track-fx" data-track-id="v"'));
  assert.ok(html.includes('class="vhtml-track-fx" data-track-id="top"'));
  assert.ok(!html.includes('data-track-id="subs"'), 'caption lanes host no adjustment layer');
});

const PLAIN = project(`
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>`);

test('adjust.<param> keyframes drive the adjust chain over time, with or without a base effect', () => {
  const parsed = parse(PLAIN);
  // Keyframed temperature on a clip that has NO adjust effect: the runtime
  // evaluates the channel over an implicit zero base.
  const keyed = applyEditOperations(parsed.document.project, [{
    op: 'clip.set',
    clipId: 'c',
    props: {
      animations: [{
        id: 'kf-temp', property: 'adjust.temperature', timeBase: 'clip', start: 0, duration: 1,
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }],
        easing: 'linear', iterations: 1, direction: 'normal', fill: 'both', compose: 'replace', enabled: true,
      }],
    },
  } as never]);
  const validation = validateDocument({ specVersion: '1.1', project: keyed.project });
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));
  const start = evaluateFrame(keyed.project, { num: 0, den: 1 }).clips.find((clip) => clip.clipId === 'c')!;
  const late = evaluateFrame(keyed.project, { num: 9, den: 10 }).clips.find((clip) => clip.clipId === 'c')!;
  assert.equal(start.style.filter, 'none', 'temperature 0 at t=0 renders nothing');
  assert.ok(late.style.filter.includes('feColorMatrix'), `temperature ramps in (${late.style.filter.slice(0, 60)})`);

  // Additive channel on top of an authored slider: brightness 20 + add 40 → 60 → ×1.3.
  const additive = applyEditOperations(parsed.document.project, [
    { op: 'effect.add', clipId: 'c', effect: { id: 'fx-adjust', type: 'adjust', params: { brightness: 20 }, enabled: true } },
    {
      op: 'clip.set', clipId: 'c',
      props: {
        animations: [{
          id: 'kf-bright', property: 'adjust.brightness', timeBase: 'clip', start: 0, duration: 1,
          keyframes: [{ time: 0, value: 40 }, { time: 1, value: 40 }],
          easing: 'linear', iterations: 1, direction: 'normal', fill: 'both', compose: 'add', enabled: true,
        }],
      },
    },
  ] as never[]);
  const mid = evaluateFrame(additive.project, { num: 1, den: 2 }).clips.find((clip) => clip.clipId === 'c')!;
  assert.ok(mid.style.filter.includes('brightness(1.3)'), mid.style.filter);
});

test('Studio ships round-10 surfaces: adjustment layer, adjust keyframes, text animations, colour space', () => {
  for (const marker of [
    'renderLaneAdjustmentPanel',
    'previewTrack',
    'Adjustment layer (调节层)',
    'lane-fx-badge',
    'kf-toggle',
    "'adjust.' + name",
    'writeAdjustKeyframe',
    'isAnimatableClip',
    'set-colorspace',
    'display-p3',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-10 marker: ${marker}`);
  }
});
