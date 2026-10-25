/**
 * Shared code-first authoring builders.
 *
 * These are the pure builder functions behind `@sdkwork/vhtml-sdk` and the
 * inline authoring program sandbox. Both surfaces must produce the exact same
 * Core Model, so the implementation lives here, next to the model itself.
 */

import {
  DEFAULT_CLIP,
  DEFAULT_TRANSFORM,
  type Animation,
  type AnimationCompose,
  type AnimationDirection,
  type AnimationFill,
  type Asset,
  type AssetKind,
  type BlendMode,
  type CaptionClip,
  type Clip,
  type ClipBase,
  type ClipKind,
  type Composition,
  type Crop,
  type Effect,
  type EasingName,
  type GenerationKind,
  type GenerationTask,
  type Marker,
  type OutputConfig,
  type OutputFormat,
  type Project,
  type Scene,
  type SceneClip,
  type StoryboardShot,
  type TimeRemap,
  type Timeline,
  type Track,
  type TrackType,
  type Transform,
  type Transition,
  type TransitionDirection,
  type TransitionType,
} from './model.ts';
import {
  ZERO,
  add,
  parseFrameRate,
  parseTime,
  rat,
  sub,
  type Rate,
  type Rational,
} from './time.ts';
import { easingFunction } from './animation.ts';

export type TimeInput = Rational | string | number;

export interface HtmlEscaped {
  __vhtmlHtml: string;
}

/** Escape interpolated values in an HTML template. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  strings.forEach((chunk, index) => {
    result += chunk;
    if (index < values.length) {
      const value = values[index];
      if (value === null || value === undefined) return;
      if (typeof value === 'object' && value && '__vhtmlHtml' in value) {
        result += (value as HtmlEscaped).__vhtmlHtml;
      } else {
        result += String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }
    }
  });
  return result;
}

/** Trusted HTML fragment (used for composed scenes and SVG). */
export function rawHtml(markup: string): HtmlEscaped {
  return { __vhtmlHtml: markup };
}

export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((output, chunk, index) => output + chunk + (index < values.length ? String(values[index]) : ''), '');
}

export function t3(value: TimeInput, fps: Rate): Rational {
  if (typeof value === 'object' && 'num' in value) return value;
  if (typeof value === 'number') return rat(Math.round(value * 1_000_000), 1_000_000);
  return parseTime(value, { frameRate: fps });
}

let autoId = 0;

function nextId(prefix: string): string {
  autoId += 1;
  return `${prefix}-${autoId}`;
}

/**
 * Reset the auto-id counter. The authoring program runner calls this before
 * every materialisation so repeated runs of the same program in one process
 * produce identical model ids.
 */
export function resetAuthoringIds(): void {
  autoId = 0;
}

export interface AssetSpec {
  id: string;
  src: string;
  type?: AssetKind;
  mimeType?: string;
  duration?: TimeInput;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  alt?: string;
  license?: Asset['license'];
}

export function asset(spec: AssetSpec): Asset {
  return {
    id: spec.id,
    kind: spec.type ?? 'image',
    src: spec.src,
    mimeType: spec.mimeType,
    duration: spec.duration !== undefined ? t3(spec.duration, rat(30)) : undefined,
    width: spec.width,
    height: spec.height,
    sampleRate: spec.sampleRate,
    channels: spec.channels,
    alt: spec.alt,
    license: spec.license,
  };
}

export interface SceneSpec {
  id: string;
  /** External HTML fragment; when set, inline html/css should normally be omitted. */
  src?: string;
  html?: string;
  css?: string;
  duration?: TimeInput;
  width?: number;
  height?: number;
  background?: string;
  scripts?: string[];
}

export function scene(spec: SceneSpec): Scene {
  return {
    id: spec.id,
    src: spec.src,
    html: spec.html ?? '',
    css: spec.css,
    duration: spec.duration !== undefined ? t3(spec.duration, rat(30)) : undefined,
    width: spec.width,
    height: spec.height,
    background: spec.background,
    scripts: spec.scripts,
  };
}

