/**
 * Project modularization: move inline Scene HTML/CSS/scripts into external
 * `scenes/<id>.html` files without changing rendered output.
 *
 * Relative URLs in the inline Scene are written relative to the new Scene file
 * so that the parser's external-Scene rebasing still resolves them against the
 * project root. Scripts are copied verbatim.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { Project, VhtmlDocument } from '@sdkwork/vhtml-core/model';
import { serializeDocument } from '@sdkwork/vhtml-core/serialize';
import { toPosixRelative, type ProjectLayoutPaths } from './manifest.ts';

type PNode = DefaultTreeAdapterTypes.Node;
type PElement = DefaultTreeAdapterTypes.Element;

export interface SplitScenesOptions {
  root: string;
  entry: string;
  document: VhtmlDocument;
  layout: ProjectLayoutPaths;
  /** Directory relative to the project root; defaults to layout.scenes. */
  scenesDir?: string;
  /** Overwrite existing Scene files. */
  force?: boolean;
  /** Do not write files; still returns the planned result. */
  dryRun?: boolean;
}

export interface SplitSceneFile {
  sceneId: string;
  file: string;
  src: string;
  bytes: number;
}

export interface SplitScenesResult {
  changed: boolean;
  files: SplitSceneFile[];
  skipped: Array<{ sceneId: string; reason: string }>;
  warnings: string[];
  project: Project;
}

const URL_ATTRIBUTES = new Set([
  'src', 'href', 'poster', 'data', 'action', 'formaction', 'xlink:href',
]);

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i;

function isElement(node: PNode): node is PElement {
  return 'tagName' in node;
}

function rewriteUrl(value: string, prefix: string): string {
  if (!value || !prefix || ABSOLUTE_URL.test(value)) return value;
  return `${prefix}${value}`;
}

function rewriteCssUrls(css: string, prefix: string): string {
  if (!prefix) return css;
  const withUrls = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote: string, url: string) => {
    const next = rewriteUrl(url.trim(), prefix);
    return next === url.trim() ? match : `url(${quote}${next}${quote})`;
  });
  return withUrls.replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote: string, url: string) => {
    const next = rewriteUrl(url.trim(), prefix);
    return next === url.trim() ? match : `@import ${quote}${next}${quote}`;
  });
}

function rewriteSrcset(value: string, prefix: string): string {
  if (!prefix) return value;
  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;
      const [url, ...descriptor] = trimmed.split(/\s+/);
      return [rewriteUrl(url!, prefix), ...descriptor].join(' ');
    })
    .join(', ');
}

function rewriteHtmlUrls(html: string, prefix: string): string {
  if (!prefix) return html;
  const fragment = parseFragment(html);
  const visit = (node: PNode): void => {
    if (!isElement(node)) return;
    for (const attribute of node.attrs) {
      const name = (attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name).toLowerCase();
      if (name === 'style') {
        attribute.value = rewriteCssUrls(attribute.value, prefix);
      } else if (name === 'srcset') {
        attribute.value = rewriteSrcset(attribute.value, prefix);
      } else if (URL_ATTRIBUTES.has(name)) {
        attribute.value = rewriteUrl(attribute.value.trim(), prefix);
      }
    }
    if (node.tagName === 'style') {
      for (const child of node.childNodes) {
        if (child.nodeName === '#text' && 'value' in child) child.value = rewriteCssUrls(child.value, prefix);
      }
    }
    for (const child of node.childNodes) visit(child);
  };
  for (const child of fragment.childNodes) visit(child);
  return serialize(fragment);
}

function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z0-9_]+/, '') || 'scene';
}

function composeSceneFile(html: string, css: string | undefined, scripts: string[] | undefined, prefix: string): string {
  const parts: string[] = [];
  if (css?.trim()) parts.push(`<style>\n${rewriteCssUrls(css, prefix)}\n</style>`);
  for (const script of scripts ?? []) parts.push(script);
  if (html.trim()) parts.push(rewriteHtmlUrls(html, prefix));
  return `${parts.join('\n\n')}\n`;
}

function writeAtomic(file: string, content: string): void {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
}

/**
 * Split every inline Scene of a parsed project into an external Scene file.
 * Existing `src` Scenes are skipped. Relative URLs are rebased for the new
 * directory. The returned document is mutated; the entry is not written unless
 * `dryRun` is false.
 */
export function splitInlineScenes(options: SplitScenesOptions): SplitScenesResult {
  const root = path.resolve(options.root);
  const entry = path.resolve(options.entry);
  const scenesDirRelative = (options.scenesDir ?? options.layout.scenes).replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
  const scenesDir = path.resolve(root, scenesDirRelative);
  const relation = path.relative(root, scenesDir);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    throw new Error(`scenes directory must be inside the project root: ${scenesDirRelative}`);
  }

  const skipped: Array<{ sceneId: string; reason: string }> = [];
  const warnings: string[] = [];
  const planned = new Map<string, { scene: Project['scenes'][number]; file: string; src: string; content: string }>();

  for (const scene of options.document.project.scenes) {
    if (scene.src) {
      skipped.push({ sceneId: scene.id, reason: 'already external' });
      continue;
    }
    const filename = `${safeId(scene.id)}.html`;
    const file = path.join(scenesDir, filename);
    const src = toPosixRelative(root, file);
    if (planned.has(src) || (fs.existsSync(file) && !options.force)) {
      throw new Error(`scene file already exists: ${src} (use --force to overwrite)`);
    }
    const prefix = path.relative(path.dirname(file), root).split(path.sep).join('/');
    const urlPrefix = prefix ? `${prefix}/` : '';
    const content = composeSceneFile(scene.html, scene.css, scene.scripts, urlPrefix);
    planned.set(src, { scene, file, src, content });
  }

  if (!planned.size) {
    return { changed: false, files: [], skipped, warnings, project: options.document.project };
  }

  const results: SplitSceneFile[] = [];
  if (!options.dryRun) {
    fs.mkdirSync(scenesDir, { recursive: true });
    for (const item of planned.values()) writeAtomic(item.file, item.content);
    for (const item of planned.values()) {
      item.scene.src = item.src;
      item.scene.html = '';
      item.scene.css = undefined;
      item.scene.scripts = undefined;
      results.push({
        sceneId: item.scene.id,
        file: item.file,
        src: item.src,
        bytes: Buffer.byteLength(item.content),
      });
    }
    writeAtomic(entry, serializeDocument(options.document));
  } else {
    for (const item of planned.values()) {
      results.push({
        sceneId: item.scene.id,
        file: item.file,
        src: item.src,
        bytes: Buffer.byteLength(item.content),
      });
    }
  }

  if (results.length) {
    warnings.push('relative URLs were rebased to the Scene directory; review script-generated URLs manually');
  }

  return { changed: true, files: results, skipped, warnings, project: options.document.project };
}
