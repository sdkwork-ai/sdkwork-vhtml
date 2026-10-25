/**
 * Shared timeline evaluator.
 *
 * This module is deliberately browser-safe: the Node exporter uses it for
 * audio/caption planning and the Chromium stage runtime bundles it to drive
 * every frame. The same rational model therefore produces the same visual and
 * audio state in both environments.
 */

import {
  allClips,
  clipEnd,
  findTimeline,
  resolveReference,
  type Animation,
  type CaptionClip,
  type Clip,
  type Effect,
  type Project,
  type Timeline,
  type TimelineClip,
  type Track,
  type Transition,
} from '@sdkwork/vhtml-core/model';
import {
  ZERO,
  add,
  gt,
  gte,
  lt,
  mul,
  sub,
  toNumber,
  type Rational,
} from '@sdkwork/vhtml-core/time';
import {
  easingFunction,
  parseNumericValue,
  sampleAnimation,
  sampleTimeRemap,
  timeRemapSegments,
} from '@sdkwork/vhtml-core/animation';
import type { Rate } from '@sdkwork/vhtml-core/time';

export interface ElementAnimationState {
  selector: string;
  properties: Record<string, string>;
}

export interface EffectOverlay {
  background: string;
  opacity: number;
  blendMode: string;
}

export interface ChromaKeyState {
  color: string;
  tolerance: number;
  spill: number;
}

export interface ClipStyleState {
  opacity: number;
  transform: string;
  filter: string;
  clipPath?: string;
  borderRadius?: string;
  mixBlendMode: string;
  zIndex: number;
  overlays: EffectOverlay[];
  chromaKey?: ChromaKeyState;
  backgroundColor?: string;
  css?: Record<string, string>;
}

export interface AudioFrameState {
  clipId: string;
  active: boolean;
  gain: number;
  pan: number;
  sourceTime: number;
  rate: number;
  reverse: boolean;
  muted: boolean;
}

export interface CaptionFrameState {
  clipId: string;
  active: boolean;
  text: string;
  speaker?: string;
  style: Record<string, string>;
  color: string;
  backgroundColor?: string;
  opacity: number;
  transform: string;
  textAlign: string;
}

export interface ClipFrameState {
  clipId: string;
  kind: Clip['kind'];
  trackId: string;
  active: boolean;
  localTime: number;
  sceneTime: number;
  sourceTime?: number;
  mediaTime?: number;
  playbackRate: number;
  reverse: boolean;
  freeze: boolean;
  loop: boolean;
  style: ClipStyleState;
  elementStyles: ElementAnimationState[];
  caption?: CaptionFrameState;
  audio?: AudioFrameState;
  issues: string[];
}

export interface TransitionOverlayState {
  id: string;
  color: string;
  opacity: number;
}

export interface FrameState {
  time: number;
  timeRational: Rational;
  frameIndex: number;
  frameRate: Rate;
  duration: number;
  width: number;
  height: number;
  background: string;
  clips: ClipFrameState[];
  globalStyles: ElementAnimationState[];
  transitionOverlays: TransitionOverlayState[];
  issues: string[];
}

export interface EvaluateOptions {
  timelineId?: string;
  mode?: 'deterministic' | 'preview';
  frameIndex?: number;
  /** Internal recursion guard for nested timeline clips. */
  depth?: number;
}

const MAX_NESTING_DEPTH = 8;

interface LayerAccumulator {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  opacity: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  invert: number;
  hueRotate: number;
  dropShadow: string[];
  extraTransform: string[];
  filterRaw: string[];
  clipPath?: string;
  borderRadius?: string;
  css: Record<string, string>;
}

const DEFAULT_STYLE: ClipStyleState = {
  opacity: 1,
  transform: 'none',
  filter: 'none',
  mixBlendMode: 'normal',
  zIndex: 0,
  overlays: [],
};

