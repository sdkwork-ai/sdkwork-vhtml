import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import type { EditOperation } from '@sdkwork/vhtml-core/edits';
import { findClip } from '@sdkwork/vhtml-core/model';
import type { Animation } from '@sdkwork/vhtml-core/model';
import { rat, toNumber } from '@sdkwork/vhtml-core/time';

const SOURCE = `<project id="inv-test" version="1.1"><settings><composition width="640" height="360" frame-rate="30/1" duration="10s" /></settings>
<assets><asset id="media" type="video" src="./m.mp4" duration="10s" /><asset id="short" type="video" src="./s.mp4" duration="2s" /><asset id="music" type="audio" src="./mu.mp3" duration="10s" /><asset id="pic" type="image" src="./p.png" /></assets>
<scenes><scene id="s" duration="4s"><div>Hello</div></scene></scenes>
<timelines><timeline id="main" duration="10s">
<lane id="v" type="video"><clip id="a" ref="s" start="0s" duration="4s" /></lane>
<lane id="aud" type="audio"><clip id="m1" ref="media" start="0s" duration="4s" in="1s" /></lane>
</timeline></timelines></project>`;

function load() {
  const result = parseVhtml(SOURCE, { file: 'D:/tmp/inv.vhtml' });
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  return result.document.project;
}

function apply(project: ReturnType<typeof load>, operations: EditOperation[]) {
  return applyEditOperations(project, operations);
}

function opacityAnimation(id: string, startSeconds: number, durationSeconds: number): Animation {
  return {
    id,
    property: 'opacity',
    start: rat(Math.round(startSeconds * 1_000_000), 1_000_000),
    duration: rat(Math.round(durationSeconds * 1_000_000), 1_000_000),
    timeBase: 'clip',
    easing: 'linear',
    iterations: 1,
    direction: 'normal',
    fill: 'both',
    compose: 'replace',
    enabled: true,
    keyframes: [
      { time: rat(0), value: 0 },
      { time: rat(Math.round(durationSeconds * 1_000_000), 1_000_000), value: 1 },
    ],
  };
}

test('batch stops at the first failing child and applies no later siblings', () => {
  const project = load();
  const result = apply(project, [
    {
      op: 'batch',
      operations: [
        { op: 'clip.trim', clipId: 'missing', start: '1s' },
        { op: 'clip.set', clipId: 'a', props: { opacity: 0.5 } },
      ],
    },
  ]);
  assert.equal(result.ok, false);
  const clip = findClip(result.project, 'a')!.clip;
  assert.equal(clip.opacity, 1, 'the sibling after the failing op must not be applied');
});

test('moveBatch moves a linked pair exactly once', () => {
  const project = load();
  const linked = apply(project, [
    { op: 'clip.add', trackId: 'aud', clip: { ...makeAudioClip('a1'), start: rat(0), duration: rat(4) } },
    { op: 'clip.link', clipIds: ['a', 'a1'] },
  ]);
  assert.equal(linked.ok, true, linked.diagnostics.map((d) => d.message).join('; '));
  const moved = apply(linked.project, [{ op: 'timeline.moveBatch', clipIds: ['a', 'a1'], start: '2s' }]);
  assert.equal(moved.ok, true, moved.diagnostics.map((d) => d.message).join('; '));
  assert.equal(toNumber(findClip(moved.project, 'a')!.clip.start), 2);
  assert.equal(toNumber(findClip(moved.project, 'a1')!.clip.start), 2, 'the linked partner must shift by the same delta exactly once');
});

test('clip.move link-follow rejects a partner that would start before zero', () => {
  const project = load();
  const linked = apply(project, [
    { op: 'clip.add', trackId: 'aud', clip: { ...makeAudioClip('a1'), start: rat(0), duration: rat(4) } },
    { op: 'clip.move', clipId: 'a', start: rat(500_000, 1_000_000) },
    { op: 'clip.link', clipIds: ['a', 'a1'] },
  ]);
  assert.equal(linked.ok, true);
  const moved = apply(linked.project, [{ op: 'clip.move', clipId: 'a', start: rat(0) }]);
  assert.equal(moved.ok, false, 'delta -0.5s would push the audio partner before the timeline start');
});

