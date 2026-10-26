import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { ErrorCode } from '@sdkwork/vhtml-core/errors';
import { materializeGenerations, type GenerationProvider } from '@sdkwork/vhtml-generation';

function parse(source: string) {
  return parseVhtml(source, { file: 'usage.vhtml', root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="usage" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"><lane id="v" type="video"></lane></timeline></timelines>
  <generations>
    <generate id="t1" kind="text" provider="fake">
      <prompt>first</prompt>
      <usage cost="0.5" currency="USD" credits="3" tokens="120" compute-seconds="2.5" output-bytes="64"></usage>
    </generate>
    <generate id="t2" kind="text" provider="fake">
      <prompt>second</prompt>
    </generate>
  </generations>
</project>
</vhtml></body></html>`;

/** Fake provider returning the RFC-0013 envelope with provider-reported usage. */
function fakeProvider(): GenerationProvider {
  return {
    id: 'fake',
    kinds: ['text', 'image'],
    async generate() {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-usage-')), 'out.txt');
      fs.writeFileSync(file, 'generated');
      return {
        files: [{ path: file, kind: 'data' as const }],
        usage: { cost: 0.25, currency: 'USD', tokens: 80 },
        providerJobId: 'job-42',
      };
    },
  };
}

function textTaskRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-usage-root-'));
}

test('usage records parse, validate and round-trip through serialization', () => {
  const parsed = parse(BASE_PROJECT);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const task = parsed.document.project.generations[0]!;
  assert.equal(task.usage?.cost, 0.5);
  assert.equal(task.usage?.currency, 'USD');
  assert.equal(task.usage?.credits, 3);
  assert.equal(task.usage?.tokens, 120);
  assert.equal(task.usage?.computeSeconds, 2.5);
  assert.equal(task.usage?.outputBytes, 64);
  const validation = validateDocument(parsed.document, { checkFiles: false });
  assert.equal(validation.ok, true, validation.diagnostics.map((d) => d.message).join('\n'));

  const serialized = serializeDocument(parsed.document);
  const reparsed = parse(serialized);
  const roundTripped = reparsed.document.project.generations[0]!.usage;
  assert.equal(roundTripped?.cost, 0.5);
  assert.equal(roundTripped?.currency, 'USD');
  assert.equal(roundTripped?.credits, 3);
  assert.equal(roundTripped?.tokens, 120);
  assert.equal(roundTripped?.computeSeconds, 2.5);
  assert.equal(roundTripped?.outputBytes, 64);
});

test('cost without a currency raises a validation warning', () => {
  const parsed = parse(BASE_PROJECT.replace('cost="0.5" currency="USD"', 'cost="0.5"'));
  const validation = validateDocument(parsed.document, { checkFiles: false });
  assert.ok(
    validation.warnings.some((d) => d.code === ErrorCode.VALIDATION_INVALID_VALUE && d.message.includes('currency')),
    'expected a currency warning',
  );
});

test('materializeGenerations records observed + provider usage and a run summary', async () => {
  const root = textTaskRoot();
  try {
    const parsed = parse(BASE_PROJECT);
    const result = await materializeGenerations({
      project: parsed.document.project,
      root,
      providers: [fakeProvider()],
    });
    assert.deepEqual(result.ran, ['t1', 't2']);
    const task = result.project.generations[0]!;
    assert.equal(task.usage?.cost, 0.25, 'provider-reported usage wins');
    assert.equal(task.usage?.tokens, 80);
    assert.equal(task.usage?.computeSeconds !== undefined, true, 'observed computeSeconds recorded');
    assert.ok((task.usage?.outputBytes ?? 0) > 0, 'observed outputBytes recorded');
    assert.equal(task.providerJobId, 'job-42');
    assert.equal(result.usage?.cost, 0.5, 'two tasks at 0.25 each');
    assert.equal(result.usage?.tasks.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('quota ceilings stop further provider calls with GENERATION_QUOTA_EXCEEDED', async () => {
  const root = textTaskRoot();
  try {
    const parsed = parse(BASE_PROJECT);
    await assert.rejects(
      materializeGenerations({
        project: parsed.document.project,
        root,
        providers: [fakeProvider()],
        // Each run costs 0.25; the cap must stop the second provider call.
        quota: { maxCost: 0.2, currency: 'USD' },
      }),
      (error: { code?: string }) => error.code === ErrorCode.GENERATION_QUOTA_EXCEEDED,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