function num(value: Rational | number): number {
  return typeof value === 'number' ? value : toNumber(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function humanSeconds(value: Rational): string {
  return `${(toNumber(value) * 1000).toFixed(1)}ms`;
}

function isRecord(value: unknown): value is Record<string, string | number | boolean> {
  return typeof value === 'object' && value !== null;
}

function effectNumber(effect: Effect, names: string[], fallback: number): number {
  for (const name of names) {
    const value = effect.params[name];
    if (value === undefined) continue;
    if (typeof value === 'number') return value;
    const parsed = parseNumericValue(String(value));
    if (parsed) return parsed.number;
  }
  return fallback;
}

function effectString(effect: Effect, names: string[], fallback: string): string {
  for (const name of names) {
    const value = effect.params[name];
    if (value !== undefined && value !== '') return String(value);
  }
  return fallback;
}

function cssUnit(value: number, unit = 'px'): string {
  return `${Math.round(value * 1000) / 1000}${unit}`;
}

function canonicalProperty(property: string): string {
  const aliases: Record<string, string> = {
    translateX: 'x',
    translateY: 'y',
    translatex: 'x',
    translatey: 'y',
    rotate: 'rotate',
    scale: 'scale',
    opacity: 'opacity',
    blur: 'blur',
    brightness: 'brightness',
    contrast: 'contrast',
    saturate: 'saturate',
    grayscale: 'grayscale',
    sepia: 'sepia',
    invert: 'invert',
    'hue-rotate': 'hueRotate',
    hueRotate: 'hueRotate',
    volume: 'volume',
    pan: 'pan',
  };
  return aliases[property] ?? property;
}

function applyAnimatedProperty(
  layer: LayerAccumulator,
  property: string,
  value: string | number,
  compose: Animation['compose'] = 'replace',
): boolean {
  const key = canonicalProperty(property);
  const numeric = typeof value === 'number' ? value : parseNumericValue(String(value))?.number;
  const additive = compose === 'add' || compose === 'accumulate';
  switch (key) {
    case 'x':
      if (numeric !== undefined) layer.x = additive ? layer.x + numeric : numeric;
      return true;
    case 'y':
      if (numeric !== undefined) layer.y = additive ? layer.y + numeric : numeric;
      return true;
    case 'scale':
      if (numeric !== undefined) {
        layer.scaleX = additive ? layer.scaleX + numeric : numeric;
        layer.scaleY = additive ? layer.scaleY + numeric : numeric;
      }
      return true;
    case 'scaleX':
      if (numeric !== undefined) layer.scaleX = additive ? layer.scaleX + numeric : numeric;
      return true;
    case 'scaleY':
      if (numeric !== undefined) layer.scaleY = additive ? layer.scaleY + numeric : numeric;
      return true;
    case 'rotate':
      if (numeric !== undefined) layer.rotate = additive ? layer.rotate + numeric : numeric;
      return true;
    case 'opacity':
      if (numeric !== undefined) layer.opacity = clamp(additive ? layer.opacity + numeric : numeric, 0, 1);
      return true;
    case 'blur':
      if (numeric !== undefined) layer.blur = Math.max(0, additive ? layer.blur + numeric : numeric);
      return true;
    case 'brightness':
      if (numeric !== undefined) layer.brightness = Math.max(0, additive ? layer.brightness + numeric : numeric);
      return true;
    case 'contrast':
      if (numeric !== undefined) layer.contrast = Math.max(0, additive ? layer.contrast + numeric : numeric);
      return true;
    case 'saturate':
      if (numeric !== undefined) layer.saturate = Math.max(0, additive ? layer.saturate + numeric : numeric);
      return true;
    case 'grayscale':
      if (numeric !== undefined) layer.grayscale = clamp(additive ? layer.grayscale + numeric : numeric, 0, 100);
      return true;
    case 'sepia':
      if (numeric !== undefined) layer.sepia = clamp(additive ? layer.sepia + numeric : numeric, 0, 100);
      return true;
    case 'invert':
      if (numeric !== undefined) layer.invert = clamp(additive ? layer.invert + numeric : numeric, 0, 100);
      return true;
    case 'hueRotate':
      if (numeric !== undefined) layer.hueRotate = additive ? layer.hueRotate + numeric : numeric;
      return true;
    case 'transform':
      layer.extraTransform.push(String(value));
      return true;
    case 'filter':
      layer.filterRaw.push(String(value));
      return true;
    case 'clipPath':
    case 'clip-path':
      layer.clipPath = String(value);
      return true;
    case 'borderRadius':
    case 'border-radius':
      layer.borderRadius = String(value);
      return true;
    case 'dropShadow':
    case 'drop-shadow':
      layer.dropShadow.push(String(value));
      return true;
    default:
      layer.css[property] = String(value);
      return false;
  }
}

function buildLayerStyle(layer: LayerAccumulator, trackOpacity: number): ClipStyleState {
  const transforms = [
    `translate(${Math.round(layer.x * 1000) / 1000}px, ${Math.round(layer.y * 1000) / 1000}px)`,
    `rotate(${Math.round(layer.rotate * 1000) / 1000}deg)`,
    `scale(${Math.round(layer.scaleX * 1e6) / 1e6}, ${Math.round(layer.scaleY * 1e6) / 1e6})`,
    ...layer.extraTransform,
  ];
  const filters: string[] = [];
  if (layer.blur > 0) filters.push(`blur(${cssUnit(layer.blur)})`);
  if (layer.brightness !== 1) filters.push(`brightness(${layer.brightness})`);
  if (layer.contrast !== 1) filters.push(`contrast(${layer.contrast})`);
  if (layer.saturate !== 1) filters.push(`saturate(${layer.saturate})`);
  if (layer.grayscale !== 0) filters.push(`grayscale(${layer.grayscale}%)`);
  if (layer.sepia !== 0) filters.push(`sepia(${layer.sepia}%)`);
  if (layer.invert !== 0) filters.push(`invert(${layer.invert}%)`);
  if (layer.hueRotate !== 0) filters.push(`hue-rotate(${layer.hueRotate}deg)`);
  for (const shadow of layer.dropShadow) filters.push(`drop-shadow(${shadow})`);
  for (const raw of layer.filterRaw) filters.push(raw);
  return {
    ...DEFAULT_STYLE,
    opacity: clamp(layer.opacity * trackOpacity, 0, 1),
    transform: transforms.join(' '),
    filter: filters.length ? filters.join(' ') : 'none',
    clipPath: layer.clipPath,
    borderRadius: layer.borderRadius,
    overlays: [],
    css: Object.keys(layer.css).length ? { ...layer.css } : undefined,
  };
}

function sampleElementStyles(
  animations: Animation[],
  timeFor: (animation: Animation) => Rational,
): ElementAnimationState[] {
  const groups = new Map<string, Animation[]>();
  for (const animation of animations) {
    if (!animation.selector) continue;
    const group = groups.get(animation.selector) ?? [];
    group.push(animation);
    groups.set(animation.selector, group);
  }
  const result: ElementAnimationState[] = [];
  for (const [selector, group] of groups) {
    const layer: LayerAccumulator = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
      opacity: 1,
      blur: 0,
      brightness: 1,
      contrast: 1,
      saturate: 1,
      grayscale: 0,
      sepia: 0,
      invert: 0,
      hueRotate: 0,
      dropShadow: [],
      extraTransform: [],
      filterRaw: [],
      css: {},
    };
    let opacityTouched = false;
    let transformTouched = false;
    let filterTouched = false;
    let clipPathTouched = false;
    let borderRadiusTouched = false;
    for (const animation of group) {
      const sample = sampleAnimation(animation, timeFor(animation));
      if (!sample.active || sample.value === undefined) continue;
      const property = canonicalProperty(animation.property);
      const beforeTransform = layer.extraTransform.length;
      if (applyAnimatedProperty(layer, animation.property, sample.value, animation.compose)) {
        if (property === 'opacity') opacityTouched = true;
        else if (['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate'].includes(property)) transformTouched = true;
        else if (['blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'invert', 'hueRotate', 'dropShadow'].includes(property)) filterTouched = true;
        else if (property === 'transform') transformTouched = true;
        else if (property === 'filter') filterTouched = true;
        else if (property === 'clipPath') clipPathTouched = true;
        else if (property === 'borderRadius') borderRadiusTouched = true;
      }
      if (layer.extraTransform.length !== beforeTransform) transformTouched = true;
    }
    const properties: Record<string, string> = {};
    if (opacityTouched) properties.opacity = String(clamp(layer.opacity, 0, 1));
    if (transformTouched) {
      properties.transform = [
        `translate(${Math.round(layer.x * 1000) / 1000}px, ${Math.round(layer.y * 1000) / 1000}px)`,
        `rotate(${Math.round(layer.rotate * 1000) / 1000}deg)`,
        `scale(${Math.round(layer.scaleX * 1e6) / 1e6}, ${Math.round(layer.scaleY * 1e6) / 1e6})`,
        ...layer.extraTransform,
      ].join(' ');
    }
    if (filterTouched) {
      const filters: string[] = [];
      if (layer.blur > 0) filters.push(`blur(${cssUnit(layer.blur)})`);
      if (layer.brightness !== 1) filters.push(`brightness(${layer.brightness})`);
      if (layer.contrast !== 1) filters.push(`contrast(${layer.contrast})`);
      if (layer.saturate !== 1) filters.push(`saturate(${layer.saturate})`);
      if (layer.grayscale !== 0) filters.push(`grayscale(${layer.grayscale}%)`);
      if (layer.sepia !== 0) filters.push(`sepia(${layer.sepia}%)`);
      if (layer.invert !== 0) filters.push(`invert(${layer.invert}%)`);
      if (layer.hueRotate !== 0) filters.push(`hue-rotate(${layer.hueRotate}deg)`);
      for (const shadow of layer.dropShadow) filters.push(`drop-shadow(${shadow})`);
      for (const raw of layer.filterRaw) filters.push(raw);
      properties.filter = filters.length ? filters.join(' ') : 'none';
    }
    if (clipPathTouched && layer.clipPath) properties['clip-path'] = layer.clipPath;
    if (borderRadiusTouched && layer.borderRadius) properties['border-radius'] = layer.borderRadius;
    for (const [name, value] of Object.entries(layer.css)) properties[name] = value;
    if (Object.keys(properties).length) result.push({ selector, properties });
  }
  return result;
}

function collectEffects(clip: Clip, layer: LayerAccumulator): {
  overlays: EffectOverlay[];
  chromaKey?: ChromaKeyState;
  borderRadius?: string;
  clipPath?: string;
  issues: string[];
} {
  const overlays: EffectOverlay[] = [];
  let chromaKey: ChromaKeyState | undefined;
  let borderRadius = layer.borderRadius;
  let clipPath = layer.clipPath;
  const issues: string[] = [];

  for (const effect of clip.effects) {
    if (!effect.enabled) continue;
    switch (effect.type) {
      case 'blur':
        layer.blur += effectNumber(effect, ['amount', 'radius', 'px'], 4);
        break;
      case 'brightness':
        layer.brightness *= effectNumber(effect, ['amount', 'value'], 1) / (effect.params.percent ? 100 : 1);
        break;
      case 'contrast':
        layer.contrast *= effectNumber(effect, ['amount', 'value'], 1) / (effect.params.percent ? 100 : 1);
        break;
      case 'saturate':
        layer.saturate *= effectNumber(effect, ['amount', 'value'], 1) / (effect.params.percent ? 100 : 1);
        break;
      case 'grayscale':
        layer.grayscale = effectNumber(effect, ['amount', 'value'], 100);
        break;
      case 'sepia':
        layer.sepia = effectNumber(effect, ['amount', 'value'], 100);
        break;
      case 'invert':
        layer.invert = effectNumber(effect, ['amount', 'value'], 100);
        break;
      case 'hue-rotate':
        layer.hueRotate = effectNumber(effect, ['amount', 'angle', 'deg'], 180);
        break;
      case 'drop-shadow':
        layer.dropShadow.push(
          `${cssUnit(effectNumber(effect, ['x'], 0))} ${cssUnit(effectNumber(effect, ['y'], 8))} ${cssUnit(effectNumber(effect, ['blur'], 16))} ${effectString(effect, ['color'], 'rgba(0,0,0,0.55)')}`,
        );
        break;
      case 'glow':
        layer.dropShadow.push(
          `0 ${cssUnit(effectNumber(effect, ['blur'], 18))} ${cssUnit(effectNumber(effect, ['spread'], 24))} ${effectString(effect, ['color'], 'rgba(110,231,255,0.8)')}`,
        );
        break;
      case 'grain': {
        const opacity = effectNumber(effect, ['opacity', 'amount'], 0.12);
        const size = effectNumber(effect, ['size'], 3);
        overlays.push({
          background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size * 20}' height='${size * 20}'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
          opacity,
          blendMode: 'overlay',
        });
        break;
      }
      case 'vignette': {
        const amount = effectNumber(effect, ['amount'], 0.5);
        overlays.push({
          background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${clamp(amount, 0, 1)}) 100%)`,
          opacity: 1,
          blendMode: 'normal',
        });
        break;
      }
      case 'tint':
      case 'color-overlay': {
        overlays.push({
          background: effectString(effect, ['color'], '#6ee7ff'),
          opacity: effectNumber(effect, ['opacity', 'amount'], 0.35),
          blendMode: effectString(effect, ['blend', 'mode'], effect.type === 'tint' ? 'multiply' : 'normal'),
        });
        break;
      }
      case 'rounded': {
        borderRadius = effectString(effect, ['radius', 'value'], '24px');
        break;
      }
      case 'mask': {
        const shape = effectString(effect, ['shape'], 'inset');
        if (shape === 'circle') {
          clipPath = 'circle(50% at 50% 50%)';
        } else if (shape === 'ellipse') {
          clipPath = 'ellipse(50% 50% at 50% 50%)';
        } else if (shape === 'inset') {
          clipPath = `inset(${effectString(effect, ['inset', 'value'], '5%')})`;
        } else if (effectString(effect, ['points'], '')) {
          clipPath = `polygon(${effectString(effect, ['points'], '')})`;
        } else {
          clipPath = effectString(effect, ['clip-path', 'value'], 'inset(5%)');
        }
        break;
      }
      case 'filter':
        layer.filterRaw.push(effectString(effect, ['value', 'filter'], 'none'));
        break;
      case 'chroma-key':
        chromaKey = {
          color: effectString(effect, ['color', 'key'], '#00ff00'),
          tolerance: clamp(effectNumber(effect, ['tolerance'], 0.25), 0, 1),
          spill: clamp(effectNumber(effect, ['spill'], 0.15), 0, 1),
        };
        break;
      case 'css': {
        const css = effectString(effect, ['style', 'value'], '');
        if (css.includes('filter:')) {
          layer.filterRaw.push(css.slice(css.indexOf('filter:') + 7).split(';')[0]!.trim());
        }
        break;
      }
      default:
        issues.push(`unsupported visual effect "${effect.type}" on clip "${clip.id}"`);
    }
  }
  return { overlays, chromaKey, borderRadius, clipPath, issues };
}

function clipAnimationTime(animation: Animation, projectTime: Rational, localTime: Rational): Rational {
  return animation.timeBase === 'project' ? projectTime : localTime;
}

function sampleClipLayer(
  clip: Clip,
  animations: Animation[],
  projectTime: Rational,
  localTime: Rational,
  trackOpacity: number,
  issues: string[],
): ClipStyleState {
  const layer: LayerAccumulator = {
    x: clip.transform.x,
    y: clip.transform.y,
    scaleX: clip.transform.scaleX,
    scaleY: clip.transform.scaleY,
    rotate: clip.transform.rotate,
    opacity: clip.opacity,
    blur: 0,
    brightness: 1,
    contrast: 1,
    saturate: 1,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    hueRotate: 0,
    dropShadow: [],
    extraTransform: [],
    filterRaw: [],
    css: {},
  };
  const layerValues: Record<string, string | number> = {};
  const layerAnimations: Animation[] = [];
  for (const animation of animations) {
    if (!animation.selector) layerAnimations.push(animation);
  }
  void layerValues;
  // Evaluate in declaration order so compose semantics match sampleProperties.
  for (const animation of layerAnimations) {
    const sample = sampleAnimation(
      animation,
      clipAnimationTime(animation, projectTime, localTime),
    );
    if (!sample.active || sample.value === undefined) continue;
    if (animation.property === 'volume' || animation.property === 'pan') continue;
    applyAnimatedProperty(layer, animation.property, sample.value, animation.compose);
  }
  const effects = collectEffects(clip, layer);
  const style = buildLayerStyle(layer, trackOpacity);
  style.overlays = effects.overlays;
  style.chromaKey = effects.chromaKey;
  style.clipPath = effects.clipPath ?? style.clipPath;
  style.borderRadius = effects.borderRadius ?? style.borderRadius;
  if (clip.crop) {
    // Normative crop semantics: an inset region reveal — the content outside
    // the crop rectangle is hidden, the layer box itself never rescales (use
    // transform.scale to refill if desired). An explicit mask effect owns the
    // same clip-path channel and wins; the conflict is reported, never silent.
    const percent = (value: number): string => {
      const rounded = Math.round(value * 1_000_000) / 10_000;
      return String(rounded);
    };
    const cropPath = `inset(${percent(clip.crop.top)}% ${percent(clip.crop.right)}% ${percent(clip.crop.bottom)}% ${percent(clip.crop.left)}%)`;
    if (style.clipPath) {
      issues.push(`clip "${clip.id}" has both a crop and a mask clip-path; the mask wins`);
    } else {
      style.clipPath = cropPath;
    }
  }
  issues.push(...effects.issues);
  return style;
}

function animationVolume(
  animations: Animation[],
  projectTime: Rational,
  localTime: Rational,
  base: number,
): number {
  let volume = base;
  for (const animation of animations) {
    if (canonicalProperty(animation.property) !== 'volume') continue;
    const sample = sampleAnimation(animation, clipAnimationTime(animation, projectTime, localTime));
    if (!sample.active || sample.value === undefined) continue;
    const parsed = typeof sample.value === 'number' ? sample.value : parseNumericValue(String(sample.value))?.number;
    if (parsed === undefined) continue;
    volume = animation.compose === 'replace' ? parsed : volume * parsed;
  }
  return volume;
}

function animationPan(
  animations: Animation[],
  projectTime: Rational,
  localTime: Rational,
  base: number,
): number {
  let pan = base;
  for (const animation of animations) {
    if (canonicalProperty(animation.property) !== 'pan') continue;
    const sample = sampleAnimation(animation, clipAnimationTime(animation, projectTime, localTime));
    if (!sample.active || sample.value === undefined) continue;
    const parsed = typeof sample.value === 'number' ? sample.value : parseNumericValue(String(sample.value))?.number;
    if (parsed === undefined) continue;
    pan = animation.compose === 'replace' ? parsed : pan + parsed;
  }
  return clamp(pan, -1, 1);
}

function sourceTimeFor(clip: Clip, localTime: Rational): Rational | undefined {
  if (clip.freeze) return clip.freeze;
  if (clip.kind === 'image' || clip.kind === 'caption' || clip.kind === 'data') return undefined;
  if (clip.timeRemap?.keyframes.length) return add(clip.sourceIn, sampleTimeRemap(clip.timeRemap, localTime));
  const offset = clip.reverse ? sub(clip.duration, localTime) : localTime;
  return add(clip.sourceIn, mul(offset, clip.speed));
}

/** Instantaneous source-rate at clip-local time (derivative of the remap). */
function instantaneousRate(clip: Clip, localTime: Rational): number {
  if (!clip.timeRemap?.keyframes.length) return clip.reverse ? -num(clip.speed) : num(clip.speed);
  const segments = timeRemapSegments(clip.timeRemap);
  const t = num(localTime);
  for (const segment of segments) {
    if (t >= num(segment.from) && t < num(segment.to)) return segment.rate;
  }
  return segments.length ? segments[segments.length - 1]!.rate : num(clip.speed);
}

function sceneLocalTime(clip: Clip, localTime: Rational, sceneDuration?: Rational): Rational {
  let value: Rational;
  if (clip.timeRemap?.keyframes.length) {
    // Curves map local time straight onto source offsets (RFC-0008); the
    // same mapping governs scene/nested-timeline local time.
    value = add(clip.sourceIn, sampleTimeRemap(clip.timeRemap, localTime));
  } else {
    const offset = clip.reverse ? sub(clip.duration, localTime) : localTime;
    value = add(clip.sourceIn, mul(offset, clip.speed));
  }
  if (clip.kind === 'scene' && clip.loop && sceneDuration && gt(sceneDuration, ZERO)) {
    const durationNumber = toNumber(sceneDuration);
    const valueNumber = toNumber(value) % durationNumber;
    value = mul(sceneDuration, { num: Math.round((valueNumber / durationNumber) * 1_000_000), den: 1_000_000 });
  }
  return value;
}

function fadeGain(clip: Clip, localTime: Rational): number {
  let gain = 1;
  const local = num(localTime);
  if (clip.fadeIn) {
    const fade = num(clip.fadeIn);
    if (fade > 0 && local < fade) gain *= clamp(local / fade, 0, 1);
  }
  if (clip.fadeOut) {
    const fade = num(clip.fadeOut);
    const remaining = num(clip.duration) - local;
    if (fade > 0 && remaining < fade) gain *= clamp(remaining / fade, 0, 1);
  }
  return gain;
}

function transitionProgress(transition: Transition, time: Rational, from: Clip, to: Clip): number | undefined {
  const start = gt(from.start, to.start) ? from.start : to.start;
  const end = lt(clipEnd(from), clipEnd(to)) ? clipEnd(from) : clipEnd(to);
  if (lt(time, start) || gte(time, end)) return undefined;
  const window = sub(end, start);
  if (!gt(window, ZERO)) return undefined;
  const linear = clamp(num(sub(time, start)) / num(window), 0, 1);
  return easingFunction(transition.easing)(linear);
}

function transitionExtraTransform(
  transition: Transition,
  progress: number,
  incoming: boolean,
): string | undefined {
  if (transition.type !== 'slide') return undefined;
  const offset = incoming ? (1 - progress) * 100 : -progress * 100;
  switch (transition.direction) {
    case 'right':
      return `translateX(${incoming ? -offset : offset}%)`;
    case 'up':
      return `translateY(${incoming ? offset : -offset}%)`;
    case 'down':
      return `translateY(${incoming ? -offset : offset}%)`;
    default:
      return `translateX(${offset}%)`;
  }
}

function wipeClipPath(direction: Transition['direction'], progress: number): string {
  const remaining = (1 - progress) * 100;
  switch (direction) {
    case 'right':
      return `inset(0 0 0 ${remaining}%)`;
    case 'up':
      return `inset(${remaining}% 0 0 0)`;
    case 'down':
      return `inset(0 0 ${remaining}% 0)`;
    default:
      return `inset(0 ${remaining}% 0 0)`;
  }
}

function applyTransitionVisual(
  transition: Transition,
  progress: number,
  from: ClipFrameState,
  to: ClipFrameState,
): TransitionOverlayState | undefined {
  const ease = progress;
  switch (transition.type) {
    case 'crossfade': {
      from.style.opacity *= 1 - ease;
      to.style.opacity *= ease;
      return undefined;
    }
    case 'fade':
    case 'dip': {
      from.style.opacity *= 1 - ease;
      to.style.opacity *= ease;
      return {
        id: transition.id,
        color: transition.type === 'dip' ? transition.color : '#000000',
        opacity: Math.sin(Math.PI * ease) * 0.92,
      };
    }
    case 'wipe': {
      to.style.clipPath = wipeClipPath(transition.direction, ease);
      return undefined;
    }
    case 'slide': {
      const fromTransform = transitionExtraTransform(transition, ease, false);
      const toTransform = transitionExtraTransform(transition, ease, true);
      if (fromTransform) from.style.transform += ` ${fromTransform}`;
      if (toTransform) to.style.transform += ` ${toTransform}`;
      return undefined;
    }
    case 'zoom': {
      to.style.transform += ` scale(${0.82 + 0.18 * ease})`;
      to.style.opacity *= ease;
      from.style.transform += ` scale(${1 + 0.12 * ease})`;
      from.style.opacity *= 1 - ease;
      return undefined;
    }
    case 'blur': {
      const blur = Math.sin(Math.PI * ease) * 20;
      from.style.opacity *= 1 - ease;
      to.style.opacity *= ease;
      if (blur > 0.01) {
        from.style.filter = from.style.filter === 'none' ? `blur(${blur.toFixed(2)}px)` : `${from.style.filter} blur(${blur.toFixed(2)}px)`;
        to.style.filter = to.style.filter === 'none' ? `blur(${blur.toFixed(2)}px)` : `${to.style.filter} blur(${blur.toFixed(2)}px)`;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

export function evaluateFrame(
  project: Project,
  time: Rational,
  options: EvaluateOptions = {},
): FrameState {
  const timeline = findTimeline(project, options.timelineId ?? project.mainTimeline) ?? project.timelines[0];
  const frameRate = project.composition.frameRate;
  const issues: string[] = [];
  if (!timeline) {
    return {
      time: num(time),
      timeRational: time,
      frameIndex: options.frameIndex ?? 0,
      frameRate,
      duration: num(project.composition.duration),
      width: project.composition.width,
      height: project.composition.height,
      background: project.composition.background,
      clips: [],
      globalStyles: [],
      transitionOverlays: [],
      issues: ['project has no timeline'],
    };
  }

  const clips: ClipFrameState[] = [];
  const states = new Map<string, ClipFrameState>();
  const audioStates: ClipFrameState[] = [];
  const transitionOverlays: TransitionOverlayState[] = [];
  const trackOpacity = new Map<string, number>();
  for (const track of timeline.tracks) trackOpacity.set(track.id, track.opacity);

  const sortedTracks = [...timeline.tracks].sort((a, b) => a.order - b.order);
  const audioSolo = timeline.tracks.some((track) => track.type === 'audio' && track.solo);
  let visualOrder = 0;
  for (const track of sortedTracks) {
    if (!track.enabled) continue;
    const isAudio = track.type === 'audio';
    const isCaption = track.type === 'caption';
    const isVisual = track.type === 'video' || track.type === 'overlay' || isCaption;
    const baseOrder = visualOrder * 1000;
    if (isVisual) visualOrder += 1;
    for (const clip of track.clips) {
      const active = gte(time, clip.start) && lt(time, clipEnd(clip)) && clip.enabled;
      if (!active) continue;
      const localTime = sub(time, clip.start);

      // Nested timeline (compound clip): evaluate the sub-timeline at the
      // mapped local time and flatten its clip states into this frame.
      if (clip.kind === 'timeline') {
        const depth = options.depth ?? 0;
        if (depth >= MAX_NESTING_DEPTH) {
          issues.push(`timeline clip "${clip.id}" exceeds the maximum nesting depth of ${MAX_NESTING_DEPTH}`);
          continue;
        }
        const resolved = clip.ref ? resolveReference(project, clip.ref) : undefined;
        if (!resolved || resolved.kind !== 'timeline') {
          issues.push(`timeline clip "${clip.id}" references missing timeline "${clip.ref}"`);
          continue;
        }
        const mapped = sceneLocalTime(clip, localTime, resolved.timeline.duration);
        const subFrame = evaluateFrame(project, mapped, {
          timelineId: resolved.timeline.id,
          mode: options.mode,
          frameIndex: options.frameIndex,
          depth: depth + 1,
        });
        const wrapperAudioOffset = clip.audioOffset ? num(clip.audioOffset) : 0;
        for (const subState of subFrame.clips) {
          const isSubCaption = subState.style.zIndex >= 900_000;
          const subZ = subState.style.zIndex >= 900_000
            ? 900_000 + (subState.style.zIndex % 1_000)
            : subState.style.zIndex % 1_000;
          subState.style.zIndex = isSubCaption ? subZ : baseOrder + clip.z + subZ;
          if (subState.audio) {
            subState.audio.gain *= track.volume * clip.volume * fadeGain(clip, localTime);
            subState.audio.pan = clamp(subState.audio.pan + track.pan + clip.pan, -1, 1);
            subState.audio.muted = subState.audio.muted || track.muted;
            // The compound clip's audio-offset shifts all inner audio
            // relative to its own visual mapping (RFC-0011 semantics).
            subState.audio.sourceTime += wrapperAudioOffset;
          }
          clips.push(subState);
          if (subState.audio) audioStates.push(subState);
          states.set(subState.clipId, subState);
        }
        transitionOverlays.push(...subFrame.transitionOverlays);
        issues.push(...subFrame.issues);
        continue;
      }

      const source = sourceTimeFor(clip, localTime);
      const sceneDuration = clip.kind === 'scene' && clip.ref
        ? project.scenes.find((scene) => scene.id === clip.ref?.replace(/^scene:/, ''))?.duration
        : undefined;
      const sceneTime = sceneLocalTime(clip, localTime, sceneDuration);
      const style = sampleClipLayer(
        clip,
        [...clip.animations, ...project.animations.filter((animation) => animation.clipId === clip.id)],
        time,
        localTime,
        track.opacity,
        issues,
      );
      style.zIndex = isCaption ? 900_000 + clip.z : baseOrder + clip.z;
      const state: ClipFrameState = {
        clipId: clip.id,
        kind: clip.kind,
        trackId: track.id,
        active,
        localTime: num(localTime),
        sceneTime: num(sceneTime),
        sourceTime: source ? num(source) : undefined,
        mediaTime: source ? num(source) : undefined,
        playbackRate: instantaneousRate(clip, localTime),
        reverse: clip.reverse,
        freeze: Boolean(clip.freeze),
        loop: clip.kind === 'scene' ? Boolean(clip.loop) : false,
        style,
        elementStyles: [],
        issues: [],
      };
      const clipAnimations = [
        ...clip.animations,
        ...project.animations.filter((animation) => animation.clipId === clip.id),
      ];
      state.elementStyles = sampleElementStyles(clipAnimations, (animation) =>
        animation.timeBase === 'project' ? time : sceneTime,
      );
      if (isCaption && clip.kind === 'caption') {
        const caption = clip as CaptionClip;
        state.caption = {
          clipId: clip.id,
          active,
          text: caption.text,
          speaker: caption.speaker,
          style: caption.style ?? {},
          color: caption.style?.color ?? '#ffffff',
          backgroundColor: caption.style?.['background-color'],
          opacity: style.opacity,
          transform: style.transform,
          textAlign: caption.style?.['text-align'] ?? 'center',
        };
      }
      if (isAudio) {
        const gainBase = animationVolume(clip.animations, time, localTime, clip.volume);
        const panBase = animationPan(clip.animations, time, localTime, clip.pan);
        const audioOffsetSeconds = clip.audioOffset ? num(clip.audioOffset) : 0;
        state.audio = {
          clipId: clip.id,
          active,
          gain: clamp(gainBase, 0, 8) * fadeGain(clip, localTime) * track.volume,
          pan: clamp(panBase + track.pan, -1, 1),
          // Audio hears source(t) + audioOffset; the video path keeps the
          // unshifted source time. Previews clamp negative lead to 0.
          sourceTime: (source ? num(source) : 0) + audioOffsetSeconds,
          rate: num(clip.speed),
          reverse: clip.reverse,
          muted: Boolean((clip as { muted?: boolean }).muted) || track.muted || (audioSolo && !track.solo),
        };
        audioStates.push(state);
      }
      clips.push(state);
      states.set(clip.id, state);
    }
  }

  for (const track of timeline.tracks) {
    for (const transition of track.transitions) {
      const from = states.get(transition.fromClipId);
      const to = states.get(transition.toClipId);
      if (!from || !to) continue;
      const fromClip = track.clips.find((clip) => clip.id === transition.fromClipId);
      const toClip = track.clips.find((clip) => clip.id === transition.toClipId);
      if (!fromClip || !toClip) continue;
      const progress = transitionProgress(transition, time, fromClip, toClip);
      if (progress === undefined) continue;
      if (track.type === 'audio') {
        const outgoing = Math.cos((progress * Math.PI) / 2);
        const incoming = Math.sin((progress * Math.PI) / 2);
        if (from.audio) from.audio.gain *= outgoing;
        if (to.audio) to.audio.gain *= incoming;
        continue;
      }
      const overlay = applyTransitionVisual(transition, progress, from, to);
      if (overlay) transitionOverlays.push(overlay);
    }
  }

  const globalStyles = sampleElementStyles(
    project.animations.filter((animation) => !animation.clipId && animation.selector),
    () => time,
  );

  // Keep audio states out of visual ordering but available in `clips` for the runtime.
  void audioStates;
  return {
    time: num(time),
    timeRational: time,
    frameIndex: options.frameIndex ?? Math.floor(num(time) * num(frameRate)),
    frameRate,
    duration: num(timeline.duration),
    width: project.composition.width,
    height: project.composition.height,
    background: project.composition.background,
    clips,
    globalStyles,
    transitionOverlays,
    issues,
  };
}

/** Return active caption cues for sidecar subtitle export. */
export function collectCaptions(project: Project, timelineId?: string): CaptionClip[] {
  const timeline = findTimeline(project, timelineId ?? project.mainTimeline);
  if (!timeline) return [];
  return allClips(project)
    .filter((located) => located.timeline.id === timeline.id && located.clip.kind === 'caption')
    .map((located) => located.clip as CaptionClip)
    .sort((a, b) => num(a.start) - num(b.start));
}

export function trackHasAudio(track: Track): boolean {
  return track.type === 'audio';
}

/** Human-readable time helper for diagnostics. */
export function frameTimeLabel(frame: number, rate: Rate): string {
  return `frame ${frame} (${(frame / (rate.num / rate.den)).toFixed(3)}s)`;
}

export function secondsLabel(value: Rational): string {
  return humanSeconds(value);
}
