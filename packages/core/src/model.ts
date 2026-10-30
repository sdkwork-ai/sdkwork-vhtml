/**
 * VHTML 1.1 Core Model.
 *
 * The model is independent of the DOM, of any editor, and of any encoder.
 * Rational time, explicit references and non-destructive clip semantics are
 * the only sources of truth for every renderer and exporter.
 */

import type { Diagnostic, SourceLocation } from './errors.ts';
import type { Rate, Rational } from './time.ts';
import { add, rat } from './time.ts';
export const SPEC_VERSION = '1.1';

export type ColorSpace = 'srgb' | 'display-p3' | 'rec709';
export type FitMode = 'cover' | 'contain' | 'fill' | 'none';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-lighter';

export type TrackType = 'video' | 'overlay' | 'audio' | 'caption' | 'data';

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'data' | 'captions' | 'svg';

export type GenerationKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'speech'
  | 'sfx'
  | 'text'
  | 'edit'
  | 'avatar'
  | 'lipsync'
  | 'dub'
  | 'matte'
  | 'translation'
  | 'storyboard'
  /** ASR: audio/video in, timed transcript out (cues / word timings). */
  | 'transcribe';

export type GenerationStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type ClipKind = 'scene' | 'timeline' | 'video' | 'image' | 'svg' | 'audio' | 'caption' | 'data';

export type TimingMode = 'clip' | 'project';

export type OutputFormat = 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'wav' | 'mp3';
export type OutputFitMode = 'stretch' | 'contain' | 'cover';

/**
 * RFC-0017 explicit audio downmix policy. `mono` folds the mix to one
 * channel; the default `stereo` keeps the mixer's two-channel profile (an
 * implicit fold from >2 declared channels is reported as an export issue,
 * never silent).
 */
export type DownmixPolicy = 'mono' | 'stereo';

export interface LicenseInfo {
  name?: string;
  url?: string;
  attribution?: string;
  commercialUse?: boolean;
}