test('freeze on a reversed clip freezes the boundary frame', () => {
  const project = load();
  const result = apply(project, [
    { op: 'clip.speed', clipId: 'm1', speed: 1, reverse: true },
    { op: 'clip.freeze', clipId: 'm1', at: '1s' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('; '));
  const right = findClip(result.project, 'm1-b')!.clip;
  // m1 plays [1s..5s] in reverse; after 1s of reversed playback from the end
  // the boundary frame sits at source position 4s, not the window head 1s.
  assert.equal(right.reverse, true);
  assert.ok(right.freeze, 'freeze must be set');
  assert.equal(toNumber(right.freeze!), 4);
});

test('replace onto a shorter source clamps without collapsing the clip', () => {
  const project = load();
  // in-point past the new source end: window restarts at the head.
  const past = apply(project, [
    { op: 'clip.add', trackId: 'v', clip: { id: 'v2', kind: 'video', ref: 'short', start: rat(0), duration: rat(2), sourceIn: rat(5), speed: rat(1), reverse: false, enabled: true, z: 0, opacity: 1, blend: 'normal', fit: 'cover', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0.5, anchorY: 0.5 }, effects: [], animations: [], volume: 1, pan: 0, audioEffects: [] } },
    { op: 'clip.replace', clipId: 'v2', ref: 'short' },
  ]);
  assert.equal(past.ok, true, past.diagnostics.map((d) => d.message).join('; '));
  const pastClip = findClip(past.project, 'v2')!.clip;
  assert.equal(toNumber(pastClip.sourceIn), 0);
  assert.equal(toNumber(pastClip.duration), 2);
  // in=1s window=2s onto a 2s source: window clamps to 1s.
  const clamp = apply(project, [
    { op: 'clip.add', trackId: 'v', clip: { id: 'v3', kind: 'video', ref: 'media', start: rat(0), duration: rat(2), sourceIn: rat(1), speed: rat(1), reverse: false, enabled: true, z: 0, opacity: 1, blend: 'normal', fit: 'cover', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0.5, anchorY: 0.5 }, effects: [], animations: [], volume: 1, pan: 0, audioEffects: [] } },
    { op: 'clip.replace', clipId: 'v3', ref: 'short' },
  ]);
  assert.equal(clamp.ok, true);
  const clampClip = findClip(clamp.project, 'v3')!.clip;
  assert.equal(toNumber(clampClip.duration), 1);
  assert.equal(toNumber(clampClip.sourceOut!), 2);
});

