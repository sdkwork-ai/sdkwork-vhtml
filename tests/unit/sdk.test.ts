import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defineVideo,
  clip,
  lane,
  animate,
  caption,
  transition,
  effect,
  html,
} from '@sdkwork/vhtml-sdk';
import { validateVideo } from '@sdkwork/vhtml-sdk';
import { serializeVideoDocument } from '@sdkwork/vhtml-sdk';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';

const project = defineVideo({
  id: 'sdk-test',
  width: 640,
  height: 360,
  fps: '30/1',
  duration: '4s',
  background: '#05070d',
  styles: ['.stage{color:#6ee7ff}'],
  generations: [
    {
      id: 'bg',
      kind: 'video',
      provider: 'procedural',
      prompt: 'test background',
      constraints: { duration: '4s', width: 640, height: 360 },
    },
  ],
  scenes: [
    {
      id: 'intro',
      duration: '4s',
      css: '.stage{position:absolute;inset:0;display:grid;place-items:center;font:700 48px system-ui}',
      html: html`<div class="stage">SDK ${'works'}</div>`,
    },
  ],
  lanes: [
    lane('video', 'bg-lane', [clip('gen:bg', { id: 'bg-clip', start: 0, duration: '4s' })]),
    lane(
      'video',
      'story',
      [
        clip('scene:intro', {
          id: 'intro-clip',
          start: 0,
          duration: '4s',
          effects: [effect('vignette', { amount: 0.4 })],
          animations: [animate({ property: 'opacity', from: 0, to: 1, duration: '0.5s' })],
        }),
        clip('scene:intro', {
          id: 'intro-clip-2',
          start: 3.5,
          duration: '0.5s',
        }),
      ],
      {
        transitions: [transition('intro-clip', 'intro-clip-2', { type: 'fade', duration: '0.5s' })],
      },
    ),
  ],
  captions: [caption('SDK captions', '0.5s', { duration: '2s' })],
  outputs: [{ format: 'mp4', path: 'out/sdk.mp4' }],
});

test('SDK builds a valid project from code', () => {
  validateVideo(project);
  const validation = validateDocument(
    { specVersion: '1.1', project },
    { root: process.cwd(), checkFiles: false },
  );
  assert.equal(validation.errors.length, 0);
  assert.equal(project.scenes.length, 1);
  assert.equal(project.timelines[0]!.tracks.length, 3);
  assert.equal(project.timelines[0]!.tracks[1]!.transitions[0]!.type, 'fade');
  assert.deepEqual(project.timelines[0]!.tracks[1]!.clips.map((entry) => entry.kind), ['scene', 'scene']);
});

test('SDK output serializes and parses back to an equivalent project', () => {
  const text = serializeVideoDocument(project);
  const parsed = parseVhtml(text, { file: 'D:/tmp/sdk-test.vhtml' });
  assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  assert.equal(parsed.document.project.id, 'sdk-test');
  assert.equal(parsed.document.project.timelines[0]!.tracks[0]!.clips.length, 1);
  assert.equal(parsed.document.project.generations[0]!.constraints.duration?.num, 4);
  const validation = validateDocument(parsed.document, { root: 'D:/tmp', checkFiles: false });
  assert.equal(validation.errors.length, 0);
});

test('SDK emits external Scene src without inlining fragment content', () => {
  const external = defineVideo({
    id: 'external-sdk',
    width: 320,
    height: 180,
    fps: 30,
    duration: '1s',
    scenes: [{ id: 'intro', src: 'scenes/intro.html' }],
    lanes: [lane('video', 'visual', [clip('scene:intro', { start: 0, duration: '1s' })])],
  });
  assert.equal(external.scenes[0]!.src, 'scenes/intro.html');
  assert.equal(external.scenes[0]!.html, '');
  const text = serializeVideoDocument(external);
  assert.match(text, /<scene[^>]*src="scenes\/intro\.html"/);
  assert.doesNotMatch(text, /intro\.html[^>]*>\s*<div/);
});
