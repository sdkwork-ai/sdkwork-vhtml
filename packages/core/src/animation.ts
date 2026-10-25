/**
 * Deterministic keyframe evaluation shared by the Node timeline evaluator and
 * the browser stage runtime.
 */

import type { Animation, AnimationDirection, EasingName, Keyframe, TimeRemap } from './model.ts';
import { gte, gt, lt, rat, sub, toNumber, ZERO, type Rational } from './time.ts';

export interface SampledAnimation {
  active: boolean;
  value: string | number | undefined;
  progress: number;
}

interface CubicBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EASING_CURVES: Record<string, CubicBezier> = {
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
};

function bezierCoordinate(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function solveBezier(curve: CubicBezier, x: number): number {
  let t = x;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const currentX = bezierCoordinate(t, curve.x1, curve.x2) - x;
    if (Math.abs(currentX) < 1e-6) break;
    const derivative =
      3 * (1 - t) * (1 - t) * curve.x1 +
      6 * (1 - t) * t * (curve.x2 - curve.x1) +
      3 * t * t * (1 - curve.x2);
    if (Math.abs(derivative) < 1e-6) break;
    t -= currentX / derivative;
    t = Math.max(0, Math.min(1, t));
  }
  return bezierCoordinate(t, curve.y1, curve.y2);
}

export function easingFunction(easing: EasingName | undefined): (progress: number) => number {
  if (!easing || easing === 'linear') return (p) => p;
  const named = EASING_CURVES[easing];
  if (named) return (p) => solveBezier(named, p);
  const cubic = /^cubic-bezier\(\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*\)$/.exec(easing);
  if (cubic) {
    const curve = {
      x1: Number(cubic[1]),
      y1: Number(cubic[2]),
      x2: Number(cubic[3]),
      y2: Number(cubic[4]),
    };
    return (p) => solveBezier(curve, p);
  }
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*(start|end|jump-start|jump-end|jump-none|jump-both)\s*)?\)$/.exec(easing);
  if (steps) {
    const count = Math.max(1, Number(steps[1]));
    const position = steps[2] ?? 'end';
    return (p) => {
      if (position === 'start' || position === 'jump-start') return Math.min(1, Math.floor(p * count) / count + 1 / count);
      if (position === 'jump-both') return Math.min(1, (Math.floor(p * count) + 1) / (count + 1));
      if (position === 'jump-none') return Math.max(0, Math.min(1, Math.floor(p * count) / Math.max(1, count - 1)));
      return Math.min(1, Math.floor(p * count) / count);
    };
  }
  return (p) => p;
}

interface NumericValue {
  number: number;
  unit: string;
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  transparent: '#00000000',
};

export function parseNumericValue(value: string): NumericValue | undefined {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%|deg|rad|turn|s|ms|em|rem|vh|vw|fr)?$/.exec(value.trim());
  if (!match) return undefined;
  return { number: Number(match[1]), unit: match[2] ?? '' };
}

export function parseColor(value: string): RgbaColor | undefined {
  let text = value.trim().toLowerCase();
  text = NAMED_COLORS[text] ?? text;
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex.split('').map((char) => char + char).join('');
      return parseColor(`#${expanded}`);
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return undefined;
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (rgb) {
    const channel = (part: string): number =>
      part.endsWith('%') ? Math.round((Number(part.slice(0, -1)) / 100) * 255) : Number(part);
    const alpha = rgb[4]
      ? rgb[4].endsWith('%')
        ? Number(rgb[4].slice(0, -1)) / 100
        : Number(rgb[4])
      : 1;
    return { r: channel(rgb[1]!), g: channel(rgb[2]!), b: channel(rgb[3]!), a: alpha };
  }
  return undefined;
}