export interface AnimationSpec {
  property: string;
  from?: string | number;
  to?: string | number;
  values?: Array<string | number>;
  times?: TimeInput[];
  keyframes?: Array<{ at: TimeInput; value: string | number; easing?: EasingName }>;
  start?: TimeInput;
  duration?: TimeInput;
  easing?: EasingName;
  iterations?: number | 'infinite';
  direction?: AnimationDirection;
  fill?: AnimationFill;
  compose?: AnimationCompose;
  timeBase?: 'clip' | 'project';
  selector?: string;
  enabled?: boolean;
}

export function animate(spec: AnimationSpec, fps: Rate = rat(30)): Animation {
  const keyframes: Array<{ time: Rational; value: string | number; easing?: EasingName }> = [];
  if (spec.keyframes?.length) {
    for (const keyframe of spec.keyframes) {
      keyframes.push({ time: t3(keyframe.at, fps), value: keyframe.value, easing: keyframe.easing });
    }
  } else if (spec.values?.length) {
    const values = spec.values;
    const times = spec.times ?? [];
    for (let index = 0; index < values.length; index += 1) {
      let time: Rational;
      if (times[index] !== undefined) {
        time = t3(times[index]!, fps);
      } else if (spec.duration !== undefined && values.length > 1) {
        const duration = t3(spec.duration, fps);
        time = rat(duration.num * index, duration.den * (values.length - 1));
      } else if (values.length > 1) {
        time = rat(index, values.length - 1);
      } else {
        time = ZERO;
      }
      keyframes.push({ time, value: values[index]!, easing: undefined });
    }
  } else {
    if (spec.from === undefined) throw new Error(`animate("${spec.property}") needs from or values`);
    const duration = spec.duration !== undefined ? t3(spec.duration, fps) : rat(1);
    keyframes.push({ time: ZERO, value: spec.from });
    keyframes.push({ time: duration, value: spec.to ?? spec.from });
  }
  let duration =
    spec.duration !== undefined
      ? t3(spec.duration, fps)
      : keyframes.reduce((max, keyframe) => (keyframe.time.num * max.den > max.num * keyframe.time.den ? keyframe.time : max), ZERO);
  if (duration.num === 0) duration = rat(1);
  return {
    id: nextId(`anim-${spec.property.replace(/[^A-Za-z0-9]+/g, '-')}`),
    clipId: undefined,
    selector: spec.selector,
    property: spec.property,
    keyframes,
    start: spec.start !== undefined ? t3(spec.start, fps) : ZERO,
    duration,
    timeBase: spec.timeBase ?? 'clip',
    easing: spec.easing ?? 'linear',
    iterations: spec.iterations ?? 1,
    direction: spec.direction ?? 'normal',
    fill: spec.fill ?? 'both',
    compose: spec.compose ?? 'replace',
    enabled: spec.enabled ?? true,
  };
}

export interface EffectSpec {
  type: string;
  params?: Record<string, string | number | boolean>;
  enabled?: boolean;
}

export function effect(type: string, params: Record<string, string | number | boolean> = {}): Effect {
  return {
    id: nextId(`fx-${type}`),
    type,
    params,
    enabled: true,
  };
}

export interface TimeRemapSpec {
  /** Keyframes mapping clip-local time to source offsets. */
  keyframes: Array<{ at: TimeInput; source: TimeInput; easing?: EasingName }>;
  /** Default easing between keyframes. */
  easing?: EasingName;
}

export function timeRemap(spec: TimeRemapSpec, fps: Rate = rat(30)): TimeRemap {
  return {
    keyframes: spec.keyframes.map((keyframe) => ({
      at: t3(keyframe.at, fps),
      source: t3(keyframe.source, fps),
      easing: keyframe.easing,
    })),
    easing: spec.easing ?? 'linear',
  };
}

