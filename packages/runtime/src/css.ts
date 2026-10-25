/**
 * Minimal CSS scoper used to isolate scene-local styles.
 *
 * It understands nested at-rules and quoted strings. It intentionally does not
 * rename @keyframes (documented limitation: scene animations should use unique
 * keyframe names).
 */

function skipString(css: string, index: number): number {
  const quote = css[index];
  let cursor = index + 1;
  while (cursor < css.length) {
    if (css[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (css[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return css.length;
}

function skipComment(css: string, index: number): number {
  const end = css.indexOf('*/', index + 2);
  return end === -1 ? css.length : end + 2;
}

function findMatchingBrace(css: string, openIndex: number): number {
  let depth = 0;
  let index = openIndex;
  while (index < css.length) {
    const char = css[index]!;
    if (char === '/' && css[index + 1] === '*') {
      index = skipComment(css, index);
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return css.length;
}

function findNextOpenBrace(css: string, start: number): number {
  let index = start;
  while (index < css.length) {
    const char = css[index]!;
    if (char === '/' && css[index + 1] === '*') {
      index = skipComment(css, index);
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char === '{') return index;
    index += 1;
  }
  return -1;
}

function splitSelectors(selector: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let index = 0;
  while (index < selector.length) {
    const char = selector[index]!;
    if (char === '/' && selector[index + 1] === '*') {
      const end = skipComment(selector, index);
      index = end;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = skipString(selector, index);
      current += selector.slice(index, end);
      index = end;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
    index += 1;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (trimmed === ':root' || trimmed === 'html' || trimmed === 'body') return scope;
  if (trimmed.includes(':root')) return trimmed.replace(/:root\b/g, scope);
  if (trimmed.startsWith(scope)) return trimmed;
  return `${scope} ${trimmed}`;
}

function transform(css: string, scope: string): string {
  let output = '';
  let index = 0;
  while (index < css.length) {
    const open = findNextOpenBrace(css, index);
    if (open === -1) {
      output += css.slice(index);
      break;
    }
    const preludeStart = index;
    const preludeRaw = css.slice(preludeStart, open);
    const selector = preludeRaw.trim();
    const close = findMatchingBrace(css, open);
    const inner = css.slice(open + 1, close);
    if (selector.startsWith('@')) {
      const lowering = selector.toLowerCase();
      if (/^@(media|supports|container|layer|scope|document)\b/.test(lowering)) {
        output += `${css.slice(preludeStart, open + 1)}${transform(inner, scope)}}`;
      } else {
        output += css.slice(preludeStart, close + 1);
      }
    } else {
      const leading = preludeRaw.slice(0, preludeRaw.length - preludeRaw.trimStart().length);
      const scoped = splitSelectors(selector).map((part) => scopeSelector(part, scope)).join(', ');
      output += `${leading}${scoped}{${inner}}`;
    }
    index = close + 1;
  }
  return output;
}

export function scopeCss(css: string, sceneId: string): string {
  const scope = `[data-vhtml-scene="${sceneId.replace(/"/g, '\\"')}"]`;
  return transform(css, scope);
}

/** Remove CSS comments to keep stage documents smaller. */
export function stripCssComments(css: string): string {
  let output = '';
  let index = 0;
  while (index < css.length) {
    const char = css[index]!;
    if (char === '/' && css[index + 1] === '*') {
      index = skipComment(css, index);
      output += ' ';
      continue;
    }
    if (char === '"' || char === "'") {
      const end = skipString(css, index);
      output += css.slice(index, end);
      index = end;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}