function rgbaToString(color: RgbaColor): string {
  const r = Math.round(color.r);
  const g = Math.round(color.g);
  const b = Math.round(color.b);
  const a = Math.round(color.a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function interpolateValue(from: string | number, to: string | number, progress: number): string | number {
  const fromText = String(from);
  const toText = String(to);
  const fromColor = parseColor(fromText);
  const toColor = parseColor(toText);
  if (fromColor && toColor) {
    return rgbaToString({
      r: fromColor.r + (toColor.r - fromColor.r) * progress,
      g: fromColor.g + (toColor.g - fromColor.g) * progress,
      b: fromColor.b + (toColor.b - fromColor.b) * progress,
      a: fromColor.a + (toColor.a - fromColor.a) * progress,
    });
  }
  const fromNumber = parseNumericValue(fromText);
  const toNumber = parseNumericValue(toText);
  if (fromNumber && toNumber) {
    const unit = fromNumber.unit || toNumber.unit;
    if (fromNumber.unit === toNumber.unit || fromNumber.unit === '' || toNumber.unit === '') {
      const value = fromNumber.number + (toNumber.number - fromNumber.number) * progress;
      const rounded = Math.round(value * 1e6) / 1e6;
      return `${rounded}${unit}`;
    }
  }
  if (fromText === toText) return from;
  return progress < 0.5 ? from : to;
}

function sampleKeyframes(keyframes: Keyframe[], time: number, defaultEasing: EasingName): string | number {
  if (!keyframes.length) return 0;
  if (time <= 0) return keyframes[0]!.value;
  for (let index = 1; index < keyframes.length; index += 1) {
    const next = keyframes[index]!;
    const nextTime = toNumber(next.time);
    if (time <= nextTime) {
      const previous = keyframes[index - 1]!;
      const previousTime = toNumber(previous.time);
      const span = nextTime - previousTime;
      const linear = span <= 0 ? 1 : (time - previousTime) / span;
      const eased = easingFunction(next.easing ?? defaultEasing)(Math.max(0, Math.min(1, linear)));
      return interpolateValue(previous.value, next.value, eased);
    }
  }
  return keyframes[keyframes.length - 1]!.value;
}

function directionProgress(
  direction: AnimationDirection,
  iteration: number,
  raw: number,
): number {
  const reversed = iteration % 2 === 1;
  switch (direction) {
    case 'reverse':
      return 1 - raw;
    case 'alternate':
      return reversed ? 1 - raw : raw;
    case 'alternate-reverse':
      return reversed ? raw : 1 - raw;
    default:
      return raw;
  }
}

export interface SampleAnimationOptions {
  /** Override the animation start/duration (used by split operations). */
  start?: Rational;
  duration?: Rational;
}

/**
 * Sample an animation at an absolute time expressed in its time base
 * (clip-local for timeBase="clip", project time for timeBase="project").
 */
export function sampleAnimation(
  animation: Animation,
  time: Rational,
  options: SampleAnimationOptions = {},
): SampledAnimation {
  if (!animation.enabled) return { active: false, value: undefined, progress: 0 };
  const start = options.start ?? animation.start;
  const duration = options.duration ?? animation.duration;
  const local = toNumber(time) - toNumber(start);
  const durationSeconds = toNumber(duration);
  if (durationSeconds <= 0) return { active: false, value: undefined, progress: 0 };
  const total =
    animation.iterations === 'infinite'
      ? Number.POSITIVE_INFINITY
      : durationSeconds * animation.iterations;

  if (local < 0) {
    if (animation.fill === 'backwards' || animation.fill === 'both') {
      const progress = directionProgress(animation.direction, 0, 0);
      return {
        active: true,
        value: sampleKeyframes(animation.keyframes, progress * durationSeconds, animation.easing),
        progress,
      };
    }
    return { active: false, value: undefined, progress: 0 };
  }
  if (local >= total) {
    if (animation.fill === 'forwards' || animation.fill === 'both') {
      const iteration = Math.max(0, Math.ceil(animation.iterations === 'infinite' ? 1 : animation.iterations) - 1);
      const progress = directionProgress(animation.direction, iteration, 1);
      return {
        active: true,
        value: sampleKeyframes(animation.keyframes, progress * durationSeconds, animation.easing),
        progress,
      };
    }
    return { active: false, value: undefined, progress: 1 };
  }
  const iteration = Math.floor(local / durationSeconds);
  const raw = (local % durationSeconds) / durationSeconds;
  const progress = directionProgress(animation.direction, iteration, raw);
  return {
    active: true,
    value: sampleKeyframes(animation.keyframes, progress * durationSeconds, animation.easing),
    progress,
  };
}

/** Interpolate the animation's value at a local time; used to split clips. */
export function animationValueAt(animation: Animation, localTime: Rational): string | number | undefined {
  const sampled = sampleAnimation(animation, localTime);
  return sampled.active ? sampled.value : undefined;
}

/** Sample a set of animations by property with compose semantics. */
export function sampleProperties(
  animations: Animation[],
  time: Rational,
  base: Record<string, string | number> = {},
): Record<string, string | number> {
  const result: Record<string, string | number> = { ...base };
  for (const animation of animations) {
    const sampled = sampleAnimation(animation, time);
    if (!sampled.active || sampled.value === undefined) continue;
    const property = animation.property;
    if (animation.compose === 'replace') {
      result[property] = sampled.value;
    } else if (animation.compose === 'add' || animation.compose === 'accumulate') {
      const previous = result[property];
      if (previous !== undefined) {
        const left = parseNumericValue(String(previous));
        const right = parseNumericValue(String(sampled.value));
        if (left && right) {
          const unit = left.unit || right.unit;
          result[property] = `${left.number + right.number}${unit}`;
          continue;
        }
        result[property] = interpolateValue(String(previous), String(sampled.value), 0.5);
        continue;
      }
      result[property] = sampled.value;
    }
  }
  return result;
}

/** True when animation time order is invalid (used by validator). */
export function keyframesSorted(keyframes: Keyframe[]): boolean {
  for (let index = 1; index < keyframes.length; index += 1) {
    if (gt(keyframes[index]!.time, keyframes[index - 1]!.time)) continue;
    if (lt(keyframes[index]!.time, keyframes[index - 1]!.time)) return false;
  }
  return true;
}

/**
 * Evaluate a clip time-remap curve at clip-local time and return the source
 * offset. The mapping is exact rational arithmetic except for the eased
 * interpolation factor, which is quantised to microseconds like every other
 * sampled value. Before the first and after the last keyframe the nearest
 * source position is held.
 */
export function sampleTimeRemap(remap: TimeRemap, localTime: Rational): Rational {
  const keyframes = remap.keyframes;
  if (!keyframes.length) return ZERO;
  const first = keyframes[0]!;
  if (lt(localTime, first.at)) return first.source;
  const last = keyframes[keyframes.length - 1]!;
  if (gte(localTime, last.at)) return last.source;
  for (let index = 1; index < keyframes.length; index += 1) {
    const to = keyframes[index]!;
    const from = keyframes[index - 1]!;
    if (gt(localTime, to.at)) continue;
    const segmentLength = toNumber(sub(to.at, from.at));
    if (segmentLength <= 0) return to.source;
    const u = toNumber(sub(localTime, from.at)) / segmentLength;
    const eased = easingFunction(to.easing ?? remap.easing)(u);
    const sourceLength = toNumber(sub(to.source, from.source));
    return rat(Math.round((toNumber(from.source) + sourceLength * eased) * 1_000_000), 1_000_000);
  }
  return last.source;
}

/** Average source-time slope of a remap segment, for audio resampling plans. */
export function timeRemapSegments(remap: TimeRemap): Array<{ from: Rational; to: Rational; rate: number }> {
  const keyframes = remap.keyframes;
  if (keyframes.length < 2) return [];
  const segments: Array<{ from: Rational; to: Rational; rate: number }> = [];
  for (let index = 1; index < keyframes.length; index += 1) {
    const from = keyframes[index - 1]!;
    const to = keyframes[index]!;
    const span = toNumber(sub(to.at, from.at));
    if (span <= 0) continue;
    segments.push({ from: from.at, to: to.at, rate: toNumber(sub(to.source, from.source)) / span });
  }
  return segments;
}