export interface Provenance {
  source: 'file' | 'generated' | 'remote' | 'procedural';
  taskId?: string;
  provider?: string;
  model?: string;
  promptHash?: string;
  seed?: number;
  createdAt?: string;
  outputHash?: string;
  generatorVersion?: string;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  src: string;
  mimeType?: string;
  /** Declared or probed duration for time-bearing assets. */
  duration?: Rational;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  hash?: string;
  size?: number;
  alt?: string;
  loop?: boolean;
  license?: LicenseInfo;
  provenance?: Provenance;
  /** Task id when this asset was materialised from a generation task. */
  generatedBy?: string;
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface Scene {
  id: string;
  name?: string;
  /** When set, HTML/CSS/scripts are loaded from this external HTML fragment. */
  src?: string;
  duration?: Rational;
  width?: number;
  height?: number;
  background?: string;
  /** HTML content subtree rendered by Chromium. */
  html: string;
  /** Scene-scoped CSS, automatically prefixed with a scene selector. */
  css?: string;
  scripts?: string[];
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  anchorX: number;
  anchorY: number;
  perspective?: number;
}

export interface Crop {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Effect {
  id: string;
  type: string;
  params: Record<string, string | number | boolean>;
  enabled: boolean;
}

export type EasingName =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | string;

export type AnimationDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
export type AnimationFill = 'none' | 'forwards' | 'backwards' | 'both';
export type AnimationCompose = 'replace' | 'add' | 'accumulate';

export interface Keyframe {
  /** Time relative to the animation start. */
  time: Rational;
  value: string | number;
  easing?: EasingName;
}

/**
 * One point of a clip time-remap curve. `at` is clip-local time (seconds from
 * the clip start) and `source` is the source offset shown at that moment. The
 * source position between keyframes follows `easing` (falling back to the
 * remap-wide easing), which makes speed ramps and reverse ramps exact without
 * integrating a speed function.
 */
export interface TimeRemapKeyframe {
  at: Rational;
  source: Rational;
  easing?: EasingName;
}

export interface TimeRemap {
  /** Sorted by strictly increasing `at`; the first keyframe must be `at = 0`. */
  keyframes: TimeRemapKeyframe[];
  /** Easing applied between keyframes without an explicit easing. */
  easing: EasingName;
}

export interface Animation {
  id: string;
  /** Target clip. When omitted, `selector` is resolved against the whole stage. */
  clipId?: string;
  /** Optional CSS selector, scoped to the clip layer when clipId is present. */
  selector?: string;
  property: string;
  keyframes: Keyframe[];
  start: Rational;
  duration: Rational;
  timeBase: TimingMode;
  easing: EasingName;
  iterations: number | 'infinite';
  direction: AnimationDirection;
  fill: AnimationFill;
  compose: AnimationCompose;
  enabled: boolean;
}

export interface ClipBase {
  id: string;
  kind: ClipKind;
  /** Namespaced reference (`scene:...`, `asset:...`, `gen:...`) or bare id. */
  ref?: string;
  name?: string;
  /** Extra class applied to the generated clip layer. */
  className?: string;
  start: Rational;
  duration: Rational;
  /** Offset inside the referenced source. */
  sourceIn: Rational;
  /** End offset inside the referenced source; derived when omitted. */
  sourceOut?: Rational;
  speed: Rational;
  reverse: boolean;
  /** When set the clip shows this exact source time for its whole duration. */
  freeze?: Rational;
  /**
   * Keyframed source-time mapping (speed ramps, slow-motion curves). Mutually
   * exclusive with `freeze`; `speed` is ignored while the remap is defined.
   */
  timeRemap?: TimeRemap;
  enabled: boolean;
  z: number;
  opacity: number;
  blend: BlendMode;
  transform: Transform;
  crop?: Crop;
  fit: FitMode;
  effects: Effect[];
  animations: Animation[];
  volume: number;
  pan: number;
  fadeIn?: Rational;
  fadeOut?: Rational;
  /**
   * Audio lead/lag relative to the clip's visual source mapping, in seconds.
   * Positive values play the audio later (audio heard at source time
   * source(t) + audioOffset); negative values lead. Video timing is
   * unchanged — this is the lip-sync / latency correction knob.
   */
  audioOffset?: Rational;
  audioEffects: Effect[];
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface SceneClip extends ClipBase {
  kind: 'scene';
  ref: string;
  /** Loop the scene-local timeline for the clip duration. */
  loop?: boolean;
}

/**
 * A compound clip: the referenced Timeline is evaluated recursively and its
 * clips are flattened into the parent frame with remapped time. Cycle-free
 * references are enforced by the validator.
 */
export interface TimelineClip extends ClipBase {
  kind: 'timeline';
  ref: string;
  /** Loop the nested timeline for the clip duration. */
  loop?: boolean;
}

export interface MediaClip extends ClipBase {
  kind: 'video' | 'image' | 'svg' | 'audio';
  ref: string;
  muted?: boolean;
}

export interface CaptionClip extends ClipBase {
  kind: 'caption';
  text: string;
  speaker?: string;
  style?: Record<string, string>;
}

export interface DataClip extends ClipBase {
  kind: 'data';
  value?: string;
}

export type Clip = SceneClip | TimelineClip | MediaClip | CaptionClip | DataClip;

const TransitionTypeCanon: readonly TransitionType[] = ['crossfade', 'fade', 'wipe', 'slide', 'zoom', 'blur', 'dip'];

export type TransitionType =
  | 'crossfade'
  | 'fade'
  | 'wipe'
  | 'slide'
  | 'zoom'
  | 'blur'
  | 'dip';

/** Built-in visual effect types renderers MUST implement (single source of truth). */
export const VISUAL_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'invert',
  'hue-rotate', 'drop-shadow', 'glow', 'grain', 'vignette', 'tint',
  'color-overlay', 'chroma-key', 'rounded', 'mask', 'filter', 'css',
]);

/** Built-in audio effect types mixers MUST implement (single source of truth). */
export const AUDIO_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'gain', 'highpass', 'lowpass', 'compressor', 'echo', 'pitch', 'fade', 'normalize', 'denoise', 'ducking',
]);

