#!/usr/bin/env node
/**
 * Install the packed tarballs into a clean consumer project, import every
 * public package, run the CLI, and type-check a consumer program against the
 * shipped declaration files.
 *
 * Usage: node scripts/verify-packages.mjs [--keep]
 * Prerequisite: pnpm pack:all
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Windows requires a shell to execute the npm shim; arguments are static.
process.noDeprecation = true;

const root = path.resolve(import.meta.dirname, '..');
const tarballsDir = path.join(root, 'dist-packages');
if (!fs.existsSync(tarballsDir)) {
  console.error('dist-packages/ is missing; run "pnpm pack:all" first');
  process.exit(1);
}
const tarballs = fs.readdirSync(tarballsDir).filter((file) => file.endsWith('.tgz'));
if (!tarballs.length) {
  console.error('no package tarballs found; run "pnpm pack:all"');
  process.exit(1);
}

const keep = process.argv.includes('--keep');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-npm-consumer-'));
const deps = {};
for (const file of tarballs) {
  const name = `@sdkwork/${file.replace(/^sdkwork-/, '').replace(/-\d+\.\d+\.\d+\.tgz$/, '')}`;
  deps[name] = `file:${path.join(tarballsDir, file).replace(/\\/g, '/')}`;
}
fs.writeFileSync(
  path.join(temp, 'package.json'),
  `${JSON.stringify({ name: 'vhtml-consumer', private: true, type: 'module', version: '1.0.0', dependencies: deps, devDependencies: { typescript: '5.8' } }, null, 2)}\n`,
);

const npm = (args) => spawnSync('npm', args, {
  cwd: temp,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NODE_NO_WARNINGS: '1' },
});

console.log(`installing ${tarballs.length} tarballs in ${temp}`);
let result = npm(['install', '--no-audit', '--no-fund']);
if (result.status !== 0) process.exit(result.status ?? 1);

fs.writeFileSync(path.join(temp, 'check.mjs'), `import { parseVhtml, validateDocument } from '@sdkwork/vhtml-core';
import { defineVideo, clip, lane } from '@sdkwork/vhtml-sdk';
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { buildStageRuntime } from '@sdkwork/vhtml-runtime/build';
import { exportProject } from '@sdkwork/vhtml-media/export';
import { resolveProjectInput } from '@sdkwork/vhtml-project';
import { splitInlineScenes } from '@sdkwork/vhtml-project/split';
import { DELIVERY_PRESETS } from '@sdkwork/vhtml-core/presets';
import { loadSchema } from '@sdkwork/vhtml-schema';
import { startStudio } from '@sdkwork/vhtml-studio';
import { applyEditOperations } from '@sdkwork/vhtml-editor';
import { main } from '@sdkwork/vhtml-cli';
import * as meta from '@sdkwork/vhtml';

const project = defineVideo({
  id: 'consumer-check', width: 320, height: 180, fps: 30, duration: '1s',
  scenes: [{ id: 's', html: '<div>consumer</div>' }],
  lanes: [lane('video', 'visual', [clip('scene:s', { start: 0, duration: '1s' })])],
});
const validation = validateDocument({ specVersion: '1.1', project }, { root: '.', checkFiles: false });
const edit = applyEditOperations(project, [{ op: 'clip.move', clipId: 'visual-clip-1', start: 0.5 }]);
const browserRuntime = await buildStageRuntime();
const checks = {
  schema: Boolean(loadSchema('model')),
  parse: typeof parseVhtml,
  validation: validation.ok,
  edit: edit.ok,
  renderer: typeof VhtmlRenderer,
  runtimeBundle: browserRuntime.length > 10_000,
  exportProject: typeof exportProject,
  project: typeof resolveProjectInput,
  split: typeof splitInlineScenes,
  studio: typeof startStudio,
  cli: typeof main,
  metaExports: Object.keys(meta).length,
  deliveryPresets: DELIVERY_PRESETS.length,
};
if (!checks.validation || !checks.edit || !checks.runtimeBundle || checks.metaExports < 100 || checks.deliveryPresets < 10) {
  console.error(checks);
  process.exit(1);
}
console.log(JSON.stringify(checks));
`);
fs.writeFileSync(path.join(temp, 'check.ts'), `import { defineVideo, clip, lane } from '@sdkwork/vhtml-sdk';
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { loadSchema } from '@sdkwork/vhtml-schema';
import { DELIVERY_PRESETS } from '@sdkwork/vhtml-core/presets';
import { splitInlineScenes } from '@sdkwork/vhtml-project/split';
import type { Project } from '@sdkwork/vhtml-core';

const project: Project = defineVideo({
  id: 'type-check', width: 320, height: 180, fps: 30, duration: '1s',
  scenes: [{ id: 's', html: '<div>x</div>' }],
  lanes: [lane('video', 'visual', [clip('scene:s', { start: 0, duration: '1s' })])],
});
const renderer: typeof VhtmlRenderer = VhtmlRenderer;
const schema: Record<string, unknown> = loadSchema('model');
const split: typeof splitInlineScenes = splitInlineScenes;
const presets: number = DELIVERY_PRESETS.length;
void [project, renderer, schema, split, presets];
`);

result = spawnSync(process.execPath, ['check.mjs'], { cwd: temp, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const tscBin = path.join(temp, 'node_modules', 'typescript', 'bin', 'tsc');
result = spawnSync(process.execPath, [
  tscBin, '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
  '--target', 'ES2023', '--strict', '--skipLibCheck', 'check.ts',
], { cwd: temp, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const cli = spawnSync(process.execPath, [path.join(temp, 'node_modules', '@sdkwork', 'vhtml', 'bin', 'vhtml.mjs'), '--version'], {
  cwd: temp,
  stdio: 'inherit',
});
if (cli.status !== 0) process.exit(cli.status ?? 1);

const cliBin = path.join(temp, 'node_modules', '@sdkwork', 'vhtml', 'bin', 'vhtml.mjs');
result = spawnSync(process.execPath, [cliBin, 'init', 'sample', '--force'], { cwd: temp, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const samplePackage = JSON.parse(fs.readFileSync(path.join(temp, 'sample', 'package.json'), 'utf8'));
if (!samplePackage.devDependencies?.['@sdkwork/vhtml']) {
  console.error('generated project is missing the @sdkwork/vhtml dependency');
  process.exit(1);
}
result = spawnSync(process.execPath, [cliBin, 'build', 'sample'], { cwd: temp, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
result = spawnSync(process.execPath, [cliBin, 'validate', 'sample'], { cwd: temp, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log('npm package integration verified');
if (keep) console.log(`kept consumer at ${temp}`);
else fs.rmSync(temp, { recursive: true, force: true });
