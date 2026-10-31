/**
 * VHTML 1.1 parser.
 *
 * Uses the HTML5 tree construction algorithm (parse5) so that every document is
 * parsed exactly as a browser would parse it. VHTML core elements are recognised
 * by context; HTML content subtrees are preserved verbatim and never rewritten.
 *
 * HTML-safe naming note: `<track>` (void) and `<caption>` (table-only) cannot be
 * used as VHTML containers without corrupting the HTML5 tree. 1.1 therefore uses
 * `<lane>` and `<cue>`. The parser detects legacy `<track>` and explains the fix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, parseFragment, serialize, serializeOuter } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import {
  DEFAULT_CLIP,
  DEFAULT_COMPOSITION,
  DEFAULT_TRANSFORM,
  SPEC_VERSION,
  type Animation,
  type AnimationDirection,
  type AnimationFill,
  type AnimationCompose,
  type Asset,
  type AssetKind,
  type BlendMode,
  type CaptionClip,
  type Clip,
  type ClipKind,
  type Composition,
  type Crop,
  type DataClip,
  type Effect,
  type EasingName,
  type GenerationConstraints,
  type GenerationDirection,
  type GenerationInput,
  type GenerationKind,
  GENERATION_REVIEW_STATUSES,
  type GenerationReview,
  type GenerationOutputSpec,
  type GenerationRights,
  type GenerationSafety,
  type GenerationTask,
  type GenerationUsage,
  type BibleProfile,
  type BibleReference,
  type ExtensionDeclaration,
  type ExtensionKind,
  type Keyframe,
  type Marker,
  type MediaClip,
  type OutputConfig,
  type OutputFormat,
  type Project,
  type Scene,
  type SceneClip,
  type StoryboardShot,
  type StoryboardStatus,
  type TimeRemap,
  type TimeRemapKeyframe,
  type Timeline,
  type TimelineClip,
  type Track,
  type TrackType,
  type Transform,
  type Transition,
  type TransitionDirection,
  type TransitionType,
  type DataBlock,
  type VhtmlDocument,
  generationKindToAssetKind,
  resolveReference,
} from './model.ts';
import {
  DiagnosticBag,
  ErrorCode,
  VhtmlError,
  errorDiagnostic,
  formatDiagnostic,
  type Diagnostic,
  type SourceLocation,
} from './errors.ts';
import {
  ZERO,
  add,
  div,
  eq,
  gt,
  gte,
  lt,
  mul,
  parseFrameRate,
  parseTime,
  rat,
  sub,
  type Rate,
  type Rational,
} from './time.ts';

type PNode = DefaultTreeAdapterTypes.Node;
type PElement = DefaultTreeAdapterTypes.Element;
type PParent = DefaultTreeAdapterTypes.ParentNode;
type PDocument = DefaultTreeAdapterTypes.Document;
type PFragment = DefaultTreeAdapterTypes.DocumentFragment;

export interface ParseOptions {
  file?: string;
  /** Directory for relative assets; defaults to the file's directory. */
  root?: string;
  /** Optional file reader for external Scene fragments (defaults to fs.readFileSync). */
  readFile?: (absolutePath: string) => string;
}

export interface ParseResult {
  document: VhtmlDocument;
  diagnostics: Diagnostic[];
}

const CLIP_KINDS: ClipKind[] = ['scene', 'timeline', 'video', 'image', 'svg', 'audio', 'caption', 'data'];
const TRACK_TYPES: TrackType[] = ['video', 'overlay', 'audio', 'caption', 'data'];
const BLEND_MODES = new Set<BlendMode>([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
  'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue',
  'saturation', 'color', 'luminosity', 'plus-lighter',
]);
const OUTPUT_FORMATS = new Set<OutputFormat>(['mp4', 'webm', 'gif', 'png-sequence', 'wav', 'mp3']);
const GENERATION_KINDS = new Set<GenerationKind>([
  'image', 'video', 'audio', 'music', 'speech', 'sfx', 'text', 'edit',
  'avatar', 'lipsync', 'dub', 'matte', 'translation', 'storyboard', 'transcribe',
]);
const STORYBOARD_STATUSES = new Set<StoryboardStatus>([
  'idea', 'boarded', 'generating', 'ready', 'approved',
]);

function encodeUrlPath(value: string): string {
  return value
    .split(path.sep)
    .map((part) =>
      encodeURIComponent(part).replace(/%(?:24|26|2B|2C|3A|3B|3D|40)/gi, (escape) =>
        String.fromCharCode(Number.parseInt(escape.slice(1), 16)),
      ),
    )
    .join('/');
}
const TRANSITION_TYPES = new Set<TransitionType>([
  'crossfade', 'fade', 'wipe', 'slide', 'zoom', 'blur', 'dip',
]);
const DIRECTIONS = new Set<TransitionDirection>(['left', 'right', 'up', 'down']);

const ASSET_EXTENSIONS: Record<string, AssetKind> = {  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', avif: 'image', gif: 'image', bmp: 'image',
  svg: 'svg',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio',
  vtt: 'captions', srt: 'captions',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font',
  json: 'data', csv: 'data', txt: 'data',
};

function isElement(node: PNode | undefined): node is PElement {
  return Boolean(node && 'tagName' in node);
}

function tagOf(node: PElement): string {
  return node.tagName.toLowerCase();
}

function childNodesOf(parent: PParent | PElement): PNode[] {
  return (parent.childNodes ?? []) as PNode[];
}

function elementChildren(parent: PParent | PElement): PElement[] {
  return childNodesOf(parent).filter(isElement);
}

function attrOf(el: PElement, ...names: string[]): string | undefined {
  for (const name of names) {
    const found = el.attrs.find((attr) => attr.name.toLowerCase() === name);
    if (found) return found.value;
  }
  return undefined;
}

function hasAttr(el: PElement, name: string): boolean {
  return el.attrs.some((attr) => attr.name.toLowerCase() === name);
}

function serializeNode(node: PNode): string {
  if (isElement(node)) return serializeOuter(node);
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('data' in node && typeof node.data === 'string') return `<!--${node.data}-->`;
  return '';
}

function textOf(node: PNode): string {
  if (!('childNodes' in node)) return '';
  const parts: string[] = [];
  for (const child of node.childNodes as PNode[]) {
    if (isElement(child)) {
      if (tagOf(child) === 'script' || tagOf(child) === 'style') continue;
      parts.push(textOf(child));
    } else if ('value' in child) {
      parts.push(child.value);
    }
  }
  return parts.join('');
}

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'true' || v === 'yes' || v === '1' || v === 'on') return true;
  if (v === 'false' || v === 'no' || v === '0' || v === 'off') return false;
  return fallback;
}

function parseStyleDeclarations(css: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of css.split(';')) {
    const index = part.indexOf(':');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && value) result[name] = value;
  }
  return result;
}

function splitList(value: string): string[] {
  return value.split(';').map((part) => part.trim()).filter(Boolean);
}

