/**
 * Sample-accurate audio mixer.
 *
 * Audio is decoded to float PCM through FFmpeg, then mixed in Node so that
 * fades, volume automation, panning, transitions and range trimming share the
 * exact rational timeline used by the visual renderer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sampleAnimation, sampleTimeRemap } from '@sdkwork/vhtml-core/animation';
import {
  clipEnd,
  declaredBase,
  declaredParams,
  findAsset,
  findTimeline,
  resolveReference,
  AUDIO_EFFECT_TYPES,
  type Clip,
  type Project,
  type Timeline,
  type Track,
  type Transition,
} from '@sdkwork/vhtml-core/model';
import {
  ZERO,
  add,
  frameIndexAt,
  gt,
  gte,
  lt,
  mul,
  rat,
  sampleCount,
  sub,
  toNumber,
  type Rational,
} from '@sdkwork/vhtml-core/time';
import { MediaToolError, ffmpegPath, runTool } from '@sdkwork/vhtml-ffmpeg';

export interface AudioMixOptions {
  project: Project;
  root: string;
  timelineId?: string;
  rangeStart: Rational;
  rangeDuration: Rational;
  sampleRate: number;
  channels: number;
  masterGain?: number;
  normalize?: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface AudioMixResult {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  frames: number;
  durationSeconds: number;
  clipsMixed: number;
  issues: string[];
  peak: number;
}

export interface AudioMixFileResult extends AudioMixResult {
  path: string;
}

function resolveAssetFile(project: Project, root: string, clip: Clip): string | undefined {
  if (!clip.ref) return undefined;
  const id = clip.ref.replace(/^(asset|gen):/, '');
  const asset = findAsset(project, id) ?? project.assets.find((candidate) => candidate.id === clip.ref);
  if (!asset) return undefined;
  if (/^https?:/i.test(asset.src)) return undefined;
  const file = path.resolve(root, asset.src);
  const relation = path.relative(root, file);
  if (relation.startsWith('..') || path.isAbsolute(relation)) return undefined;
  return fs.existsSync(file) ? file : undefined;
}

function atempoChain(speed: number): string[] {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  while (remaining > 100) {
    filters.push('atempo=100');
    remaining /= 100;
  }
  if (Math.abs(remaining - 1) > 0.0001) {
    filters.push(`atempo=${remaining.toFixed(6)}`);
  }
  return filters;
}

function audioEffectFilters(clip: Clip): string[] {
  const filters: string[] = [];
  for (const effect of clip.audioEffects) {
    if (!effect.enabled) continue;
    const params = effect.params;
    const numberParam = (name: string, fallback: number): number => {
      const value = params[name];
      return typeof value === 'number' ? value : Number(value ?? fallback);
    };
    switch (effect.type) {
      case 'highpass':
        filters.push(`highpass=f=${numberParam('frequency', numberParam('f', 120))}`);
        break;
      case 'lowpass':
        filters.push(`lowpass=f=${numberParam('frequency', numberParam('f', 8000))}`);
        break;
      case 'compressor':
        filters.push(
          `acompressor=threshold=${numberParam('threshold', 0.125)}:ratio=${numberParam('ratio', 4)}:attack=${numberParam('attack', 20)}:release=${numberParam('release', 250)}`,
        );
        break;
      case 'echo':
        filters.push(
          `aecho=in_gain=${numberParam('inGain', 0.8)}:out_gain=${numberParam('outGain', 0.9)}:delays=${numberParam('delay', 120)}:decays=${numberParam('decay', 0.35)}`,
        );
        break;
      case 'pitch': {
        const semitones = numberParam('semitones', 0);
        if (semitones !== 0) {
          const ratio = 2 ** (semitones / 12);
          filters.push(`asetrate=${Math.round(48_000 * ratio)},aresample=48000`);
        }
        break;
      }
      case 'gain': {
        const gain = params['gain'];
        if (typeof gain === 'number') filters.push(`volume=${gain}`);
        break;
      }
      case 'normalize': {
        // Per-clip loudness normalisation (EBU R128, single pass). The target
        // integrates loudness is authored in LUFS; broadcast -16 is the default.
        const target = numberParam('lufs', numberParam('loudness', numberParam('I', -16)));
        const tp = numberParam('tp', numberParam('truePeak', -1.5));
        const lra = numberParam('lra', 11);
        filters.push(`loudnorm=I=${target}:TP=${tp}:LRA=${lra}`);
        break;
      }
      case 'denoise': {
        // FFT denoiser: `strength` is the noise reduction amount in dB and
        // `floor` the noise floor in dB (mirrors the afftdn parameter names).
        const strength = numberParam('strength', numberParam('nr', numberParam('reduction', 12)));
        const floor = numberParam('floor', numberParam('nf', -25));
        filters.push(`afftdn=nr=${strength}:nf=${floor}`);
        break;
      }
      default:
        break;
    }
  }
  return filters;
}

const decodedCache = new Map<string, Float32Array>();

/** Source-time span covered by a clip's remap curve (falls back to speed mapping). */
function remapSourceSpan(clip: Clip): { min: number; max: number } | undefined {
  if (!clip.timeRemap?.keyframes.length) return undefined;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const keyframe of clip.timeRemap.keyframes) {
    const value = toNumber(keyframe.source);
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * Decode the raw source window a remap curve touches (no atempo). Playback
 * speed comes from indexed reads with linear interpolation in the mix loop.
 */
async function decodeRemappedAudio(
  project: Project,
  root: string,
  clip: Clip,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<{ pcm: Float32Array; minSource: number } | undefined> {
  const span = remapSourceSpan(clip);
  if (!span) return undefined;
  const file = resolveAssetFile(project, root, clip);
  if (!file) return undefined;
  const stat = fs.statSync(file);
  const offset = clip.audioOffset ? toNumber(clip.audioOffset) : 0;
  const minSource = Math.max(0, span.min + Math.min(0, offset));
  const duration = Math.max(0, span.max - span.min + Math.abs(offset));
  if (duration <= 0) return undefined;
  const effects = audioEffectFilters(clip);
  const key = [
    file,
    stat.mtimeMs,
    stat.size,
    'remap',
    minSource.toFixed(9),
    duration.toFixed(9),
    sampleRate,
    effects.join('|'),
  ].join('::');
  const cached = decodedCache.get(key);
  if (cached) return { pcm: cached, minSource };
  const args = ['-nostdin', '-hide_banner', '-v', 'error'];
  if (minSource > 0) args.push('-ss', minSource.toFixed(9));
  args.push('-i', file, '-t', duration.toFixed(9), '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '2', '-ar', String(sampleRate));
  if (effects.length) args.push('-af', effects.join(','));
  args.push('-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1');
  const { stdout } = await runTool(ffmpegPath(), args, {
    timeoutMs: 180_000,
    signal,
    maxOutputBytes: 1024 * 1024 * 1024,
  });
  if (stdout.length < 4) return undefined;
  const floatCount = Math.floor(stdout.length / 4);
  const samples = new Float32Array(floatCount);
  for (let index = 0; index < floatCount; index += 1) {
    samples[index] = stdout.readFloatLE(index * 4);
  }
  decodedCache.set(key, samples);
  return { pcm: samples, minSource };
}

/** Map clip-local seconds through speed / reverse / remap / loop into source seconds. */
function clipSourceSeconds(clip: Clip, localSeconds: number, loopDuration?: Rational): number {
  if (clip.timeRemap?.keyframes.length) {
    const base = toNumber(clip.sourceIn);
    if (clip.kind === 'scene' && 'loop' in clip && clip.loop && loopDuration && toNumber(loopDuration) > 0) {
      const remapped = toNumber(sampleTimeRemap(clip.timeRemap, rat(Math.round(localSeconds * 1_000_000), 1_000_000)));
      return base + (remapped % toNumber(loopDuration));
    }
    return base + toNumber(sampleTimeRemap(clip.timeRemap, rat(Math.round(localSeconds * 1_000_000), 1_000_000)));
  }
  const offset = clip.reverse ? toNumber(clip.duration) - localSeconds : localSeconds;
  return toNumber(clip.sourceIn) + offset * toNumber(clip.speed);
}

/** Map clip-local seconds through the clip into the referenced timeline's time. */
function nestedTimelineSeconds(clip: Clip, localSeconds: number, subDuration?: Rational): number {
  const mapped = clipSourceSeconds(clip, localSeconds);
  if (clip.kind === 'timeline' && 'loop' in clip && clip.loop && subDuration && toNumber(subDuration) > 0) {
    const duration = toNumber(subDuration);
    return ((mapped % duration) + duration) % duration;
  }
  return mapped;
}

async function decodeClipAudio(
  project: Project,
  root: string,
  clip: Clip,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<Float32Array | undefined> {
  if (clip.kind !== 'audio' && clip.kind !== 'video') return undefined;
  if (clip.freeze) return undefined;
  const file = resolveAssetFile(project, root, clip);
  if (!file) return undefined;
  const stat = fs.statSync(file);
  const offset = clip.audioOffset ? toNumber(clip.audioOffset) : 0;
  // Extend the decoded window so offset-shifted reads stay inside the PCM.
  const sourceIn = Math.max(0, toNumber(clip.sourceIn) + Math.min(0, offset));
  const span = toNumber(clip.sourceOut ? sub(clip.sourceOut, clip.sourceIn) : mul(clip.duration, clip.speed)) + Math.abs(offset);
  if (span <= 0) return undefined;
  const speed = toNumber(clip.speed) || 1;
  const effects = audioEffectFilters(clip);
  const key = [
    file,
    stat.mtimeMs,
    stat.size,
    sourceIn.toFixed(9),
    span.toFixed(9),
    speed.toFixed(9),
    offset.toFixed(9),
    sampleRate,
    effects.join('|'),
  ].join('::');
  const cached = decodedCache.get(key);
  if (cached) return cached;

  const filters = [...atempoChain(speed), ...effects];
  const args = ['-nostdin', '-hide_banner', '-v', 'error'];
  if (sourceIn > 0) args.push('-ss', sourceIn.toFixed(9));
  if (span > 0) args.push('-t', span.toFixed(9));
  args.push('-i', file, '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '2', '-ar', String(sampleRate));
  if (filters.length) args.push('-af', filters.join(','));
  args.push('-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1');
  const { stdout } = await runTool(ffmpegPath(), args, {
    timeoutMs: 180_000,
    signal,
    maxOutputBytes: 1024 * 1024 * 1024,
  });
  if (stdout.length < 4) return undefined;
  const floatCount = Math.floor(stdout.length / 4);
  const samples = new Float32Array(floatCount);
  for (let index = 0; index < floatCount; index += 1) {
    samples[index] = stdout.readFloatLE(index * 4);
  }
  if (clip.reverse) {
    const frames = Math.floor(floatCount / 2);
    const reversed = new Float32Array(samples.length);
    for (let frame = 0; frame < frames; frame += 1) {
      const from = (frames - 1 - frame) * 2;
      reversed[frame * 2] = samples[from]!;
      reversed[frame * 2 + 1] = samples[from + 1]!;
    }
    decodedCache.set(key, reversed);
    return reversed;
  }
  decodedCache.set(key, samples);
  return samples;
}

/** Decoded-timeline seconds for a leaf read, honouring audioOffset. */
function leafReadSeconds(clip: Clip, leafLocal: number): number {
  const offset = clip.audioOffset ? toNumber(clip.audioOffset) : 0;
  if (clip.timeRemap?.keyframes.length) return leafLocal + offset;
  return leafLocal * (toNumber(clip.speed) || 1) + offset;
}

function animatedNumber(
  project: Project,
  clip: Clip,
  time: Rational,
  property: 'volume' | 'pan',
  base: number,
): number {
  let value = base;
  const animations = [
    ...clip.animations,
    ...project.animations.filter((animation) => animation.clipId === clip.id),
  ];
  for (const animation of animations) {
    if (animation.property !== property) continue;
    const sampleTime = animation.timeBase === 'project' ? time : sub(time, clip.start);
    const sampled = sampleAnimation(animation, sampleTime);
    if (!sampled.active || sampled.value === undefined) continue;
    const numeric =
      typeof sampled.value === 'number'
        ? sampled.value
        : Number.parseFloat(String(sampled.value));
    if (!Number.isFinite(numeric)) continue;
    value = animation.compose === 'replace' ? numeric : value + numeric;
  }
  return value;
}

function fadeGain(clip: Clip, localSeconds: number): number {
  let gain = 1;
  if (clip.fadeIn) {
    const fade = toNumber(clip.fadeIn);
    if (fade > 0 && localSeconds < fade) gain *= Math.max(0, Math.min(1, localSeconds / fade));
  }
  if (clip.fadeOut) {
    const fade = toNumber(clip.fadeOut);
    const remaining = toNumber(clip.duration) - localSeconds;
    if (fade > 0 && remaining < fade) gain *= Math.max(0, Math.min(1, remaining / fade));
  }
  return gain;
}

interface TransitionWindow {
  transition: Transition;
  start: number;
  end: number;
}

function transitionWindows(track: Track): TransitionWindow[] {
  const windows: TransitionWindow[] = [];
  for (const transition of track.transitions) {
    const from = track.clips.find((clip) => clip.id === transition.fromClipId);
    const to = track.clips.find((clip) => clip.id === transition.toClipId);
    if (!from || !to) continue;
    const start = Math.max(toNumber(from.start), toNumber(to.start));
    const end = Math.min(toNumber(clipEnd(from)), toNumber(clipEnd(to)));
    if (end > start) windows.push({ transition, start, end });
  }
  return windows;
}

function transitionGain(
  clip: Clip,
  seconds: number,
  windows: TransitionWindow[],
): number {
  let gain = 1;
  for (const window of windows) {
    if (seconds < window.start || seconds >= window.end) continue;
    const progress = (seconds - window.start) / (window.end - window.start);
    if (window.transition.fromClipId === clip.id) gain *= Math.cos((progress * Math.PI) / 2);
    else if (window.transition.toClipId === clip.id) gain *= Math.sin((progress * Math.PI) / 2);
  }
  return gain;
}

interface WrapperLevel {
  clip: Clip;
  track: Track;
  subDuration?: Rational;
}

/**
 * One audible leaf clip together with the nested-timeline wrappers above it.
 * Time flows top-down: project time -> wrapper local time -> ... -> leaf time.
 */
interface AudioUnit {
  clip: Clip;
  leafTrack: Track;
  chain: WrapperLevel[];
  windows: TransitionWindow[];
  ducking?: {
    sidechainTrack: string;
    threshold: number;
    reduction: number;
    attack: number;
    release: number;
    hold: number;
  };
}

const MAX_AUDIO_NESTING = 8;

function duckingParams(clip: Clip): AudioUnit['ducking'] {
  for (const effect of clip.audioEffects) {
    if (!effect.enabled || effect.type !== 'ducking') continue;
    const sidechainTrack = String(effect.params['sidechain-track'] ?? effect.params['sidechainTrack'] ?? '');
    if (!sidechainTrack) continue;
    const numberParam = (name: string, fallback: number): number => {
      const value = effect.params[name];
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      sidechainTrack,
      threshold: numberParam('threshold', -24),
      reduction: Math.min(1, Math.max(0, numberParam('reduction', 0.25))),
      attack: Math.max(0, numberParam('attack', 0.05)),
      release: Math.max(0, numberParam('release', 0.4)),
      hold: Math.max(0, numberParam('hold', 0.1)),
    };
  }
  return undefined;
}

/**
 * True when at least one audio track on the timeline is soloed. Non-soloed
 * audio tracks are then silent (NLE solo semantics; `muted` still wins).
 */
export function audioSoloActive(timeline: Timeline): boolean {
  return timeline.tracks.some((track) => track.type === 'audio' && track.solo);
}

/**
 * Desugar declared plugin audio effects onto their built-in base behaviour
 * (RFC-0015). The clip is never mutated; a shallow clone carries the resolved
 * chain when any effect type is a declaration rather than a built-in.
 */
function withDesugaredAudioEffects(clip: Clip, extensions: Project['extensions'] | undefined): Clip {
  if (!clip.audioEffects.some((effect) => !AUDIO_EFFECT_TYPES.has(effect.type))) return clip;
  return {
    ...clip,
    audioEffects: clip.audioEffects.map((declared: Clip['audioEffects'][number]): Clip['audioEffects'][number] => {
      if (AUDIO_EFFECT_TYPES.has(declared.type)) return declared;
      const base = declaredBase(extensions, 'audio-effect', declared.type);
      if (!base) return declared;
      return {
        ...declared,
        type: base as typeof declared.type,
        params: { ...(declaredParams(extensions, declared.type) ?? {}), ...declared.params },
      };
    }),
  };
}

function collectAudioUnits(
  project: Project,
  timeline: Timeline,
  chain: WrapperLevel[],
  out: AudioUnit[],
  depth: number,
): void {
  if (depth > MAX_AUDIO_NESTING) return;
  const soloActive = audioSoloActive(timeline);
  for (const track of timeline.tracks) {
    if (track.type === 'audio') {
      if (track.muted) continue;
      if (soloActive && !track.solo) continue;
      const windows = transitionWindows(track);
      for (const clip of track.clips) {
        if (!clip.enabled) continue;
        if (clip.kind !== 'audio' && clip.kind !== 'video') continue;
        if ((clip as { muted?: boolean }).muted) continue;
        if (clip.freeze) continue;
        const effectiveClip = withDesugaredAudioEffects(clip, project.extensions);
        out.push({ clip: effectiveClip, leafTrack: track, chain, windows, ducking: duckingParams(effectiveClip) });
      }
    } else {
      for (const clip of track.clips) {
        if (clip.kind !== 'timeline' || !clip.enabled) continue;
        const resolved = clip.ref ? resolveReference(project, clip.ref) : undefined;
        if (!resolved || resolved.kind !== 'timeline') continue;
        collectAudioUnits(
          project,
          resolved.timeline,
          [...chain, { clip, track, subDuration: resolved.timeline.duration }],
          out,
          depth + 1,
        );
      }
    }
  }
}

/** Whether a chain is time-identity (pure passthrough) so leaf time is linear. */
function isIdentityChain(chain: WrapperLevel[]): boolean {
  return chain.every(
    (level) =>
      toNumber(level.clip.speed) === 1 &&
      !level.clip.reverse &&
      !level.clip.timeRemap &&
      !('loop' in level.clip && level.clip.loop) &&
      !level.clip.audioOffset &&
      toNumber(level.clip.sourceIn) === 0,
  );
}

/** Walk project seconds down the wrapper chain; returns leaf-local seconds.
 *  Wrapper audio-offsets shift the audio heard inside each compound level. */
function leafLocalSeconds(unit: AudioUnit, projectSeconds: number): number {
  let time = projectSeconds;
  for (const level of unit.chain) {
    const clipStart = toNumber(level.clip.start);
    const local = time - clipStart;
    if (local < 0 || local >= toNumber(level.clip.duration)) return Number.NaN;
    const wrapperOffset = level.clip.audioOffset ? toNumber(level.clip.audioOffset) : 0;
    time = nestedTimelineSeconds(level.clip, local + wrapperOffset, level.subDuration);
  }
  return time - toNumber(unit.clip.start);
}

/** Static chain gain/pan factors plus per-level fades for one moment. */
function chainGainPan(unit: AudioUnit, projectSeconds: number): { gain: number; pan: number; active: boolean } {
  let gain = 1;
  let pan = 0;
  let time = projectSeconds;
  for (const level of unit.chain) {
    const clipStart = toNumber(level.clip.start);
    const local = time - clipStart;
    if (local < 0 || local >= toNumber(level.clip.duration)) return { gain, pan, active: false };
    gain *= level.track.volume * level.clip.volume * fadeGain(level.clip, local);
    pan += level.track.pan + level.clip.pan;
    const wrapperOffset = level.clip.audioOffset ? toNumber(level.clip.audioOffset) : 0;
    time = nestedTimelineSeconds(level.clip, local + wrapperOffset, level.subDuration);
  }
  return { gain, pan, active: true };
}

/** Project-time span that bounds when the unit can be audible. */
function unitProjectSpan(unit: AudioUnit): { start: number; end: number } {
  if (unit.chain.length) return { start: toNumber(unit.chain[0]!.clip.start), end: toNumber(clipEnd(unit.chain[0]!.clip)) };
  return { start: toNumber(unit.clip.start), end: toNumber(clipEnd(unit.clip)) };
}

/**
 * Smoothed ducking multiplier from a sidechain envelope. The envelope is a
 * one-pole follower over the sidechain level; `hold` keeps full attenuation
 * after the level drops below the threshold.
 */
class DuckingEnvelope {
  private readonly linearThreshold: number;
  private envelope = 0;
  private holdSamples = 0;

  constructor(
    private readonly params: NonNullable<AudioUnit['ducking']>,
    private readonly sampleRate: number,
  ) {
    this.linearThreshold = 10 ** (params.threshold / 20);
  }

  next(sidechainLevel: number): number {
    const attackCo = this.params.attack > 0 ? Math.exp(-1 / (this.params.attack * this.sampleRate)) : 0;
    const releaseCo = this.params.release > 0 ? Math.exp(-1 / (this.params.release * this.sampleRate)) : 0;
    const target = sidechainLevel > this.linearThreshold ? 1 : 0;
    if (target > this.envelope) this.envelope = attackCo * this.envelope + (1 - attackCo) * target;
    else this.envelope = releaseCo * this.envelope + (1 - releaseCo) * target;
    if (this.envelope > 0.5) this.holdSamples = Math.round(this.params.hold * this.sampleRate);
    else if (this.holdSamples > 0) this.holdSamples -= 1;
    return 1 - this.envelope * (1 - this.params.reduction);
  }
}

function duckGainFor(
  unit: AudioUnit,
  frame: number,
  channels: number,
  target: MixTarget,
  cache: Map<string, DuckingEnvelope>,
): number | undefined {
  const ducking = target.ignoreDucking ? undefined : unit.ducking;
  if (!ducking) return undefined;
  const sideBuffer = target.sidechainBuffers?.get(ducking.sidechainTrack);
  if (!sideBuffer) return undefined;
  const cacheKey = `${unit.clip.id}::${ducking.sidechainTrack}`;
  let envelope = cache.get(cacheKey);
  if (!envelope) {
    envelope = new DuckingEnvelope(ducking, target.sampleRate);
    cache.set(cacheKey, envelope);
  }
  const side = sideBuffer[frame * channels]! + (channels > 1 ? sideBuffer[frame * channels + 1]! : 0);
  return envelope.next(Math.abs(side) / (channels > 1 ? 2 : 1));
}

export async function mixSoundtrack(options: AudioMixOptions): Promise<AudioMixResult> {
  const timeline = findTimeline(options.project, options.timelineId ?? options.project.mainTimeline) ?? options.project.timelines[0];
  if (!timeline) throw new Error('VHTML: project has no timeline');
  const channels = options.channels >= 2 ? 2 : 1;
  const frames = sampleCount(options.rangeDuration, options.sampleRate);
  const mixed = new Float32Array(frames * channels);
  const rangeStart = toNumber(options.rangeStart);
  const rangeEnd = rangeStart + toNumber(options.rangeDuration);
  const issues: string[] = [];
  let clipsMixed = 0;

  const units: AudioUnit[] = [];
  collectAudioUnits(options.project, timeline, [], units, 0);

  // Ducking pass 1: mix every referenced sidechain track into its own buffer
  // so ducked units can read the smoothed level while they are mixed.
  const duckedUnits = units.filter((unit) => unit.ducking);
  const sidechainBuffers = new Map<string, Float32Array>();
  if (duckedUnits.length) {
    const needed = new Set(duckedUnits.map((unit) => unit.ducking!.sidechainTrack));
    for (const trackId of needed) {
      const sideUnits = units.filter((unit) => unit.leafTrack.id === trackId);
      const buffer = new Float32Array(frames * channels);
      if (sideUnits.length) {
        await mixUnitsInto(sideUnits, buffer, {
          project: options.project,
          root: options.root,
          rangeStart,
          rangeEnd,
          frames,
          channels,
          sampleRate: options.sampleRate,
          issues,
          signal: options.signal,
          ignoreDucking: true,
        });
      }
      sidechainBuffers.set(trackId, buffer);
    }
  }

  clipsMixed = await mixUnitsInto(units, mixed, {
    project: options.project,
    root: options.root,
    rangeStart,
    rangeEnd,
    frames,
    channels,
    sampleRate: options.sampleRate,
    issues,
    signal: options.signal,
    sidechainBuffers,
    onUnitDone: () => {
      clipsMixed += 1;
      options.onProgress?.(clipsMixed, units.length);
    },
  });

  const master = options.masterGain ?? 1;
  let peak = 0;
  for (let index = 0; index < mixed.length; index += 1) {
    mixed[index]! *= master;
    const value = Math.abs(mixed[index]!);
    if (value > peak) peak = value;
  }
  if (options.normalize && peak > 0.891) {
    const scale = 0.891 / peak;
    for (let index = 0; index < mixed.length; index += 1) mixed[index]! *= scale;
    peak = 0.891;
  }
  for (let index = 0; index < mixed.length; index += 1) {
    const value = mixed[index]!;
    if (value > 1) mixed[index] = 1;
    else if (value < -1) mixed[index] = -1;
  }
  return {
    samples: mixed,
    sampleRate: options.sampleRate,
    channels,
    frames,
    durationSeconds: frames / options.sampleRate,
    clipsMixed,
    issues,
    peak,
  };
}

interface MixTarget {
  project: Project;
  root: string;
  rangeStart: number;
  rangeEnd: number;
  frames: number;
  channels: number;
  sampleRate: number;
  issues: string[];
  signal?: AbortSignal;
  sidechainBuffers?: Map<string, Float32Array>;
  ignoreDucking?: boolean;
  onUnitDone?: () => void;
}

async function mixUnitsInto(units: AudioUnit[], mixed: Float32Array, target: MixTarget): Promise<number> {
  const { channels, frames, sampleRate, rangeStart, rangeEnd } = target;
  let mixedCount = 0;
  const envelopeCache = new Map<string, DuckingEnvelope>();
  for (const unit of units) {
    const span = unitProjectSpan(unit);
    const overlapStart = Math.max(rangeStart, span.start);
    const overlapEnd = Math.min(rangeEnd, span.end);
    if (overlapEnd <= overlapStart) continue;
    let pcm: Float32Array | undefined;
    let remapped: { pcm: Float32Array; minSource: number } | undefined;
    try {
      if (unit.clip.timeRemap?.keyframes.length) {
        remapped = await decodeRemappedAudio(target.project, target.root, unit.clip, sampleRate, target.signal);
        if (!remapped) {
          target.issues.push(`clip "${unit.clip.id}" has no decodable audio stream for its time remap`);
          continue;
        }
        pcm = remapped.pcm;
      } else {
        pcm = await decodeClipAudio(target.project, target.root, unit.clip, sampleRate, target.signal);
      }
    } catch (error) {
      const message =
        error instanceof MediaToolError
          ? `audio decode failed for clip "${unit.clip.id}": ${error.message.split('\n')[0]}`
          : `audio decode failed for clip "${unit.clip.id}": ${(error as Error).message}`;
      target.issues.push(message);
      continue;
    }
    if (!pcm) {
      target.issues.push(`clip "${unit.clip.id}" has no decodable audio stream`);
      continue;
    }
    const decodedFrames = Math.floor(pcm.length / 2);
    const startFrame = Math.max(0, Math.round((overlapStart - rangeStart) * sampleRate));
    const endFrame = Math.min(frames, Math.round((overlapEnd - rangeStart) * sampleRate));
    const identity = isIdentityChain(unit.chain) && !unit.clip.timeRemap && !unit.clip.reverse;
    const leafDuration = toNumber(unit.clip.duration);
    const firstLeafLocal = leafLocalSeconds(unit, overlapStart);
    if (!Number.isFinite(firstLeafLocal)) continue;
    const localOffsetSeconds = Math.max(0, firstLeafLocal);
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const projectSeconds = rangeStart + frame / sampleRate;
      const chainState = chainGainPan(unit, projectSeconds);
      if (!chainState.active) continue;
      const leafLocal = identity
        ? localOffsetSeconds + (frame - startFrame) / sampleRate
        : leafLocalSeconds(unit, projectSeconds);
      if (!Number.isFinite(leafLocal) || leafLocal < 0 || leafLocal >= leafDuration) continue;

      const blockIndex = Math.floor((frame - startFrame) / 128);
      const blockFrame = startFrame + blockIndex * 128;
      const blockLocal = identity
        ? localOffsetSeconds + (blockFrame - startFrame) / sampleRate
        : leafLocalSeconds(unit, rangeStart + blockFrame / sampleRate);
      const blockTime = rat(Math.round((rangeStart + blockFrame / sampleRate) * 1_000_000), 1_000_000);

      let gain =
        animatedNumber(target.project, unit.clip, blockTime, 'volume', unit.clip.volume) *
        chainState.gain *
        fadeGain(unit.clip, Number.isFinite(blockLocal) ? blockLocal : leafLocal);
      if (unit.chain.length === 0) {
        gain *= transitionGain(unit.clip, projectSeconds, unit.windows);
      }
      if (!Number.isFinite(gain)) gain = 0;
      let pan = animatedNumber(target.project, unit.clip, blockTime, 'pan', unit.clip.pan) + chainState.pan + unit.leafTrack.pan;
      pan = Math.max(-1, Math.min(1, pan));
      const duck = duckGainFor(unit, frame, channels, target, envelopeCache);
      if (duck !== undefined) gain *= duck;

      const leftPan = pan <= 0 ? 1 : 1 - pan;
      const rightPan = pan >= 0 ? 1 : 1 + pan;
      let left: number;
      let right: number;
      if (remapped) {
        const sourceSeconds = clipSourceSeconds(unit.clip, leafLocal) + (unit.clip.audioOffset ? toNumber(unit.clip.audioOffset) : 0);
        const sourceFrameFloat = (sourceSeconds - remapped.minSource) * sampleRate;
        const sourceFrame = Math.floor(sourceFrameFloat);
        if (sourceFrame < 0) continue;
        if (sourceFrame + 1 >= decodedFrames) break;
        const frac = sourceFrameFloat - sourceFrame;
        left = (pcm[sourceFrame * 2]! * (1 - frac) + pcm[(sourceFrame + 1) * 2]! * frac) * gain * leftPan;
        right = (pcm[sourceFrame * 2 + 1]! * (1 - frac) + pcm[(sourceFrame + 1) * 2 + 1]! * frac) * gain * rightPan;
      } else {
        const clipFrameFloat = leafReadSeconds(unit.clip, leafLocal) * sampleRate;
        if (clipFrameFloat < 0) continue;
        const clipFrame = Math.floor(clipFrameFloat);
        if (clipFrame + 1 >= decodedFrames) break;
        const frac = clipFrameFloat - clipFrame;
        left = (pcm[clipFrame * 2]! * (1 - frac) + pcm[(clipFrame + 1) * 2]! * frac) * gain * leftPan;
        right = (pcm[clipFrame * 2 + 1]! * (1 - frac) + pcm[(clipFrame + 1) * 2 + 1]! * frac) * gain * rightPan;
      }
      const output = frame * channels;
      if (channels === 1) {
        mixed[output] += (left + right) * 0.5;
      } else {
        mixed[output] += left;
        mixed[output + 1] += right;
      }
    }
    mixedCount += 1;
    target.onUnitDone?.();
  }
  return mixedCount;
}

export function writeWavFloat(file: string, samples: Float32Array, channels: number, sampleRate: number): void {
  const bytesPerSample = 4;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(3, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(32, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeFloatLE(samples[index]!, 44 + index * 4);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

export async function renderSoundtrackToWav(options: AudioMixOptions & { file: string }): Promise<AudioMixFileResult> {
  const mixed = await mixSoundtrack(options);
  writeWavFloat(options.file, mixed.samples, mixed.channels, mixed.sampleRate);
  return { ...mixed, path: options.file };
}

/** Apply EBU R128 loudness normalisation to a WAV file in place using a temp file. */
export async function normalizeLoudness(
  file: string,
  targetLufs: number,
  signal?: AbortSignal,
): Promise<void> {
  const temp = `${file}.loudnorm.wav`;
  await runTool(
    ffmpegPath(),
    [
      '-nostdin', '-hide_banner', '-v', 'error', '-y',
      '-i', file,
      '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`,
      '-ar', '48000',
      '-c:a', 'pcm_f32le',
      temp,
    ],
    { timeoutMs: 300_000, signal },
  );
  fs.renameSync(temp, file);
}

export function audioRangeForOutput(project: Project, timelineId: string | undefined, start: Rational, duration: Rational): {
  start: Rational;
  duration: Rational;
  end: Rational;
} {
  const timeline = findTimeline(project, timelineId ?? project.mainTimeline);
  const end = add(start, duration);
  if (timeline) {
    const timelineEnd = timeline.duration;
    if (gt(end, timelineEnd)) {
      return { start, duration: sub(timelineEnd, start), end: timelineEnd };
    }
  }
  return { start, duration, end };
}

export function hasAudibleClips(project: Project, timelineId?: string): boolean {
  const timeline = findTimeline(project, timelineId ?? project.mainTimeline);
  if (!timeline) return false;
  const units: AudioUnit[] = [];
  collectAudioUnits(project, timeline, [], units, 0);
  return units.length > 0;
}

export function audioClipTimeRange(clip: Clip): { start: number; end: number } {
  return { start: toNumber(clip.start), end: toNumber(clipEnd(clip)) };
}

export function frameToSample(frame: number, fps: { num: number; den: number }, sampleRate: number): number {
  return Math.round((frame / (fps.num / fps.den)) * sampleRate);
}

export function emptyAudio(): AudioMixResult {
  return {
    samples: new Float32Array(0),
    sampleRate: 48_000,
    channels: 2,
    frames: 0,
    durationSeconds: 0,
    clipsMixed: 0,
    issues: [],
    peak: 0,
  };
}

export const AUDIO_ZERO = ZERO;
export function silenceFor(duration: Rational, sampleRate: number, channels: number): AudioMixResult {
  const frames = sampleCount(duration, sampleRate);
  return {
    samples: new Float32Array(frames * channels),
    sampleRate,
    channels,
    frames,
    durationSeconds: frames / sampleRate,
    clipsMixed: 0,
    issues: [],
    peak: 0,
  };
}

export function audioEnd(timeline: Timeline): Rational {
  return timeline.duration;
}

export function safeAudioSeconds(value: Rational): number {
  return gte(value, ZERO) ? toNumber(value) : 0;
}
