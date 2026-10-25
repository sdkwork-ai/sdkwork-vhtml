/**
 * Builds the browser stage runtime bundle with esbuild. Cached per process.
 */

import fs from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

let cached: Promise<string> | undefined;

function entryPoint(): string {
  const candidates = ['./browser/entry.js', './browser/entry.ts'];
  for (const candidate of candidates) {
    const file = fileURLToPath(new URL(candidate, import.meta.url));
    if (fs.existsSync(file)) return file;
  }
  throw new Error('VHTML: browser runtime entry not found (build the runtime package)');
}

export function buildStageRuntime(): Promise<string> {
  if (!cached) {
    cached = build({
      entryPoints: [entryPoint()],
      bundle: true,
      write: false,
      format: 'iife',
      target: ['chrome110'],
      minify: true,
      legalComments: 'none',
      platform: 'browser',
      logLevel: 'silent',
    }).then((result) => {
      const file = result.outputFiles?.[0];
      if (!file) throw new Error('VHTML: esbuild produced no runtime bundle');
      return file.text;
    });
  }
  return cached;
}

/** Exposed for tests that need a cold cache. */
export function clearRuntimeBundleCache(): void {
  cached = undefined;
}