test('split of a retimed scene clip advances the source window by duration * speed', () => {
  const project = load();
  const result = apply(project, [
    { op: 'clip.speed', clipId: 'a', speed: 2 },
    { op: 'clip.split', clipId: 'a', at: '1s' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('; '));
  const right = findClip(result.project, 'a-b')!.clip;
  assert.equal(toNumber(right.sourceIn), 2, '1s of project time at 2x consumes 2s of scene time');
});

test('trim rescales fades that no longer fit the shortened clip', () => {
  const project = load();
  const result = apply(project, [
    { op: 'clip.set', clipId: 'a', props: { fadeIn: 3, fadeOut: 3 } },
    { op: 'clip.trim', clipId: 'a', start: rat(0), end: rat(2) },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('; '));
  const clip = findClip(result.project, 'a')!.clip;
  assert.equal(toNumber(clip.duration), 2);
  assert.ok(clip.fadeIn && clip.fadeOut);
  assert.equal(toNumber(clip.fadeIn) + toNumber(clip.fadeOut), 2, 'fadeIn + fadeOut must stay <= duration');
});

test('clip.set ref revalidates the reference type', () => {
  const project = load();
  // m1 is a video clip (parser infers the kind from the referenced asset):
  // swapping in an audio source must be rejected.
  const incompatible = apply(project, [{ op: 'clip.set', clipId: 'm1', props: { ref: 'music' } }]);
  assert.equal(incompatible.ok, false);
  assert.ok(incompatible.diagnostics.some((d) => d.code === 'REFERENCE_INCOMPATIBLE'));
  const audioClipIncompatible = apply(project, [
    { op: 'clip.add', trackId: 'aud', clip: { ...makeAudioClip('a9'), ref: 'music' } },
    { op: 'clip.set', clipId: 'a9', props: { ref: 'pic' } },
  ]);
  assert.equal(audioClipIncompatible.ok, false);
  assert.ok(audioClipIncompatible.diagnostics.some((d) => d.code === 'REFERENCE_INCOMPATIBLE'));
  const missing = apply(project, [{ op: 'clip.set', clipId: 'm1', props: { ref: 'asset:nope' } }]);
  assert.equal(missing.ok, false);
  assert.ok(missing.diagnostics.some((d) => d.code === 'REFERENCE_NOT_FOUND'));
  const compatible = apply(project, [{ op: 'clip.set', clipId: 'm1', props: { ref: 'short' } }]);
  assert.equal(compatible.ok, true, compatible.diagnostics.map((d) => d.message).join('; '));
  assert.equal(findClip(compatible.project, 'm1')!.clip.ref, 'short');
});

test('duplicate retargets copied animation clipIds and drops the linkId', () => {
  const project = load();
  const prepared = apply(project, [
    { op: 'animation.add', clipId: 'a', animation: opacityAnimation('an-a', 0, 1) },
    { op: 'clip.set', clipId: 'a', props: { metadata: { linkId: 'pair-1' } } },
  ]);
  assert.equal(prepared.ok, true);
  const result = apply(prepared.project, [{ op: 'clip.duplicate', clipId: 'a' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('; '));
  const copy = findClip(result.project, 'a-copy')!.clip;
  assert.equal(copy.animations.length, 1);
  assert.equal(copy.animations[0]!.clipId, 'a-copy', 'copied animations must target the copy');
  assert.equal(copy.animations[0]!.id, 'an-a-of-a-copy');
  assert.equal(copy.metadata?.linkId, undefined, 'a duplicate is an independent clip');
  assert.equal(findClip(result.project, 'a')!.clip.metadata?.linkId, 'pair-1', 'the original keeps its link');
});

test('trim of a remapped clip follows the curve instead of the linear window', () => {
  const project = load();
  const prepared = apply(project, [
    {
      op: 'clip.timeremap',
      clipId: 'm1',
      keyframes: [
        { at: '1s', source: '2s' },
        { at: '2s', source: '4s' },
      ],
    },
  ]);
  assert.equal(prepared.ok, true, prepared.diagnostics.map((d) => d.message).join('; '));
  const result = apply(prepared.project, [{ op: 'clip.trim', clipId: 'm1', start: '1s', end: '3s' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('; '));
  const clip = findClip(result.project, 'm1')!.clip;
  assert.equal(toNumber(clip.start), 1);
  assert.equal(toNumber(clip.duration), 2);
  // Local zero now maps to old local 1s, i.e. source 3s (window started at in=1s).
  assert.equal(toNumber(clip.sourceIn), 3);
  const keyframes = clip.timeRemap!.keyframes;
  assert.equal(toNumber(keyframes[0]!.at), 0);
  assert.equal(toNumber(keyframes[0]!.source), 0);
  assert.equal(toNumber(keyframes[1]!.at), 1);
  assert.equal(toNumber(keyframes[1]!.source), 2);
  // The tail is clamped at the new end with the original curve's value.
  assert.equal(toNumber(keyframes[keyframes.length - 1]!.at), 2);
});

test('clip.speed preserves an authored source window', () => {
  const project = load();
  const prepared = apply(project, [
    { op: 'clip.trim', clipId: 'm1', start: rat(0), duration: rat(2) },
    { op: 'clip.slip', clipId: 'm1', delta: rat(1) },
  ]);
  assert.equal(prepared.ok, true, prepared.diagnostics.map((d) => d.message).join('; '));
  const before = findClip(prepared.project, 'm1')!.clip;
  assert.equal(toNumber(before.sourceIn), 2);
  assert.equal(toNumber(before.sourceOut!), 4);
  const result = apply(prepared.project, [{ op: 'clip.speed', clipId: 'm1', speed: 2 }]);
  assert.equal(result.ok, true);
  const clip = findClip(result.project, 'm1')!.clip;
  assert.equal(toNumber(clip.duration), 1, '2x over the same 2s window halves the project duration');
  assert.equal(toNumber(clip.sourceIn), 2);
  assert.equal(toNumber(clip.sourceOut!), 4, 'the source window must not grow');
});

test('split of an animation with start > 0 keeps keyframe positions on both sides', () => {
  const project = load();
  const prepared = apply(project, [
    { op: 'animation.add', clipId: 'a', animation: opacityAnimation('an-a', 1, 2) },
  ]);
  assert.equal(prepared.ok, true, prepared.diagnostics.map((d) => d.message).join('; '));
  const result = apply(prepared.project, [{ op: 'clip.split', clipId: 'a', at: '2s' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('; '));
  const right = findClip(result.project, 'a-b')!.clip;
  assert.equal(right.animations.length, 1);
  const rightAnim = right.animations[0]!;
  assert.equal(toNumber(rightAnim.start), 0);
  assert.equal(toNumber(rightAnim.duration), 1, 'the animation spans clip-local 1s..3s, cut at 2s');
  const times = rightAnim.keyframes.map((keyframe) => toNumber(keyframe.time));
  const values = rightAnim.keyframes.map((keyframe) => keyframe.value);
  assert.deepEqual(times, [0, 1]);
  assert.deepEqual(values, [0.5, 1], 'the right half starts at the boundary value 0.5');
  const left = findClip(result.project, 'a')!.clip;
  const leftAnim = left.animations[0]!;
  assert.equal(toNumber(leftAnim.duration), 1);
  assert.equal(toNumber(leftAnim.keyframes[leftAnim.keyframes.length - 1]!.time), 1);
  assert.equal(leftAnim.keyframes[leftAnim.keyframes.length - 1]!.value, 0.5);
});

function makeAudioClip(id: string) {
  return {
    id,
    kind: 'audio' as const,
    ref: 'media',
    start: rat(0),
    duration: rat(4),
    sourceIn: rat(0),
    speed: rat(1),
    reverse: false,
    enabled: true,
    z: 0,
    opacity: 1,
    blend: 'normal' as const,
    fit: 'cover' as const,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0.5, anchorY: 0.5 },
    effects: [] as never[],
    animations: [] as Animation[],
    volume: 1,
    pan: 0,
    audioEffects: [] as never[],
  };
}
