import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { validateDocument } from '@sdkwork/vhtml-core/validate';
import { ErrorCode } from '@sdkwork/vhtml-core/errors';
import { evaluateFrame } from '@sdkwork/vhtml-runtime/evaluate';

function parse(source: string) {
  return parseVhtml(source, { file: 'registry.vhtml', root: process.cwd() });
}

const REGISTRY_PROJECT = `<!doctype html>
<html><body><vhtml version="1.1">
<project id="registry" version="1.1">
  <settings><composition width="320" height="180" frame-rate="30/1" duration="2s" background="#101010" /></settings>
  <extensions>
    <extension name="vhs" kind="effect" base="blur" version="1.0.0">
      <params amount="12"></params>
    </extension>
    <extension name="gritty" kind="transition" base="dip" version="1.0.0"></extension>
    <extension name="brand-pack" version="2"></extension>
  </extensions>
  <scenes><scene id="card" duration="1s"><div style="position:absolute;inset:0;background:#234">card</div></scene></scenes>
  <timelines><timeline id="main" duration="2s">
    <lane id="v" type="video">
      <clip id="a" ref="scene:card" start="0s" duration="0.8s">
        <effect type="vhs" amount="24"></effect>
      </clip>
      <clip id="b" ref="scene:card" start="0.6s" duration="0.8s"></clip>
      <transition from="a" to="b" type="gritty" duration="0.2s"></transition>
    </lane>
  </timeline></timelines>
</project>
</vhtml></body></html>`;

test('declared effect/transition types pass validation without unknown-feature warnings', () => {
  const parsed = parse(REGISTRY_PROJECT);
  assert.equal(parsed.diagnostics.filter((d) => d.severity === 'error').length, 0, parsed.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
  const report = validateDocument(parsed.document, { checkFiles: false });
  assert.equal(report.ok, true, report.diagnostics.map((d) => d.message).join('\n'));
  assert.ok(
    !report.warnings.some((d) => d.code === ErrorCode.RENDER_UNSUPPORTED_FEATURE),
    'declared types must not warn: ' + report.warnings.map((d) => d.message).join('; '),
  );
});

test('plain extension declarations keep their version/required metadata', () => {
  const parsed = parse(REGISTRY_PROJECT);
  const extensions = parsed.document.project.extensions ?? {};
  assert.equal(extensions['brand-pack']?.required, false);
  assert.equal(extensions['brand-pack']?.version, '2');
  assert.equal(extensions['vhs']?.kind, 'effect');
  assert.equal(extensions['vhs']?.base, 'blur');
  assert.equal(extensions['vhs']?.params?.amount, 12);
});

test('plugin declarations must desugar onto a built-in base of the same family', () => {
  const broken = REGISTRY_PROJECT.replace('<extension name="vhs" kind="effect" base="blur" version="1.0.0">', '<extension name="vhs" kind="effect" base="no-such-base" version="1.0.0">');
  const report = validateDocument(parse(broken).document, { checkFiles: false });
  assert.ok(report.errors.some((d) => d.code === ErrorCode.EXTENSION_INVALID && d.message.includes('vhs')));
  const baseless = REGISTRY_PROJECT.replace('kind="effect" base="blur"', 'kind="effect"');
  const parsed = parse(baseless);
  assert.ok(parsed.diagnostics.some((d) => d.severity === 'error' && d.code === ErrorCode.PARSE_MISSING_ATTRIBUTE));
});

test('declared effects render through their base with declared defaults under clip params', () => {
  const project = parse(REGISTRY_PROJECT).document.project;
  const frame = evaluateFrame(project, { num: 100, den: 1000 });
  const clipA = frame.clips.find((clip) => clip.clipId === 'a');
  assert.ok(clipA, 'clip a is active');
  // vhs -> blur base: clip param amount=24 overrides the declared default 12.
  assert.ok((clipA!.style.filter ?? '').includes('blur(24px)'), clipA!.style.filter);
  // The declared-but-undeclared-name path still reports unknown effects.
  const unknown = REGISTRY_PROJECT.replace('type="vhs" amount="24"', 'type="holo" amount="2"');
  const unknownFrame = evaluateFrame(parse(unknown).document.project, { num: 100, den: 1000 });
  assert.ok(unknownFrame.issues.some((issue) => issue.includes('holo')));
});

test('declared transitions evaluate as their base (dip overlay from gritty)', () => {
  const project = parse(REGISTRY_PROJECT).document.project;
  const frame = evaluateFrame(project, { num: 700, den: 1000 });
  assert.ok(
    frame.transitionOverlays.some((overlay) => overlay.opacity > 0),
    'gritty (base dip) renders the dip overlay',
  );
  assert.equal(frame.transitionOverlays[0]!.color, '#000000', 'dip uses the transition color (default black)');
});

test('serialization round-trips plugin declarations', () => {
  const reparsed = parse(serializeDocument(parse(REGISTRY_PROJECT).document));
  const extensions = reparsed.document.project.extensions ?? {};
  assert.equal(extensions['vhs']?.kind, 'effect');
  assert.equal(extensions['vhs']?.base, 'blur');
  assert.equal(extensions['vhs']?.params?.amount, 12);
  assert.equal(extensions['gritty']?.kind, 'transition');
  assert.equal(extensions['brand-pack']?.required, false);
});