/** Built-in transition types renderers MUST implement (single source of truth). */
export const TRANSITION_TYPES: ReadonlySet<string> = new Set(TransitionTypeCanon);

/**
 * Resolve the built-in behaviour a declared effect/transition type renders as
 * (RFC-0015), or `undefined` when the type is not a declared plugin.
 */
export function declaredBase(
  extensions: Project['extensions'] | undefined,
  kind: ExtensionKind,
  typeName: string,
): string | undefined {
  const declaration = extensions?.[typeName];
  return declaration?.kind === kind ? declaration.base : undefined;
}

/** Declared default parameters of a plugin declaration (RFC-0015). */
export function declaredParams(
  extensions: Project['extensions'] | undefined,
  typeName: string,
): Record<string, string | number | boolean> | undefined {
  return extensions?.[typeName]?.kind ? extensions[typeName]?.params : undefined;
}

export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

export interface Transition {
  id: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  /**
   * Built-in transition type, or a declared plugin type (RFC-0015) that the
   * renderer desugars onto the extension's `base` behaviour.
   */
  type: TransitionType | (string & {});
  duration: Rational;
  easing: EasingName;
  direction: TransitionDirection;
  color: string;
  params: Record<string, string | number | boolean>;
  source?: SourceLocation;
}

export interface Track {
  id: string;
  type: TrackType;
  name?: string;
  /** Higher order renders on top for visual tracks. */
  order: number;
  enabled: boolean;
  muted: boolean;
  /**
   * Solo: when any audio track is soloed, non-soloed audio tracks are silent
   * in preview and export (NLE solo semantics; `muted` still wins per track).
   */
  solo?: boolean;
  locked: boolean;
  volume: number;
  pan: number;
  opacity: number;
  blend: BlendMode;
  /** CSS applied to caption elements on caption tracks. */
  captionStyle?: string;
  clips: Clip[];
  transitions: Transition[];
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface Marker {
  id: string;
  time: Rational;
  name?: string;
  type: 'marker' | 'chapter' | 'comment';
  color?: string;
  metadata?: Record<string, string>;
}

export interface Timeline {
  id: string;
  name?: string;
  duration: Rational;
  tracks: Track[];
  markers: Marker[];
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface GenerationInput {
  ref: string;
  role: string;
}

export interface GenerationConstraints {
  duration?: Rational;
  width?: number;
  height?: number;
  aspectRatio?: string;
  /**
   * Vendor-style resolution tier (`480p`, `540p`, `720p`, `1080p`, `2k`,
   * `4k`). Vendors accept tiers rather than exact dimensions; adapters MUST
   * resolve `resolution` against `aspectRatio` when only a tier is given.
   * `width`/`height` remain authoritative when both are present.
   */
  resolution?: string;
  frameRate?: Rate;
  sampleRate?: number;
  channels?: number;
  language?: string;
  seed?: number;
  /** Diffusion sampling steps (image/edit models; e.g. SDXL, Flux). */
  steps?: number;
  /** Prompt-guidance strength (a.k.a. cfg/guidance scale). */
  guidance?: number;
  [key: string]: unknown;
}

export interface GenerationOutputSpec {
  id?: string;
  path?: string;
  mimeType?: string;
  role?: string;
}

/** Camera/shot direction shared by image, video and storyboard tasks. */
export interface ShotDirection {
  framing?: string;
  camera?: string;
  angle?: string;
  lens?: string;
  lighting?: string;
  mood?: string;
  setting?: string;
  action?: string;
  continuity?: string;
}

export interface ImageDirection {
  style?: string;
  composition?: string;
  background?: string;
  transparent?: boolean;
  referenceStrength?: number;
  mask?: string;
  control?: string;
}

export interface VideoDirection {
  firstFrame?: string;
  lastFrame?: string;
  referenceVideo?: string;
  camera?: string;
  /**
   * Controlled camera-movement vocabulary (recommended values): `none`,
   * `push-in`, `pull-out`, `zoom-in`, `zoom-out`, `pan-left`, `pan-right`,
   * `tilt-up`, `tilt-down`, `orbit`, `crane-up`, `crane-down`, `handheld`,
   * `follow`. Adapters map this onto vendor camera presets (Kling
   * camera_control, Luma camera concept, Hailuo/PixVerse camera movement,
   * Seedance `camerafixed` = `none`); free-form descriptions belong in
   * `shot.camera`.
   */
  cameraMove?: string;
  motion?: string;
  /**
   * Normalised motion intensity, 0 = still, 1 = maximum. Adapters rescale to
   * vendor ranges (Pika `motionStrength` 0-4, Vidu `movement_amplitude`,
   * Runway motion bucket) and MUST document their scale in the catalog.
   */
  motionStrength?: number;
  /**
   * Whether the model generates a native soundtrack for the clip (Sora,
   * Veo, Wan, Kling omni, Pika `with_sound`). `false` must mute generated
   * audio; omit for vendors without native audio.
   */
  withAudio?: boolean;
  loop?: boolean;
  lipSync?: boolean;
}

export interface SpeechDirection {
  language?: string;
  voice?: string;
  accent?: string;
  emotion?: string;
  pace?: string;
  /** Numeric speaking-rate multiplier; 1 = native pace (ElevenLabs `speed`,
   *  OpenAI TTS `speed`). Prefer `rate` for exact mapping, `pace` for prose. */
  rate?: number;
  pitch?: string;
  style?: string;
  speaker?: string;
  pronunciation?: string;
  consent?: string;
}

export interface MusicDirection {
  genre?: string;
  mood?: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  instruments?: string[];
  structure?: string[];
  vocals?: string;
  /** Song lyrics for singing-voice generation (Suno-style vendors). */
  lyrics?: string;
  /** Convenience alias for `vocals: "none"`; adapters MUST treat both alike. */
  instrumental?: boolean;
  stems?: boolean;
  loop?: boolean;
}

export interface SfxDirection {
  category?: string;
  environment?: string;
  intensity?: string;
  loop?: boolean;
}

export interface EditDirection {
  operation?: string;
  strength?: number;
  preserve?: string;
  mask?: string;
}

/**
 * Structured creative direction. `params` stays provider-specific; `direction`
 * is the portable vocabulary for shot, image, video, voice, music, SFX and edit
 * intent. Unknown namespaced keys are preserved for forward compatibility.
 */
export interface GenerationDirection {
  shot?: ShotDirection;
  image?: ImageDirection;
  video?: VideoDirection;
  speech?: SpeechDirection;
  music?: MusicDirection;
  sfx?: SfxDirection;
  edit?: EditDirection;
  [key: string]: unknown;
}

export type GenerationReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes-requested';

/** Valid review statuses (single source of truth for parser/validator/edits). */
export const GENERATION_REVIEW_STATUSES: ReadonlySet<GenerationReviewStatus> = new Set(['pending', 'approved', 'rejected', 'changes-requested']);

export interface GenerationReview {
  status: GenerationReviewStatus;
  reviewer?: string;
  notes?: string;
  reviewedAt?: string;
}

export interface GenerationRights {
  license?: string;
  /** Consent reference for a depicted person or voice. */
  consent?: string;
  likeness?: 'none' | 'consented' | 'synthetic';
  voiceCloning?: 'none' | 'consented';
  commercialUse?: boolean;
  aiDisclosure?: boolean;
}

export interface GenerationSafety {
  rating?: string;
  policy?: string;
  moderated?: boolean;
  notes?: string;
}

/**
 * Recorded or declared consumption for one generation task (RFC-0013). Cost is
 * `currency`-denominated; credits and tokens are provider units; compute
 * seconds and output bytes are observed facts the runtime records on every
 * provider run. Vendor-only units belong in the index signature.
 */
export interface GenerationUsage {
  /** Provider-reported cost, denominated in `currency`. */
  cost?: number;
  currency?: string;
  /** Billable text/model tokens as reported by the provider. */
  tokens?: number;
  /** Provider credits or abstract billing units. */
  credits?: number;
  /** Observed provider wall time for this task, in seconds. */
  computeSeconds?: number;
  /** Sum of generated output sizes in bytes. */
  outputBytes?: number;
  /** ISO-8601 instant the usage was recorded. */
  recordedAt?: string;
  [key: string]: unknown;
}

/**
 * Hard spending ceiling for one materialisation run (RFC-0013). When the
 * cumulative usage of already-run tasks plus the next task would exceed a cap,
 * the run fails with `GENERATION_QUOTA_EXCEEDED` before the provider is called.
 */
export interface GenerationQuota {
  maxCost?: number;
  maxCredits?: number;
  maxTokens?: number;
  maxComputeSeconds?: number;
  /** Currency `maxCost` is denominated in; mismatching recorded usage counts. */
  currency?: string;
}

/** Reference from a bible profile to an asset or generation output. */
export interface BibleReference {
  ref: string;
  role: string;
}

export type BibleKind = 'character' | 'style';

/**
 * A versioned character or style bible (RFC-0014): the canonical description a
 * project keeps for AI consistency across shots. Generation tasks reference a
 * bible with `ref="character:<id>"` or `ref="style:<id>"`; bumping `version`
 * invalidates cached generations through the cache key.
 */
export interface BibleProfile {
  kind: BibleKind;
  id: string;
  /** Advisory revision; bump to invalidate generation caches. */
  version?: number;
  name?: string;
  /** Canonical positive description of the character or style. */
  description?: string;
  /** What must stay out of every depiction; feeds negative prompts. */
  negative?: string;
  /** Reference sheets, style boards or generation outputs that anchor it. */
  references: BibleReference[];
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export type ExtensionKind = 'effect' | 'audio-effect' | 'transition';

/**
 * A declared project extension. Plain declarations only carry `name`,
 * `version` and `required`. Plugin declarations (RFC-0015) additionally
 * contribute an effect, audio-effect or transition `type` that validators
 * recognise and renderers desugar onto the built-in `base` behaviour; extra
 * params are the declared defaults for clips using the type.
 */
export interface ExtensionDeclaration {
  name: string;
  version?: string;
  required: boolean;
  kind?: ExtensionKind;
  /** Built-in behaviour the declared type renders as. */
  base?: string;
  /** Declared default parameters for clips using the type. */
  params?: Record<string, string | number | boolean>;
}

export interface GenerationTask {
  id: string;
  kind: GenerationKind;
  provider?: string;
  model?: string;
  prompt: string;
  negativePrompt?: string;
  inputs: GenerationInput[];
  constraints: GenerationConstraints;
  params: Record<string, string | number | boolean>;
  /** Portable creative direction; provider-specific values belong in `params`. */
  direction?: GenerationDirection;
  outputs: GenerationOutputSpec[];
  status: GenerationStatus;
  /** Recorded or declared consumption for this task (RFC-0013). */
  usage?: GenerationUsage;
  review?: GenerationReview;
  rights?: GenerationRights;
  safety?: GenerationSafety;
  providerJobId?: string;
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface Composition {
  width: number;
  height: number;
  frameRate: Rate;
  duration: Rational;
  sampleRate: number;
  channels: number;
  background: string;
  colorSpace: ColorSpace;
  /** Deterministic random seed shared by renderer, scripts and providers. */
  seed: number;
  deviceScaleFactor: number;
}

export type StoryboardStatus = 'idea' | 'boarded' | 'generating' | 'ready' | 'approved';

/**
 * A planning shot. It is intentionally decoupled from the timeline: a shot may
 * reference a Scene, a generation task or an asset, and can be reordered or
 * edited without changing render timing. The timeline remains authoritative for
 * final playback.
 */
export interface StoryboardShot {
  id: string;
  order: number;
  title?: string;
  description?: string;
  prompt?: string;
  scene?: string;
  generation?: string;
  asset?: string;
  duration?: Rational;
  status: StoryboardStatus;
  direction?: GenerationDirection;
  tags?: string[];
  notes?: string;
  /** Current review record (RFC-0018); `storyboard.review` maintains it. */
  review?: GenerationReview;
  /** Prior review records, oldest first (RFC-0018 approval history). */
  reviewHistory?: GenerationReview[];
  source?: SourceLocation;
}

export interface OutputConfig {
  id: string;
  timeline: string;
  format: OutputFormat;
  width: number;
  height: number;
  frameRate: Rate;
  /** How composition frames fit a different delivery aspect ratio. */
  fit?: OutputFitMode;
  /** RFC-0017 explicit audio downmix policy (default stereo). */
  downmix?: DownmixPolicy;
  /** Optional sub-range of the timeline; defaults to the whole timeline. */
  rangeStart?: Rational;
  rangeDuration?: Rational;
  videoCodec: string;
  audioCodec: string;
  videoBitrate?: string;
  crf?: number;
  preset?: string;
  audioBitrate?: string;
  sampleRate: number;
  channels: number;
  pixelFormat: string;
  colorSpace: ColorSpace;
  background: string;
  burnCaptions: boolean;
  captionsPath?: string;
  path?: string;
  metadata?: Record<string, string>;
  source?: SourceLocation;
}

export interface Project {
  id: string;
  version: string;
  title?: string;
  description?: string;
  lang?: string;
  composition: Composition;
  assets: Asset[];
  scenes: Scene[];
  timelines: Timeline[];
  generations: GenerationTask[];
  /** Versioned character & style bible library (RFC-0014). */
  bibles?: BibleProfile[];
  /** Optional planning layer; timeline remains authoritative for playback. */
  storyboard?: StoryboardShot[];
  outputs: OutputConfig[];
  /** Global CSS from <style> elements outside scenes. */
  styles: string[];
  /** External stylesheets declared with <link rel="stylesheet">. */
  stylesheets?: string[];
  /** Project-level scripts, executed once in the stage. */
  scripts?: string[];
  /** Animations that target elements across the whole stage. */
  animations: Animation[];
  metadata: Record<string, string>;
  /** Declared extensions; plugin declarations register effect/transition types (RFC-0015). */
  extensions?: Record<string, ExtensionDeclaration>;
  requirements?: string[];
  mainTimeline: string;
}

export interface DocumentSource {
  path: string;
  /** Directory used to resolve relative asset paths. */
  root: string;
  raw?: string;
}

/**
 * Inline authoring program (code authoring extension). The program is executed
 * once at materialisation time in a deterministic sandbox and builds scenes,
 * lanes, clips, captions and generations with ordinary code.
 */
export interface AuthoringProgram {
  code: string;
  /** Deterministic seed; defaults to the composition seed. */
  seed?: number;
  /** Parameters readable as `vhtml.ctx.params` (CLI `--param key=value`). */
  params?: Record<string, string>;
  source?: SourceLocation;
}

/** A data block consumed by the authoring program. */
export interface DataBlock {
  id: string;
  mimeType: string;
  /** Parsed value for `application/json`; raw text otherwise. */
  value: unknown;
  /** External file (project-root relative) the block was loaded from. */
  src?: string;
  source?: SourceLocation;
}

export interface VhtmlDocument {
  specVersion: string;
  project: Project;
  source?: DocumentSource;
  /** Non-fatal parser diagnostics (warnings and migration notes). */
  warnings?: Diagnostic[];
  /** Authoring program; materialised before validation/render/export. */
  program?: AuthoringProgram;
  /** Inline data blocks available to the authoring program. */
  dataBlocks?: DataBlock[];
}

export const DEFAULT_COMPOSITION: Composition = {
  width: 1920,
  height: 1080,
  frameRate: rat(30),
  duration: rat(8),
  sampleRate: 48_000,
  channels: 2,
  background: '#000000',
  colorSpace: 'srgb',
  seed: 1,
  deviceScaleFactor: 1,
};

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

export const DEFAULT_CLIP: Omit<ClipBase, 'id' | 'kind'> = {
  start: rat(0),
  duration: rat(0),
  sourceIn: rat(0),
  speed: rat(1),
  reverse: false,
  enabled: true,
  z: 0,
  opacity: 1,
  blend: 'normal',
  transform: { ...DEFAULT_TRANSFORM },
  fit: 'cover',
  effects: [],
  animations: [],
  volume: 1,
  pan: 0,
  audioEffects: [],
};

export const VISUAL_TRACK_TYPES: ReadonlySet<TrackType> = new Set(['video', 'overlay']);

export function clipEnd(clip: Pick<ClipBase, 'start' | 'duration'>): Rational {
  return add(clip.start, clip.duration);
}

export function isVisualClip(clip: Clip): boolean {
  return clip.kind !== 'audio' && clip.kind !== 'data';
}

export function isAudioClip(clip: Clip): boolean {
  return clip.kind === 'audio' || clip.kind === 'video';
}

export function isCaptionClip(clip: Clip): clip is CaptionClip {
  return clip.kind === 'caption';
}

export function clipSourceDuration(clip: ClipBase): Rational | undefined {
  if (!clip.sourceOut) return undefined;
  return add(clip.sourceOut, rat(-clip.sourceIn.num, -clip.sourceIn.den));
}
export function allTracks(project: Project): Array<{ timeline: Timeline; track: Track }> {
  const result: Array<{ timeline: Timeline; track: Track }> = [];
  for (const timeline of project.timelines) {
    for (const track of timeline.tracks) result.push({ timeline, track });
  }
  return result;
}

export interface LocatedClip {
  clip: Clip;
  track: Track;
  timeline: Timeline;
}

export function allClips(project: Project): LocatedClip[] {
  const result: LocatedClip[] = [];
  for (const timeline of project.timelines) {
    for (const track of timeline.tracks) {
      for (const clip of track.clips) result.push({ clip, track, timeline });
    }
  }
  return result;
}

export function findTimeline(project: Project, id: string): Timeline | undefined {
  return project.timelines.find((timeline) => timeline.id === id);
}

export function findTrack(project: Project, id: string): { timeline: Timeline; track: Track } | undefined {
  for (const timeline of project.timelines) {
    const track = timeline.tracks.find((candidate) => candidate.id === id);
    if (track) return { timeline, track };
  }
  return undefined;
}

export function findClip(project: Project, id: string): LocatedClip | undefined {
  return allClips(project).find((located) => located.clip.id === id);
}

export function findScene(project: Project, id: string): Scene | undefined {
  return project.scenes.find((scene) => scene.id === id);
}

export function findAsset(project: Project, id: string): Asset | undefined {
  return project.assets.find((asset) => asset.id === id);
}

export function findGeneration(project: Project, id: string): GenerationTask | undefined {
  return project.generations.find((task) => task.id === id);
}

/** Look up a bible profile by id, ignoring its `character`/`style` kind. */
export function findBible(project: Project, id: string): BibleProfile | undefined {
  return project.bibles?.find((bible) => bible.id === id);
}

export function findOutput(project: Project, id: string): OutputConfig | undefined {
  return project.outputs.find((output) => output.id === id);
}

export function findStoryboardShot(project: Project, id: string): StoryboardShot | undefined {
  return project.storyboard?.find((shot) => shot.id === id);
}

export type ResolvedReference =
  | { kind: 'scene'; id: string; scene: Scene }
  | { kind: 'asset'; id: string; asset: Asset }
  | { kind: 'generation'; id: string; task: GenerationTask }
  | { kind: 'timeline'; id: string; timeline: Timeline }
  | { kind: 'bible'; id: string; bible: BibleProfile };

/** Namespaces that address bible profiles (both resolve the same library). */
export const BIBLE_NAMESPACES = new Set(['character', 'style']);

export function parseReference(ref: string): { namespace?: string; id: string } {
  const index = ref.indexOf(':');
  if (index === -1) return { id: ref };
  return { namespace: ref.slice(0, index), id: ref.slice(index + 1) };
}

/**
 * Resolve a clip/asset reference. Namespaces are authoritative; bare ids are
 * resolved across scenes, assets and generation tasks and MUST be unique.
 */
export function resolveReference(project: Project, ref: string): ResolvedReference | undefined {
  const parsed = parseReference(ref);
  if (parsed.namespace === 'gen') {
    const task = findGeneration(project, parsed.id);
    return task ? { kind: 'generation', id: task.id, task } : undefined;
  }
  if (parsed.namespace === 'scene') {
    const scene = findScene(project, parsed.id);
    return scene ? { kind: 'scene', id: scene.id, scene } : undefined;
  }
  if (parsed.namespace === 'asset') {
    const asset = findAsset(project, parsed.id);
    return asset ? { kind: 'asset', id: asset.id, asset } : undefined;
  }
  if (parsed.namespace === 'timeline') {
    const timeline = findTimeline(project, parsed.id);
    return timeline ? { kind: 'timeline', id: timeline.id, timeline } : undefined;
  }
  if (parsed.namespace && BIBLE_NAMESPACES.has(parsed.namespace)) {
    const bible = findBible(project, parsed.id);
    return bible ? { kind: 'bible', id: bible.id, bible } : undefined;
  }
  if (parsed.namespace) return undefined;

  const scene = findScene(project, parsed.id);
  if (scene) return { kind: 'scene', id: scene.id, scene };
  const asset = findAsset(project, parsed.id);
  if (asset) return { kind: 'asset', id: asset.id, asset };
  const task = findGeneration(project, parsed.id);
  if (task) return { kind: 'generation', id: task.id, task };
  const timeline = findTimeline(project, parsed.id);
  if (timeline) return { kind: 'timeline', id: timeline.id, timeline };
  return undefined;
}

export function generatedAssetId(taskId: string, outputIndex = 0): string {
  return outputIndex === 0 ? `gen:${taskId}` : `gen:${taskId}:${outputIndex}`;
}

export function generationKindToAssetKind(kind: GenerationKind): AssetKind {
  switch (kind) {
    case 'image':
    case 'edit':
    case 'matte':
    case 'storyboard':
      return 'image';
    case 'video':
    case 'avatar':
    case 'lipsync':
      return 'video';
    case 'audio':
    case 'music':
    case 'speech':
    case 'sfx':
    case 'dub':
      return 'audio';
    case 'text':
    case 'translation':
    case 'transcribe':
      return 'data';
    default:
      return 'data';
  }
}

export function createEmptyProject(id = 'untitled'): Project {
  return {
    id,
    version: SPEC_VERSION,
    composition: { ...DEFAULT_COMPOSITION },
    assets: [],
    scenes: [],
    timelines: [
      {
        id: 'main',
        duration: DEFAULT_COMPOSITION.duration,
        tracks: [],
        markers: [],
      },
    ],
    generations: [],
    storyboard: [],
    outputs: [],
    styles: [],
    animations: [],
    metadata: {},
    mainTimeline: 'main',
  };
}
