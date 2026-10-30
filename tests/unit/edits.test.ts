import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { applyEditOperations, EditSession } from '@sdkwork/vhtml-core/edits';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { clipEnd, findClip } from '@sdkwork/vhtml-core/model';
import { rat, toNumber } from '@sdkwork/vhtml-core/time';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';

const SOURCE = `<project id="edit-test" version="1.1"><settings><composition width="640" height="360" frame-rate="30/1" duration="10s" /></settings>
<assets><asset id="media" type="video" src="./m.mp4" duration="10s" /></assets>
<scenes><scene id="s" duration="4s"><div>Hello</div></scene></scenes>
<timelines><timeline id="main" duration="10s">
<lane id="v" type="video"><clip id="a" ref="s" start="0s" duration="2s"><animate property="opacity" from="0" to="1" start="0.5s" duration="1s" /></clip><clip id="b" ref="s" start="2s" duration="2s" /></lane>
<lane id="audio" type="audio"><clip id="m1" ref="media" start="0s" duration="4s" in="1s" /></lane>
</timeline></timelines></project>`;

function load() {
  const result = parseVhtml(SOURCE, { file: 'D:/tmp/edit.vhtml' });
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  return result.document.project;
}

test('trim adjusts project time and source in/out consistently', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.trim', clipId: 'm1', start: '1s', end: '3s' }]);
  assert.equal(result.ok, true);
  const clip = findClip(result.project, 'm1')!.clip;
  assert.equal(toNumber(clip.start), 1);
  assert.equal(toNumber(clip.duration), 2);
  assert.equal(toNumber(clip.sourceIn), 2);
  assert.equal(toNumber(clip.sourceOut!), 4);
  const validation = validateDocument({ specVersion: '1.1', project: result.project }, { root: 'D:/tmp', checkFiles: false });
  assert.equal(validation.errors.length, 0);
});

test('split produces complementary halves and splits animations', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.split', clipId: 'a', at: '1s' }]);
  assert.equal(result.ok, true);
  const left = findClip(result.project, 'a')!.clip;
  const right = findClip(result.project, 'a-b')!.clip;
  assert.equal(toNumber(left.duration), 1);
  assert.equal(toNumber(right.start), 1);
  assert.equal(toNumber(right.duration), 1);
  assert.equal(left.animations.length, 1);
  assert.equal(right.animations.length, 1);
  assert.equal(left.animations[0]!.duration.num / left.animations[0]!.duration.den, 0.5);
  assert.equal(right.animations[0]!.start.num, 0);
});

test('ripple delete closes the gap and removes references', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.rippleDelete', clipId: 'a' }]);
  assert.equal(result.ok, true);
  const b = findClip(result.project, 'b')!.clip;
  assert.equal(toNumber(b.start), 0);
  assert.equal(toNumber(clipEnd(b)), 2);
});

test('slip moves the source window without moving the clip', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.slip', clipId: 'm1', delta: '1s' }]);
  assert.equal(result.ok, true);
  const clip = findClip(result.project, 'm1')!.clip;
  assert.equal(toNumber(clip.start), 0);
  assert.equal(toNumber(clip.sourceIn), 2);
  assert.equal(toNumber(clip.sourceOut!), 6);
});

test('speed retimes duration while preserving the source span', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.speed', clipId: 'm1', speed: 2 }]);
  assert.equal(result.ok, true);
  const clip = findClip(result.project, 'm1')!.clip;
  assert.equal(toNumber(clip.duration), 2);
  assert.equal(toNumber(clip.speed), 2);
  assert.equal(toNumber(clip.sourceOut!) - toNumber(clip.sourceIn), 4);
});

test('roll moves an adjacent cut', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.roll', clipId: 'a', edge: 'end', delta: '0.5s' }]);
  assert.equal(result.ok, true);
  assert.equal(toNumber(findClip(result.project, 'a')!.clip.duration), 2.5);
  assert.equal(toNumber(findClip(result.project, 'b')!.clip.start), 2.5);
});

test('edit session supports undo and redo', () => {
  const project = load();
  const session = new EditSession(project);
  session.apply([{ op: 'clip.move', clipId: 'b', start: '4s' }]);
  assert.equal(toNumber(findClip(session.project, 'b')!.clip.start), 4);
  session.undo();
  assert.equal(toNumber(findClip(session.project, 'b')!.clip.start), 2);
  session.redo();
  assert.equal(toNumber(findClip(session.project, 'b')!.clip.start), 4);
});