export interface ClipSpec {
  id?: string;
  ref?: string;
  src?: string;
  kind?: ClipKind;
  /** Inline HTML scene shorthand. */
  html?: string;
  css?: string;
  start?: TimeInput;
  duration?: TimeInput;
  in?: TimeInput;
  out?: TimeInput;
  speed?: number;
  reverse?: boolean;
  freeze?: TimeInput | boolean;
  /** Keyframed time remap (speed ramps); overrides `speed` when set. */
  timeRemap?: TimeRemapSpec;
  enabled?: boolean;
  z?: number;
  opacity?: number;
  blend?: BlendMode;
  fit?: 'cover' | 'contain' | 'fill' | 'none';
  transform?: Partial<Transform> & { scale?: number };
  crop?: Partial<Crop>;
  effects?: Effect[];
  audioEffects?: Effect[];
  animations?: Array<AnimationSpec | Animation>;
  volume?: number;
  pan?: number;
  fadeIn?: TimeInput;
  fadeOut?: TimeInput;
  /** Audio lead/lag in seconds (lip-sync correction); see ClipBase.audioOffset. */
  audioOffset?: TimeInput;
  className?: string;
  name?: string;
  loop?: boolean;
  muted?: boolean;
  text?: string;
  speaker?: string;
  style?: Record<string, string>;
  value?: string;
  /** Data passed through to the generated clip metadata. */
  metadata?: Record<string, string>;
}

export interface SceneIndex {
  scenes: Map<string, Scene>;
  assets: Map<string, Asset>;
  generations: Map<string, GenerationTask>;
}

export function resolveClipKind(spec: ClipSpec, index: SceneIndex): ClipKind {
  if (spec.kind) return spec.kind;
  if (spec.text !== undefined) return 'caption';
  if (spec.value !== undefined) return 'data';
  const ref = spec.ref;
  if (!ref) return 'scene';
  if (ref.startsWith('timeline:')) return 'timeline';
  const bare = ref.replace(/^(scene|asset|gen):/, '');
  if (ref.startsWith('gen:') || index.generations.has(bare)) {
    const task = index.generations.get(bare);
    if (task) {
      if (task.kind === 'audio' || task.kind === 'music' || task.kind === 'speech' || task.kind === 'sfx' || task.kind === 'dub') return 'audio';
      if (task.kind === 'image' || task.kind === 'edit' || task.kind === 'matte' || task.kind === 'storyboard') return 'image';
      if (task.kind === 'text' || task.kind === 'translation') return 'data';
      if (task.kind === 'video' || task.kind === 'avatar' || task.kind === 'lipsync') return 'video';
    }
    return 'video';
  }
  if (index.scenes.has(bare)) return 'scene';
  const found = [...index.assets.values()].find((assetValue) => assetValue.id === bare || assetValue.id === ref);
  if (found) {
    if (found.kind === 'audio') return 'audio';
    if (found.kind === 'video') return 'video';
    if (found.kind === 'svg') return 'svg';
    if (found.kind === 'image') return 'image';
  }
  return 'scene';
}

export function isAnimation(value: AnimationSpec | Animation): value is Animation {
  return 'id' in value && 'timeBase' in value && Array.isArray((value as Animation).keyframes);
}

