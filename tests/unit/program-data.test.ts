import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { materializeDocument } from '@sdkwork/vhtml-core/program';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';

const ROOT = path.resolve('conformance');

function load(file: string) {
  const absolute = path.join(ROOT, file);
  return parseVhtml(fs.readFileSync(absolute, 'utf8'), { file: absolute, root: path.dirname(absolute) });
}

test('external data blocks load from project files and serialize by reference', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-data-'));
  try {
    fs.writeFileSync(path.join(root, 'rows.json'), JSON.stringify({ rows: [{ id: 'a' }, { id: 'b' }] }));
    const source = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="data-src" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="2s" /></settings>
  <timelines><timeline id="main" duration="2s"><lane id="v" type="video"></lane></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
const rows = vhtml.data.get('rows').rows;
rows.forEach((row, index) => {
  vhtml.addClip('v', { ref: 'scene:card-' + row.id, start: index, duration: 1 });
  vhtml.addScene({ id: 'card-' + row.id, html: '<div>' + row.id + '</div>' });
});
</script>
<data id="rows" src="./rows.json"></data>
</vhtml></body></html>`;
    const parsed = parseVhtml(source, { file: path.join(root, 'video.vhtml'), root });
    assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0);
    const block = parsed.document.dataBlocks?.find((candidate) => candidate.id === 'rows');
    assert.ok(block, 'data block present');
    assert.equal(block!.src, './rows.json');
    const result = materializeDocument(parsed.document);
    assert.equal(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
    assert.equal(result.document.project.timelines[0]!.tracks[0]!.clips.length, 2);

    // Round trip of the *unmaterialised* document keeps the reference form,
    // re-reads the same file, and re-materialises to the same model.
    const serialized = serializeDocument(parsed.document);
    assert.ok(serialized.includes('<data id="rows" src="./rows.json">'));
    const reparsed = parseVhtml(serialized, { file: path.join(root, 'video.vhtml'), root });
    const rerun = materializeDocument(reparsed.document);
    assert.equal(
      JSON.stringify(rerun.document.project.timelines[0]!.tracks[0]!.clips.map((clip) => clip.id)),
      JSON.stringify(result.document.project.timelines[0]!.tracks[0]!.clips.map((clip) => clip.id)),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('external data blocks reject URLs and root escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-data-'));
  try {
    for (const [src, code] of [
      ['https://example.com/rows.json', 'SECURITY_PATH_ESCAPE'],
      ['../outside.json', 'SECURITY_PATH_ESCAPE'],
      ['./missing.json', 'IO_NOT_FOUND'],
    ] as const) {
      const source = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="bad-data" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
</project>
<data id="rows" type="application/json" src="${src}"></data>
</vhtml></body></html>`;
      const parsed = parseVhtml(source, { file: path.join(root, 'video.vhtml'), root });
      assert.ok(
        parsed.diagnostics.some((diagnostic) => diagnostic.code === code),
        `${src} must produce ${code}`,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('materializeDocument merges external params over program params', () => {
  const source = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="params" version="1.1">
  <settings><composition width="16" height="16" frame-rate="30/1" duration="1s" /></settings>
  <timelines><timeline id="main" duration="1s"></timeline></timelines>
</project>
<script type="application/vnd.vhtml.program+javascript" params="{&quot;from&quot;:&quot;document&quot;,&quot;kept&quot;:&quot;yes&quot;}">
vhtml.setMetadata('from', String(vhtml.ctx.params.from));
vhtml.setMetadata('kept', String(vhtml.ctx.params.kept));
</script>
</vhtml></body></html>`;
  const parsed = parseVhtml(source, { file: 'params.vhtml', root: process.cwd() });
  const result = materializeDocument(parsed.document, { params: { from: 'cli' } });
  assert.equal(result.document.project.metadata['from'], 'cli', 'external params win');
  assert.equal(result.document.project.metadata['kept'], 'yes', 'program params preserved');
  const without = materializeDocument(parsed.document);
  assert.equal(without.document.project.metadata['from'], 'document');
});

test('conformance fixture: program params flow through ctx', () => {
  const parsed = load('parsing/program-params.vhtml');
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0);
  const result = materializeDocument(parsed.document);
  assert.equal(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
  assert.equal(result.document.project.metadata['accent'], '#6ee7ff');
  assert.equal(result.document.project.metadata['cards'], '3');
});
