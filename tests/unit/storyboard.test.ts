import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';
import { createEmptyProject } from '@sdkwork/vhtml-core/model';

const SOURCE = `<project id="board" version="1.1"><settings><composition width="640" height="360" frame-rate="30/1" duration="8s" /></settings>
<scenes><scene id="s1"><div>one</div></scene><scene id="s2"><div>two</div></scene></scenes>
<generations><generate id="cover" kind="image"><prompt>cover</prompt></generate></generations>
<storyboard>
  <shot id="second" order="2" title="Second" scene="s2" generation="cover" duration="2.5s" status="boarded" tags="b,roll">
    <description>Second setup</description>
    <direction>{"shot":{"framing":"close","camera":"handheld"},"music":{"mood":"tense"}}</direction>
    <notes>check continuity</notes>
  </shot>
  <shot id="first" order="1" title="First" scene="s1" duration="1s" status="approved">
    <description>Opening</description>
  </shot>
</storyboard>
<timelines><timeline id="main" duration="8s"><lane id="v" type="video"></lane></timeline></timelines>
</project>`;

test('storyboard parses order, links, direction and notes', () => {
  const parsed = parseVhtml(SOURCE, { file: 'D:/tmp/board.vhtml' });
  const shots = parsed.document.project.storyboard ?? [];
  assert.equal(shots.length, 2);
  assert.deepEqual(shots.map((shot) => shot.id), ['first', 'second']);
  assert.equal(shots[1]!.title, 'Second');
  assert.equal(shots[1]!.order, 2);
  assert.equal(shots[1]!.scene, 's2');
  assert.equal(shots[1]!.generation, 'cover');
  assert.deepEqual(shots[1]!.tags, ['b', 'roll']);
  assert.equal(shots[1]!.duration?.num, 5);
  assert.equal(shots[1]!.duration?.den, 2);
  assert.equal((shots[1]!.direction?.shot as Record<string, unknown>).camera, 'handheld');
  assert.equal(shots[1]!.notes, 'check continuity');
  const validation = validateDocument(parsed.document, { checkFiles: false });
  assert.equal(validation.errors.length, 0, validation.errors.map((item) => item.message).join('\n'));
});

test('storyboard serializes and round-trips without losing planning fields', () => {
  const parsed = parseVhtml(SOURCE, { file: 'D:/tmp/board.vhtml' });
  const serialized = serializeDocument(parsed.document);
  assert.match(serialized, /<storyboard>/);
  assert.match(serialized, /<shot[^>]*id="second"/);
  const reparsed = parseVhtml(serialized, { file: 'D:/tmp/board-2.vhtml' });
  const shots = reparsed.document.project.storyboard ?? [];
  assert.deepEqual(shots.map((shot) => shot.id), ['first', 'second']);
  assert.equal(shots[1]!.notes, 'check continuity');
  assert.deepEqual(shots[1]!.tags, ['b', 'roll']);
});

test('storyboard add/set/move/reorder/remove are non-destructive edits', () => {
  const project = createEmptyProject('edit-board');
  project.scenes = [
    { id: 's1', html: '<div>one</div>', duration: { num: 2, den: 1 } },
    { id: 's2', html: '<div>two</div>', duration: { num: 2, den: 1 } },
  ];
  project.generations = [{ id: 'cover', kind: 'image', prompt: 'cover', inputs: [], constraints: {}, params: {}, outputs: [], status: 'draft' }];
  let result = applyEditOperations(project, [
    { op: 'storyboard.add', shot: { id: 'a', title: 'A', scene: 's1', status: 'idea', tags: [] } },
    { op: 'storyboard.add', shot: { id: 'b', title: 'B', generation: 'cover', status: 'boarded', tags: ['hero'] } },
    { op: 'storyboard.add', shot: { id: 'c', title: 'C', status: 'idea', tags: [] }, at: 1 },  ]);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join('\n'));
  assert.deepEqual(result.project.storyboard?.map((shot) => shot.id), ['a', 'c', 'b']);
  assert.deepEqual(result.project.storyboard?.map((shot) => shot.order), [1, 2, 3]);

  result = applyEditOperations(result.project, [
    { op: 'storyboard.set', shotId: 'c', props: { title: 'C revised', duration: '2.25s', status: 'ready', tags: ['insert'], direction: { shot: { camera: 'orbit' } } } },
    { op: 'storyboard.move', shotId: 'b', to: 0 },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join('\n'));
  assert.deepEqual(result.project.storyboard?.map((shot) => shot.id), ['b', 'a', 'c']);
  const c = result.project.storyboard?.find((shot) => shot.id === 'c')!;
  assert.equal(c.title, 'C revised');
  assert.equal(c.status, 'ready');
  assert.equal(c.duration?.num, 9);
  assert.equal(c.duration?.den, 4);
  assert.deepEqual(c.tags, ['insert']);

  result = applyEditOperations(result.project, [
    { op: 'storyboard.reorder', shotIds: ['c', 'b', 'a'] },
    { op: 'storyboard.remove', shotId: 'b' },
  ]);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join('\n'));
  assert.deepEqual(result.project.storyboard?.map((shot) => shot.id), ['c', 'a']);
  assert.deepEqual(result.project.storyboard?.map((shot) => shot.order), [1, 2]);
  const detached = applyEditOperations(result.project, [{ op: 'storyboard.remove', shotId: 'nope' }]);
  assert.equal(detached.ok, false);
});

test('storyboard validation catches missing refs and duplicate order', () => {
  const project = createEmptyProject('bad-board');
  project.storyboard = [
    { id: 'a', order: 1, scene: 'missing', status: 'idea' },
    { id: 'b', order: 1, generation: 'nope', status: 'idea' },
  ];
  const validation = validateDocument({ specVersion: '1.1', project }, { checkFiles: false });
  const messages = validation.errors.map((item) => item.message).join('\n');
  assert.match(messages, /missing Scene/);
  assert.match(messages, /duplicate order/);
  assert.match(messages, /missing generation/);
});
