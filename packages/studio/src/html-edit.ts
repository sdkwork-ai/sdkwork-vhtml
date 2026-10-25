/**
 * Source-safe editing of one DOM element inside a Scene HTML fragment.
 *
 * The Studio reports an element path (indices among content elements, ignoring
 * `<style>`/`<script>` which are extracted by the VHTML parser). This module
 * applies a patch to the same path in the authored fragment and serializes it
 * back. Untouched markup, comments, styles and scripts are preserved.
 */

import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

type PNode = DefaultTreeAdapterTypes.Node;
type PElement = DefaultTreeAdapterTypes.Element;
type PFragment = DefaultTreeAdapterTypes.DocumentFragment;
type PAttribute = PElement['attrs'][number];

export interface HtmlElementPatch {
  /** Full desired attribute map (excluding `style`). `null` values remove. */
  attributes?: Record<string, string | null>;
  /** Full inline style declaration; empty/undefined removes it. */
  style?: string;
  /** Replace text of a leaf element. */
  text?: string;
  /** Replace the children of a container element with parsed HTML. */
  innerHTML?: string;
}

const MAX_PATH = 64;
const MAX_ATTRIBUTES = 128;
const MAX_VALUE = 200_000;
const NAME = /^[^\s"'<>/=]+$/;

function isElement(node: PNode): node is PElement {
  return 'tagName' in node;
}

function contentChildren(parent: PFragment | PElement): PElement[] {
  return (parent.childNodes ?? []).filter(
    (node): node is PElement => isElement(node) && node.tagName !== 'style' && node.tagName !== 'script',
  );
}

function findElement(fragment: PFragment, path: number[]): PElement {
  if (!path.length) throw new Error('select a Scene child element, not the generated Scene wrapper');
  let parent: PFragment | PElement = fragment;
  let current: PElement | undefined;
  for (const index of path) {
    const children = contentChildren(parent);
    current = children[index];
    if (!current) throw new Error(`element path does not exist at index ${index}`);
    parent = current;
  }
  if (!current) throw new Error('element path is empty');
  return current;
}

function attrKey(attribute: PAttribute): string {
  return attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name;
}

function validate(
  attributes: Record<string, string | null>,
  style: string | undefined,
  text: string | undefined,
  innerHTML: string | undefined,
): void {
  const names = Object.keys(attributes);
  if (names.length > MAX_ATTRIBUTES) throw new Error(`too many attributes (max ${MAX_ATTRIBUTES})`);
  for (const name of names) {
    if (!NAME.test(name)) throw new Error(`invalid attribute name: ${name}`);
    const value = attributes[name];
    if (value !== null && value.length > MAX_VALUE) throw new Error(`attribute value too long: ${name}`);
  }
  if (style !== undefined && style.length > MAX_VALUE) throw new Error('inline style is too long');
  if (text !== undefined && text.length > 1_000_000) throw new Error('text content is too long');
  if (innerHTML !== undefined && innerHTML.length > 1_000_000) throw new Error('inner HTML is too long');
  if (text !== undefined && innerHTML !== undefined) throw new Error('patch text and innerHTML are mutually exclusive');
}

/**
 * Apply an element patch to a Scene HTML fragment. Throws on invalid paths or
 * attempts to replace text on a container with element children.
 */
export function patchHtmlElement(html: string, path: number[], patch: HtmlElementPatch): string {
  if (!Array.isArray(path) || path.length > MAX_PATH) throw new Error('invalid element path');
  if (path.some((index) => !Number.isInteger(index) || index < 0)) throw new Error('invalid element path');
  validate(patch.attributes ?? {}, patch.style, patch.text, patch.innerHTML);

  const fragment = parseFragment(html) as PFragment;
  const element = findElement(fragment, path);

  if (patch.attributes) {
    const desired = new Map<string, string | null>();
    for (const [name, value] of Object.entries(patch.attributes)) {
      if (name.toLowerCase() === 'style') continue;
      desired.set(name, value);
    }
    const next: PAttribute[] = [];
    for (const attribute of element.attrs) {
      const key = attrKey(attribute);
      if (key === 'style') {
        next.push(attribute);
        continue;
      }
      if (!desired.has(key)) continue;
      const value = desired.get(key);
      desired.delete(key);
      if (value === null || value === undefined) continue;
      attribute.value = value;
      next.push(attribute);
    }
    for (const [name, value] of desired) {
      if (value === null) continue;
      next.push({ name, value });
    }
    element.attrs = next;
  }

  if (patch.style !== undefined) {
    const style = patch.style.trim();
    const existing = element.attrs.find((attribute) => attribute.name === 'style');
    if (style) {
      if (existing) existing.value = style;
      else element.attrs.push({ name: 'style', value: style });
    } else {
      element.attrs = element.attrs.filter((attribute) => attribute.name !== 'style');
    }
  }

  if (patch.text !== undefined) {
    const hasElementChildren = (element.childNodes ?? []).some((node) => isElement(node));
    if (hasElementChildren) {
      throw new Error('cannot replace text of a container with child elements; edit inner HTML or a leaf node instead');
    }
    element.childNodes = [{ nodeName: '#text', value: patch.text, parentNode: element } as DefaultTreeAdapterTypes.TextNode];
  }

  if (patch.innerHTML !== undefined) {
    const children = parseFragment(element, patch.innerHTML, {}) as PFragment;
    element.childNodes = children.childNodes;
    for (const child of element.childNodes) child.parentNode = element;
  }

  return serialize(fragment);
}
