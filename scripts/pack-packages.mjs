#!/usr/bin/env node
/**
 * Pack every publishable package into dist-packages/.
 *
 * `pnpm pack` rewrites `workspace:^` dependency ranges to concrete versions,
 * so the resulting tarballs are normal npm packages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Windows requires a shell to execute the pnpm shim; arguments are static.
process.noDeprecation = true;

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist-packages');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const packages = fs.readdirSync(path.join(root, 'packages')).sort();
let failed = 0;
for (const name of packages) {
  const packageDir = path.join(root, 'packages', name);
  if (!fs.existsSync(path.join(packageDir, 'package.json'))) continue;
  const result = spawnSync(
    'pnpm',
    ['pack', '--pack-destination', output],
    { cwd: packageDir, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
  if (result.status !== 0) {
    console.error(`failed to pack ${name}`);
    failed += 1;
  }
}
console.log(`packed ${packages.length - failed}/${packages.length} package(s) into ${path.relative(root, output)}`);
process.exitCode = failed ? 1 : 0;
