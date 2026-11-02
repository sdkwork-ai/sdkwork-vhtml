import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

function parse(source: string, file = 'round21.vhtml') {
  return parseVhtml(source, { file, root: process.cwd() });
}

const PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="round21" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="4s" /></settings>
  <assets><asset id="tone" kind="audio" src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" /></assets>
  <scenes><scene id="card" duration="4s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="4s">
    <lane id="v" type="video"><clip id="c" ref="scene:card" start="0s" duration="4s"></clip></lane>
    <lane id="a" type="audio"><clip id="voice" ref="tone" kind="audio" start="0s" duration="2s" speed="2" pitch-follows-speed="true"></clip></lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('pitch-follows-speed parses, validates, round-trips and drives the preview audio state', () => {
  const parsed = parse(PROJECT);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => d.message).join('\n'));
  const voice = parsed.document.project.timelines[0]!.tracks.find((track) => track.id === 'a')!.clips[0]!;
  assert.equal(voice.pitchFollowsSpeed, true);
  const validation = validateDocument(parsed.document);
  assert.equal(validation.errors.length, 0, validation.errors.map((issue) => issue.message).join('\n'));

  const serialized = serializeDocument(parsed.document);
  assert.match(serialized, /pitch-follows-speed(?:="true")?[\s>]/);
  const again = parse(serialized, 'round21-roundtrip.vhtml').document.project.timelines[0]!.tracks.find((track) => track.id === 'a')!.clips[0]!;
  assert.equal(again.pitchFollowsSpeed, true);

  const tape = evaluateFrame(parsed.document.project, { num: 1, den: 1 }).clips.find((clip) => clip.clipId === 'voice')!;
  assert.equal(tape.audio!.rate, 2);
  assert.equal(tape.audio!.preservesPitch, false, '变调 previews with preservesPitch=false');

  const stretched = applyEditOperations(parsed.document.project, [{ op: 'clip.set', clipId: 'voice', props: { pitchFollowsSpeed: false } } as never]);
  const voiceAfter = stretched.project.timelines[0]!.tracks.find((track) => track.id === 'a')!.clips[0]!;
  assert.equal(voiceAfter.pitchFollowsSpeed, undefined, 'false clears the attribute instead of serialising it');
  assert.ok(!serializeDocument({ specVersion: '1.1', project: stretched.project }).includes('pitch-follows-speed'));
  const preview = evaluateFrame(stretched.project, { num: 1, den: 1 }).clips.find((clip) => clip.clipId === 'voice')!;
  assert.equal(preview.audio!.preservesPitch, true);
});

test('Studio ships round-13 surfaces: version history, sticker recolour, pitch follows speed', () => {
  for (const marker of [
    'history-modal',
    '/api/history/restore',
    '/api/history/snapshot',
    'Version history (版本历史)',
    'renderStickerSection',
    'Sticker recoloured',
    'pitchFollowsSpeed',
    'Pitch follows speed (变调)',
  ]) {
    assert.ok(STUDIO_HTML.includes(marker), `round-13 marker: ${marker}`);
  }
});
