import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { ErrorCode, type VhtmlError } from '@sdkwork/vhtml-core/errors';
import { findBible, resolveReference } from '@sdkwork/vhtml-core/model';
import { defineVideo, character, styleGuide, extension } from '@sdkwork/vhtml-sdk';
import { bibleInputsFor, buildVendorPayload } from '@sdkwork/vhtml-generation/vendors';

function parse(source: string) {
  return parseVhtml(source, { file: 'bibles.vhtml', root: process.cwd() });
}

const BIBLE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="bibles" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <characters>
    <character id="mika" version="3" name="Mika">
      <description>A silver-haired courier in a teal flight jacket.</description>
      <negative>no glasses, no hat</negative>
      <reference ref="asset:sheet" role="reference-image"></reference>
    </character>
    <style-guide id="noir" version="1">
      <description>High-contrast noir with rain-slick streets.</description>
      <reference ref="asset:board" role="style"></reference>
    </style-guide>
  </characters>
  <assets>
    <asset id="sheet" type="image" src="sheet.png"></asset>
    <asset id="board" type="image" src="board.png"></asset>
  </assets>
  <generations>
    <generate id="shot" kind="image" provider="procedural">
      <prompt>Mika delivers a parcel at dawn.</prompt>
      <gen-input ref="character:mika" role="character"></gen-input>
      <gen-input ref="style:noir" role="style"></gen-input>
    </generate>
  </generations>
  <timelines><timeline id="main" duration="1s"><lane id="v" type="video"></lane></timeline></timelines>
</project>
</vhtml></body></html>`;

test('bibles parse with references, negative text and versions', () => {
  const parsed = parse(BIBLE_PROJECT);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const bibles = parsed.document.project.bibles ?? [];
  assert.equal(bibles.length, 2);
  const mika = bibles[0]!;
  assert.equal(mika.kind, 'character');
  assert.equal(mika.version, 3);
  assert.equal(mika.name, 'Mika');
  assert.equal(mika.negative, 'no glasses, no hat');
  assert.deepEqual(mika.references, [{ ref: 'asset:sheet', role: 'reference-image' }]);
  const noir = bibles[1]!;
  assert.equal(noir.kind, 'style');
});

test('character:/style: references resolve and validate against the bible library', () => {
  const parsed = parse(BIBLE_PROJECT);
  const project = parsed.document.project;
  const mika = findBible(project, 'mika');
  assert.ok(mika, 'findBible resolves by id');
  const resolved = resolveReference(project, 'character:mika');
  assert.equal(resolved?.kind, 'bible');
  assert.equal(resolveReference(project, 'style:noir')?.kind, 'bible');
  const validation = validateDocument(parsed.document, { checkFiles: false });
  assert.equal(validation.ok, true, validation.diagnostics.map((d) => d.message).join('\n'));

  const missing = parse(BIBLE_PROJECT.replace('ref="character:mika"', 'ref="character:ghost"'));
  const report = validateDocument(missing.document, { checkFiles: false });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((d) => d.code === ErrorCode.REFERENCE_NOT_FOUND && d.message.includes('character:ghost')));
});

test('bible references that point at missing assets fail validation', () => {
  const parsed = parse(BIBLE_PROJECT.replace('ref="asset:sheet"', 'ref="asset:gone"'));
  const report = validateDocument(parsed.document, { checkFiles: false });
  assert.ok(report.errors.some((d) => d.code === ErrorCode.REFERENCE_NOT_FOUND && d.message.includes('"mika"')));
});

test('serialization round-trips the bible library', () => {
  const parsed = parse(BIBLE_PROJECT);
  const reparsed = parse(serializeDocument(parsed.document));
  const bibles = reparsed.document.project.bibles ?? [];
  assert.equal(bibles.length, 2);
  assert.equal(bibles[0]!.kind, 'character');
  assert.equal(bibles[0]!.version, 3);
  assert.equal(bibles[0]!.negative, 'no glasses, no hat');
  assert.equal(bibles[1]!.kind, 'style');
});

test('generation cache key and vendor payload include bible profiles', () => {
  const project = parse(BIBLE_PROJECT).document.project;
  const task = project.generations[0]!;
  const resolved = bibleInputsFor(task, project);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0]![1].id, 'mika');
  assert.equal(resolved[1]![1].kind, 'style');

  const payload = buildVendorPayload(task, project, {
    resolveSrc: (p, ref) => {
      const resolved = resolveReference(p, ref);
      return resolved?.kind === 'asset' ? { src: resolved.asset.src, mimeType: resolved.asset.mimeType } : undefined;
    },
  });
  const bibles = payload.bibles as Array<Record<string, unknown>>;
  assert.equal(bibles.length, 2);
  assert.equal(bibles[0]!.kind, 'character');
  assert.equal(bibles[0]!.version, 3);
  assert.equal(bibles[0]!.negative, 'no glasses, no hat');
  assert.equal((bibles[0]!.references as Array<Record<string, unknown>>)[0]!.src, 'sheet.png');
});

test('SDK builders build bibles into the project library', () => {
  const project = defineVideo({
    id: 'bible-sdk',
    width: 320,
    height: 180,
    duration: '1s',
    characters: [character({ id: 'mika', version: 3, description: 'courier' })],
    styleGuides: [styleGuide({ id: 'noir', description: 'noir' })],
    generations: [{
      id: 'shot',
      kind: 'image',
      prompt: 'Mika at dawn',
      inputs: [{ ref: 'character:mika', role: 'character' }],
    }],
    lanes: [{ id: 'v', type: 'video', clips: [] }],
  });
  assert.equal(project.bibles?.length, 2);
  assert.equal(project.bibles?.[0]!.kind, 'character');
  assert.equal(project.bibles?.[0]!.version, 3);
  assert.equal(project.bibles?.[1]!.kind, 'style');
  assert.equal(project.generations[0]!.inputs[0]!.ref, 'character:mika');
  const extensionDeclaration = extension({ name: 'vhs', kind: 'effect', base: 'blur', params: { amount: 12 } });
  assert.equal(extensionDeclaration.kind, 'effect');
  assert.equal(extensionDeclaration.base, 'blur');
});

test('generate with an unknown bible id fails before any provider call', async () => {
  const parsed = parse(BIBLE_PROJECT.replace('ref="character:mika"', 'ref="character:ghost"'));
  const { materializeGenerations } = await import('@sdkwork/vhtml-generation');
  await assert.rejects(
    materializeGenerations({ project: parsed.document.project, root: process.cwd() }),
    (error: VhtmlError) => error.code === ErrorCode.REFERENCE_NOT_FOUND || error.code === ErrorCode.GENERATION_PROVIDER_ERROR,
  );
});
