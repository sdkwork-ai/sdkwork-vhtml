#!/usr/bin/env node
/**
 * apply-edits.mjs — safe wrapper around `vhtml edit --ops`.
 *
 * Skill: sdkwork-vhtml-video (.sdkwork/skills/sdkwork-vhtml-video)
 *
 * Usage:
 *   node apply-edits.mjs <project> --ops <file|-> [--out <file>] [--dry-run] [--json]
 *
 * What it does:
 *   1. Lints the operations JSON (known op names + required fields) — catches
 *      typos before the model is touched.
 *   2. Refuses to run when the project currently fails `vhtml validate`.
 *   3. Applies via `vhtml edit <project> --ops … --out …`; when writing in
 *      place it adds `--backup` (creates `<entry>.vhtml.bak`) unless the
 *      caller already passed a different --out.
 *   4. Re-validates the result and reports diagnostics.
 *
 * `--ops -` reads the operations JSON from stdin. `--dry-run` lints and
 * prints the plan without writing. Exit 0 applied (and valid), 1 failed or
 * invalid, 2 usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const dryRun = argv.includes('--dry-run');

function argValue(name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

const target = argv.find((arg) => !arg.startsWith('--') && arg !== '-');
const opsSource = argValue('ops');
const outFlag = typeof argValue('out') === 'string' ? argValue('out') : undefined;

const usage = 'usage: node apply-edits.mjs <project> --ops <file|-> [--out <file>] [--dry-run] [--json]';
function fail(message, code, extra) {
  if (json) console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  else {
    console.error(`error: ${message}`);
    if (extra?.issues) for (const issue of extra.issues) console.error(`  - ${issue}`);
    if (extra?.diagnostics) {
      for (const diagnostic of extra.diagnostics.slice(0, 20)) {
        console.error(`  - ${diagnostic.severity}: ${diagnostic.code} ${diagnostic.message}`);
      }
    }
    if (extra?.stderr) console.error(extra.stderr.trim());
  }
  process.exit(code);
}

if (!target || !opsSource) fail(usage, 2);
const project = path.resolve(target);
if (!fs.existsSync(project)) fail(`project not found: ${project}`, 1);

// --- resolve the vhtml CLI (same strategy as check-project.mjs) -------------
function resolveVhtmlBin() {
  if (process.env.VHTML_BIN && fs.existsSync(process.env.VHTML_BIN)) {
    return { command: process.execPath, args: [process.env.VHTML_BIN] };
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'bin', 'vhtml.mjs');
    if (fs.existsSync(candidate)) return { command: process.execPath, args: [candidate] };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const shell of ['pnpm', 'npx']) {
    const probe = spawnSync(shell, ['exec', 'vhtml', '--version'], { encoding: 'utf8' });
    if (probe.status === 0) return { command: shell, args: ['exec', 'vhtml'] };
  }
  return null;
}
const bin = resolveVhtmlBin();
if (!bin) fail('vhtml CLI not found (tried $VHTML_BIN, repo bin/vhtml.mjs, pnpm exec, npx)', 1);

// --- read and lint the ops --------------------------------------------------
let raw;
if (opsSource === '-') {
  raw = fs.readFileSync(0, 'utf8');
} else {
  const opsPath = path.resolve(opsSource);
  if (!fs.existsSync(opsPath)) fail(`ops file not found: ${opsPath}`, 1);
  raw = fs.readFileSync(opsPath, 'utf8');
}
let operations;
let wasBareObject = false;
try {
  const parsed = JSON.parse(raw);
  wasBareObject = !Array.isArray(parsed);
  operations = Array.isArray(parsed) ? parsed : [parsed];
  if (!operations.length) fail('ops file contains no operations', 1);
} catch (error) {
  fail(`ops JSON is not valid JSON: ${error.message}`, 1);
}

// Implemented op names — mirrors packages/core/src/edits.ts (authoritative).
const REQUIRED_FIELDS = {
  'project.set': [], 'composition.set': ['composition'],
  'timeline.set': ['timelineId'], 'track.add': ['timelineId', 'track'],
  'track.remove': ['trackId'], 'track.set': ['trackId'],
  'clip.add': ['trackId', 'clip'], 'timeline.insert': ['laneId', 'clip'],
  'timeline.overwrite': ['laneId', 'clip'],
  'clip.remove': ['clipId'], 'clip.rippleDelete': ['clipId'],
  'clip.move': ['clipId'], 'clip.trim': ['clipId'], 'clip.split': ['clipId', 'at'],
  'clip.slip': ['clipId', 'delta'], 'clip.slide': ['clipId', 'delta'],
  'clip.roll': ['clipId', 'edge', 'delta'], 'clip.speed': ['clipId', 'speed'],
  'clip.freeze': ['clipId'], 'clip.timeremap': ['clipId', 'keyframes'],
  'clip.timeremap.clear': ['clipId'], 'clip.duplicate': ['clipId'],
  'clip.splitMulti': ['clipId', 'times'], 'clip.detachAudio': ['clipId'],
  'clip.replace': ['clipId', 'ref'],
  'timeline.nest': ['clipIds'], 'timeline.unnest': ['clipId'],
  'timeline.rippleCut': ['trackIds', 'start', 'end'],
  'storyboard.apply': [], 'timeline.moveBatch': ['clipIds', 'start'],
  'timeline.copy': ['clipIds'], 'timeline.cut': ['clipIds'], 'timeline.paste': [],
  'clip.link': ['clipIds'], 'clip.unlink': ['clipId'],
  'clip.set': ['clipId', 'props'],
  'transition.add': ['trackId', 'transition'], 'transition.remove': ['transitionId'],
  'animation.add': ['animation'], 'animation.remove': ['animationId'],
  'effect.add': ['clipId', 'effect'], 'effect.remove': ['clipId', 'effectId'],
  'marker.add': ['marker'], 'marker.remove': ['markerId'],
  'scene.set': ['sceneId', 'props'],
  'asset.add': ['asset'], 'asset.remove': ['assetId'], 'asset.set': ['assetId'],
  'storyboard.add': ['shot'], 'storyboard.set': ['shotId', 'props'],
  'storyboard.remove': ['shotId'], 'storyboard.move': ['shotId', 'to'],
  'storyboard.reorder': ['shotIds'], 'batch': ['operations'],
};
const lintIssues = [];
for (const [index, operation] of operations.entries()) {
  const where = `operations[${index}]`;
  if (!operation || typeof operation !== 'object') { lintIssues.push(`${where}: not an object`); continue; }
  const name = operation.op;
  if (!name || !(name in REQUIRED_FIELDS)) {
    lintIssues.push(`${where}: unknown op "${name}" (see references/edit-operations.md)`);
    continue;
  }
  for (const field of REQUIRED_FIELDS[name]) {
    if (operation[field] === undefined) lintIssues.push(`${where}: ${name} missing "${field}"`);
  }
  if (name === 'clip.set') {
    const timing = ['start', 'duration', 'in', 'out', 'speed'].filter((key) => key in (operation.props ?? {}));
    if (timing.length) lintIssues.push(`${where}: clip.set carries timing props (${timing.join(', ')}) — use clip.trim/move/speed instead`);
  }
}
if (lintIssues.length) fail(`ops lint failed with ${lintIssues.length} issue(s)`, 1, { issues: lintIssues });

// --- pre-validate the project ----------------------------------------------
const preValidated = spawnSync(bin.command, [...bin.args, 'validate', project, '--json'], { encoding: 'utf8' });
if (preValidated.status !== 0) {
  fail('project does not currently validate — fix it before editing', 1,
    { diagnostics: safeParse(preValidated.stdout)?.diagnostics ?? [] });
}

// --- apply ------------------------------------------------------------------
// `vhtml edit` treats a bare-object ops file as {operations: undefined} → an
// EMPTY op list and exits 0 without changes. Always hand it a normalized
// array file, never the original source.
import os from 'node:os';
let opsForCli = opsSource;
if (opsSource === '-' || wasBareObject) {
  opsForCli = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-ops-')), 'ops.json');
  fs.writeFileSync(opsForCli, JSON.stringify(operations, null, 2));
}
const finalArgs = [...bin.args, 'edit', project, '--ops', opsForCli];
if (outFlag) finalArgs.push('--out', outFlag);
else finalArgs.push('--backup');
if (dryRun) {
  const plan = {
    ok: true,
    dryRun: true,
    project,
    operations: operations.length,
    command: [bin.command, ...finalArgs].map((part) => (part === '-' ? 'stdin(-)' : part)).join(' '),
    note: 'no files were written',
  };
  if (json) console.log(JSON.stringify(plan, null, 2));
  else {
    console.log(`dry-run: ${operations.length} operation(s) lint OK`);
    console.log(`would run: ${plan.command}`);
  }
  process.exit(0);
}

const applied = spawnSync(bin.command, finalArgs, { encoding: 'utf8' });
if (applied.status !== 0) {
  fail(`vhtml edit failed (${applied.status})`, 1, {
    stdout: (applied.stdout || '').slice(-2000),
    stderr: (applied.stderr || '').slice(-2000),
  });
}

// --- post-validate ----------------------------------------------------------
const postValidated = spawnSync(bin.command, [...bin.args, 'validate', outFlag ?? project, '--json'], { encoding: 'utf8' });
const post = safeParse(postValidated.stdout);
const ok = postValidated.status === 0 && post?.ok !== false;

if (json) {
  console.log(JSON.stringify({
    ok,
    project,
    out: outFlag ?? project,
    operations: operations.length,
    backup: outFlag ? undefined : `${outFlag ?? project}.bak`,
    validation: post ? { errors: post.errors, warnings: post.warnings, diagnostics: post.diagnostics } : undefined,
  }, null, 2));
} else {
  console.log((applied.stdout || '').trim());
  if (/\(0 object\(s\)\)/.test(applied.stdout || '') && operations.length) {
    console.log('note: 0 objects changed — the operations matched nothing (wrong ids, cut at a boundary, or already-applied state)');
  }
  if (post) {
    console.log(`validation: ${post.ok ? 'ok' : 'INVALID'} (${post.errors} error(s), ${post.warnings} warning(s))`);
    for (const diagnostic of (post.diagnostics ?? []).filter((d) => d.severity !== 'info').slice(0, 20)) {
      console.log(`  ${diagnostic.severity}: ${diagnostic.code} ${diagnostic.message}`);
    }
  }
  console.log(ok ? 'apply-edits: PASS' : 'apply-edits: applied but validation FAILED');
}
process.exit(ok ? 0 : 1);

function safeParse(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
  } catch { /* ignore */ }
  return null;
}
