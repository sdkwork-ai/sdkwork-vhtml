#!/usr/bin/env node
/**
 * check-project.mjs — one-shot quality gate for a VHTML project.
 *
 * Skill: sdkwork-vhtml-video (.sdkwork/skills/sdkwork-vhtml-video)
 * Also used by the edit / generate / export skills before they write.
 *
 * Usage:
 *   node check-project.mjs <project> [--json] [--skip-assets] [--skip-render]
 *
 * Runs, in order:
 *   1. `vhtml validate <project> --json`  — model, references, asset files
 *   2. `vhtml assets verify <project> --json` (skipped with --skip-assets or
 *      when the project is a bare .vhtml file)
 *   3. `vhtml render <project> --frame 0 --out <tmp>/frame-0.png` — a real
 *      Chromium smoke render (skipped with --skip-render; needs Chrome)
 *
 * The vhtml CLI is resolved from: $VHTML_BIN, this repository's bin/vhtml.mjs
 * (walking up from this script), `pnpm exec vhtml`, `npx --no-install vhtml`.
 *
 * Output: human summary, or one JSON object with --json. Exit 0 when all
 * enabled checks pass (warnings allowed), 1 otherwise, 2 on usage error.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const usage = 'usage: node check-project.mjs <project> [--json] [--skip-assets] [--skip-render]';
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const skipAssets = argv.includes('--skip-assets');
const skipRender = argv.includes('--skip-render');
const target = argv.find((arg) => !arg.startsWith('--'));

if (!target) {
  console.error(usage);
  process.exit(2);
}
const project = path.resolve(target);
if (!fs.existsSync(project)) {
  if (json) console.log(JSON.stringify({ ok: false, error: `project not found: ${project}` }, null, 2));
  else console.error(`error: project not found: ${project}`);
  process.exit(1);
}

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
if (!bin) {
  const message = 'vhtml CLI not found (tried $VHTML_BIN, repo bin/vhtml.mjs, pnpm exec, npx)';
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`error: ${message}`);
  process.exit(1);
}

const runCli = (cliArgs) => spawnSync(bin.command, [...bin.args, ...cliArgs], { encoding: 'utf8' });

function parseJsonOutput(result) {
  try {
    const start = result.stdout.indexOf('{');
    const end = result.stdout.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(result.stdout.slice(start, end + 1));
  } catch { /* fall through */ }
  return null;
}

const checks = [];
let failures = 0;

// 1. validate
const validated = runCli(['validate', project, '--json']);
const validation = parseJsonOutput(validated);
if (validated.status !== 0 || !validation) {
  failures += 1;
  checks.push({
    check: 'validate',
    ok: false,
    detail: validation ? `${validation.errors} error(s), ${validation.warnings} warning(s)` : (validated.stderr || 'no JSON output'),
    diagnostics: validation?.diagnostics ?? [],
  });
} else {
  checks.push({
    check: 'validate',
    ok: validation.ok,
    detail: `${validation.errors} error(s), ${validation.warnings} warning(s)`,
    diagnostics: validation.diagnostics ?? [],
  });
  if (!validation.ok) failures += 1;
}

// 2. assets verify (directory projects only; a bare .vhtml has no manifest)
const isDirectory = fs.statSync(project).isDirectory();
if (!skipAssets && isDirectory) {
  const verified = runCli(['assets', 'verify', project, '--json']);
  const verification = parseJsonOutput(verified);
  const ok = verified.status === 0 && verification?.ok !== false;
  checks.push({
    check: 'assets',
    ok,
    detail: verification ? `missing=${(verification.missing ?? []).length}` : (verified.stderr || 'no JSON output'),
    missing: verification?.missing ?? [],
  });
  if (!ok) failures += 1;
}

// 3. Chromium smoke render of frame 0
if (!skipRender) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-check-'));
  const frame = path.join(temp, 'frame-0.png');
  const rendered = runCli(['render', project, '--frame', '0', '--out', frame]);
  const ok = rendered.status === 0 && fs.existsSync(frame);
  checks.push({
    check: 'render',
    ok,
    detail: ok ? `${fs.statSync(frame).size} bytes` : (rendered.stderr || 'render failed').trim().split('\n').slice(-3).join('\n'),
  });
  if (!ok) failures += 1;
  fs.rmSync(temp, { recursive: true, force: true });
}

const ok = failures === 0;
if (json) {
  console.log(JSON.stringify({ ok, project, cli: `${bin.command} ${bin.args.join(' ')}`, checks }, null, 2));
} else {
  for (const check of checks) {
    console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.check.padEnd(9)} ${check.detail}`);
    if (!check.ok && check.diagnostics?.length) {
      for (const diagnostic of check.diagnostics.slice(0, 20)) {
        console.log(`      ${diagnostic.severity ?? 'error'}: ${diagnostic.code ?? ''} ${diagnostic.message ?? ''}`);
      }
    }
  }
  console.log(ok ? `\ncheck-project: PASS (${path.basename(project)})` : `\ncheck-project: FAIL (${failures} failed check(s))`);
}
process.exit(ok ? 0 : 1);
