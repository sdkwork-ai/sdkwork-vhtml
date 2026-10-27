import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { ErrorCode } from '@sdkwork/vhtml-core/errors';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { frameCacheKey, openFrameCache, pruneFrameCache } from '@sdkwork/vhtml-media/frame-cache';

function parse(source: string) {
  return parseVhtml(source, { file: 'round12.vhtml', root: process.cwd() });
}

const BASE_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round12" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="1s" /></settings>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="1s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="1s"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('output downmix parses, round-trips and rejects unknown policies', () => {
  const parsed = parse(BASE_PROJECT.replace(
    '</timelines>',
    '</timelines>\n<outputs><output id="mono" format="wav" downmix="mono" path="renders/m.wav"></output><output id="stereo" format="wav" path="renders/s.wav"></output></outputs>',
  ));
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const outputs = parsed.document.project.outputs;
  assert.equal(outputs[0]!.downmix, 'mono');
  assert.equal(outputs[1]!.downmix, undefined);

  const bad = parse(BASE_PROJECT.replace(
    '</timelines>',
    '</timelines>\n<outputs><output id="bad" format="wav" downmix="quad" path="renders/q.wav"></output></outputs>',
  ));
  assert.ok(bad.diagnostics.some((d) => d.code === ErrorCode.VALIDATION_INVALID_VALUE && d.message.includes('downmix')));

  const reparsed = parse(serializeDocument(parsed.document));
  assert.equal(reparsed.document.project.outputs[0]!.downmix, 'mono');
});

test('storyboard shots parse review records with history (last review is current)', () => {
  const withReviews = BASE_PROJECT.replace(
    '</timelines>',
    `</timelines>
<storyboard>
  <shot id="s1" title="Boarded shot" status="boarded" duration="1s">
    <description>Opening card.</description>
    <review status="changes-requested" reviewer="ana" reviewed-at="2026-10-20T10:00:00Z">too dark</review>
    <review status="approved" reviewer="bo" reviewed-at="2026-10-21T09:00:00Z">fixed contrast</review>
  </shot>
</storyboard>`,
  );
  const parsed = parse(withReviews);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const shot = parsed.document.project.storyboard![0]!;
  assert.equal(shot.review?.status, 'approved');
  assert.equal(shot.review?.reviewer, 'bo');
  assert.equal(shot.reviewHistory?.length, 1);
  assert.equal(shot.reviewHistory![0]!.status, 'changes-requested');
  assert.equal(shot.reviewHistory![0]!.reviewer, 'ana');

  const reparsed = parse(serializeDocument(parsed.document));
  const roundTripped = reparsed.document.project.storyboard![0]!;
  assert.equal(roundTripped.review?.status, 'approved');
  assert.equal(roundTripped.reviewHistory?.length, 1);
});

test('storyboard.review edit op appends the previous review to history', () => {
  const withReviews = BASE_PROJECT.replace(
    '</timelines>',
    `</timelines>
<storyboard>
  <shot id="s1" title="Shot" status="boarded" duration="1s">
    <review status="approved" reviewer="ana"></review>
  </shot>
</storyboard>`,
  );
  const parsed = parse(withReviews);
  const result = applyEditOperations(parsed.document.project, [
    { op: 'storyboard.review', shotId: 's1', review: { status: 'changes-requested', reviewer: 'bo', notes: 'reframe the card' } },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const shot = result.project.storyboard![0]!;
  assert.equal(shot.review?.status, 'changes-requested');
  assert.equal(shot.review?.reviewer, 'bo');
  assert.equal(shot.reviewHistory?.length, 1);
  assert.equal(shot.reviewHistory![0]!.status, 'approved');

  const rejected = applyEditOperations(parsed.document.project, [
    { op: 'storyboard.review', shotId: 'missing', review: { status: 'approved' } },
  ]);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.some((d) => d.code === ErrorCode.EDIT_TARGET_NOT_FOUND));

  const invalid = applyEditOperations(parsed.document.project, [
    { op: 'storyboard.review', shotId: 's1', review: { status: 'total-mess' } as never },
  ]);
  assert.equal(invalid.ok, false);
});

test('frame cache key is stable for identical projects and changes on edits', () => {
  const projectA = parse(BASE_PROJECT).document.project;
  const projectB = parse(BASE_PROJECT).document.project;
  const keyOptions = {
    root: process.cwd(),
    timelineId: 'main',
    fps: projectA.composition.frameRate,
    rangeStart: { num: 0, den: 1 },
    rangeDuration: { num: 1, den: 1 },
    renderer: { headless: true },
  };
  const keyA = frameCacheKey(projectA, keyOptions);
  assert.equal(keyA, frameCacheKey(projectB, keyOptions), 'identical projects share one key');

  const edited = applyEditOperations(projectA, [{ op: 'clip.set', clipId: 'c', props: { opacity: 0.5 } }]);
  assert.notEqual(keyA, frameCacheKey(edited.project, keyOptions), 'an edit changes the key');

  assert.notEqual(
    keyA,
    frameCacheKey(projectA, { ...keyOptions, rangeDuration: { num: 1, den: 2 } }),
    'range changes the key',
  );
  assert.notEqual(
    keyA,
    frameCacheKey(projectA, { ...keyOptions, renderer: { headless: true, sandbox: false } }),
    'renderer fingerprint changes the key',
  );
});

test('frame cache reads/writes frames and prunes old keys inside the cache root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-framecache-'));
  try {
    const cacheA = openFrameCache(root, 'key-a');
    assert.equal(cacheA.read(0), undefined, 'empty cache misses');
    cacheA.write(0, Buffer.from('png-0'));
    cacheA.write(1, Buffer.from('png-1'));
    const reread = openFrameCache(root, 'key-a');
    assert.deepEqual(reread.read(1)?.toString(), 'png-1', 'frames survive across cache opens');
    assert.equal(reread.hits, 1);
    assert.equal(reread.misses, 0);

    // Refresh ignores reads but keeps writes.
    const refresh = openFrameCache(root, 'key-a', { refresh: true });
    assert.equal(refresh.read(0), undefined);
    refresh.write(0, Buffer.from('png-0-new'));
    assert.equal(openFrameCache(root, 'key-a').read(0)?.toString(), 'png-0-new');

    for (const key of ['key-b', 'key-c', 'key-d', 'key-e']) {
      const cache = openFrameCache(root, key);
      cache.write(0, Buffer.from('x'));
    }
    const removed = pruneFrameCache(root, 3);
    const remaining = fs.readdirSync(root).sort();
    assert.equal(remaining.length, 3, `prune keeps the newest keys: ${remaining.join(',')}`);
    assert.ok(remaining.includes('key-e'), 'newest key survives');
    assert.ok(!remaining.includes('key-a'), 'oldest key pruned');
    assert.equal(removed.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validation accepts mono downmix and review-carrying shots without errors', () => {
  const parsed = parse(BASE_PROJECT.replace(
    '</timelines>',
    `</timelines>
<outputs><output id="mono" format="wav" downmix="mono" path="renders/m.wav"></output></outputs>
<storyboard><shot id="s1" status="boarded" duration="1s"><review status="pending"></review></shot></storyboard>`,
  ));
  const report = validateDocument(parsed.document, { checkFiles: false });
  assert.equal(report.ok, true, report.diagnostics.map((d) => d.message).join('\n'));
});
