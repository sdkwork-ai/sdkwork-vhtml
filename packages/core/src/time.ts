/**
 * Exact rational time arithmetic for VHTML.
 *
 * VHTML never stores timeline time as an accumulated floating point value.
 * Every time is a reduced rational number of seconds. Frame indices, audio
 * sample indices and timecodes are derived from these exact values.
 */

export interface Rational {
  readonly num: number;
  readonly den: number;
}

/** A frame rate is a rational number of frames per second, e.g. 30000/1001. */
export type Rate = Rational;

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function assertSafeInt(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`VHTML_TIME_OVERFLOW: ${what} is outside the safe integer range (${value})`);
  }
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

/** Create a normalised rational. The denominator is always positive. */
export function rat(num: number, den = 1): Rational {
  if (!Number.isFinite(num) || !Number.isFinite(den)) {
    throw new RangeError(`VHTML_TIME_INVALID: non-finite rational (${num}/${den})`);
  }
  if (den === 0) throw new RangeError('VHTML_TIME_INVALID: zero denominator');
  assertSafeInt(num, 'numerator');
  assertSafeInt(den, 'denominator');
  if (num === 0) return ZERO;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export const ZERO: Rational = Object.freeze({ num: 0, den: 1 });
export const ONE: Rational = Object.freeze({ num: 1, den: 1 });

export function isZero(a: Rational): boolean {
  return a.num === 0;
}

export function add(a: Rational, b: Rational): Rational {
  return rat(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return rat(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0) throw new RangeError('VHTML_TIME_INVALID: division by zero time value');
  return rat(a.num * b.den, a.den * b.num);
}

export function neg(a: Rational): Rational {
  return rat(-a.num, a.den);
}

export function abs(a: Rational): Rational {
  return a.num < 0 ? neg(a) : a;
}

export function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function eq(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

export function lt(a: Rational, b: Rational): boolean {
  return cmp(a, b) < 0;
}

export function lte(a: Rational, b: Rational): boolean {
  return cmp(a, b) <= 0;
}

export function gt(a: Rational, b: Rational): boolean {
  return cmp(a, b) > 0;
}

export function gte(a: Rational, b: Rational): boolean {
  return cmp(a, b) >= 0;
}

export function min(a: Rational, b: Rational): Rational {
  return lt(a, b) ? a : b;
}

export function max(a: Rational, b: Rational): Rational {
  return gt(a, b) ? a : b;
}

export function clamp(value: Rational, low: Rational, high: Rational): Rational {
  return max(low, min(value, high));
}

/** Convert a rational to a floating point number (lossy; presentation only). */
export function toNumber(a: Rational): number {
  return a.num / a.den;
}

/** Alias used by public APIs that speak seconds. */
export const toSeconds = toNumber;

/** Parse an exact decimal string such as "-12.375". */
export function fromDecimal(text: string): Rational {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new RangeError(`VHTML_TIME_INVALID: not a decimal number: "${text}"`);
  const sign = match[1] === '-' ? -1 : 1;
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? '';
  if (fraction.length > 12) {
    throw new RangeError(`VHTML_TIME_INVALID: too many decimal places: "${text}"`);
  }
  const scale = 10 ** fraction.length;
  const numerator = Number(whole) * scale + (fraction ? Number(fraction) : 0);
  return rat(sign * numerator, scale);
}

/** Create a time value from a possibly fractional number of seconds. */
export function seconds(value: number): Rational {
  if (!Number.isFinite(value)) throw new RangeError(`VHTML_TIME_INVALID: ${value}`);
  const text = value.toFixed(9).replace(/\.?0+$/, '');
  return fromDecimal(text || '0');
}

export function rate(num: number, den = 1): Rate {
  if (num <= 0) throw new RangeError('VHTML_TIME_INVALID: frame rate must be positive');
  return rat(num, den);
}

export interface TimeParseContext {
  /** Frame rate used to resolve the `f` (frames) unit. */
  frameRate?: Rate;
  /** Set of expression variables and their values (advanced authoring). */
  variables?: Record<string, Rational>;
}

const TIME_UNIT_FACTORS: Record<string, Rational> = {
  ns: rat(1, 1_000_000_000),
  us: rat(1, 1_000_000),
  µs: rat(1, 1_000_000),
  ms: rat(1, 1_000),
  s: ONE,
  sec: ONE,
  secs: ONE,
  m: rat(60),
  min: rat(60),
  mins: rat(60),
  h: rat(3600),
  hr: rat(3600),
  hrs: rat(3600),
};

/**
 * Parse VHTML's normative time syntax:
 *
 *   0 | 12 | 1.5s | 250ms | 10f | 00:00:01.500 | 30000/1001s | $variable
 *
 * A bare number is only accepted for zero. `f` requires a frame rate context.
 */
export function parseTime(text: string, ctx: TimeParseContext = {}): Rational {
  const source = String(text).trim();
  if (!source) throw new RangeError('VHTML_TIME_INVALID: empty time value');
  if (source === '0' || source === '+0' || source === '-0') return ZERO;

  if (source.startsWith('$')) {
    const name = source.slice(1);
    const value = ctx.variables?.[name];
    if (!value) throw new RangeError(`VHTML_TIME_INVALID: unknown time variable "${name}"`);
    return value;
  }

  const rationalUnit = /^([+-]?\d+)\/(\d+)\s*(s|ms|us|ns)?$/.exec(source);
  if (rationalUnit) {
    const base = rat(Number(rationalUnit[1]), Number(rationalUnit[2]));
    const unit = rationalUnit[3];
    return unit ? mul(base, TIME_UNIT_FACTORS[unit]!) : base;
  }

  const timecode = /^([+-]?)(\d+):([0-5]\d):([0-5]\d)(?:[.,](\d{1,9}))?$/.exec(source);
  if (timecode) {
    const negative = timecode[1] === '-';
    const hours = Number(timecode[2]);
    const minutes = Number(timecode[3]);
    const secs = Number(timecode[4]);
    const fraction = timecode[5] ?? '';
    const frac = fraction ? fromDecimal(`0.${fraction}`) : ZERO;
    const absolute = add(rat(hours * 3600 + minutes * 60 + secs), frac);
    return negative ? neg(absolute) : absolute;
  }

  // SMPTE-style frame timecode: HH:MM:SS:FF (non-drop) or HH:MM:SS;FF
  // (drop-frame notation). Both parse to the same rational instant; the
  // semicolon only documents that the numbering excludes skipped frames.
  // A frame rate context is required.
  const frameTimecode = /^([+-]?)(\d+):([0-5]\d):([0-5]\d)[:;]([0-5]?\d)$/.exec(source);
  if (frameTimecode) {
    if (!ctx.frameRate) {
      throw new RangeError('VHTML_TIME_INVALID: frame timecode used without a frame rate context');
    }
    const negative = frameTimecode[1] === '-';
    const hours = Number(frameTimecode[2]);
    const minutes = Number(frameTimecode[3]);
    const secs = Number(frameTimecode[4]);
    const frames = Number(frameTimecode[5]);
    const fpsNumber = ctx.frameRate.num / ctx.frameRate.den;
    if (frames >= Math.ceil(fpsNumber)) {
      throw new RangeError(
        `VHTML_TIME_INVALID: timecode frame field ${frames} is out of range for frame rate ${ctx.frameRate.num}/${ctx.frameRate.den}`,
      );
    }
    // t = seconds + frames/fps = (seconds * fps.num + frames * fps.den) / fps.num
    const absolute = div(
      rat((hours * 3600 + minutes * 60 + secs) * ctx.frameRate.num + frames * ctx.frameRate.den),
      rat(ctx.frameRate.num),
    );
    return negative ? neg(absolute) : absolute;
  }

  const frames = /^([+-]?\d+(?:\.\d+)?)\s*f(?:rames?)?$/.exec(source);
  if (frames) {
    if (!ctx.frameRate) {
      throw new RangeError('VHTML_TIME_INVALID: frame time used without a frame rate context');
    }
    return div(fromDecimal(frames[1]!), ctx.frameRate);
  }

  const units = /^([+-]?\d+(?:\.\d+)?)\s*(ns|us|µs|ms|s|secs?|mins?|m|hrs?|h)$/.exec(source);
  if (units) {
    return mul(fromDecimal(units[1]!), TIME_UNIT_FACTORS[units[2]!]!);
  }

  throw new RangeError(`VHTML_TIME_INVALID: unrecognised time value "${source}"`);
}

/** Non-throwing variant that returns a diagnostic-friendly result. */
export function tryParseTime(
  text: string,
  ctx: TimeParseContext = {},
): { ok: true; value: Rational } | { ok: false; message: string } {
  try {
    return { ok: true, value: parseTime(text, ctx) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/** Parse a frame rate: "30", "25/1", "30000/1001", "23.976". */
export function parseFrameRate(text: string | number | Rate): Rate {
  if (typeof text === 'object') return rate(text.num, text.den);
  if (typeof text === 'number') {
    if (!Number.isFinite(text) || text <= 0) {
      throw new RangeError(`VHTML_TIME_INVALID: invalid frame rate "${text}"`);
    }
    return fromDecimal(text.toFixed(9).replace(/\.?0+$/, ''));
  }
  const source = String(text).trim();
  const ratio = /^(\d+)\s*\/\s*(\d+)$/.exec(source);
  if (ratio) return rate(Number(ratio[1]), Number(ratio[2]));
  const decimal = fromDecimal(source);
  if (decimal.num <= 0) throw new RangeError(`VHTML_TIME_INVALID: invalid frame rate "${text}"`);
  return decimal;
}

/** Approximate decimal frame rate for labels and compatibility checks. */
export function rateToNumber(value: Rate): number {
  return value.num / value.den;
}

export function formatRate(value: Rate): string {
  return value.den === 1 ? `${value.num}` : `${value.num}/${value.den}`;
}

/** Exact frame budget for a project duration: ceil(duration * fps). */
export function frameCount(duration: Rational, fps: Rate): number {
  const product = mul(duration, fps);
  const count = Math.ceil(product.num / product.den);
  return Math.max(0, count);
}

/** Exact presentation time of a frame index: n / fps. */
export function frameTime(index: number, fps: Rate): Rational {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError(`VHTML_TIME_INVALID: frame index must be a non-negative integer (${index})`);
  }
  return rat(index * fps.den, fps.num);
}

/** Index of the frame whose half-open interval [n/fps, (n+1)/fps) contains time. */
export function frameIndexAt(time: Rational, fps: Rate): number {
  const scaled = mul(time, fps);
  return Math.floor(scaled.num / scaled.den);
}

/** Duration of one frame in seconds. */
export function frameDuration(fps: Rate): Rational {
  return rat(fps.den, fps.num);
}

/** Round a time to the nearest frame boundary (half up). */
export function snapToFrame(time: Rational, fps: Rate): Rational {
  const scaled = mul(time, fps);
  const rounded = Math.round(scaled.num / scaled.den);
  return frameTime(rounded, fps);
}

/** Number of audio samples for a duration at a sample rate. */
export function sampleCount(duration: Rational, sampleRate: number): number {
  const scaled = mul(duration, rat(sampleRate));
  return Math.max(0, Math.round(scaled.num / scaled.den));
}

export function sampleTime(index: number, sampleRate: number): Rational {
  return rat(index, sampleRate);
}

/** Convert a time to a (possibly fractional) sample index. */
export function sampleIndexAt(time: Rational, sampleRate: number): number {
  return toNumber(time) * sampleRate;
}

function finiteDecimal(value: Rational): string | null {
  if (value.num === 0) return '0';
  let den = value.den;
  let twos = 0;
  let fives = 0;
  while (den % 2 === 0) {
    den /= 2;
    twos += 1;
  }
  while (den % 5 === 0) {
    den /= 5;
    fives += 1;
  }
  if (den !== 1) return null;
  const digits = Math.max(twos, fives);
  if (digits > 9) return null;
  const scale = 10 ** digits;
  const scaled = value.num * (scale / value.den);
  if (!Number.isSafeInteger(scaled)) return null;
  const negative = scaled < 0;
  const absolute = Math.abs(scaled);
  let text: string;
  if (digits === 0) {
    text = String(absolute);
  } else {
    const padded = String(absolute).padStart(digits + 1, '0');
    const whole = padded.slice(0, -digits);
    let fraction = padded.slice(-digits).replace(/0+$/, '');
    text = fraction ? `${whole}.${fraction}` : whole;
  }
  return negative ? `-${text}` : text;
}

/**
 * Canonical textual time for .vhtml serialisation. Exact: if the rational
 * cannot be represented as a short decimal, it is emitted as `n/ds`.
 */
export function formatTime(value: Rational): string {
  const decimal = finiteDecimal(value);
  if (decimal !== null) return `${decimal}s`;
  return `${value.num}/${value.den}s`;
}

/** Human readable seconds, e.g. "1.5s" or "12s". */
export function formatSeconds(value: Rational, precision = 3): string {
  const rounded = Math.round(toNumber(value) * 10 ** precision) / 10 ** precision;
  return `${Number(rounded.toFixed(precision))}s`;
}

function timecodeParts(value: Rational): {
  negative: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
} {
  const negative = value.num < 0;
  const absolute = negative ? abs(value) : value;
  const totalMs = Math.floor(toNumber(absolute) * 1000 + 0.5);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    negative,
    seconds: totalSeconds % 60,
    minutes: Math.floor(totalSeconds / 60) % 60,
    hours: Math.floor(totalSeconds / 3600),
    ms,
  };
}

/** WebVTT / SRT timestamp: HH:MM:SS.mmm (rounded half up, non-drop-frame). */
export function formatTimecode(value: Rational, separator = '.'): string {
  const parts = timecodeParts(value);
  const sign = parts.negative ? '-' : '';
  return `${sign}${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}:${String(parts.seconds).padStart(2, '0')}${separator}${String(parts.ms).padStart(3, '0')}`;
}

/** Frame timecode with a frame field, e.g. 00:00:01:15 @ 30fps. */
export function formatFrameTimecode(value: Rational, fps: Rate, separator = ':'): string {
  if (fps.den !== 1) {
    return `${formatTimecode(value, '.')} f${frameIndexAt(value, fps)}`;
  }
  const totalFrames = frameIndexAt(value, fps);
  const framesPerSecond = fps.num;
  const totalSeconds = Math.floor(totalFrames / framesPerSecond);
  const frames = totalFrames % framesPerSecond;
  const parts = timecodeParts(rat(totalSeconds));
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}:${String(parts.seconds).padStart(2, '0')}${separator}${String(frames).padStart(2, '0')}`;
}

/** Intersect two half-open ranges. Returns null when they do not overlap. */
export function intersect(
  aStart: Rational,
  aEnd: Rational,
  bStart: Rational,
  bEnd: Rational,
): { start: Rational; end: Rational } | null {
  const start = max(aStart, bStart);
  const end = min(aEnd, bEnd);
  return lt(start, end) ? { start, end } : null;
}

/** True when t is inside the half-open interval [start, end). */
export function inRange(t: Rational, start: Rational, end: Rational): boolean {
  return gte(t, start) && lt(t, end);
}

/** Linear interpolation between exact rationals at rational progress 0..1. */
export function lerp(a: Rational, b: Rational, progress: Rational): Rational {
  return add(a, mul(sub(b, a), progress));
}

/** Parse a rational ratio such as "16:9". */
export function parseAspectRatio(text: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!match) throw new RangeError(`VHTML_VALUE_INVALID: invalid aspect ratio "${text}"`);
  const ratio = Number(match[1]) / Number(match[2]);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError(`VHTML_VALUE_INVALID: invalid aspect ratio "${text}"`);
  }
  return ratio;
}