function convertParam(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseAngle(value: string): number | undefined {
  const match = /^([+-]?\d+(?:\.\d+)?)(deg|rad|turn)?$/.exec(value.trim());
  if (!match) return undefined;
  const number = Number(match[1]);
  switch (match[2]) {
    case 'rad': return (number * 180) / Math.PI;
    case 'turn': return number * 360;
    default: return number;
  }
}

function parseGain(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().toLowerCase();
  const numeric = /^([+-]?\d+(?:\.\d+)?)\s*(db|%)?$/.exec(trimmed);
  if (!numeric) return undefined;
  const number = Number(numeric[1]);
  if (numeric[2] === 'db') return 10 ** (number / 20);
  if (numeric[2] === '%') return number / 100;
  return number;
}

function parsePan(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const percent = /^([+-]?\d+(?:\.\d+)?)%$/.exec(trimmed);
  const number = percent ? Number(percent[1]) / 100 : Number(trimmed);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(-1, Math.min(1, number));
}

function parseSpeed(value: string | undefined): Rational | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const ratio = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (ratio) {
    const speed = rat(Math.round(Number(ratio[1]) * 1e6), Math.round(Number(ratio[2]) * 1e6));
    if (speed.num > 0) return speed;
    return undefined;
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return rat(Math.round(number * 1e6), 1e6);
}

function inferAssetKind(src: string): AssetKind | undefined {
  const clean = src.split(/[?#]/)[0] ?? src;
  const ext = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase();
  return ASSET_EXTENSIONS[ext];
}

/**
 * HTML5 ignores the self-closing flag on non-void elements. VHTML authors
 * reasonably expect `<asset … />` to behave like XML, so the parser expands
 * self-closing VHTML tags to explicit start/end pairs before invoking parse5.
 * HTML content inside <scene> is never rewritten.
 */
const VHTML_SELF_CLOSING_TAGS = new Set([
  'vhtml', 'project', 'settings', 'composition', 'assets', 'asset', 'scenes', 'scene',
  'timelines', 'timeline', 'lane', 'clip', 'cue', 'transition', 'transitions', 'effect',
  'effects', 'audio-effect', 'animate', 'animations', 'keyframe', 'transform', 'crop',
  'generate', 'generations', 'prompt', 'negative-prompt', 'gen-input', 'constraints',
  'params', 'direction', 'review', 'rights', 'safety', 'usage', 'gen-output', 'outputs', 'output', 'markers', 'marker', 'metadata',
  'characters', 'character', 'style-guide', 'reference', 'negative', 'extensions',
  'storyboard', 'shot', 'description', 'notes',
  'requirements', 'requires', 'extension', 'license', 'tracks', 'lanes', 'captions',
  'timeremap', 'time-remap', 'remap', 'data', 'program', 'param',
]);

function expandSelfClosingTags(source: string): string {
  let result = '';
  let index = 0;
  let sceneDepth = 0;
  let rawTextTag: string | undefined;

  while (index < source.length) {
    if (rawTextTag) {
      const lower = source.toLowerCase();
      const close = lower.indexOf(`</${rawTextTag}`, index);
      if (close === -1) {
        result += source.slice(index);
        break;
      }
      result += source.slice(index, close);
      index = close;
      rawTextTag = undefined;
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      const stop = end === -1 ? source.length : end + 3;
      result += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (source[index] !== '<') {
      result += source[index];
      index += 1;
      continue;
    }
    let cursor = index + 1;
    let quote: string | undefined;
    while (cursor < source.length) {
      const char = source[cursor];
      if (quote) {
        if (char === quote) quote = undefined;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
      cursor += 1;
    }
    if (cursor >= source.length) {
      result += source.slice(index);
      break;
    }
    const rawTag = source.slice(index, cursor + 1);
    const nameMatch = /^<\s*\/?\s*([A-Za-z][A-Za-z0-9:_-]*)/.exec(rawTag);
    const name = nameMatch?.[1]?.toLowerCase();
    const closing = /^<\s*\//.test(rawTag);
    const selfClosing = /\/\s*>$/.test(rawTag);
    const isSceneTag = name === 'scene';

    if (name && !closing) {
      if ((name === 'script' || name === 'style') && !selfClosing) rawTextTag = name;
    }

    if (!closing && name && sceneDepth === 0 && selfClosing && VHTML_SELF_CLOSING_TAGS.has(name)) {
      const replaced = rawTag.replace(/\/\s*>$/, `></${name}>`);
      result += replaced;
    } else {
      result += rawTag;
    }

    if (isSceneTag) {
      if (closing) sceneDepth = Math.max(0, sceneDepth - 1);
      else if (!(selfClosing && name && VHTML_SELF_CLOSING_TAGS.has(name))) sceneDepth += 1;
    }
    index = cursor + 1;
  }
  return result;
}

function mediaKindToClipKind(kind: AssetKind): ClipKind | undefined {
  switch (kind) {
    case 'video': return 'video';
    case 'image': return 'image';
    case 'svg': return 'svg';
    case 'audio': return 'audio';
    default: return undefined;
  }
}

function defaultCodecs(format: OutputFormat): { videoCodec: string; audioCodec: string } {
  switch (format) {
    case 'mp4': return { videoCodec: 'libx264', audioCodec: 'aac' };
    case 'webm': return { videoCodec: 'libvpx-vp9', audioCodec: 'libopus' };
    case 'gif': return { videoCodec: 'gif', audioCodec: 'none' };
    case 'png-sequence': return { videoCodec: 'png', audioCodec: 'none' };
    case 'wav': return { videoCodec: 'none', audioCodec: 'pcm_s16le' };
    case 'mp3': return { videoCodec: 'none', audioCodec: 'libmp3lame' };
    default: return { videoCodec: 'libx264', audioCodec: 'aac' };
  }
}

class VhtmlParser {
  readonly source: string;
  readonly originalSource: string;
  readonly file: string;
  readonly root: string;
  readonly diagnostics = new DiagnosticBag();
  private readonly usedIds = new Set<string>();
  private readonly readFile: (absolutePath: string) => string;
  private autoCounter = 0;
  private doc!: PDocument;
  private vhtmlEl?: PElement;
  private projectEl!: PElement;
  private project!: Project;
  private compositionDurationExplicit = false;
  private mainTimelineExplicit = false;
  private documentProgram?: { code: string; seed?: number; params: Record<string, string>; source?: SourceLocation };
  private documentDataBlocks?: DataBlock[];

  constructor(source: string, options: ParseOptions = {}) {
    this.originalSource = source.startsWith('\uFEFF') ? source.slice(1) : source;
    this.source = expandSelfClosingTags(this.originalSource);
    this.file = options.file ?? '<input>.vhtml';
    this.root = options.root ?? path.dirname(path.resolve(this.file));
    this.readFile = options.readFile ?? ((absolutePath) => fs.readFileSync(absolutePath, 'utf8'));
  }

  parse(): ParseResult {
    this.doc = parse(this.source, { sourceCodeLocationInfo: true, scriptingEnabled: true }) as PDocument;
    this.locateRoot();
    this.initProject();
    this.parseComposition();
    this.parseAssets();
    this.parseScenes();
    this.parseGenerations();
    this.parseBibles();
    this.parseExtensions();
    this.parseStoryboard();
    this.parseTimelines();
    this.parseProjectAnimations();
    this.parseOutputs();
    this.parseProjectMetadata();
    this.parseAuthoringProgram();
    this.collectGlobalResources();
    this.finalize();
    return {
      document: {
        specVersion: SPEC_VERSION,
        project: this.project,
        source: { path: this.file, root: this.root, raw: this.originalSource },
        warnings: this.diagnostics.items.filter((d) => d.severity !== 'error'),
        program: this.documentProgram,
        dataBlocks: this.documentDataBlocks,
      },
      diagnostics: this.diagnostics.items,
    };
  }

  // ---------------------------------------------------------------- helpers

  private loc(el: PElement): SourceLocation | undefined {
    const location = el.sourceCodeLocation;
    if (!location) return undefined;
    return {
      file: this.file,
      line: location.startLine,
      column: location.startCol,
      endLine: location.endLine,
      endColumn: location.endCol,
      offset: location.startOffset,
      length: location.endOffset - location.startOffset,
    };
  }

  private error(code: string, message: string, el?: PElement, extra: Omit<Diagnostic, 'code' | 'message' | 'severity' | 'source'> = {}): void {
    this.diagnostics.add(errorDiagnostic(code, message, { ...extra, source: el ? this.loc(el) : undefined }));
  }

  private warn(code: string, message: string, el?: PElement, extra: Omit<Diagnostic, 'code' | 'message' | 'severity' | 'source'> = {}): void {
    this.diagnostics.add({
      code,
      severity: 'warning',
      message,
      ...extra,
      source: el ? this.loc(el) : undefined,
    });
  }

  private attr(el: PElement, ...names: string[]): string | undefined {
    return attrOf(el, ...names);
  }

  private requiredAttr(el: PElement, name: string, what: string): string {
    const value = this.attr(el, name);
    if (value === undefined || value === '') {
      this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, `${what} requires a "${name}" attribute`, el);
      return '';
    }
    return value;
  }

  private intAttr(
    el: PElement,
    name: string,
    fallback: number | undefined,
    min: number,
    max: number,
    options: { required?: boolean } = {},
  ): number | undefined {
    const raw = this.attr(el, name);
    if (raw === undefined) {
      if (options.required) this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, `missing required attribute "${name}"`, el);
      return fallback;
    }
    if (!/^[+-]?\d+$/.test(raw.trim())) {
      this.error(ErrorCode.PARSE_INVALID_ATTRIBUTE, `attribute "${name}" must be an integer, got "${raw}"`, el);
      return fallback;
    }
    const value = Number(raw);
    if (value < min || value > max) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `attribute "${name}" must be between ${min} and ${max}, got ${value}`, el);
      return fallback;
    }
    return value;
  }

  private numberAttr(el: PElement, name: string, fallback: number | undefined, min: number, max: number): number | undefined {
    const raw = this.attr(el, name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      this.error(ErrorCode.PARSE_INVALID_ATTRIBUTE, `attribute "${name}" must be a number in [${min}, ${max}]`, el);
      return fallback;
    }
    return value;
  }

  private timeAttr(
    el: PElement,
    name: string,
    fallback?: Rational,
    options: { required?: boolean; frameRate?: Rate } = {},
  ): Rational | undefined {
    const raw = this.attr(el, name);
    if (raw === undefined || raw === '') {
      if (options.required) this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, `missing required time attribute "${name}"`, el);
      return fallback;
    }
    try {
      return parseTime(raw, { frameRate: options.frameRate ?? this.project?.composition?.frameRate });
    } catch (error) {
      this.error(ErrorCode.TIME_INVALID, (error as Error).message, el);
      return fallback;
    }
  }

  private idFor(el: PElement, kind: string, required = false): string {
    let id = this.attr(el, 'id');
    if (!id) {
      if (required) {
        this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, `<${tagOf(el)}> requires an "id" attribute`, el);
      }
      id = this.uniqueId(`${kind}-${++this.autoCounter}`);
    }
    if (this.usedIds.has(id)) {
      this.error(ErrorCode.PARSE_DUPLICATE_ID, `duplicate id "${id}"`, el, { objectId: id });
      id = this.uniqueId(`${id}-${++this.autoCounter}`);
    }
    this.usedIds.add(id);
    return id;
  }

  private uniqueId(candidate: string): string {
    let id = candidate.replace(/[^A-Za-z0-9_.:-]/g, '-').replace(/^[^A-Za-z_]/, '_$&');
    let counter = 1;
    while (this.usedIds.has(id)) id = `${candidate}-${counter++}`;
    return id;
  }

  private findFirst(tag: string, root: PParent = this.doc): PElement | undefined {
    const stack: PNode[] = [...childNodesOf(root)];
    while (stack.length) {
      const node = stack.shift()!;
      if (!isElement(node)) continue;
      if (tagOf(node) === tag) return node;
      stack.unshift(...childNodesOf(node));
    }
    return undefined;
  }

  private direct(el: PElement, tag: string): PElement[] {
    return elementChildren(el).filter((child) => tagOf(child) === tag);
  }

  private wrapped(el: PElement, wrapper: string, tag: string): PElement[] {
    const result = this.direct(el, tag);
    for (const w of this.direct(el, wrapper)) {
      result.push(...elementChildren(w).filter((child) => tagOf(child) === tag));
    }
    return result;
  }

  private locateRoot(): void {
    this.vhtmlEl = this.findFirst('vhtml');
    let projectEl: PElement | undefined;
    if (this.vhtmlEl) {
      projectEl = this.findFirst('project', this.vhtmlEl) ?? undefined;
      if (!projectEl) {
        this.error(ErrorCode.PARSE_INVALID_DOCUMENT, '<vhtml> root must contain a <project> element', this.vhtmlEl);
      }
    } else {
      projectEl = this.findFirst('project');
    }
    if (!projectEl) {
      throw new VhtmlError(
        ErrorCode.PARSE_INVALID_DOCUMENT,
        'VHTML document has no <project> root element. Wrap project semantics in <vhtml version="1.1"><project …>…</project></vhtml>.',
      );
    }
    this.projectEl = projectEl;
  }

  private initProject(): void {
    const version = this.attr(this.projectEl, 'version') ?? (this.vhtmlEl ? this.attr(this.vhtmlEl, 'version') : undefined);
    if (!version) {
      this.error(
        ErrorCode.PARSE_MISSING_ATTRIBUTE,
        'the project root must declare version="1.1"',
        this.projectEl,
      );
    } else if (version !== SPEC_VERSION && version !== '1.0') {
      this.error(
        ErrorCode.PARSE_UNSUPPORTED_VERSION,
        `unsupported VHTML version "${version}"; this runtime implements ${SPEC_VERSION}`,
        this.projectEl,
      );
    } else if (version === '1.0') {
      this.warn(
        ErrorCode.PARSE_UNSUPPORTED_VERSION,
        'VHTML 1.0 documents are parsed with 1.1 semantics; <track> must be migrated to <lane> and <caption> to <cue>',
        this.projectEl,
      );
    }

    const id = this.attr(this.projectEl, 'id') ?? 'untitled';
    this.usedIds.add(id);
    this.project = {
      id,
      version: SPEC_VERSION,
      title: this.attr(this.projectEl, 'title') ?? this.titleFromHead(),
      description: this.attr(this.projectEl, 'description', 'summary'),
      lang: this.attr(this.projectEl, 'lang') ?? this.attr(this.findFirst('html') ?? this.projectEl, 'lang'),
      composition: { ...DEFAULT_COMPOSITION, frameRate: rat(30), duration: rat(8) },
      assets: [],
      scenes: [],
      timelines: [],
      generations: [],
      storyboard: [],
      outputs: [],
      styles: [],
      stylesheets: [],
      scripts: [],
      animations: [],
      metadata: {},
      requirements: [],
      mainTimeline: 'main',
    };
  }

  private titleFromHead(): string | undefined {
    const title = this.findFirst('title');
    if (!title) return undefined;
    const text = textOf(title).trim();
    return text || undefined;
  }

  private parseComposition(): void {
    const settings = this.direct(this.projectEl, 'settings')[0];
    const compositionEl =
      (settings ? this.direct(settings, 'composition')[0] : undefined) ??
      this.direct(this.projectEl, 'composition')[0];
    if (!compositionEl) {
      this.error(
        ErrorCode.PARSE_MISSING_ATTRIBUTE,
        'project requires a <composition> (inside <settings>) with width, height, frame-rate and duration',
        this.projectEl,
      );
      this.project.composition = { ...DEFAULT_COMPOSITION };
      return;
    }
    const width = this.intAttr(compositionEl, 'width', 1920, 16, 16384, { required: true }) ?? 1920;
    const height = this.intAttr(compositionEl, 'height', 1080, 16, 16384, { required: true }) ?? 1080;
    let frameRate = rat(30);
    const rateRaw = this.attr(compositionEl, 'frame-rate', 'fps');
    if (rateRaw === undefined) {
      this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, 'composition requires frame-rate', compositionEl);
    } else {
      try {
        frameRate = parseFrameRate(rateRaw);
      } catch (error) {
        this.error(ErrorCode.TIME_INVALID, (error as Error).message, compositionEl);
      }
    }
    const durationRaw = this.attr(compositionEl, 'duration');
    let duration = rat(8);
    if (durationRaw === undefined) {
      this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, 'composition requires duration', compositionEl);
    } else {
      try {
        duration = parseTime(durationRaw, { frameRate });
        this.compositionDurationExplicit = true;
      } catch (error) {
        this.error(ErrorCode.TIME_INVALID, (error as Error).message, compositionEl);
      }
    }
    const sampleRate = this.intAttr(compositionEl, 'sample-rate', 48_000, 8_000, 192_000) ?? 48_000;
    const channels = this.intAttr(compositionEl, 'channels', 2, 1, 8) ?? 2;
    const background = this.attr(compositionEl, 'background') ?? '#000000';
    const colorSpaceRaw = this.attr(compositionEl, 'color-space') ?? 'srgb';
    const colorSpace = colorSpaceRaw === 'display-p3' || colorSpaceRaw === 'rec709' ? colorSpaceRaw : 'srgb';
    if (!['srgb', 'display-p3', 'rec709'].includes(colorSpaceRaw)) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unsupported color-space "${colorSpaceRaw}"`, compositionEl);
    }
    const seed = this.intAttr(compositionEl, 'seed', 1, 0, 2 ** 31 - 1) ?? 1;
    const dpr = this.numberAttr(compositionEl, 'device-scale-factor', 1, 1, 4) ?? 1;
    this.project.composition = {
      width,
      height,
      frameRate,
      duration,
      sampleRate,
      channels,
      background,
      colorSpace,
      seed,
      deviceScaleFactor: dpr,
    };
  }

  private parseAssets(): void {
    for (const el of this.wrapped(this.projectEl, 'assets', 'asset')) {
      const id = this.idFor(el, 'asset', true);
      const src = this.requiredAttr(el, 'src', '<asset>');
      const typeRaw = this.attr(el, 'type', 'kind');
      let kind = typeRaw ? (typeRaw as AssetKind) : inferAssetKind(src);
      if (!kind || !['image', 'video', 'audio', 'font', 'data', 'captions', 'svg'].includes(kind)) {
        this.error(
          ErrorCode.ASSET_UNSUPPORTED_TYPE,
          `cannot determine asset type for "${src}"; add type="image|video|audio|svg|font|data|captions"`,
          el,
          { objectId: id },
        );
        kind = 'data';
      }
      const duration = this.timeAttr(el, 'duration');
      const asset: Asset = {
        id,
        kind,
        src,
        mimeType: this.attr(el, 'mime-type'),
        duration,
        width: this.intAttr(el, 'width', undefined, 1, 100_000),
        height: this.intAttr(el, 'height', undefined, 1, 100_000),
        sampleRate: this.intAttr(el, 'sample-rate', undefined, 1, 384_000),
        channels: this.intAttr(el, 'channels', undefined, 1, 32),
        hash: this.attr(el, 'hash', 'sha256'),
        size: this.intAttr(el, 'size', undefined, 0, Number.MAX_SAFE_INTEGER),
        alt: this.attr(el, 'alt'),
        loop: this.attr(el, 'loop') !== undefined ? parseBool(this.attr(el, 'loop')) : undefined,
        license: this.parseAssetLicense(el),
        provenance: this.parseAssetProvenance(el),
        generatedBy: this.attr(el, 'generated-by'),
        metadata: {},
        source: this.loc(el),
      };
      if (kind !== 'image' && kind !== 'svg' && kind !== 'video' && kind !== 'audio' && !duration) {
        // non-time-bearing assets do not need duration
      }
      this.project.assets.push(asset);
    }
  }

  private parseAssetLicense(el: PElement): Asset['license'] {
    const licenseEl = this.direct(el, 'license')[0];
    if (!licenseEl) return undefined;
    const name = this.attr(licenseEl, 'name');
    const url = this.attr(licenseEl, 'url');
    const attribution = this.attr(licenseEl, 'attribution');
    const commercialUse = this.attr(licenseEl, 'commercial-use');
    if (!name && !url && !attribution && commercialUse === undefined) return undefined;
    return {
      name,
      url,
      attribution,
      commercialUse: commercialUse === undefined ? undefined : parseBool(commercialUse),
    };
  }

  private parseAssetProvenance(el: PElement): Asset['provenance'] {
    const generatedBy = this.attr(el, 'generated-by');
    const provider = this.attr(el, 'provider');
    const model = this.attr(el, 'model');
    if (!generatedBy && !provider && !model) return undefined;
    return {
      source: generatedBy ? 'generated' : 'file',
      taskId: generatedBy,
      provider,
      model,
      seed: this.intAttr(el, 'seed', undefined, 0, 2 ** 31 - 1),
      promptHash: this.attr(el, 'prompt-hash'),
      createdAt: this.attr(el, 'created-at'),
    };
  }

  private parseScenes(): void {
    for (const el of this.wrapped(this.projectEl, 'scenes', 'scene')) {
      const id = this.idFor(el, 'scene', true);
      const externalSrc = this.attr(el, 'src');
      let content: { html: string; css: string; scripts: string[] };
      if (externalSrc) {
        content = this.loadExternalScene(el, externalSrc, id);
      } else {
        content = this.extractSceneContent(el);
      }
      const scene: Scene = {
        id,
        name: this.attr(el, 'name'),
        src: externalSrc,
        duration: this.timeAttr(el, 'duration'),
        width: this.intAttr(el, 'width', undefined, 1, 100_000),
        height: this.intAttr(el, 'height', undefined, 1, 100_000),
        background: this.attr(el, 'background'),
        html: content.html,
        css: content.css || undefined,
        scripts: content.scripts.length ? content.scripts : undefined,
        metadata: {},
        source: this.loc(el),
      };
      this.project.scenes.push(scene);
    }
  }

  /**
   * Load an external Scene HTML fragment. Relative URLs are rebased to the
   * project root so the browser stage (served at `/`) resolves them correctly.
   */
  /** Resolve and read an external `<data src>` file under the project root. */
  private readDataFile(el: PElement, rawSrc: string, id: string): { content: string; src?: string } {
    let decoded = rawSrc.trim().split('#')[0]!.split('?')[0]!;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep raw */
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded)) {
      this.error(ErrorCode.SECURITY_PATH_ESCAPE, `data "${id}" src must be a project-local file, not a URL: ${rawSrc}`, el, { objectId: id });
      return { content: '' };
    }
    const absolute = path.resolve(this.root, decoded);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      this.error(ErrorCode.SECURITY_PATH_ESCAPE, `data "${id}" src escapes the project root: ${rawSrc}`, el, { objectId: id });
      return { content: '' };
    }
    try {
      const realRoot = fs.realpathSync(this.root);
      const realFile = fs.realpathSync(absolute);
      const realRelative = path.relative(realRoot, realFile);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        this.error(ErrorCode.SECURITY_PATH_ESCAPE, `data "${id}" src resolves outside the project root via a link: ${rawSrc}`, el, { objectId: id });
        return { content: '' };
      }
      return { content: fs.readFileSync(realFile, 'utf8'), src: rawSrc };
    } catch (error) {
      this.error(ErrorCode.IO_NOT_FOUND, `data "${id}" src could not be read: ${(error as Error).message}`, el, { objectId: id });
      return { content: '' };
    }
  }

  private loadExternalScene(el: PElement, rawSrc: string, id: string): { html: string; css: string; scripts: string[] } {
    let decoded = rawSrc.trim();
    // Strip query/hash *before* decoding so %23 and %3F remain legal filename
    // characters instead of being mistaken for a fragment/query delimiter.
    decoded = decoded.split('#')[0]!.split('?')[0]!;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep raw */
    }
    const clean = decoded;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) {
      this.error(
        ErrorCode.SECURITY_PATH_ESCAPE,
        `scene "${id}" src must be a project-local file, not a URL: ${rawSrc}`,
        el,
        { objectId: id },
      );
      return { html: '', css: '', scripts: [] };
    }
    const absolute = path.resolve(this.root, clean);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      this.error(
        ErrorCode.SECURITY_PATH_ESCAPE,
        `scene "${id}" src escapes the project root: ${rawSrc}`,
        el,
        { objectId: id },
      );
      return { html: '', css: '', scripts: [] };
    }
    let content: string;
    try {
      const realRoot = fs.realpathSync(this.root);
      const realFile = fs.realpathSync(absolute);
      const realRelative = path.relative(realRoot, realFile);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        this.error(
          ErrorCode.SECURITY_PATH_ESCAPE,
          `scene "${id}" src resolves outside the project root via a link: ${rawSrc}`,
          el,
          { objectId: id },
        );
        return { html: '', css: '', scripts: [] };
      }
      const stat = fs.statSync(realFile);
      if (stat.size > 16 * 1024 * 1024) {
        this.error(ErrorCode.ASSET_TOO_LARGE, `external scene "${rawSrc}" is larger than 16 MiB`, el, { objectId: id });
      }
      content = this.readFile(realFile).replace(/^\uFEFF/, '');
    } catch (error) {
      this.error(
        ErrorCode.ASSET_NOT_FOUND,
        `scene "${id}" external file not found: ${rawSrc} (${(error as Error).message})`,
        el,
        { objectId: id },
      );
      return { html: '', css: '', scripts: [] };
    }
    let fragment: PFragment;
    try {
      fragment = parseFragment(content, { sourceCodeLocationInfo: false }) as PFragment;
    } catch (error) {
      this.error(ErrorCode.PARSE_INVALID_TAG, `scene "${id}" external HTML failed to parse: ${(error as Error).message}`, el, { objectId: id });
      return { html: '', css: '', scripts: [] };
    }
    this.rebaseSceneFragment(fragment, path.dirname(absolute));
    const extracted = this.extractFragmentContent(fragment);
    return extracted;
  }

  private rebaseSceneFragment(fragment: PFragment, baseDir: string): void {
    const visit = (parent: PParent | PFragment): void => {
      for (const child of childNodesOf(parent as PParent)) {
        if (!isElement(child)) continue;
        const tag = tagOf(child);
        for (const attribute of child.attrs) {
          const name = attribute.name.toLowerCase();
          if (name === 'style') {
            attribute.value = this.rebaseCss(attribute.value, baseDir);
          } else if (name === 'srcset' || name === 'imagesrcset') {
            attribute.value = attribute.value
              .split(',')
              .map((part) => {
                const trimmed = part.trim();
                if (!trimmed) return trimmed;
                const [url, ...descriptor] = trimmed.split(/\s+/);
                return [this.rebaseUrl(url ?? '', baseDir), ...descriptor].join(' ');
              })
              .join(', ');
          } else if (
            ['src', 'href', 'poster', 'data', 'xlink:href', 'action', 'formaction'].includes(name)
          ) {
            attribute.value = this.rebaseUrl(attribute.value, baseDir);
          }
        }
        if (tag === 'style') {
          for (const textNode of childNodesOf(child) as Array<{ value?: string }>) {
            if (typeof textNode.value === 'string') textNode.value = this.rebaseCss(textNode.value, baseDir);
          }
        } else if (tag !== 'script') {
          visit(child);
        }
      }
    };
    visit(fragment);
  }

  private rebaseUrl(value: string, baseDir: string): string {
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed)) return value;
    if (/^(?:var|calc|env)\(/i.test(trimmed)) return value;
    if (trimmed.startsWith('/')) return value;
    const match = /^([^?#]*)([?#].*)?$/.exec(trimmed);
    if (!match || !match[1]) return value;
    let pathPart = match[1];
    try {
      pathPart = decodeURIComponent(pathPart);
    } catch {
      /* keep raw path */
    }
    const absolute = path.resolve(baseDir, pathPart);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return value;
    const encoded = encodeUrlPath(relative);
    return `/${encoded}${match[2] ?? ''}`;
  }

  private rebaseCss(css: string, baseDir: string): string {
    if (!css) return css;
    const withUrls = css.replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]+))\s*\)/gi,
      (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined) => {
        const value = (doubleQuoted ?? singleQuoted ?? bare ?? '').trim();
        return `url("${this.rebaseUrl(value, baseDir)}")`;
      },
    );
    return withUrls.replace(
      /@import\s+(?:"([^"]*)"|'([^']*)')/gi,
      (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined) =>
        `@import "${this.rebaseUrl(doubleQuoted ?? singleQuoted ?? '', baseDir)}"`,
    );
  }

  private extractFragmentContent(fragment: PFragment): { html: string; css: string; scripts: string[] } {
    const styles: string[] = [];
    const scripts: string[] = [];
    const visit = (parent: PParent | PFragment): void => {
      const children = childNodesOf(parent as PParent);
      for (const child of [...children]) {
        if (!isElement(child)) continue;
        const tag = tagOf(child);
        if (tag === 'style') {
          styles.push(textOf(child));
          this.removeChild(parent, child);
          continue;
        }
        if (tag === 'script') {
          const type = (this.attr(child, 'type') ?? '').trim().toLowerCase();
          const isJavaScript =
            type === '' ||
            type === 'module' ||
            type === 'text/javascript' ||
            type === 'application/javascript' ||
            type === 'text/ecmascript' ||
            type === 'application/ecmascript';
          if (isJavaScript) {
            scripts.push(serializeOuter(child));
            this.removeChild(parent, child);
            continue;
          }
        }
        visit(child);
      }
    };
    visit(fragment);
    return {
      html: serialize(fragment).trim(),
      css: styles.join('\n').trim(),
      scripts,
    };
  }

  private removeChild(parent: PParent | PFragment, child: PNode): void {
    const container = parent as unknown as { childNodes: PNode[] };
    const index = container.childNodes.indexOf(child);
    if (index !== -1) container.childNodes.splice(index, 1);
  }

  private extractSceneContent(el: PElement): { html: string; css: string; scripts: string[] } {
    const styles: string[] = [];
    const scripts: string[] = [];
    const ranges: Array<[number, number]> = [];

    const visit = (node: PNode): void => {
      if (!isElement(node)) return;
      const tag = tagOf(node);
      if (tag === 'style') {
        styles.push(textOf(node));
        const loc = node.sourceCodeLocation;
        if (loc) ranges.push([loc.startOffset, loc.endOffset]);
        return;
      }
      if (tag === 'script') {
        const type = (this.attr(node, 'type') ?? '').trim().toLowerCase();
        const isJavaScript =
          type === '' ||
          type === 'module' ||
          type === 'text/javascript' ||
          type === 'application/javascript' ||
          type === 'text/ecmascript' ||
          type === 'application/ecmascript';
        if (isJavaScript) {
          scripts.push(serializeOuter(node));
          const loc = node.sourceCodeLocation;
          if (loc) ranges.push([loc.startOffset, loc.endOffset]);
          return;
        }
      }
      for (const child of childNodesOf(node)) visit(child);
    };
    for (const child of childNodesOf(el)) visit(child);

    let html: string;
    const outer = el.sourceCodeLocation;
    const innerStart = outer?.startTag?.endOffset;
    const innerEnd = outer?.endTag?.startOffset;
    if (innerStart !== undefined && innerEnd !== undefined && innerEnd >= innerStart) {
      let raw = this.source.slice(innerStart, innerEnd);
      if (ranges.length) {
        for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
          const from = Math.max(0, start - innerStart);
          const to = Math.max(0, end - innerStart);
          raw = raw.slice(0, from) + raw.slice(to);
        }
      }
      html = raw;
    } else {
      html = childNodesOf(el)
        .filter((node) => !isElement(node) || (tagOf(node) !== 'style' && tagOf(node) !== 'script'))
        .map((node) => serializeNode(node))
        .join('');
    }
    return { html: html.trim(), css: styles.join('\n').trim(), scripts };
  }

  private parseGenerations(): void {
    for (const el of this.wrapped(this.projectEl, 'generations', 'generate')) {
      const id = this.idFor(el, 'generate', true);
      const kindRaw = this.attr(el, 'kind');
      let kind: GenerationKind = 'image';
      if (!kindRaw || !GENERATION_KINDS.has(kindRaw as GenerationKind)) {
        this.error(
          ErrorCode.PARSE_INVALID_ATTRIBUTE,
          `<generate> requires kind="image|video|audio|music|speech|sfx|text|edit|avatar|lipsync|dub|matte|translation|storyboard"`,
          el,
          { objectId: id },
        );
      } else {
        kind = kindRaw as GenerationKind;
      }
      const promptEl = this.direct(el, 'prompt')[0];
      const prompt = (this.attr(el, 'prompt') ?? (promptEl ? textOf(promptEl) : '')).trim();
      const negativeEl = this.direct(el, 'negative-prompt')[0];
      const negativePrompt = (this.attr(el, 'negative-prompt') ?? (negativeEl ? textOf(negativeEl) : '')).trim() || undefined;
      if (!prompt) {
        this.warn(ErrorCode.PARSE_MISSING_ATTRIBUTE, `<generate id="${id}"> has an empty prompt`, el, { objectId: id });
      }
      const inputs: GenerationInput[] = [];
      for (const inputEl of this.direct(el, 'gen-input')) {
        const ref = this.requiredAttr(inputEl, 'ref', '<gen-input>');
        if (ref) inputs.push({ ref, role: this.attr(inputEl, 'role') ?? 'input' });
      }
      const constraintsEl = this.direct(el, 'constraints')[0];
      const constraints: GenerationConstraints = constraintsEl
        ? this.parseGenerationConstraints(constraintsEl)
        : {};
      const paramsEl = this.direct(el, 'params')[0];
      const params: Record<string, string | number | boolean> = {};
      if (paramsEl) {
        for (const attr of paramsEl.attrs) params[attr.name] = convertParam(attr.value);
      }
      const directionEl = this.direct(el, 'direction')[0];
      let direction: GenerationDirection | undefined;
      if (directionEl) {
        const raw = textOf(directionEl).trim();
        if (raw) {
          try {
            const parsedDirection = JSON.parse(raw) as unknown;
            if (!parsedDirection || typeof parsedDirection !== 'object' || Array.isArray(parsedDirection)) {
              throw new Error('direction must be a JSON object');
            }
            direction = parsedDirection as GenerationDirection;
          } catch (error) {
            this.error(
              ErrorCode.VALIDATION_INVALID_VALUE,
              `<generate id="${id}"> direction is invalid JSON: ${(error as Error).message}`,
              directionEl,
              { objectId: id },
            );
          }
        }
      }
      const reviewEl = this.direct(el, 'review')[0];
      let review: GenerationReview | undefined;
      if (reviewEl) {
        const statusRaw = this.attr(reviewEl, 'status') ?? 'pending';
        if (!GENERATION_REVIEW_STATUSES.has(statusRaw as GenerationReview['status'])) {
          this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid generation review status "${statusRaw}"`, reviewEl, { objectId: id });
        } else {
          review = {
            status: statusRaw as GenerationReview['status'],
            reviewer: this.attr(reviewEl, 'reviewer'),
            notes: textOf(reviewEl).trim() || undefined,
            reviewedAt: this.attr(reviewEl, 'reviewed-at'),
          };
        }
      }
      const rightsEl = this.direct(el, 'rights')[0];
      let rights: GenerationRights | undefined;
      if (rightsEl) {
        const likeness = this.attr(rightsEl, 'likeness');
        const voiceCloning = this.attr(rightsEl, 'voice-cloning');
        if (likeness && !['none', 'consented', 'synthetic'].includes(likeness)) {
          this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid rights likeness "${likeness}"`, rightsEl, { objectId: id });
        }
        if (voiceCloning && !['none', 'consented'].includes(voiceCloning)) {
          this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid rights voice-cloning "${voiceCloning}"`, rightsEl, { objectId: id });
        }
        rights = {
          license: this.attr(rightsEl, 'license'),
          consent: this.attr(rightsEl, 'consent'),
          likeness: likeness === 'none' || likeness === 'consented' || likeness === 'synthetic' ? likeness : undefined,
          voiceCloning: voiceCloning === 'none' || voiceCloning === 'consented' ? voiceCloning : undefined,
          commercialUse: this.attr(rightsEl, 'commercial-use') === undefined
            ? undefined
            : parseBool(this.attr(rightsEl, 'commercial-use'), false),
          aiDisclosure: this.attr(rightsEl, 'ai-disclosure') === undefined
            ? undefined
            : parseBool(this.attr(rightsEl, 'ai-disclosure'), true),
        };
      }
      const safetyEl = this.direct(el, 'safety')[0];
      let safety: GenerationSafety | undefined;
      if (safetyEl) {
        safety = {
          rating: this.attr(safetyEl, 'rating'),
          policy: this.attr(safetyEl, 'policy'),
          moderated: this.attr(safetyEl, 'moderated') === undefined
            ? undefined
            : parseBool(this.attr(safetyEl, 'moderated'), false),
          notes: textOf(safetyEl).trim() || undefined,
        };
      }
      const outputs: GenerationOutputSpec[] = [];
      for (const outputEl of this.direct(el, 'gen-output')) {
        outputs.push({
          id: this.attr(outputEl, 'id'),
          path: this.attr(outputEl, 'path', 'file'),
          mimeType: this.attr(outputEl, 'mime-type'),
          role: this.attr(outputEl, 'role'),
        });
      }
      const usageEl = this.direct(el, 'usage')[0];
      let usage: GenerationUsage | undefined;
      if (usageEl) {
        usage = this.parseGenerationUsage(usageEl, id);
      }
      if (!constraints.duration) {
        const duration = this.timeAttr(el, 'duration');
        if (duration) constraints.duration = duration;
      }
      const task: GenerationTask = {
        id,
        kind,
        provider: this.attr(el, 'provider'),
        model: this.attr(el, 'model'),
        prompt,
        negativePrompt,
        inputs,
        constraints,
        params,
        direction,
        outputs,
        status: 'draft',
        usage,
        review,
        rights,
        safety,
        providerJobId: this.attr(el, 'provider-job-id'),
        metadata: {},
        source: this.loc(el),
      };
      this.project.generations.push(task);
    }
  }

  /** Parse a `<usage>` consumption record (RFC-0013). */
  private parseGenerationUsage(el: PElement, taskId: string): GenerationUsage {
    const usage: GenerationUsage = {};
    const numbers: Array<[keyof GenerationUsage, string]> = [
      ['cost', 'cost'],
      ['tokens', 'tokens'],
      ['credits', 'credits'],
      ['computeSeconds', 'compute-seconds'],
      ['outputBytes', 'output-bytes'],
    ];
    for (const [key, attr] of numbers) {
      const raw = this.attr(el, attr);
      if (raw === undefined) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        this.error(
          ErrorCode.VALIDATION_OUT_OF_RANGE,
          `<usage ${attr}> on generation "${taskId}" must be a non-negative number, got "${raw}"`,
          el,
          { objectId: taskId },
        );
        continue;
      }
      usage[key] = value;
    }
    const currency = this.attr(el, 'currency');
    if (currency) usage.currency = currency;
    const recordedAt = this.attr(el, 'recorded-at');
    if (recordedAt) usage.recordedAt = recordedAt;
    const known = new Set(['id', 'cost', 'currency', 'tokens', 'credits', 'compute-seconds', 'output-bytes', 'recorded-at']);
    for (const attr of el.attrs) {
      if (known.has(attr.name)) continue;
      usage[attr.name] = attr.value;
    }
    return usage;
  }

  /**
   * Parse the character & style bible library (RFC-0014). Children may sit
   * inside a `<characters>` container or directly under `<project>`.
   */
  private parseBibles(): void {
    for (const el of this.wrapped(this.projectEl, 'characters', 'character')) {
      const bible = this.parseBible(el, 'character');
      if (bible) this.pushBible(bible, el);
    }
    for (const el of this.wrapped(this.projectEl, 'characters', 'style-guide')) {
      const bible = this.parseBible(el, 'style');
      if (bible) this.pushBible(bible, el);
    }
  }

  private pushBible(bible: BibleProfile, el: PElement): void {
    this.project.bibles ??= [];
    if (this.project.bibles.some((existing) => existing.id === bible.id)) {
      this.error(
        ErrorCode.PARSE_DUPLICATE_ID,
        `duplicate ${bible.kind === 'character' ? '<character>' : '<style-guide>'} id "${bible.id}"`,
        el,
        { objectId: bible.id },
      );
      return;
    }
    this.project.bibles.push(bible);
  }

  private parseBible(el: PElement, kind: BibleProfile['kind']): BibleProfile | undefined {
    const id = this.idFor(el, kind === 'character' ? 'character' : 'style-guide', true);
    const tag = kind === 'character' ? '<character>' : '<style-guide>';
    const versionRaw = this.attr(el, 'version');
    let version: number | undefined;
    if (versionRaw !== undefined) {
      version = Number(versionRaw);
      if (!Number.isInteger(version) || version < 1) {
        this.error(
          ErrorCode.VALIDATION_OUT_OF_RANGE,
          `${tag} id="${id}" version must be a positive integer, got "${versionRaw}"`,
          el,
          { objectId: id },
        );
        version = undefined;
      }
    }
    const references: BibleReference[] = [];
    for (const refEl of this.direct(el, 'reference')) {
      const ref = this.requiredAttr(refEl, 'ref', '<reference>');
      if (ref) references.push({ ref, role: this.attr(refEl, 'role') ?? (kind === 'character' ? 'character' : 'style') });
    }
    const descriptionEl = this.direct(el, 'description')[0];
    const negativeEl = this.direct(el, 'negative')[0];
    const bible: BibleProfile = {
      kind,
      id,
      version,
      name: this.attr(el, 'name'),
      description: (this.attr(el, 'description') ?? (descriptionEl ? textOf(descriptionEl) : '')).trim() || undefined,
      negative: (negativeEl ? textOf(negativeEl) : '').trim() || undefined,
      references,
      metadata: {},
      source: this.loc(el),
    };
    return bible;
  }

  private parseGenerationConstraints(el: PElement): GenerationConstraints {
    const constraints: GenerationConstraints = {};
    const duration = this.timeAttr(el, 'duration');
    if (duration) constraints.duration = duration;
    const width = this.intAttr(el, 'width', undefined, 1, 100_000);
    const height = this.intAttr(el, 'height', undefined, 1, 100_000);
    if (width) constraints.width = width;
    if (height) constraints.height = height;
    const resolution = this.attr(el, 'resolution');
    if (resolution) {
      const dimensions = /^(\d+)\s*[x×]\s*(\d+)$/.exec(resolution.trim());
      const tier = /^(\d{3,4})p$|^(\d+)k$/i.exec(resolution.trim());
      if (dimensions) {
        constraints.width = Number(dimensions[1]);
        constraints.height = Number(dimensions[2]);
      } else if (tier) {
        // Vendor-style tier (480p/540p/720p/1080p/2k/4k); adapters resolve the
        // tier against the aspect ratio.
        constraints.resolution = resolution.trim().toLowerCase();
      } else {
        this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid resolution "${resolution}"; expected WxH or a tier like 720p/1080p/4k`, el);
      }
    }
    const steps = this.intAttr(el, 'steps', undefined, 1, 1000);
    if (steps) constraints.steps = steps;
    const guidance = this.numberAttr(el, 'guidance', undefined, 0, 1000);
    if (guidance !== undefined) constraints.guidance = guidance;
    const aspectRatio = this.attr(el, 'aspect-ratio');
    if (aspectRatio) constraints.aspectRatio = aspectRatio;
    const frameRate = this.attr(el, 'frame-rate', 'fps');
    if (frameRate) {
      try {
        constraints.frameRate = parseFrameRate(frameRate);
      } catch (error) {
        this.error(ErrorCode.TIME_INVALID, (error as Error).message, el);
      }
    }
    const sampleRate = this.intAttr(el, 'sample-rate', undefined, 1, 384_000);
    if (sampleRate) constraints.sampleRate = sampleRate;
    const channels = this.intAttr(el, 'channels', undefined, 1, 32);
    if (channels) constraints.channels = channels;
    const language = this.attr(el, 'language', 'lang');
    if (language) constraints.language = language;
    const seed = this.intAttr(el, 'seed', undefined, 0, 2 ** 31 - 1);
    if (seed !== undefined) constraints.seed = seed;
    for (const attr of el.attrs) {
      if (['duration', 'width', 'height', 'resolution', 'aspect-ratio', 'frame-rate', 'fps', 'sample-rate', 'channels', 'language', 'lang', 'seed'].includes(attr.name)) continue;
      constraints[attr.name] = convertParam(attr.value);
    }
    return constraints;
  }

  private parseStoryboard(): void {
    const shotsOut = this.wrapped(this.projectEl, 'storyboard', 'shot');
    if (!shotsOut.length) return;
    const shots: StoryboardShot[] = [];
    shotsOut.forEach((el, index) => {
      const id = this.idFor(el, 'shot', true);
      const statusRaw = this.attr(el, 'status') ?? 'idea';
      if (!STORYBOARD_STATUSES.has(statusRaw as StoryboardStatus)) {
        this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid storyboard status "${statusRaw}"`, el, { objectId: id });
      }
      const descriptionEl = this.direct(el, 'description')[0];
      const promptEl = this.direct(el, 'prompt')[0];
      const notesEl = this.direct(el, 'notes')[0];
      const directionEl = this.direct(el, 'direction')[0];
      let direction: GenerationDirection | undefined;
      if (directionEl) {
        const raw = textOf(directionEl).trim();
        if (raw) {
          try {
            const parsedDirection = JSON.parse(raw) as unknown;
            if (!parsedDirection || typeof parsedDirection !== 'object' || Array.isArray(parsedDirection)) {
              throw new Error('direction must be a JSON object');
            }
            direction = parsedDirection as GenerationDirection;
          } catch (error) {
            this.error(
              ErrorCode.VALIDATION_INVALID_VALUE,
              `<shot id="${id}"> direction is invalid JSON: ${(error as Error).message}`,
              directionEl,
              { objectId: id },
            );
          }
        }
      }
      const tagsRaw = this.attr(el, 'tags');
      // RFC-0018: `<review>` children form the shot's approval history. The
      // LAST element is the current record; preceding ones are the history.
      const reviewRecords: GenerationReview[] = [];
      for (const reviewEl of this.direct(el, 'review')) {
        const reviewStatusRaw = this.attr(reviewEl, 'status') ?? 'pending';
        if (!GENERATION_REVIEW_STATUSES.has(reviewStatusRaw as GenerationReview['status'])) {
          this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid shot review status "${reviewStatusRaw}"`, reviewEl, { objectId: id });
          continue;
        }
        reviewRecords.push({
          status: reviewStatusRaw as GenerationReview['status'],
          reviewer: this.attr(reviewEl, 'reviewer'),
          notes: textOf(reviewEl).trim() || undefined,
          reviewedAt: this.attr(reviewEl, 'reviewed-at'),
        });
      }
      const shot: StoryboardShot = {
        id,
        order: this.intAttr(el, 'order', index + 1, 1, 1_000_000) ?? index + 1,
        title: this.attr(el, 'title'),
        description: (this.attr(el, 'description') ?? (descriptionEl ? textOf(descriptionEl) : '')).trim() || undefined,
        prompt: (this.attr(el, 'prompt') ?? (promptEl ? textOf(promptEl) : '')).trim() || undefined,
        scene: this.attr(el, 'scene'),
        generation: this.attr(el, 'generation'),
        asset: this.attr(el, 'asset'),
        duration: this.timeAttr(el, 'duration'),
        status: STORYBOARD_STATUSES.has(statusRaw as StoryboardStatus) ? statusRaw as StoryboardStatus : 'idea',
        direction,
        tags: tagsRaw ? tagsRaw.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
        notes: (this.attr(el, 'notes') ?? (notesEl ? textOf(notesEl) : '')).trim() || undefined,
        review: reviewRecords.at(-1),
        reviewHistory: reviewRecords.length > 1 ? reviewRecords.slice(0, -1) : undefined,
        source: this.loc(el),
      };
      shots.push(shot);
    });
    shots.sort((a, b) => a.order - b.order);
    this.project.storyboard = shots.map((shot, index) => ({ ...shot, order: index + 1 }));
  }

  private parseTimelines(): void {
    const timelineEls = this.wrapped(this.projectEl, 'timelines', 'timeline');
    if (!timelineEls.length) {
      this.error(ErrorCode.VALIDATION_EMPTY_TIMELINE, 'project requires at least one <timeline>', this.projectEl);
    }
    for (const el of timelineEls) {
      const id = this.idFor(el, 'timeline', true);
      const tracks: Track[] = [];
      const markers: Marker[] = [];
      const laneEls = [
        ...this.direct(el, 'lane'),
        ...this.direct(el, 'tracks').flatMap((wrapper) => this.direct(wrapper, 'lane')),
      ];
      for (const legacyTrack of this.direct(el, 'track')) {
        this.error(
          ErrorCode.PARSE_HTML_AMBIGUITY,
          '<track> is a void HTML element and cannot contain clips. VHTML 1.1 uses <lane>…</lane> for tracks. Rename <track> to <lane>.',
          legacyTrack,
        );
      }
      laneEls.forEach((laneEl, index) => {
        const track = this.parseTrack(laneEl, index, id);
        if (track) tracks.push(track);
      });
      for (const markerEl of this.direct(el, 'marker')) {
        const time = this.timeAttr(markerEl, 'at', undefined, { required: true }) ?? this.timeAttr(markerEl, 'time');
        if (!time) continue;
        markers.push({
          id: this.attr(markerEl, 'id') ?? this.uniqueId(`marker-${markers.length + 1}`),
          time,
          name: this.attr(markerEl, 'name', 'label'),
          type: (this.attr(markerEl, 'type') as Marker['type']) ?? 'marker',
          color: this.attr(markerEl, 'color'),
        });
      }
      let duration = this.timeAttr(el, 'duration');
      const maxEnd = tracks.reduce((max, track) => {
        for (const clip of track.clips) {
          const end = add(clip.start, clip.duration);
          if (gt(end, max)) max = end;
        }
        return max;
      }, ZERO);
      if (!duration) {
        duration = maxEnd;
        if (eq(duration, ZERO)) this.warn(ErrorCode.VALIDATION_EMPTY_TIMELINE, `timeline "${id}" is empty`, el, { objectId: id });
      } else if (lt(duration, maxEnd)) {
        this.error(
          ErrorCode.VALIDATION_CLIP_OVERFLOW,
          `timeline "${id}" duration ${duration.num}/${duration.den}s is shorter than its last clip end`,
          el,
          { objectId: id },
        );
      }
      const timeline: Timeline = {
        id,
        name: this.attr(el, 'name'),
        duration: duration ?? ZERO,
        tracks,
        markers,
        metadata: {},
        source: this.loc(el),
      };
      this.project.timelines.push(timeline);
    }

    const mainId = this.attr(this.projectEl, 'main-timeline', 'main') ?? this.attr(this.vhtmlEl ?? this.projectEl, 'main-timeline', 'main');
    if (mainId) {
      this.mainTimelineExplicit = true;
      const found = this.project.timelines.find((timeline) => timeline.id === mainId);
      if (!found) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `main timeline "${mainId}" does not exist`, this.projectEl);
      }
      this.project.mainTimeline = found?.id ?? this.project.timelines[0]?.id ?? 'main';
    } else {
      this.project.mainTimeline = this.project.timelines[0]?.id ?? 'main';
    }
  }

  private parseTrack(el: PElement, index: number, timelineId: string): Track | undefined {
    const id = this.idFor(el, 'lane', true);
    const typeRaw = this.attr(el, 'type');
    let type: TrackType = 'video';
    if (typeRaw) {
      if (TRACK_TYPES.includes(typeRaw as TrackType)) type = typeRaw as TrackType;
      else this.error(ErrorCode.VALIDATION_INVALID_VALUE, `invalid lane type "${typeRaw}"`, el, { objectId: id });
    }
    const clips: Clip[] = [];
    for (const child of elementChildren(el)) {
      const tag = tagOf(child);
      if (tag === 'clip' || tag === 'cue') {
        const clip = this.parseClip(child, type, id, timelineId);
        if (clip) clips.push(clip);
      } else if (tag !== 'transition') {
        if (!['style', 'script'].includes(tag)) {
          this.warn(
            ErrorCode.PARSE_UNRECOGNISED_NODE,
            `unrecognised <${tag}> inside <lane>; expected <clip>, <cue> or <transition>`,
            child,
            { objectId: id },
          );
        }
      }
    }

    if (!typeRaw && clips.length) {
      if (clips.every((clip) => clip.kind === 'caption')) type = 'caption';
      else if (clips.every((clip) => clip.kind === 'audio')) type = 'audio';
      else if (clips.every((clip) => clip.kind === 'data')) type = 'data';
    }

    if (type === 'caption' && clips.some((clip) => clip.kind !== 'caption')) {
      this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, 'caption lanes may only contain <cue> clips', el, { objectId: id });
    }

    const transitions: Transition[] = [];
    for (const transitionEl of this.direct(el, 'transition')) {
      const transition = this.parseTransition(transitionEl, id, clips);
      if (transition) transitions.push(transition);
    }

    return {
      id,
      type,
      name: this.attr(el, 'name'),
      order: this.intAttr(el, 'order', index, -1000, 1000) ?? index,
      enabled: parseBool(this.attr(el, 'enabled'), true),
      muted: parseBool(this.attr(el, 'muted'), false),
      solo: parseBool(this.attr(el, 'solo'), false) || undefined,
      locked: parseBool(this.attr(el, 'locked'), false),
      volume: parseGain(this.attr(el, 'volume')) ?? 1,
      pan: parsePan(this.attr(el, 'pan')) ?? 0,
      opacity: this.numberAttr(el, 'opacity', 1, 0, 1) ?? 1,
      blend: (this.attr(el, 'blend') as BlendMode) ?? 'normal',
      captionStyle: this.attr(el, 'caption-style'),
      clips,
      transitions,
      metadata: {},
      source: this.loc(el),
    };
  }

  private parseClip(el: PElement, trackType: TrackType, trackId: string, timelineId: string): Clip | undefined {
    const id = this.idFor(el, 'clip');
    const tag = tagOf(el);
    const kindRaw = this.attr(el, 'kind');
    let ref = this.attr(el, 'ref');
    let src = this.attr(el, 'src');
    let kind: ClipKind | undefined =
      kindRaw && CLIP_KINDS.includes(kindRaw as ClipKind) ? (kindRaw as ClipKind) : undefined;
    let refAssetKind: AssetKind | undefined;

    if (!ref && src) {
      const inferred = inferAssetKind(src);
      if (!inferred) {
        this.error(ErrorCode.ASSET_UNSUPPORTED_TYPE, `cannot infer media type from src "${src}"`, el, { objectId: id });
        return undefined;
      }
      const existing = this.project.assets.find((asset) => asset.src === src);
      if (existing) {
        ref = existing.id;
      } else {
        const assetId = this.uniqueId(`${id}-asset`);
        this.usedIds.add(assetId);
        const asset: Asset = {
          id: assetId,
          kind: inferred,
          src,
          duration: this.timeAttr(el, 'duration'),
          source: this.loc(el),
        };
        this.project.assets.push(asset);
        ref = assetId;
      }
      this.infoOnce(`Implicit asset "${ref}" created for <clip src="…">`);
    }

    if (ref) {
      const resolved = resolveReference(this.project, ref);
      if (ref.startsWith('timeline:') || kindRaw === 'timeline') kind = kind ?? 'timeline';
      if (resolved?.kind === 'scene') {
        kind = kind ?? 'scene';
      } else if (resolved?.kind === 'asset') {
        refAssetKind = resolved.asset.kind;
        kind = kind ?? mediaKindToClipKind(resolved.asset.kind);
        if (!kind) {
          this.error(
            ErrorCode.VALIDATION_INCOMPATIBLE_TRACK,
            `asset "${ref}" (${resolved.asset.kind}) cannot be used directly as a clip; use a <cue> for captions or an explicit kind`,
            el,
            { objectId: id },
          );
          return undefined;
        }
      } else if (resolved?.kind === 'generation') {
        kind = kind ?? mediaKindToClipKind(generationKindToAssetKind(resolved.task.kind));
      } else if (resolved?.kind === 'timeline') {
        kind = kind ?? 'timeline';
      }
    }

    const isCue = tag === 'cue' || kind === 'caption';
    if (isCue || (kindRaw === 'caption')) kind = 'caption';
    if (!kind) {
      if (trackType === 'caption') kind = 'caption';
      else {
        this.error(
          ErrorCode.PARSE_INVALID_ATTRIBUTE,
          `cannot determine clip kind for "${id}"; provide ref, src or kind`,
          el,
          { objectId: id },
        );
        return undefined;
      }
    }

    const start = this.timeAttr(el, 'start') ?? ZERO;
    const sourceIn = this.timeAttr(el, 'in') ?? this.timeAttr(el, 'source-in') ?? ZERO;
    let sourceOut = this.timeAttr(el, 'out') ?? this.timeAttr(el, 'source-out');
    let duration = this.timeAttr(el, 'duration');
    const speedRaw = this.attr(el, 'speed');
    const speed = parseSpeed(speedRaw) ?? rat(1);
    if (speedRaw !== undefined && parseSpeed(speedRaw) === undefined) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `speed must be a positive number, got "${speedRaw}"`, el, { objectId: id });
    }
    const reverse = parseBool(this.attr(el, 'reverse'), false);
    const freezeRaw = this.attr(el, 'freeze');
    let freeze: Rational | undefined;
    if (freezeRaw !== undefined && freezeRaw !== '') {
      if (freezeRaw === 'true' || freezeRaw === '') freeze = sourceIn;
      else {
        try {
          freeze = parseTime(freezeRaw, { frameRate: this.project.composition.frameRate });
        } catch (error) {
          this.error(ErrorCode.TIME_INVALID, (error as Error).message, el, { objectId: id });
        }
      }
    }

    const resolved = ref ? resolveReference(this.project, ref) : undefined;
    const asset = resolved?.kind === 'asset' ? resolved.asset : undefined;
    const scene = resolved?.kind === 'scene' ? resolved.scene : undefined;
    const task = resolved?.kind === 'generation' ? resolved.task : undefined;
    const knownSourceDuration = asset?.duration ?? task?.constraints.duration;
    const captionEnd = this.timeAttr(el, 'end');

    // Time remap (speed ramps): either a <timeremap> child element or a
    // `time-remap="at:source,at:source"` attribute shorthand.
    let timeRemap: TimeRemap | undefined;
    const remapContainer = this.direct(el, 'timeremap')[0] ?? this.direct(el, 'time-remap')[0];
    if (remapContainer) {
      const keyframes: TimeRemapKeyframe[] = [];
      for (const keyframeEl of [...this.direct(remapContainer, 'remap'), ...this.direct(remapContainer, 'keyframe')]) {
        const at = this.timeAttr(keyframeEl, 'at');
        const source = this.timeAttr(keyframeEl, 'source') ?? this.timeAttr(keyframeEl, 'value');
        if (at === undefined || source === undefined) {
          this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, '<remap> requires at and source', keyframeEl, { objectId: id });
          continue;
        }
        keyframes.push({ at, source, easing: this.attr(keyframeEl, 'easing') });
      }
      keyframes.sort((a, b) => (lt(a.at, b.at) ? -1 : gt(a.at, b.at) ? 1 : 0));
      if (keyframes.length) {
        timeRemap = { keyframes, easing: (this.attr(remapContainer, 'easing') as EasingName) ?? 'linear' };
      } else {
        this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, '<timeremap> requires at least one <remap> keyframe', remapContainer, { objectId: id });
      }
    }
    const remapAttrRaw = this.attr(el, 'time-remap');
    if (!timeRemap && remapAttrRaw) {
      const keyframes: TimeRemapKeyframe[] = [];
      for (const pair of remapAttrRaw.split(';').map((part) => part.trim()).filter(Boolean)) {
        const [atRaw, sourceRaw] = pair.split(/[:=]/).map((part) => part?.trim());
        if (!atRaw || !sourceRaw) {
          this.error(ErrorCode.PARSE_INVALID_ATTRIBUTE, `malformed time-remap pair "${pair}"; expected "at:source"`, el, { objectId: id });
          continue;
        }
        try {
          keyframes.push({
            at: parseTime(atRaw, { frameRate: this.project.composition.frameRate }),
            source: parseTime(sourceRaw, { frameRate: this.project.composition.frameRate }),
            easing: undefined,
          });
        } catch (error) {
          this.error(ErrorCode.TIME_INVALID, `invalid time-remap pair "${pair}": ${(error as Error).message}`, el, { objectId: id });
        }
      }
      keyframes.sort((a, b) => (lt(a.at, b.at) ? -1 : gt(a.at, b.at) ? 1 : 0));
      if (keyframes.length) {
        timeRemap = { keyframes, easing: (this.attr(el, 'time-remap-easing') as EasingName) ?? 'linear' };
      }
    }
    if (timeRemap && freeze !== undefined) {
      this.warn(ErrorCode.TIME_INVALID, `clip "${id}" sets both freeze and time remap; the remap wins`, el, { objectId: id });
      freeze = undefined;
    }
    if (timeRemap && speedRaw !== undefined) {
      const parsedSpeed = parseSpeed(speedRaw);
      if (parsedSpeed && !eq(parsedSpeed, rat(1))) {
        this.warn(ErrorCode.TIME_INVALID, `clip "${id}" sets speed and time remap; speed is ignored while the remap is defined`, el, { objectId: id });
      }
    }

    if (kind === 'caption') {
      if (captionEnd && start) {
        if (duration && !eq(duration, sub(captionEnd, start))) {
          this.warn(ErrorCode.TIME_INVALID, 'both duration and end are set; duration takes precedence', el, { objectId: id });
        }
        if (!duration) duration = sub(captionEnd, start);
      }
      if (!duration) {
        this.error(ErrorCode.TIME_UNBOUNDED, `<cue id="${id}"> requires duration or end`, el, { objectId: id });
        duration = ZERO;
      }
    } else if (kind === 'scene') {
      if (!duration) {
        if (scene?.duration) duration = scene.duration;
        else {
          this.error(ErrorCode.TIME_UNBOUNDED, `<clip id="${id}"> referencing a scene requires duration`, el, { objectId: id });
          duration = ZERO;
        }
      }
    } else if (kind === 'timeline') {
      if (!duration) {
        const subDuration = resolved?.kind === 'timeline' ? resolved.timeline.duration : undefined;
        if (subDuration) duration = subDuration;
        else {
          this.error(ErrorCode.TIME_UNBOUNDED, `timeline clip "${id}" requires duration or an existing <timeline> reference`, el, { objectId: id });
          duration = ZERO;
        }
      }
    } else if (kind === 'image' || kind === 'svg') {
      if (!duration) {
        this.error(ErrorCode.TIME_UNBOUNDED, `image clip "${id}" requires duration`, el, { objectId: id });
        duration = ZERO;
      }
    } else if (kind === 'video' || kind === 'audio') {
      if (freeze) {
        if (!duration) {
          this.error(ErrorCode.TIME_UNBOUNDED, `frozen clip "${id}" requires duration`, el, { objectId: id });
          duration = ZERO;
        }
      } else if (timeRemap && !duration) {
        this.error(ErrorCode.TIME_UNBOUNDED, `time-remapped clip "${id}" requires an explicit duration`, el, { objectId: id });
        duration = ZERO;
      } else if (!duration) {
        if (sourceOut) duration = div(sub(sourceOut, sourceIn), speed);
        else if (knownSourceDuration) duration = div(sub(knownSourceDuration, sourceIn), speed);
        else {
          this.error(
            ErrorCode.TIME_UNBOUNDED,
            `clip "${id}" needs duration or out; source length could not be inferred`,
            el,
            { objectId: id },
          );
          duration = ZERO;
        }
      }
      if (!sourceOut && !freeze && !timeRemap && knownSourceDuration) {
        const candidate = add(sourceIn, mul(duration, speed));
        if (gt(candidate, knownSourceDuration)) {
          this.error(
            ErrorCode.TIME_OUT_OF_SOURCE,
            `clip "${id}" runs ${candidate.num}/${candidate.den}s into a source that is only ${knownSourceDuration.num}/${knownSourceDuration.den}s long`,
            el,
            { objectId: id },
          );
        } else {
          sourceOut = candidate;
        }
      }
      if (sourceOut && !freeze && !timeRemap) {
        const expected = add(sourceIn, mul(duration, speed));
        if (!eq(sourceOut, expected)) {
          this.warn(
            ErrorCode.TIME_INVALID,
            `clip "${id}" duration and source in/out disagree; duration is authoritative and out was recomputed`,
            el,
            { objectId: id },
          );
          sourceOut = expected;
        }
        if (knownSourceDuration && gt(sourceOut, knownSourceDuration)) {
          this.error(
            ErrorCode.TIME_OUT_OF_SOURCE,
            `clip "${id}" out point exceeds source duration`,
            el,
            { objectId: id },
          );
        }
      }
    } else if (kind === 'data') {
      duration = duration ?? ZERO;
    }

    if (lt(duration ?? ZERO, ZERO)) {
      this.error(ErrorCode.TIME_INVALID, 'clip duration must not be negative', el, { objectId: id });
    }
    let clipDuration = duration ?? ZERO;
    if (lt(clipDuration, ZERO)) clipDuration = ZERO;

    const transform = this.parseTransform(el, this.direct(el, 'transform')[0]);
    const crop = this.parseCrop(this.direct(el, 'crop')[0]);
    const effects: Effect[] = [];
    for (const effectEl of this.direct(el, 'effect')) {
      const effect = this.parseEffect(effectEl, 'effect');
      if (effect) effects.push(effect);
    }
    const audioEffects: Effect[] = [];
    for (const effectEl of this.direct(el, 'audio-effect')) {
      const effect = this.parseEffect(effectEl, 'audio-effect');
      if (effect) audioEffects.push(effect);
    }
    const animations: Animation[] = [];
    for (const animateEl of this.direct(el, 'animate')) {
      const animation = this.parseAnimation(animateEl, 'clip', id);
      if (animation) animations.push(animation);
    }

    const base = {
      id,
      ref,
      name: this.attr(el, 'name'),
      className: this.attr(el, 'class'),
      start,
      duration: clipDuration,
      sourceIn,
      sourceOut,
      speed,
      reverse,
      freeze,
      timeRemap,
      enabled: parseBool(this.attr(el, 'enabled'), true),
      z: this.intAttr(el, 'z-index', this.intAttr(el, 'z', 0, -100_000, 100_000), -100_000, 100_000) ?? 0,
      opacity: this.numberAttr(el, 'opacity', 1, 0, 1) ?? 1,
      blend: (this.attr(el, 'blend') as BlendMode) ?? 'normal',
      transform,
      crop,
      fit: (this.attr(el, 'fit') as MediaClip['fit']) ?? 'cover',
      effects,
      animations,
      volume: parseGain(this.attr(el, 'volume')) ?? 1,
      pan: parsePan(this.attr(el, 'pan')) ?? 0,
      fadeIn: this.timeAttr(el, 'fade-in'),
      fadeOut: this.timeAttr(el, 'fade-out'),
      audioOffset: this.timeAttr(el, 'audio-offset'),
      audioEffects,
      metadata: {},
      source: this.loc(el),
    } satisfies Omit<SceneClip, 'kind' | 'ref' | 'id'> & { id: string; ref?: string };

    const meta = base.metadata as Record<string, string>;
    for (const metadataEl of this.direct(el, 'metadata')) {
      for (const attr of metadataEl.attrs) {
        meta[attr.name] = attr.value;
      }
    }
    for (const metaEl of this.wrapped(el, 'metadata', 'meta')) {
      const name = this.attr(metaEl, 'name');
      if (name) meta[name] = this.attr(metaEl, 'value') ?? '';
    }

    if (!BLEND_MODES.has(base.blend)) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unknown blend mode "${base.blend}"`, el, { objectId: id });
      base.blend = 'normal';
    }
    if (!['cover', 'contain', 'fill', 'none'].includes(base.fit)) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unknown fit mode "${base.fit}"`, el, { objectId: id });
      base.fit = 'cover';
    }

    if (kind === 'caption') {
      const styleRaw = this.attr(el, 'style');
      const caption: CaptionClip = {
        ...base,
        kind: 'caption',
        text: (this.attr(el, 'text') ?? textOf(el)).trim(),
        speaker: this.attr(el, 'speaker'),
        style: styleRaw ? parseStyleDeclarations(styleRaw) : undefined,
      };
      if (!caption.text) this.warn(ErrorCode.PARSE_MISSING_ATTRIBUTE, `caption "${id}" has no text`, el, { objectId: id });
      return caption;
    }
    if (kind === 'scene') {
      if (!ref) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `scene clip "${id}" requires ref`, el, { objectId: id });
        return undefined;
      }
      const sceneClip: SceneClip = {
        ...base,
        kind: 'scene',
        ref,
        loop: parseBool(this.attr(el, 'loop'), false),
        fit: (this.attr(el, 'fit') as SceneClip['fit']) ?? 'cover',
      };
      return sceneClip;
    }
    if (kind === 'data') {
      const data: DataClip = { ...base, kind: 'data', value: this.attr(el, 'value') ?? textOf(el).trim() };
      return data;
    }
    if (kind === 'timeline') {
      if (!ref) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `timeline clip "${id}" requires ref`, el, { objectId: id });
        return undefined;
      }
      const timelineClip: TimelineClip = {
        ...base,
        kind: 'timeline',
        ref,
        loop: parseBool(this.attr(el, 'loop'), false),
      };
      return timelineClip;
    }
    if (!ref) {
      this.error(ErrorCode.REFERENCE_NOT_FOUND, `clip "${id}" requires ref or src`, el, { objectId: id });
      return undefined;
    }
    const media: MediaClip = {
      ...base,
      kind,
      ref,
      muted: parseBool(this.attr(el, 'muted'), false),
    };
    return media;
  }

  private infoOnce(_message: string): void {
    // Reserved for verbose parser notes. Kept out of default diagnostics to
    // avoid noise when shorthand src clips are used heavily.
  }

  private parseTransform(el: PElement, transformEl: PElement | undefined): Transform {
    const transform: Transform = { ...DEFAULT_TRANSFORM };
    const composition = this.project.composition;
    const readLength = (name: string, axis: 'x' | 'y', fallback: number): number => {
      const raw = this.attr(el, name) ?? (transformEl ? this.attr(transformEl, name) : undefined);
      if (raw === undefined) return fallback;
      const value = raw.trim();
      if (value.endsWith('%')) {
        const pct = Number(value.slice(0, -1));
        if (!Number.isFinite(pct)) return fallback;
        return (pct / 100) * (axis === 'x' ? composition.width : composition.height);
      }
      const number = Number(value.replace(/px$/, ''));
      return Number.isFinite(number) ? number : fallback;
    };
    transform.x = readLength('x', 'x', 0);
    transform.y = readLength('y', 'y', 0);
    // Uniform `scale` is a magnitude (positive, 0.001..1000). `scale-x`/
    // `scale-y` accept a sign so clips can mirror (flip) — same magnitude
    // bounds, negative means mirrored. Zero collapses the layer and stays
    // rejected, mirroring the old positive-only range.
    const magnitude = (el: PElement, name: string, raw: number | undefined, fallback: number): number => {
      if (raw !== undefined && this.attr(el, name) !== undefined && raw === 0) {
        this.error(ErrorCode.PARSE_INVALID_ATTRIBUTE, `attribute "${name}" must be a nonzero number in [-1000, 1000]`, el);
        return fallback;
      }
      return raw ?? fallback;
    };
    const scale = this.numberAttr(el, 'scale', transformEl ? this.numberAttr(transformEl, 'scale', 1, 0.001, 1000) ?? 1 : 1, 0.001, 1000) ?? 1;
    transform.scaleX = this.numberAttr(el, 'scale-x', transformEl ? magnitude(transformEl, 'scale-x', this.numberAttr(transformEl, 'scale-x', scale, -1000, 1000), scale) : scale, -1000, 1000) ?? scale;
    transform.scaleY = this.numberAttr(el, 'scale-y', transformEl ? magnitude(transformEl, 'scale-y', this.numberAttr(transformEl, 'scale-y', scale, -1000, 1000), scale) : scale, -1000, 1000) ?? scale;
    const rotateRaw = this.attr(el, 'rotate') ?? (transformEl ? this.attr(transformEl, 'rotate') : undefined);
    if (rotateRaw) transform.rotate = parseAngle(rotateRaw) ?? 0;
    const anchorX = this.attr(el, 'anchor-x') ?? (transformEl ? this.attr(transformEl, 'anchor-x') : undefined);
    const anchorY = this.attr(el, 'anchor-y') ?? (transformEl ? this.attr(transformEl, 'anchor-y') : undefined);
    if (anchorX) transform.anchorX = this.parseAnchor(anchorX);
    if (anchorY) transform.anchorY = this.parseAnchor(anchorY);
    const perspective = this.numberAttr(transformEl ?? el, 'perspective', undefined, 1, 100_000);
    if (perspective) transform.perspective = perspective;
    return transform;
  }

  private parseAnchor(value: string): number {
    const trimmed = value.trim();
    const number = trimmed.endsWith('%') ? Number(trimmed.slice(0, -1)) / 100 : Number(trimmed);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.5;
  }

  private parseCrop(el: PElement | undefined): Crop | undefined {
    if (!el) return undefined;
    const read = (name: string): number => {
      const raw = this.attr(el, name);
      if (!raw) return 0;
      const number = raw.trim().endsWith('%') ? Number(raw.trim().slice(0, -1)) / 100 : Number(raw);
      return Number.isFinite(number) ? Math.max(0, Math.min(0.999, number)) : 0;
    };
    const crop = { left: read('left'), right: read('right'), top: read('top'), bottom: read('bottom') };
    if (crop.left + crop.right >= 1 || crop.top + crop.bottom >= 1) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, 'crop leaves no visible area', el);
      return undefined;
    }
    return crop;
  }

  private parseEffect(el: PElement, fallbackKind: 'effect' | 'audio-effect'): Effect | undefined {
    const type = this.attr(el, 'type', 'name');
    if (!type) {
      this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, `<${fallbackKind}> requires type`, el);
      return undefined;
    }
    const params: Record<string, string | number | boolean> = {};
    for (const attr of el.attrs) {
      if (['id', 'type', 'name', 'enabled'].includes(attr.name)) continue;
      params[attr.name] = convertParam(attr.value);
    }
    return {
      id: this.attr(el, 'id') ?? this.uniqueId(`effect-${type}-${++this.autoCounter}`),
      type,
      params,
      enabled: parseBool(this.attr(el, 'enabled'), true),
    };
  }

  private parseAnimation(el: PElement, defaultBase: 'clip' | 'project', clipId?: string): Animation | undefined {
    const property = this.attr(el, 'property', 'prop');
    if (!property) {
      this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, '<animate> requires property', el);
      return undefined;
    }
    const id = this.attr(el, 'id') ?? this.uniqueId(`animate-${property}-${++this.autoCounter}`);
    const timeBaseRaw = this.attr(el, 'time-base');
    const timeBase = timeBaseRaw === 'project' || timeBaseRaw === 'clip' ? timeBaseRaw : defaultBase;
    const start = this.timeAttr(el, 'start') ?? ZERO;
    let duration = this.timeAttr(el, 'duration');
    const easing = (this.attr(el, 'easing', 'ease') ?? 'linear') as EasingName;
    const iterationsRaw = this.attr(el, 'iterations', 'repeat');
    let iterations: number | 'infinite' = 1;
    if (iterationsRaw === 'infinite') iterations = 'infinite';
    else if (iterationsRaw !== undefined) {
      const parsed = Number(iterationsRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, 'iterations must be a positive number or "infinite"', el);
      } else {
        iterations = parsed;
      }
    }
    const direction = (this.attr(el, 'direction') ?? 'normal') as AnimationDirection;
    const fill = (this.attr(el, 'fill') ?? 'both') as AnimationFill;
    const compose = (this.attr(el, 'compose') ?? 'replace') as AnimationCompose;
    const keyframes: Keyframe[] = [];
    const keyframeEls = this.direct(el, 'keyframe');
    if (keyframeEls.length) {
      for (const keyframeEl of keyframeEls) {
        const atRaw = this.attr(keyframeEl, 'at', 'time', 'offset');
        const value = this.attr(keyframeEl, 'value', 'to');
        if (atRaw === undefined || value === undefined) {
          this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, '<keyframe> requires at and value', keyframeEl);
          continue;
        }
        const at = this.parseKeyframeOffset(atRaw, duration, keyframeEl);
        if (at === undefined) continue;
        keyframes.push({ time: at, value, easing: this.attr(keyframeEl, 'easing') });
      }
    } else {
      const valuesRaw = this.attr(el, 'values');
      const timesRaw = this.attr(el, 'times');
      const fromRaw = this.attr(el, 'from');
      const toRaw = this.attr(el, 'to');
      if (valuesRaw !== undefined) {
        const values = splitList(valuesRaw);
        const timeParts = timesRaw ? splitList(timesRaw) : [];
        if (!values.length) {
          this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, '<animate values="…"> must not be empty', el);
        }
        values.forEach((value, index) => {
          let at: Rational | undefined;
          if (timeParts[index]) at = this.parseKeyframeOffset(timeParts[index]!, duration, el);
          else if (values.length === 1) at = ZERO;
          else at = duration ? mul(duration, rat(index, values.length - 1)) : undefined;
          if (at) keyframes.push({ time: at, value });
        });
        if (!duration && keyframes.length) duration = keyframes.reduce((max, kf) => (gt(kf.time, max) ? kf.time : max), ZERO);
      } else if (fromRaw !== undefined || toRaw !== undefined) {
        if (!duration) {
          this.error(ErrorCode.TIME_UNBOUNDED, '<animate> with from/to requires duration', el);
          return undefined;
        }
        keyframes.push({ time: ZERO, value: fromRaw ?? toRaw ?? '0' });
        keyframes.push({ time: duration, value: toRaw ?? fromRaw ?? '1' });
      } else {
        this.error(
          ErrorCode.PARSE_MISSING_ATTRIBUTE,
          '<animate> requires from/to, values/times or <keyframe> children',
          el,
        );
        return undefined;
      }
    }

    if (!duration) {
      duration = keyframes.reduce((max, kf) => (gt(kf.time, max) ? kf.time : max), ZERO);
    }
    if (!duration || eq(duration, ZERO)) {
      this.error(ErrorCode.TIME_UNBOUNDED, '<animate> duration resolves to zero', el);
      return undefined;
    }
    // Normalise out-of-range keyframes with a warning.
    for (const kf of keyframes) {
      if (gt(kf.time, duration)) {
        this.warn(ErrorCode.TIME_INVALID, 'keyframe time exceeds animation duration and was clamped', el);
        (kf as { time: Rational }).time = duration;
      }
    }
    keyframes.sort((a, b) => (lt(a.time, b.time) ? -1 : gt(a.time, b.time) ? 1 : 0));
    const selector = this.attr(el, 'target') ?? this.attr(el, 'selector');
    const explicitClip = this.attr(el, 'clip', 'clip-id') ?? clipId;
    return {
      id,
      clipId: explicitClip,
      selector,
      property,
      keyframes,
      start,
      duration,
      timeBase,
      easing,
      iterations,
      direction,
      fill,
      compose,
      enabled: parseBool(this.attr(el, 'enabled'), true),
    };
  }

  private parseKeyframeOffset(raw: string, duration: Rational | undefined, el: PElement): Rational | undefined {
    const trimmed = raw.trim();
    if (trimmed.endsWith('%')) {
      const pct = Number(trimmed.slice(0, -1));
      if (!Number.isFinite(pct)) {
        this.error(ErrorCode.TIME_INVALID, `invalid keyframe offset "${raw}"`, el);
        return undefined;
      }
      if (!duration) {
        this.error(ErrorCode.TIME_UNBOUNDED, 'percentage keyframe offsets require an explicit duration', el);
        return undefined;
      }
      return mul(duration, rat(Math.round(pct * 1000), 100_000));
    }
    const fraction = Number(trimmed);
    if (Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 && !/[a-z]/i.test(trimmed)) {
      if (!duration) {
        this.error(ErrorCode.TIME_UNBOUNDED, 'fractional keyframe offsets require an explicit duration', el);
        return undefined;
      }
      return mul(duration, rat(Math.round(fraction * 1e6), 1e6));
    }
    try {
      return parseTime(trimmed, { frameRate: this.project.composition.frameRate });
    } catch (error) {
      this.error(ErrorCode.TIME_INVALID, (error as Error).message, el);
      return undefined;
    }
  }

  private parseProjectAnimations(): void {
    const animationEls = [
      ...this.direct(this.projectEl, 'animate'),
      ...this.direct(this.projectEl, 'animations').flatMap((wrapper) => this.direct(wrapper, 'animate')),
    ];
    for (const el of animationEls) {
      const target = this.attr(el, 'clip', 'clip-id') ?? this.attr(el, 'target');
      let clipId: string | undefined;
      if (target) {
        const located = this.project.timelines
          .flatMap((timeline) => timeline.tracks)
          .flatMap((track) => track.clips)
          .find((clip) => clip.id === target);
        if (located) clipId = located.id;
      }
      const animation = this.parseAnimation(el, 'project', clipId);
      if (!animation) continue;
      if (animation.clipId) {
        // "target" was a clip id, not a selector.
        if (!this.attr(el, 'selector') && this.attr(el, 'target') === animation.clipId) {
          animation.selector = undefined;
        }
      }
      if (!animation.clipId && !animation.selector) {
        this.error(
          ErrorCode.PARSE_MISSING_ATTRIBUTE,
          'project-level <animate> needs clip="clip-id" or target="selector"',
          el,
        );
        continue;
      }
      this.project.animations.push(animation);
    }
  }

  private parseTransition(el: PElement, trackId: string, clips: Clip[]): Transition | undefined {
    const id = this.attr(el, 'id') ?? this.uniqueId(`transition-${++this.autoCounter}`);
    const fromClipId = this.requiredAttr(el, 'from', '<transition>');
    const toClipId = this.requiredAttr(el, 'to', '<transition>');
    const from = clips.find((clip) => clip.id === fromClipId);
    const to = clips.find((clip) => clip.id === toClipId);
    if (!from || !to) {
      this.error(
        ErrorCode.REFERENCE_NOT_FOUND,
        `transition "${id}" references clips that are not on this lane`,
        el,
        { objectId: id },
      );
      return undefined;
    }
    const overlapStart = from.start.num * to.start.den < to.start.num * from.start.den ? to.start : from.start;
    const fromEnd = add(from.start, from.duration);
    const toEnd = add(to.start, to.duration);
    const overlapEnd = lt(fromEnd, toEnd) ? fromEnd : toEnd;
    const overlap = sub(overlapEnd, overlapStart);
    if (lt(overlap, ZERO) || eq(overlap, ZERO)) {
      this.error(
        ErrorCode.TIME_TRANSITION_INVALID,
        `transition "${id}" requires overlapping clips; extend ${fromClipId} or start ${toClipId} earlier by the transition duration`,
        el,
        { objectId: id },
      );
      return undefined;
    }
    let duration = this.timeAttr(el, 'duration');
    if (!duration) duration = overlap;
    if (gt(duration, overlap)) {
      this.error(
        ErrorCode.TIME_TRANSITION_INVALID,
        `transition "${id}" duration exceeds clip overlap (${overlap.num}/${overlap.den}s)`,
        el,
        { objectId: id },
      );
      duration = overlap;
    }
    if (lt(duration, ZERO) || eq(duration, ZERO)) {
      this.error(ErrorCode.TIME_TRANSITION_INVALID, `transition "${id}" has zero duration`, el, { objectId: id });
      return undefined;
    }
    const typeRaw = this.attr(el, 'type') ?? 'crossfade';
    // Built-in types pass through; declared plugin types (RFC-0015) are kept
    // verbatim and desugared onto their extension base at render time.
    const isBuiltIn = TRANSITION_TYPES.has(typeRaw as TransitionType);
    const isDeclared = !isBuiltIn && this.isDeclaredTransitionType(typeRaw);
    const type = (isBuiltIn || isDeclared ? typeRaw : 'crossfade') as Transition['type'];
    if (!isBuiltIn && !isDeclared) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unknown transition type "${typeRaw}"`, el, { objectId: id });
    }
    const directionRaw = this.attr(el, 'direction') ?? 'left';
    const direction = DIRECTIONS.has(directionRaw as TransitionDirection)
      ? (directionRaw as TransitionDirection)
      : 'left';
    const params: Record<string, string | number | boolean> = {};
    for (const attr of el.attrs) {
      if (['id', 'from', 'to', 'type', 'duration', 'easing', 'direction', 'color'].includes(attr.name)) continue;
      params[attr.name] = convertParam(attr.value);
    }
    return {
      id,
      trackId,
      fromClipId,
      toClipId,
      type,
      duration,
      easing: (this.attr(el, 'easing') ?? 'ease-in-out') as EasingName,
      direction,
      color: this.attr(el, 'color') ?? '#000000',
      params,
      source: this.loc(el),
    };
  }

  private parseOutputs(): void {
    const outputEls = this.wrapped(this.projectEl, 'outputs', 'output');
    outputEls.forEach((el, index) => {
      const id = this.attr(el, 'id') ?? this.uniqueId(`output-${index + 1}`);
      this.usedIds.add(id);
      const formatRaw = this.attr(el, 'format') ?? 'mp4';
      const format = OUTPUT_FORMATS.has(formatRaw as OutputFormat) ? (formatRaw as OutputFormat) : 'mp4';
      if (!OUTPUT_FORMATS.has(formatRaw as OutputFormat)) {
        this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unsupported output format "${formatRaw}"`, el, { objectId: id });
      }
      const codecs = defaultCodecs(format);
      const timelineId = this.attr(el, 'timeline') ?? this.project.mainTimeline;
      if (!this.project.timelines.some((timeline) => timeline.id === timelineId)) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `output "${id}" references unknown timeline "${timelineId}"`, el, { objectId: id });
      }
      const rangeStart = this.timeAttr(el, 'start') ?? this.timeAttr(el, 'range-start');
      const rangeDuration = this.timeAttr(el, 'duration') ?? this.timeAttr(el, 'range-duration');
      const fitRaw = this.attr(el, 'fit');
      const fit = fitRaw === 'stretch' || fitRaw === 'contain' || fitRaw === 'cover' ? fitRaw : undefined;
      if (fitRaw && !fit) {
        this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unsupported output fit "${fitRaw}"`, el, { objectId: id });
      }
      const downmixRaw = this.attr(el, 'downmix');
      const downmix = downmixRaw === 'mono' || downmixRaw === 'stereo' ? downmixRaw : undefined;
      if (downmixRaw && !downmix) {
        this.error(ErrorCode.VALIDATION_INVALID_VALUE, `unsupported output downmix "${downmixRaw}" (expected "mono" or "stereo")`, el, { objectId: id });
      }
      const output: OutputConfig = {
        id,
        timeline: timelineId,
        format,
        width: this.intAttr(el, 'width', this.project.composition.width, 16, 16384) ?? this.project.composition.width,
        height: this.intAttr(el, 'height', this.project.composition.height, 16, 16384) ?? this.project.composition.height,
        frameRate: this.project.composition.frameRate,
        fit,
        downmix,
        rangeStart,
        rangeDuration,
        videoCodec: this.attr(el, 'video-codec', 'codec') ?? codecs.videoCodec,
        audioCodec: this.attr(el, 'audio-codec') ?? codecs.audioCodec,
        videoBitrate: this.attr(el, 'video-bitrate'),
        crf: this.intAttr(el, 'crf', undefined, 0, 63),
        preset: this.attr(el, 'preset'),
        audioBitrate: this.attr(el, 'audio-bitrate'),
        sampleRate: this.intAttr(el, 'sample-rate', this.project.composition.sampleRate, 8000, 192_000) ?? this.project.composition.sampleRate,
        channels: this.intAttr(el, 'channels', this.project.composition.channels, 1, 8) ?? this.project.composition.channels,
        pixelFormat: this.attr(el, 'pixel-format') ?? 'yuv420p',
        colorSpace: this.project.composition.colorSpace,
        background: this.attr(el, 'background') ?? this.project.composition.background,
        burnCaptions: parseBool(this.attr(el, 'burn-captions'), false),
        captionsPath: this.attr(el, 'captions-path'),
        path: this.attr(el, 'path', 'file', 'filename'),
        metadata: {},
        source: this.loc(el),
      };
      const fpsRaw = this.attr(el, 'frame-rate', 'fps');
      if (fpsRaw) {
        try {
          output.frameRate = parseFrameRate(fpsRaw);
        } catch (error) {
          this.error(ErrorCode.TIME_INVALID, (error as Error).message, el, { objectId: id });
        }
      }
      this.project.outputs.push(output);
    });
    if (!this.project.outputs.length) {
      const codecs = defaultCodecs('mp4');
      this.project.outputs.push({
        id: 'mp4',
        timeline: this.project.mainTimeline,
        format: 'mp4',
        width: this.project.composition.width,
        height: this.project.composition.height,
        frameRate: this.project.composition.frameRate,
        videoCodec: codecs.videoCodec,
        audioCodec: codecs.audioCodec,
        sampleRate: this.project.composition.sampleRate,
        channels: this.project.composition.channels,
        pixelFormat: 'yuv420p',
        colorSpace: this.project.composition.colorSpace,
        background: this.project.composition.background,
        burnCaptions: false,
      });
    }
  }

  private parseProjectMetadata(): void {
    for (const metadataEl of this.direct(this.projectEl, 'metadata')) {
      for (const attr of metadataEl.attrs) {
        if (attr.name === 'id') continue;
        this.project.metadata[attr.name] = attr.value;
      }
    }
    for (const metaEl of this.wrapped(this.projectEl, 'metadata', 'meta')) {
      for (const attr of metaEl.attrs) {
        if (attr.name === 'id') continue;
        this.project.metadata[attr.name] = attr.value;
      }
    }
    for (const reqEl of this.wrapped(this.projectEl, 'requirements', 'requires')) {
      const feature = this.attr(reqEl, 'feature', 'name');
      if (feature) this.project.requirements!.push(feature);
    }
  }

  /**
   * Parse the extension registry (RFC-0015). Runs before timelines so that
   * declared effect/transition types are known while lanes are parsed.
   */
  private parseExtensions(): void {
    for (const extEl of this.wrapped(this.projectEl, 'extensions', 'extension')) {
      const name = this.requiredAttr(extEl, 'name', '<extension>');
      if (!name) continue;
      const kindRaw = this.attr(extEl, 'kind');
      const EXTENSION_KINDS: ExtensionKind[] = ['effect', 'audio-effect', 'transition'];
      let kind: ExtensionKind | undefined;
      if (kindRaw !== undefined) {
        if ((EXTENSION_KINDS as string[]).includes(kindRaw)) {
          kind = kindRaw as ExtensionKind;
        } else {
          this.error(
            ErrorCode.VALIDATION_INVALID_VALUE,
            `<extension name="${name}"> kind must be "effect", "audio-effect" or "transition", got "${kindRaw}"`,
            extEl,
            { objectId: name },
          );
        }
      }
      const declaration: ExtensionDeclaration = {
        name,
        version: this.attr(extEl, 'version'),
        required: parseBool(this.attr(extEl, 'required'), false),
      };
      if (kind) {
        declaration.kind = kind;
        declaration.base = this.attr(extEl, 'base');
        if (!declaration.base) {
          this.error(
            ErrorCode.PARSE_MISSING_ATTRIBUTE,
            `<extension name="${name}" kind="${kind}"> requires a "base" builtin behaviour to render as`,
            extEl,
            { objectId: name },
          );
        }
        const paramsEl = this.direct(extEl, 'params')[0];
        if (paramsEl) {
          declaration.params = {};
          for (const attr of paramsEl.attrs) declaration.params[attr.name] = convertParam(attr.value);
        }
      }
      this.project.extensions ??= {};
      this.project.extensions[name] = declaration;
    }
  }

  /** True when a transition type is declared by a plugin extension. */
  private isDeclaredTransitionType(typeName: string): boolean {
    return this.project.extensions?.[typeName]?.kind === 'transition';
  }

  /** Element/type names that carry the authoring program (code extension). */
  private isProgramScript(el: PElement): boolean {
    if (tagOf(el) === 'program') return true;
    if (tagOf(el) !== 'script') return false;
    const type = (this.attr(el, 'type') ?? '').toLowerCase();
    return (
      type === 'application/vnd.vhtml.program+javascript' ||
      type === 'application/vhtml+javascript' ||
      type === 'text/vhtml+javascript'
    );
  }

  private parseAuthoringProgram(): void {
    const found: Array<{ code: string; seed?: number; params: Record<string, string>; source?: SourceLocation }> = [];
    const dataBlocks: DataBlock[] = [];
    const seenData = new Set<string>();
    const visit = (node: PNode, insideScene: boolean): void => {
      if (!isElement(node)) {
        if ('childNodes' in node) for (const child of childNodesOf(node)) visit(child, insideScene);
        return;
      }
      const tag = tagOf(node);
      const nowInsideScene = insideScene || tag === 'scene';
      if (!insideScene && this.isProgramScript(node)) {
        const code = tagOf(node) === 'program' ? textOf(node) : textOf(node);
        if (code.trim()) {
          const params: Record<string, string> = {};
          for (const paramEl of this.direct(node, 'param')) {
            const name = this.attr(paramEl, 'name');
            if (name) params[name] = this.attr(paramEl, 'value') ?? '';
          }
          const paramsRaw = this.attr(node, 'params');
          if (paramsRaw) {
            try {
              const parsed = JSON.parse(paramsRaw) as unknown;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
                  params[name] = String(value);
                }
              } else {
                this.error(ErrorCode.PARSE_INVALID_ATTRIBUTE, 'program params attribute must be a JSON object', node, { objectId: 'program' });
              }
            } catch (error) {
              this.error(ErrorCode.PARSE_INVALID_ATTRIBUTE, `program params is not valid JSON: ${(error as Error).message}`, node, { objectId: 'program' });
            }
          }
          const seedRaw = this.attr(node, 'seed');
          const seed = seedRaw !== undefined ? Number(seedRaw) : undefined;
          if (seedRaw !== undefined && (!Number.isFinite(seed) || (seed ?? 0) < 0)) {
            this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `program seed must be a non-negative integer, got "${seedRaw}"`, node);
          }
          found.push({ code, seed: Number.isFinite(seed) ? seed : undefined, params, source: this.loc(node) });
        }
      } else if (!insideScene && tag === 'data') {
        const dataId = this.attr(node, 'id', 'name');
        if (!dataId) {
          this.error(ErrorCode.PARSE_MISSING_ATTRIBUTE, '<data> requires id', node);
        } else if (seenData.has(dataId)) {
          this.error(ErrorCode.PARSE_DUPLICATE_ID, `duplicate <data> id "${dataId}"`, node, { objectId: dataId });
        } else {
          seenData.add(dataId);
          const mimeType = (this.attr(node, 'type') ?? 'application/json').toLowerCase();
          const srcRaw = this.attr(node, 'src');
          let raw = textOf(node);
          let src: string | undefined;
          if (srcRaw) {
            // External data files follow the same project-root sandbox and
            // path rules as external scenes; `src` wins over inline content.
            const loaded = this.readDataFile(node, srcRaw, dataId);
            raw = loaded.content;
            src = loaded.src;
          }
          let value: unknown = raw.trim();
          if (mimeType === 'application/json' || mimeType.endsWith('+json')) {
            try {
              value = JSON.parse(raw);
            } catch (error) {
              this.error(ErrorCode.PARSE_INVALID_DOCUMENT, `<data id="${dataId}"> is not valid JSON: ${(error as Error).message}`, node, { objectId: dataId });
              value = undefined;
            }
          }
          dataBlocks.push({ id: dataId, mimeType, value, src, source: this.loc(node) });
        }
      } else if (!insideScene && tag === 'script') {
        const type = (this.attr(node, 'type') ?? '').toLowerCase();
        if (type === 'application/json' || type.endsWith('+json')) {
          const dataId = this.attr(node, 'id');
          if (dataId && !seenData.has(dataId)) {
            seenData.add(dataId);
            try {
              dataBlocks.push({ id: dataId, mimeType: type, value: JSON.parse(textOf(node)), source: this.loc(node) });
            } catch (error) {
              this.error(ErrorCode.PARSE_INVALID_DOCUMENT, `<script type="${type}" id="${dataId}"> is not valid JSON: ${(error as Error).message}`, node, { objectId: dataId });
            }
          }
        }
      }
      if (!nowInsideScene) {
        for (const child of childNodesOf(node)) visit(child, nowInsideScene);
      }
    };
    visit(this.doc, false);

    if (found.length > 1) {
      this.error(ErrorCode.PARSE_DUPLICATE_ID, `document declares ${found.length} authoring programs; only one is allowed`, undefined, { objectId: 'program' });
    }
    if (found.length > 0) {
      this.documentProgram = found[0]!;
    }
    if (dataBlocks.length) {
      this.documentDataBlocks = dataBlocks;
    }
  }

  private collectGlobalResources(): void {
    const visit = (node: PNode, insideScene: boolean): void => {
      if (!isElement(node)) {
        if ('childNodes' in node) for (const child of childNodesOf(node)) visit(child, insideScene);
        return;
      }
      const tag = tagOf(node);
      const nowInsideScene = insideScene || tag === 'scene';
      if (!insideScene && tag === 'style') {
        const css = textOf(node).trim();
        if (css) this.project.styles.push(css);
      } else if (!insideScene && tag === 'link') {
        const rel = (this.attr(node, 'rel') ?? '').toLowerCase();
        const href = this.attr(node, 'href');
        if (rel.split(/\s+/).includes('stylesheet') && href) {
          this.project.stylesheets!.push(href);
        }
      } else if (!insideScene && tag === 'script') {
        const type = (this.attr(node, 'type') ?? '').toLowerCase();
        const isAuthoring =
          this.isProgramScript(node) ||
          type === 'application/json' ||
          type.endsWith('+json');
        if (!isAuthoring) {
          const text = textOf(node).trim();
          if (text) this.project.scripts!.push(serializeOuter(node));
        }
      }
      if (!nowInsideScene) {
        for (const child of childNodesOf(node)) visit(child, nowInsideScene);
      }
    };
    visit(this.doc, false);
  }

  private finalize(): void {
    if (!this.project.composition) return;
    const main = this.project.timelines.find((timeline) => timeline.id === this.project.mainTimeline);
    if (!this.compositionDurationExplicit && main) {
      this.project.composition.duration = main.duration;
    }
    if (main) {
      if (gt(main.duration, this.project.composition.duration)) {
        this.warn(
          ErrorCode.TIME_INVALID,
          `main timeline is longer than composition duration; frames after ${this.project.composition.duration.num}/${this.project.composition.duration.den}s are not sampled`,
          this.projectEl,
        );
      }
    }
    if (!this.mainTimelineExplicit && this.project.timelines.length > 1) {
      this.diagnostics.add({
        code: 'VALIDATION_INVALID_VALUE',
        severity: 'info',
        message: `multiple timelines found; "${this.project.mainTimeline}" is treated as main (set main-timeline to override)`,
      });
    }
    // Ensure tracks reference the same timeline and no duplicate clip ids across project.
    const seenClips = new Set<string>();
    for (const timeline of this.project.timelines) {
      for (const track of timeline.tracks) {
        for (const clip of track.clips) {
          if (seenClips.has(clip.id)) {
            this.error(ErrorCode.PARSE_DUPLICATE_ID, `duplicate clip id "${clip.id}"`, undefined, { objectId: clip.id });
          }
          seenClips.add(clip.id);
          if (clip.animations.length) {
            for (const animation of clip.animations) animation.clipId = clip.id;
          }
          // Nested timeline references may be forward declarations; every
          // timeline is known by finalize, so resolve them here and default
          // the clip duration to the sub-timeline duration.
          if (clip.kind === 'timeline') {
            const resolved = resolveReference(this.project, clip.ref);
            if (resolved?.kind === 'timeline') {
              if (clip.duration.num === 0 && clip.duration.den === 1) clip.duration = resolved.timeline.duration;
            } else {
              this.error(
                ErrorCode.REFERENCE_NOT_FOUND,
                `timeline clip "${clip.id}" references unknown timeline "${clip.ref}"`,
                undefined,
                { objectId: clip.id },
              );
            }
          }
        }
      }
    }
  }
}

export function parseVhtml(source: string, options: ParseOptions = {}): ParseResult {
  const parser = new VhtmlParser(source, options);
  return parser.parse();
}

export function tryParseVhtml(
  source: string,
  options: ParseOptions = {},
): { ok: true; result: ParseResult } | { ok: false; diagnostics: Diagnostic[]; error: VhtmlError } {
  try {
    const result = parseVhtml(source, options);
    if (result.diagnostics.some((d) => d.severity === 'error')) {
      const first = result.diagnostics.find((d) => d.severity === 'error')!;
      return { ok: false, diagnostics: result.diagnostics, error: VhtmlError.fromDiagnostic(first) };
    }
    return { ok: true, result };
  } catch (error) {
    const vhtmlError = error instanceof VhtmlError ? error : new VhtmlError(ErrorCode.PARSE_INVALID_DOCUMENT, String(error));
    return { ok: false, diagnostics: vhtmlError.diagnostics, error: vhtmlError };
  }
}

export function formatParseDiagnostics(diagnostics: Diagnostic[], cwd?: string): string {
  return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, cwd)).join('\n');
}
