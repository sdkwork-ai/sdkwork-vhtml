import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { clipEnd, findClip } from '@sdkwork/vhtml-core/model';
import { frameCount, toNumber } from '@sdkwork/vhtml-core/time';
import { loadSchema } from '@sdkwork/vhtml-schema';
import { materializeDocument } from '@sdkwork/vhtml-core/program';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';

const ROOT = path.resolve('conformance');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')) as {
  cases: Array<{
    id: string;
    kind: string;
    file: string;
    operations?: unknown[];
    expect: Record<string, unknown>;
  }>;
};
const SCHEMA = loadSchema('model');
const ajv = new Ajv2020({ strict: false, allErrors: true });
const validateSchema = ajv.compile(SCHEMA);

function load(file: string) {
  const absolute = path.join(ROOT, file);
  const parsed = parseVhtml(fs.readFileSync(absolute, 'utf8'), { file: absolute, root: path.dirname(absolute) });
  return parsed;
}

test('conformance: self-closing project parses, validates and matches the schema', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'parse-self-closing')!;
  const parsed = load(item.file);
  const validation = validateDocument(parsed.document, { root: path.dirname(path.join(ROOT, item.file)), checkFiles: false });
  assert.equal(validation.errors.length, item.expect.errors as number);
  assert.equal(parsed.document.project.assets.length, item.expect.assets as number);
  assert.equal(parsed.document.project.timelines[0]!.tracks[0]!.clips.length, item.expect.clips as number);
  assert.equal(validateSchema({ specVersion: '1.1', project: parsed.document.project }), true, JSON.stringify(validateSchema.errors));
});

test('conformance: legacy <track> produces the documented error code', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'legacy-track')!;
  const parsed = load(item.file);
  assert.ok(parsed.diagnostics.some((diagnostic) => diagnostic.code === item.expect.errorCode));
});

test('conformance: external Scene fragments rebase assets and validate', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'external-scene')!;
  const parsed = load(item.file);
  const scene = parsed.document.project.scenes[0]!;
  assert.equal(scene.src, item.expect.sceneSrc);
  assert.ok(scene.html.includes(item.expect.rebased as string));
  const validation = validateDocument(parsed.document, {
    root: path.dirname(path.join(ROOT, item.file)),
    checkFiles: true,
  });
  assert.equal(validation.errors.length, item.expect.errors as number);
  assert.equal(validateSchema({ specVersion: '1.1', project: parsed.document.project }), true, JSON.stringify(validateSchema.errors));
});

test('conformance: frame boundaries are exact', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'timing-boundary')!;
  const parsed = load(item.file);
  const project = parsed.document.project;
  const validation = validateDocument(parsed.document, {
    root: path.dirname(path.join(ROOT, item.file)),
    checkFiles: false,
  });
  assert.equal(validation.errors.length, 0);
  assert.equal(frameCount(project.composition.duration, project.composition.frameRate), item.expect.frames);
  const clip = project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.equal(toNumber(clipEnd(clip)), 1);
  assert.equal(validateSchema({ specVersion: '1.1', project }), true, JSON.stringify(validateSchema.errors));
});

test('conformance: split, ripple delete and transition produce the documented model', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'editing-split-ripple')!;
  const parsed = load(item.file);
  const result = applyEditOperations(parsed.document.project, item.operations as never[], { strict: false });
  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  const ids = result.project.timelines[0]!.tracks[0]!.clips.map((clip) => clip.id);
  assert.deepEqual(ids.sort(), (item.expect.clips as string[]).sort());
  assert.equal(findClip(result.project, 'a-b')!.clip.start.num, 0);
  assert.equal(result.project.timelines[0]!.tracks[0]!.transitions.length, 1);
});

test('conformance: authoring programs materialise deterministically', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'authoring-program')!;
  const parsed = load(item.file);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, item.expect.errors as number);
  assert.ok(parsed.document.program);
  const first = materializeDocument(parsed.document);
  const second = materializeDocument(parsed.document);
  const errors = first.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 0, errors.map((d) => d.message).join('\n'));
  assert.equal(first.document.project.scenes.length, item.expect.scenes as number);
  assert.equal(first.document.project.timelines[0]!.tracks[0]!.clips.length, item.expect.clips as number);
  assert.equal(
    JSON.stringify(first.document.project) === JSON.stringify(second.document.project),
    item.expect.deterministic as boolean,
  );
});

test('conformance: time remap evaluates media time through the curve', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'timing-timeremap')!;
  const parsed = load(item.file);
  const project = parsed.document.project;
  const half = evaluateFrame(project, { num: 1, den: 2 });
  assert.equal(half.clips[0]!.mediaTime, item.expect.mediaTimeHalf as number);
  const late = evaluateFrame(project, { num: 3, den: 2 });
  assert.equal(late.clips[0]!.mediaTime, item.expect.mediaTimeLate as number);
  const validation = validateDocument(parsed.document, { root: path.dirname(path.join(ROOT, item.file)), checkFiles: false });
  assert.equal(validation.errors.length, 0);
  assert.equal(validateSchema({ specVersion: '1.1', project }), true, JSON.stringify(validateSchema.errors));
});

test('conformance: splitting a time-remapped clip splits the curve', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'editing-timeremap-split')!;
  const parsed = load(item.file);
  const result = applyEditOperations(parsed.document.project, item.operations as never[], { strict: false });
  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  const ids = result.project.timelines[0]!.tracks[0]!.clips.map((clip) => clip.id);
  assert.deepEqual(ids.sort(), (item.expect.clips as string[]).sort());
  const right = result.project.timelines[0]!.tracks[0]!.clips.find((clip) => clip.id === 'ramp-b')!;
  assert.equal(toNumber(right.sourceIn), item.expect.rightSourceIn as number);
  assert.ok(right.timeRemap?.keyframes.length);
});

test('conformance: frame timecodes and audio offsets address the same timeline', () => {
  const item = MANIFEST.cases.find((entry) => entry.id === 'timing-av-sync')!;
  const parsed = load(item.file);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, item.expect.errors as number);
  const clip = parsed.document.project.timelines[0]!.tracks[0]!.clips[0]!;
  assert.ok(Math.abs(toNumber(clip.start) - (item.expect.clipStartSeconds as number)) < 1e-9, `start ${toNumber(clip.start)}`);
  const frame = evaluateFrame(parsed.document.project, { num: 1, den: 1 });
  const audio = frame.clips[0]!.audio;
  assert.ok(audio, 'audio state present');
  assert.ok(Math.abs(audio!.sourceTime - (item.expect.audioSourceTimeAtOne as number)) < 1e-9, `audio ${audio!.sourceTime}`);
  const validation = validateDocument(parsed.document, { root: path.dirname(path.join(ROOT, item.file)), checkFiles: false });
  assert.equal(validation.errors.length, 0);
  assert.equal(validateSchema({ specVersion: '1.1', project: parsed.document.project }), true, JSON.stringify(validateSchema.errors));
});
