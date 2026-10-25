#!/usr/bin/env node
/**
 * Verify every package's declared export targets and publish files exist.
 * Run after `pnpm build`.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packagesDir = path.join(root, 'packages');
let failures = 0;

function checkTarget(packageDir, target, label) {
  if (typeof target !== 'string') return;
  if (!target.startsWith('./') || target.includes('*')) return;
  const file = path.resolve(packageDir, target);
  if (!fs.existsSync(file)) {
    console.error(`missing ${label}: ${path.relative(root, file)}`);
    failures += 1;
  }
}

for (const name of fs.readdirSync(packagesDir)) {
  const packageDir = path.join(packagesDir, name);
  const manifestPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!pkg.name || pkg.name.endsWith('-workspace')) continue;

  checkTarget(packageDir, pkg.main, `${pkg.name} main`);
  checkTarget(packageDir, pkg.types, `${pkg.name} types`);
  for (const [subpath, value] of Object.entries(pkg.exports ?? {})) {
    if (typeof value === 'string') {
      checkTarget(packageDir, value, `${pkg.name} exports["${subpath}"]`);
      continue;
    }
    if (value && typeof value === 'object') {
      for (const [condition, target] of Object.entries(value)) {
        checkTarget(packageDir, target, `${pkg.name} exports["${subpath}"].${condition}`);
      }
    }
  }
  for (const file of pkg.files ?? []) {
    if (file === 'dist') {
      checkTarget(packageDir, './dist/index.js', `${pkg.name} dist`);
    } else if (!file.includes('*')) {
      checkTarget(packageDir, `./${file}`, `${pkg.name} files`);
    }
  }
  if (pkg.bin) {
    for (const [binName, target] of Object.entries(pkg.bin)) {
      checkTarget(packageDir, target, `${pkg.name} bin ${binName}`);
    }
  }
  console.log(`ok ${pkg.name}@${pkg.version}`);
}

if (failures) {
  console.error(`\n${failures} package target(s) missing`);
  process.exit(1);
}
console.log('\nall package targets exist');