export function buildClip(spec: ClipSpec, id: string, index: SceneIndex, composition: Composition): Clip {
  const fps = composition.frameRate;
  const kind = resolveClipKind(spec, index);
  const ref = spec.ref ?? (spec.html !== undefined ? `${id}-scene` : undefined);
  const start = spec.start !== undefined ? t3(spec.start, fps) : ZERO;
  const sourceIn = spec.in !== undefined ? t3(spec.in, fps) : ZERO;
  const speed = spec.speed !== undefined && spec.speed > 0 ? rat(Math.round(spec.speed * 1_000_000), 1_000_000) : rat(1);
  let duration = spec.duration !== undefined ? t3(spec.duration, fps) : undefined;
  let sourceOut = spec.out !== undefined ? t3(spec.out, fps) : undefined;
  if (!duration && sourceOut && spec.timeRemap === undefined) {
    duration = { num: sub(sourceOut, sourceIn).num * speed.den, den: sub(sourceOut, sourceIn).den * speed.num };
  }
  if (!duration) throw new Error(`clip "${id}" requires duration`);
  if (!sourceOut && (kind === 'video' || kind === 'audio') && spec.timeRemap === undefined) {
    sourceOut = add(sourceIn, { num: duration.num * speed.num, den: duration.den * speed.den });
  }
  let freeze: Rational | undefined;
  if (spec.freeze === true) freeze = sourceIn;
  else if (spec.freeze !== undefined && spec.freeze !== false) freeze = t3(spec.freeze as TimeInput, fps);
  const transform: Transform = {
    ...DEFAULT_TRANSFORM,
    ...(spec.transform ?? {}),
  };
  delete (transform as { scale?: number }).scale;
  if (spec.transform?.scale !== undefined) {
    transform.scaleX = spec.transform.scale;
    transform.scaleY = spec.transform.scale;
  }
  const effects = spec.effects ?? [];
  const animations: Animation[] = (spec.animations ?? []).map((animation) => {
    if (isAnimation(animation)) {
      return { ...structuredClone(animation), clipId: id };
    }
    return { ...animate(animation, fps), clipId: id };
  });
  const base: ClipBase = {
    ...DEFAULT_CLIP,
    id,
    kind,
    ref,
    name: spec.name,
    className: spec.className,
    start,
    duration,
    sourceIn,
    sourceOut,
    speed,
    reverse: spec.reverse ?? false,
    freeze,
    timeRemap: spec.timeRemap
      ? {
          keyframes: spec.timeRemap.keyframes.map((keyframe) => ({
            at: t3(keyframe.at, fps),
            source: t3(keyframe.source, fps),
            easing: keyframe.easing,
          })),
          easing: spec.timeRemap.easing ?? 'linear',
        }
      : undefined,
    enabled: spec.enabled ?? true,
    z: spec.z ?? 0,
    opacity: spec.opacity ?? 1,
    blend: spec.blend ?? 'normal',
    transform,
    crop: spec.crop
      ? {
          left: spec.crop.left ?? 0,
          right: spec.crop.right ?? 0,
          top: spec.crop.top ?? 0,
          bottom: spec.crop.bottom ?? 0,
        }
      : undefined,
    fit: spec.fit ?? 'cover',
    effects,
    animations,
    volume: spec.volume ?? 1,
    pan: spec.pan ?? 0,
    fadeIn: spec.fadeIn !== undefined ? t3(spec.fadeIn, fps) : undefined,
    fadeOut: spec.fadeOut !== undefined ? t3(spec.fadeOut, fps) : undefined,
    audioOffset: spec.audioOffset !== undefined ? t3(spec.audioOffset, fps) : undefined,
    audioEffects: spec.audioEffects ?? [],
    metadata: spec.metadata,
  };
  if (kind === 'caption') {
    return {
      ...base,
      kind: 'caption',
      text: spec.text ?? '',
      speaker: spec.speaker,
      style: spec.style,
    } as CaptionClip;
  }
  if (kind === 'data') {
    return { ...base, kind: 'data', value: spec.value } as Clip;
  }
  if (kind === 'scene') {
    return { ...base, kind: 'scene', ref: ref!, loop: spec.loop ?? false } as SceneClip;
  }
  if (kind === 'timeline') {
    return { ...base, kind: 'timeline', ref: ref ?? '', loop: spec.loop ?? false };
  }
  if (!ref) throw new Error(`clip "${id}" requires ref, src or inline html`);
  return {
    ...base,
    kind,
    ref,
    muted: spec.muted ?? false,
  } as Clip;
}

export interface TransitionSpec {
  from: string;
  to: string;
  type?: TransitionType;
  duration?: TimeInput;
  easing?: EasingName;
  direction?: TransitionDirection;
  color?: string;
  params?: Record<string, string | number | boolean>;
}

