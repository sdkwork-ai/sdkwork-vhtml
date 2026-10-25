/**
 * TypeScript 5.8 rewrites `.ts` import specifiers in emitted JavaScript when
 * `rewriteRelativeImportExtensions` is enabled, but declaration files still
 * keep the source `.ts` extension. Consumers use normal NodeNext resolution and
 * expect `.js` specifiers in `.d.ts`, so normalize them after tsc.
 *
 * Usage: node scripts/fix-declarations.mjs <package-directory>
 */

import fs from 'node:fs';
import path from 'node:path';

const packageDir = path.resolve(process.argv[2] ?? '.');
const dist = path.join(packageDir, 'dist');
if (!fs.existsSync(dist)) {
  console.error(`fix-declarations: no dist directory in ${packageDir}`);
  process.exit(1);
}

let files = 0;
let replacements = 0;
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(absolute);
      continue;
    }
    if (!entry.name.endsWith('.d.ts')) continue;
    const before = fs.readFileSync(absolute, 'utf8');
    const after = before.replace(
      /((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g,
      '$1$2.js$3',
    );
    if (after !== before) {
      fs.writeFileSync(absolute, after);
      files += 1;
      replacements += (before.match(/\.ts['"]/g) ?? []).length;
    }
  }
};
visit(dist);
console.log(`declarations: ${files} file(s), ${replacements} specifier(s) rewritten`);