test('clip source bounds are enforced', () => {
  const project = load();
  const result = applyEditOperations(project, [{ op: 'clip.trim', clipId: 'm1', start: '0s', end: '20s' }]);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'EDIT_OUT_OF_BOUNDS'));
});

test('asset add/set/remove operations preserve references', () => {
  const project = load();
  const added = applyEditOperations(project, [{
    op: 'asset.add',
    asset: { id: 'logo', kind: 'image', src: 'assets/logo.png' },
  }]);
  assert.equal(added.ok, true);
  assert.ok(added.project.assets.some((asset) => asset.id === 'logo'));

  const set = applyEditOperations(added.project, [{
    op: 'asset.set', assetId: 'logo', props: { alt: 'Logo', width: 120, height: 60 },
  }]);
  assert.equal(set.ok, true);
  const logo = set.project.assets.find((asset) => asset.id === 'logo')!;
  assert.equal(logo.alt, 'Logo');
  assert.equal(logo.width, 120);

  const removed = applyEditOperations(set.project, [{ op: 'asset.remove', assetId: 'logo' }]);
  assert.equal(removed.ok, true);
  assert.equal(removed.project.assets.some((asset) => asset.id === 'logo'), false);

  const blocked = applyEditOperations(removed.project, [{ op: 'asset.remove', assetId: 'media' }]);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.diagnostics.some((diagnostic) => diagnostic.code === 'EDIT_CONFLICT'));
});

test('scene.set updates authored HTML and is undoable', () => {
  const session = new EditSession(load());
  const before = session.project.scenes[0]!.html;
  const result = session.apply([{
    op: 'scene.set',
    sceneId: 's',
    props: { html: '<p class="edited">Changed</p>', css: '.edited{color:red}', src: 'scenes/s.html' },
  }]);
  assert.equal(result.ok, true);
  assert.equal(session.project.scenes[0]!.html, '<p class="edited">Changed</p>');
  assert.equal(session.project.scenes[0]!.css, '.edited{color:red}');
  assert.equal(session.project.scenes[0]!.src, 'scenes/s.html');
  session.undo();
  assert.equal(session.project.scenes[0]!.html, before);
  assert.equal(session.project.scenes[0]!.src, undefined);
});