export interface LaneSpec {
  id: string;
  type?: TrackType;
  name?: string;
  order?: number;
  enabled?: boolean;
  muted?: boolean;
  volume?: number;
  pan?: number;
  opacity?: number;
  blend?: BlendMode;
  captionStyle?: string;
  clips: ClipSpec[];
  transitions?: TransitionSpec[];
}

export interface CaptionSpec {
  id?: string;
  start: TimeInput;
  duration?: TimeInput;
  end?: TimeInput;
  text: string;
  speaker?: string;
  style?: Record<string, string>;
  opacity?: number;
}

export interface MarkerSpec {
  id?: string;
  time: TimeInput;
  name?: string;
  type?: Marker['type'];
  color?: string;
  metadata?: Record<string, string>;
}

export function marker(spec: MarkerSpec, fps: Rate = rat(30)): Marker {
  return {
    id: spec.id ?? nextId('marker'),
    time: t3(spec.time, fps),
    name: spec.name,
    type: spec.type ?? 'marker',
    color: spec.color,
    metadata: spec.metadata,
  };
}

export interface OutputSpec {
  id?: string;
  timeline?: string;
  format?: OutputFormat;
  width?: number;
  height?: number;
  fps?: string | number | Rate;
  path?: string;
  crf?: number;
  preset?: string;
  audioBitrate?: string;
  videoBitrate?: string;
  captionsPath?: string;
  burnCaptions?: boolean;
  rangeStart?: TimeInput;
  rangeDuration?: TimeInput;
}

/** Build an OutputConfig from a spec, mirroring the SDK default codec table. */
export function outputConfig(spec: OutputSpec, composition: Composition, index: number, timelineId = 'main'): OutputConfig {
  const format = spec.format ?? 'mp4';
  const codecs =
    format === 'webm' ? { video: 'libvpx-vp9', audio: 'libopus' } :
    format === 'gif' ? { video: 'gif', audio: 'none' } :
    format === 'png-sequence' ? { video: 'png', audio: 'none' } :
    format === 'wav' ? { video: 'none', audio: 'pcm_s16le' } :
    format === 'mp3' ? { video: 'none', audio: 'libmp3lame' } :
    { video: 'libx264', audio: 'aac' };
  return {
    id: spec.id ?? `output-${index + 1}`,
    timeline: spec.timeline ?? timelineId,
    format,
    width: spec.width ?? composition.width,
    height: spec.height ?? composition.height,
    frameRate: spec.fps !== undefined ? (typeof spec.fps === 'object' ? spec.fps : parseFrameRate(String(spec.fps))) : composition.frameRate,
    rangeStart: spec.rangeStart !== undefined ? t3(spec.rangeStart, composition.frameRate) : undefined,
    rangeDuration: spec.rangeDuration !== undefined ? t3(spec.rangeDuration, composition.frameRate) : undefined,
    videoCodec: codecs.video,
    audioCodec: codecs.audio,
    videoBitrate: spec.videoBitrate,
    crf: spec.crf,
    preset: spec.preset,
    audioBitrate: spec.audioBitrate,
    sampleRate: composition.sampleRate,
    channels: composition.channels,
    pixelFormat: 'yuv420p',
    colorSpace: composition.colorSpace,
    background: composition.background,
    burnCaptions: spec.burnCaptions ?? false,
    captionsPath: spec.captionsPath,
    path: spec.path,
  };
}

export interface GenerationSpec {
  id: string;
  kind: GenerationKind;
  prompt: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
  inputs?: Array<{ ref: string; role: string }>;
  constraints?: {
    duration?: TimeInput;
    width?: number;
    height?: number;
    aspectRatio?: string;
    frameRate?: string | number | Rate;
    sampleRate?: number;
    channels?: number;
    language?: string;
    seed?: number;
    [key: string]: unknown;
  };
  params?: GenerationTask['params'];
  direction?: GenerationTask['direction'];
  review?: GenerationTask['review'];
  rights?: GenerationTask['rights'];
  safety?: GenerationTask['safety'];
  outputs?: GenerationTask['outputs'];
}

