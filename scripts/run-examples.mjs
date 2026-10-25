#!/usr/bin/env node
/**
 * Build every TypeScript example into a canonical .vhtml project.
 * Rendering/exporting is intentionally separate because it requires Chrome and
 * FFmpeg and is slower.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const examples = path.join(root, 'examples');
const names = {
  '01-hello': 'hello-code.vhtml',
  '02-product-promo': 'promo.vhtml',
  '03-data-driven': 'metrics.vhtml',
  '04-programmatic-edit': 'edit.vhtml',
  '05-vertical-social': 'vertical.vhtml',
  '06-ai-storyboard': 'ai-storyboard.vhtml',
  '07-ppt-video': 'ppt-video.vhtml',
};
const entries = [];
for (const name of readdirSync(examples)) {
  const directory = path.join(examples, name);
  if (!statSync(directory).isDirectory()) continue;
  for (const file of readdirSync(directory)) {
    if (file.endsWith('.ts')) entries.push({ directory: name, entry: path.join(directory, file) });
  }
}

let failed = 0;
for (const { directory, entry } of entries) {
  const output = path.join(examples, directory, names[directory] ?? entry.replace(/\.ts$/, '.vhtml'));
  const relative = path.relative(root, entry);
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'bin', 'vhtml.mjs'), 'build', entry, '--out', output, '--quiet'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    failed += 1;
    console.error(`failed: ${relative}`);
  }
}
console.log(`built ${entries.length - failed}/${entries.length} example project(s)`);
process.exitCode = failed ? 1 : 0;
