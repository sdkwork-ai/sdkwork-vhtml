#!/usr/bin/env node
/**
 * Remove compiled package artifacts. Source, lockfile and documentation are
 * never touched.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packages = path.join(root, 'packages');
let removed = 0;

for (const name of fs.readdirSync(packages)) {
  const dist = path.join(packages, name, 'dist');
  if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true, force: true });
    removed += 1;
  }
}

const tarballs = path.join(root, 'dist-packages');
if (fs.existsSync(tarballs)) {
  fs.rmSync(tarballs, { recursive: true, force: true });
}
console.log(`cleaned ${removed} package dist director${removed === 1 ? 'y' : 'ies'}`);