export function generationTask(spec: GenerationSpec, fps: Rate = rat(30)): GenerationTask {
  const constraints = spec.constraints ?? {};
  return {
    id: spec.id,
    kind: spec.kind,
    prompt: spec.prompt,
    negativePrompt: spec.negativePrompt,
    provider: spec.provider,
    model: spec.model,
    inputs: spec.inputs ?? [],
    constraints: {
      ...constraints,
      duration:
        constraints.duration !== undefined && (typeof constraints.duration === 'string' || typeof constraints.duration === 'number')
          ? t3(constraints.duration as TimeInput, fps)
          : (constraints.duration as Rational | undefined),
      frameRate:
        constraints.frameRate !== undefined && typeof constraints.frameRate !== 'object'
          ? parseFrameRate(String(constraints.frameRate))
          : (constraints.frameRate as Rate | undefined),
    },
    params: spec.params ?? {},
    direction: spec.direction,
    outputs: spec.outputs ?? [],
    status: 'draft',
    review: spec.review,
    rights: spec.rights,
    safety: spec.safety,
  };
}

export interface StoryboardShotSpec {
  id: string;
  title?: string;
  description?: string;
  prompt?: string;
  scene?: string;
  generation?: string;
  asset?: string;
  duration?: TimeInput;
  status?: StoryboardShot['status'];
  direction?: GenerationTask['direction'];
  tags?: string[];
  notes?: string;
}

export function storyboardShot(spec: StoryboardShotSpec, order: number, fps: Rate = rat(30)): StoryboardShot {
  return {
    ...spec,
    order,
    status: spec.status ?? 'idea',
    duration: spec.duration !== undefined ? t3(spec.duration, fps) : undefined,
  };
}

/** Deterministic named transition id used by lanes built from specs. */
export function transitionId(laneId: string, index: number): string {
  return `transition-${laneId}-${index + 1}`;
}

/** Shorthand lane spec builder shared by the SDK and authoring programs. */
export function laneSpec(
  type: TrackType,
  id: string,
  clips: ClipSpec[],
  options: Omit<LaneSpec, 'type' | 'id' | 'clips'> = {},
): LaneSpec {
  return { type, id, clips, ...options };
}

/** Shorthand caption spec builder shared by the SDK and authoring programs. */
export function captionSpec(
  text: string,
  start: TimeInput,
  options: Omit<CaptionSpec, 'text' | 'start'> = {},
): CaptionSpec {
  return { text, start, ...options };
}

/** Index existing project objects for clip kind resolution. */
export function createSceneIndex(project: Project): SceneIndex {
  return {
    scenes: new Map(project.scenes.map((item) => [item.id, item])),
    assets: new Map(project.assets.map((item) => [item.id, item])),
    generations: new Map(project.generations.map((item) => [item.id, item])),
  };
}

export { easingFunction, rat };
export type { Rate, Rational, EasingName };

// ---- public shorthands (SDK parity) --------------------------------------

export function clip(ref: string, options: ClipSpec = {}): ClipSpec {
  return { ref, ...options };
}

export function caption(text: string, start: TimeInput, options: Omit<CaptionSpec, 'text' | 'start'> = {}): CaptionSpec {
  return captionSpec(text, start, options);
}

export function transition(from: string, to: string, options: Omit<TransitionSpec, 'from' | 'to'> = {}): TransitionSpec {
  return { from, to, ...options };
}

export function lane(type: TrackType, id: string, clips: ClipSpec[], options: Omit<LaneSpec, 'type' | 'id' | 'clips'> = {}): LaneSpec {
  return laneSpec(type, id, clips, options);
}

export function durationFrames(frames: number, fps: Rate = rat(30)): Rational {
  return { num: frames * fps.den, den: fps.num };
}
