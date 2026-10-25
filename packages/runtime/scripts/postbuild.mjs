/**
 * Copy non-TypeScript runtime assets into dist.
 *
 * `bootstrap.js` is injected verbatim into the stage document before the
 * bundled browser entry runs, so it must sit next to the compiled stage module.
 */

import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('src/browser/bootstrap.js');
const target = path.resolve('dist/browser/bootstrap.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);

const entry = path.resolve('dist/browser/entry.js');
if (!fs.existsSync(entry)) {
  throw new Error(`runtime browser entry was not compiled: ${entry}`);
}
console.log('runtime assets: bootstrap.js + browser entry');