test('clip metadata (linkId) round-trips the .vhtml file', () => {
  const session = new EditSession(load());
  const linked = session.apply([{ op: 'clip.link', clipIds: ['a', 'b'] }]);
  assert.equal(linked.ok, true);
  const linkId = session.project.timelines[0]!.tracks[0]!.clips[0]!.metadata?.linkId;
  assert.ok(linkId, 'link op records a linkId');

  const output = serializeDocument({ specVersion: '1.1', project: session.project });
  assert.match(output, /<meta name=\"linkId\"/);

  const reparsed = parseVhtml(output, { file: 'D:/tmp/edit-roundtrip.vhtml' });
  assert.equal(reparsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  const roundTripped = reparsed.document.project.timelines[0]!.tracks[0]!.clips;
  assert.equal(roundTripped[0]!.metadata?.linkId, linkId);
  assert.equal(roundTripped[1]!.metadata?.linkId, linkId);
});

test('clip.set metadata whole-replace round-trips and preserves link pairing on update', () => {
  const session = new EditSession(load());
  const linked = session.apply([{ op: 'clip.link', clipIds: ['a', 'b'] }]);
  assert.equal(linked.ok, true);
  const linkId = session.project.timelines[0]!.tracks[0]!.clips[0]!.metadata?.linkId;

  // Setting a color tag must carry existing metadata (callers merge).
  const tagged = session.apply([{
    op: 'clip.set',
    clipId: 'a',
    props: { metadata: { linkId: linkId!, clipColor: '#ff5c5c' } },
  }]);
  assert.equal(tagged.ok, true);
  const clipA = session.project.timelines[0]!.tracks[0]!.clips.find((clip) => clip.id === 'a')!;
  assert.equal(clipA.metadata?.clipColor, '#ff5c5c');
  assert.equal(clipA.metadata?.linkId, linkId, 'link pairing survives the merge');

  // Clearing metadata writes an empty record.
  const cleared = session.apply([{ op: 'clip.set', clipId: 'a', props: { metadata: {} } }]);
  assert.equal(cleared.ok, true);
  const clipA2 = session.project.timelines[0]!.tracks[0]!.clips.find((clip) => clip.id === 'a')!;
  assert.deepEqual(clipA2.metadata ?? {}, {});
});

test('clip.split derives unique effect ids and re-targets animation clipIds', () => {
  const tagged = SOURCE
    .replace(
      '<clip id="a" ref="s" start="0s" duration="2s">',
      '<clip id="a" ref="s" start="0s" duration="2s"><effect id="fx-vignette-1" type="vignette"></effect><audio-effect id="fx-grain-2" type="gain"></audio-effect>',
    );
  const session = new EditSession((function(){
    const parsed = parseVhtml(tagged, { file: 'D:/tmp/edit-split-fx.vhtml' });
    return parsed.document.project;
  })());
  const result = session.apply([{ op: 'clip.split', clipId: 'a', at: '1s' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const track = session.project.timelines[0]!.tracks[0]!;
  const right = track.clips.find((clip) => clip.id === 'a-b')!;
  const left = track.clips.find((clip) => clip.id === 'a')!;
  // The left piece keeps the original effect ids; the right piece derives new ones.
  assert.deepEqual(left.effects.map((effect) => effect.id), ['fx-vignette-1']);
  assert.deepEqual(right.effects.map((effect) => effect.id), ['fx-vignette-1-of-a-b']);
  assert.deepEqual(right.audioEffects.map((effect) => effect.id), ['fx-grain-2-of-a-b']);
  // Animation copies on the right piece re-target the new clip id.
  for (const animation of right.animations) assert.equal(animation.clipId, 'a-b');
  // The split result must pass validation with no duplicate ids.
  const validation = validateDocument({ specVersion: '1.1', project: session.project }, { checkFiles: false });
  assert.equal(validation.ok, true, validation.diagnostics.map((d) => d.message).join('\n'));
});

test('clip.split scales inherited fades to the piece duration', () => {
  // music-like clip: 8s with fadeIn 1.2s + fadeOut 1s; splitting at 2.033s
  // leaves a 2.033s left piece whose inherited fades would overlap.
  const faded = SOURCE
    .replace(
      '<clip id="m1" ref="media" start="0s" duration="4s" in="1s" />',
      '<clip id="m1" ref="media" start="0s" duration="8s" in="1s" fade-in="1.2s" fade-out="1s" />',
    );
  const parsed = parseVhtml(faded, { file: 'D:/tmp/edit-fades.vhtml' });
  const session = new EditSession(parsed.document.project);
  const result = session.apply([{ op: 'clip.split', clipId: 'm1', at: '2.033333s' }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const track = session.project.timelines[0]!.tracks[1]!;
  const left = track.clips.find((clip) => clip.id === 'm1')!;
  const right = track.clips.find((clip) => clip.id !== 'm1')!;
  const leftSum = toNumber(left.fadeIn ?? { num: 0, den: 1 }) + toNumber(left.fadeOut ?? { num: 0, den: 1 });
  assert.ok(leftSum <= toNumber(left.duration) + 1e-9, `left fades ${leftSum} <= ${toNumber(left.duration)}`);
  const rightSum = toNumber(right.fadeIn ?? { num: 0, den: 1 }) + toNumber(right.fadeOut ?? { num: 0, den: 1 });
  assert.ok(rightSum <= toNumber(right.duration) + 1e-9, `right fades ${rightSum} <= ${toNumber(right.duration)}`);
  const validation = validateDocument({ specVersion: '1.1', project: session.project }, { checkFiles: false });
  assert.equal(validation.ok, true, validation.diagnostics.map((d) => d.message).join('\n'));
});

test('transition.add without params serializes (params normalized, no 500)', () => {
  const session = new EditSession(load());
  // Overlap hero into features so a transition window exists.
  session.apply([{ op: 'clip.trim', clipId: 'a', duration: '2.5s' }]);
  const result = session.apply([{
    op: 'transition.add',
    trackId: 'v',
    transition: { fromClipId: 'a', toClipId: 'b', type: 'wipe', duration: '0.4s', direction: 'left' },
  }]);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join('\n'));
  const transition = session.project.timelines[0]!.tracks[0]!.transitions[0]!;
  assert.deepEqual(transition.params, {});
  // Serialization used to throw "Cannot convert undefined or null to object".
  const output = serializeDocument({ specVersion: '1.1', project: session.project });
  assert.match(output, /<transition[^>]*type="wipe"/);
  const reparsed = parseVhtml(output, { file: 'D:/tmp/edit-transition.vhtml' });
  assert.equal(reparsed.document.project.timelines[0]!.tracks[0]!.transitions.length, 1);
});
