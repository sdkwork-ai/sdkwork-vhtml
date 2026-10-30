/**
 * VHTML non-destructive editing operations.
 *
 * All operations are applied to the Core Model, not to a rendered timeline.
 * Editors, agents and CI can therefore share exactly the same semantics.
 * Times are exact rationals; string inputs use the normative VHTML time syntax.
 */

import {
  allClips,
  clipEnd,
  findAsset,
  findClip,
  findGeneration,
  findScene,
  findTimeline,
  findTrack,
  resolveReference,
  generationKindToAssetKind,
  GENERATION_REVIEW_STATUSES,
  type TimelineClip,
  type Animation,
  type Asset,
  type Clip,
  type ClipBase,
  type Composition,
  type Effect,
  type Marker,
  type Project,
  type StoryboardShot,
  type Timeline,
  type Track,
  type TrackType,
  type Transition,
} from './model.ts';
import { DiagnosticBag, ErrorCode, VhtmlError, type Diagnostic } from './errors.ts';
import {
  ZERO,
  add,
  div,
  eq,
  gt,
  gte,
  lt,
  lte,
  mul,
  parseTime,
  rat,
  sub,
  toNumber,
  type Rational,
} from './time.ts';
import { animationValueAt, sampleAnimation, sampleTimeRemap } from './animation.ts';
import type { TimeRemap, TimeRemapKeyframe } from './model.ts';

export type TimeLike = Rational | string | number;

export interface ClipSetProps {  opacity?: number;
  blend?: ClipBase['blend'];
  transform?: Partial<ClipBase['transform']>;
  crop?: ClipBase['crop'] | null;
  fit?: ClipBase['fit'];
  effects?: Effect[];
  animations?: Animation[];
  volume?: number;
  pan?: number;
  fadeIn?: TimeLike | null;
  fadeOut?: TimeLike | null;
  audioOffset?: TimeLike | null;
  enabled?: boolean;
  z?: number;
  name?: string;
  className?: string;
  /** Whole-replace: the provided record becomes the clip's metadata. */
  metadata?: Record<string, string>;
  ref?: string;
  loop?: boolean;
  muted?: boolean;
  text?: string;
  speaker?: string;
  style?: Record<string, string>;
  value?: string;
}

export type CompositionPatch = Omit<Partial<Composition>, 'frameRate'> & {
  frameRate?: Rational | string | number;
};

/** New-shot payload; `order` is assigned by the editor. */
export type StoryboardShotInput = Omit<StoryboardShot, 'order' | 'duration'> & {
  order?: number;
  duration?: TimeLike;
};

/** Field-level patch for a storyboard shot; `null` clears an optional field. */
export interface StoryboardShotPatch {
  title?: string | null;
  description?: string | null;
  prompt?: string | null;
  scene?: string | null;
  generation?: string | null;
  asset?: string | null;
  duration?: TimeLike | null;
  status?: StoryboardShot['status'];
  direction?: StoryboardShot['direction'] | null;
  tags?: string[] | null;
  notes?: string | null;
  order?: number;
}

export type EditOperation =
  | {
      op: 'project.set';
      title?: string;
      description?: string;
      lang?: string;
      seed?: number;
      mainTimeline?: string;
      composition?: CompositionPatch;
    }
  | { op: 'asset.add'; asset: Asset; replace?: boolean }
  | { op: 'asset.remove'; assetId: string }
  | {
      op: 'scene.set';
      sceneId: string;
      props: {
        html?: string;
        css?: string | null;
        scripts?: string[];
        name?: string;
        background?: string;
        src?: string | null;
      };
    }
  | {
      op: 'asset.set';
      assetId: string;
      props: Partial<Pick<Asset, 'src' | 'mimeType' | 'duration' | 'width' | 'height' | 'sampleRate' | 'channels' | 'alt' | 'hash' | 'size' | 'generatedBy' | 'license' | 'provenance' | 'metadata'>>;
    }
  | { op: 'timeline.set'; timelineId: string; name?: string; duration?: TimeLike }
  | { op: 'track.add'; timelineId: string; track: Partial<Track> & { id?: string; type: TrackType } }
  | { op: 'track.remove'; trackId: string }
  | {
      op: 'track.set';
      trackId: string;
      props: Partial<Pick<Track, 'name' | 'order' | 'enabled' | 'muted' | 'solo' | 'locked' | 'volume' | 'pan' | 'opacity' | 'blend' | 'captionStyle'>>;
    }
  | { op: 'clip.add'; trackId: string; clip: Clip }
  | { op: 'clip.remove'; clipId: string }
  | { op: 'clip.rippleDelete'; clipId: string }
  | { op: 'clip.move'; clipId: string; start?: TimeLike; trackId?: string }
  | { op: 'clip.trim'; clipId: string; start?: TimeLike; end?: TimeLike; duration?: TimeLike }
  | { op: 'clip.split'; clipId: string; at: TimeLike; id?: string }
  | { op: 'clip.slip'; clipId: string; delta: TimeLike }
  | { op: 'clip.slide'; clipId: string; delta: TimeLike }
  | { op: 'clip.roll'; clipId: string; edge: 'start' | 'end'; delta: TimeLike }
  | { op: 'clip.speed'; clipId: string; speed: number | string }
  | { op: 'clip.freeze'; clipId: string; sourceTime?: TimeLike; at?: TimeLike }
  | {
      op: 'clip.timeremap';
      clipId: string;
      keyframes: Array<{ at: TimeLike; source: TimeLike; easing?: string }>;
      easing?: string;
    }
  | { op: 'clip.timeremap.clear'; clipId: string }
  | { op: 'clip.duplicate'; clipId: string; id?: string; start?: TimeLike }
  | { op: 'clip.splitMulti'; clipId: string; times: TimeLike[]; ids?: string[] }
  | { op: 'clip.detachAudio'; clipId: string; laneId?: string }
  | { op: 'clip.replace'; clipId: string; ref: string; keepTiming?: 'in-out' | 'project' }
  | {
      op: 'timeline.nest';
      clipIds: string[];
      timelineId?: string;
      clipId?: string;
      removeSource?: boolean;
    }
  | { op: 'timeline.unnest'; clipId: string }
  | { op: 'timeline.rippleCut'; trackIds: string[]; start: TimeLike; end: TimeLike }
  | {
      op: 'storyboard.apply';
      shotIds?: string[];
      laneId?: string;
      at?: TimeLike | 'append';
      gap?: TimeLike;
      clipIdPrefix?: string;
    }
  | { op: 'timeline.insert'; laneId: string; clip: Clip; at?: TimeLike }
  | { op: 'timeline.overwrite'; laneId: string; clip: Clip; at?: TimeLike }
  | { op: 'clip.link'; clipIds: string[] }
  | { op: 'clip.unlink'; clipId: string }
  | { op: 'timeline.moveBatch'; clipIds: string[]; start: TimeLike }
  | { op: 'timeline.copy'; clipIds: string[] }
  | { op: 'timeline.cut'; clipIds: string[] }
  | {
      op: 'timeline.paste';
      at?: TimeLike;
      laneId?: string;
      mode?: 'add' | 'insert' | 'overwrite';
      idPrefix?: string;
    }
  | { op: 'clip.set'; clipId: string; props: ClipSetProps }
  | { op: 'transition.add'; trackId: string; transition: Partial<Omit<Transition, 'id' | 'trackId' | 'duration'>> & { fromClipId: string; toClipId: string; type: Transition['type']; duration: TimeLike; id?: string } }
  | { op: 'transition.remove'; transitionId: string }
  | { op: 'animation.add'; animation: Animation; clipId?: string }
  | { op: 'animation.remove'; animationId: string; clipId?: string }
  | { op: 'effect.add'; clipId: string; effect: Effect; audio?: boolean }
  | { op: 'effect.remove'; clipId: string; effectId: string; audio?: boolean }
  | { op: 'marker.add'; timelineId: string; marker: Omit<Marker, 'time'> & { time: TimeLike } }
  | { op: 'marker.remove'; timelineId: string; markerId: string }
  | {
      op: 'storyboard.add';
      shot: StoryboardShotInput;
      at?: number;
    }
  | {
      op: 'storyboard.set';
      shotId: string;
      props: StoryboardShotPatch;
    }
  | { op: 'storyboard.remove'; shotId: string }
  | { op: 'storyboard.move'; shotId: string; to: number }
  | { op: 'storyboard.reorder'; shotIds: string[] }
  /**
   * RFC-0018: record a review decision on a shot. The previous review (if
   * any) is appended to `reviewHistory`, so approval history accumulates.
   */
  | { op: 'storyboard.review'; shotId: string; review: NonNullable<StoryboardShot['review']> }
  | { op: 'composition.set'; composition: Partial<Composition> }
  | { op: 'batch'; operations: EditOperation[] };

export interface ApplyEditOptions {
  /** Mutate the provided project instead of cloning it. */
  mutate?: boolean;
  /** Extend timeline/composition when clips are placed beyond the end. */
  autoExtend?: boolean;
  /** Throw on the first error. */
  strict?: boolean;
  /** Frame rate used to resolve time strings and `f` units. */
  frameRate?: Rational;
}

export interface EditResult {
  project: Project;
  ok: boolean;
  diagnostics: Diagnostic[];
  changed: string[];
}

interface Located {
  project: Project;
  timeline: Timeline;
  track: Track;
  clip: Clip;
}

const STORYBOARD_STATUSES = new Set(['idea', 'boarded', 'generating', 'ready', 'approved']);

function isRational(value: unknown): value is Rational {
  return typeof value === 'object' && value !== null && 'num' in value && 'den' in value;
}

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

function locate(project: Project, clipId: string): Located | undefined {
  const found = findClip(project, clipId);
  if (!found) return undefined;
  return { project, ...found };
}

function sourceDurationOf(project: Project, clip: Clip): Rational | undefined {
  if (clip.kind === 'scene' || clip.kind === 'image' || clip.kind === 'svg' || clip.kind === 'caption' || clip.kind === 'data') {
    return undefined;
  }
  if (!clip.ref) return undefined;
  if (clip.ref.startsWith('gen:')) {
    return findGeneration(project, clip.ref.slice(4))?.constraints.duration;
  }
  return findAsset(project, clip.ref.replace(/^asset:/, ''))?.duration;
}

function fmt(value: Rational): string {
  return `${value.num}/${value.den}s`;
}

/** Paste anchor fallback: the timeline start (hosts may pass an explicit `at`). */
function playheadHint(_project: Project): Rational {
  return ZERO;
}

function laneEnd(track: Track): Rational {
  return track.clips.reduce((max, clip) => (gt(clipEnd(clip), max) ? clipEnd(clip) : max), ZERO);
}

function clipOut(clip: Clip): Rational {
  return clip.sourceOut ?? add(clip.sourceIn, mul(clip.duration, clip.speed));
}

function clipSourceSpan(clip: Clip): Rational {
  return mul(clip.duration, clip.speed);
}

function isTimeBearing(clip: Clip): boolean {
  return clip.kind === 'video' || clip.kind === 'audio';
}

function uniqueId(project: Project, base: string): string {
  const used = new Set<string>();
  for (const located of allClips(project)) used.add(located.clip.id);
  for (const timeline of project.timelines) {
    used.add(timeline.id);
    for (const track of timeline.tracks) {
      used.add(track.id);
      for (const transition of track.transitions) used.add(transition.id);
      for (const clip of track.clips) for (const animation of clip.animations) used.add(animation.id);
    }
  }
  for (const scene of project.scenes) used.add(scene.id);
  for (const asset of project.assets) used.add(asset.id);
  for (const task of project.generations) used.add(task.id);
  for (const shot of project.storyboard ?? []) used.add(shot.id);
  for (const animation of project.animations) used.add(animation.id);
  let id = base;
  let counter = 2;
  while (used.has(id)) id = `${base}-${counter++}`;
  return id;
}

function idExists(project: Project, id: string): boolean {
  if (project.id === id) return true;
  if (project.assets.some((asset) => asset.id === id)) return true;
  if (project.scenes.some((scene) => scene.id === id)) return true;
  if (project.timelines.some((timeline) => timeline.id === id)) return true;
  if (project.generations.some((task) => task.id === id)) return true;
  if (project.outputs.some((output) => output.id === id)) return true;
  for (const located of allClips(project)) {
    if (located.clip.id === id || located.track.id === id) return true;
  }
  return false;
}

function ensureExtent(project: Project, timeline: Timeline, end: Rational, autoExtend: boolean): void {
  if (!autoExtend) return;
  if (gt(end, timeline.duration)) timeline.duration = end;
  if (timeline.id === project.mainTimeline && gt(timeline.duration, project.composition.duration)) {
    project.composition.duration = timeline.duration;
  }
}

function reconcileTransitions(project: Project, diagnostics: DiagnosticBag): void {
  for (const timeline of project.timelines) {
    for (const track of timeline.tracks) {
      const clipMap = new Map(track.clips.map((clip) => [clip.id, clip]));
      const kept: Transition[] = [];
      for (const transition of track.transitions) {
        const from = clipMap.get(transition.fromClipId);
        const to = clipMap.get(transition.toClipId);
        if (!from || !to) {
          diagnostics.warning(ErrorCode.TIME_TRANSITION_INVALID, `transition "${transition.id}" was removed because a clip no longer exists`, {
            objectId: transition.id,
          });
          continue;
        }
        const overlapStart = gt(from.start, to.start) ? from.start : to.start;
        const overlapEnd = lt(clipEnd(from), clipEnd(to)) ? clipEnd(from) : clipEnd(to);
        const overlap = sub(overlapEnd, overlapStart);
        if (!gt(overlap, ZERO)) {
          diagnostics.warning(ErrorCode.TIME_TRANSITION_INVALID, `transition "${transition.id}" was removed because the clips no longer overlap`, {
            objectId: transition.id,
          });
          continue;
        }
        if (gt(transition.duration, overlap)) {
          diagnostics.warning(
            ErrorCode.TIME_TRANSITION_INVALID,
            `transition "${transition.id}" was clamped to the ${overlap.num}/${overlap.den}s clip overlap`,
            { objectId: transition.id },
          );
          transition.duration = overlap;
        }
        kept.push(transition);
      }
      track.transitions = kept;
      track.clips.sort((a, b) => (lt(a.start, b.start) ? -1 : gt(a.start, b.start) ? 1 : 0));
    }
  }
}

function splitAnimations(
  project: Project,
  animations: Animation[],
  cut: Rational,
  reserved: Set<string>,
): { left: Animation[]; right: Animation[] } {
  const leftResult: Animation[] = [];
  const rightResult: Animation[] = [];
  const nextId = (base: string): string => {
    let id = `${base}-b`;
    let counter = 2;
    while (reserved.has(id) || findAnimation(project, id)) id = `${base}-b${counter++}`;
    reserved.add(id);
    return id;
  };

  for (const animation of animations) {
    const start = animation.start;
    const end = add(start, animation.duration);
    if (animation.timeBase === 'project') {
      leftResult.push(structuredClone(animation));
      const copy = structuredClone(animation);
      copy.id = nextId(animation.id);
      rightResult.push(copy);
      continue;
    }
    if (lte(end, cut)) {
      leftResult.push(structuredClone(animation));
      continue;
    }
    if (gte(start, cut)) {
      const copy = structuredClone(animation);
      copy.start = sub(start, cut);
      rightResult.push(copy);
      continue;
    }
    const boundary =
      animationValueAt(animation, cut) ??
      animation.keyframes[animation.keyframes.length - 1]?.value ??
      0;
    // Truncate the left half at the cut.
    const left = structuredClone(animation);
    left.duration = sub(cut, start);
    left.iterations = 1;
    left.fill = 'forwards';
    left.keyframes = left.keyframes
      .filter((keyframe) => lt(keyframe.time, left.duration))
      .map((keyframe) => ({ ...keyframe }));
    if (!left.keyframes.length) left.keyframes.push({ time: ZERO, value: boundary });
    left.keyframes.push({ time: left.duration, value: boundary });
    leftResult.push(left);

    // The right half starts from the interpolated boundary value.
    const right = structuredClone(animation);
    right.id = nextId(animation.id);
    right.start = ZERO;
    right.duration = sub(end, cut);
    right.iterations = 1;
    right.fill = 'both';
    right.keyframes = animation.keyframes
      .filter((keyframe) => gt(keyframe.time, cut))
      .map((keyframe) => ({ ...keyframe, time: sub(keyframe.time, cut) }));
    right.keyframes.unshift({ time: ZERO, value: boundary });
    if (!gt(right.duration, ZERO)) right.duration = rat(1, 1000);
    rightResult.push(right);
  }
  return { left: leftResult, right: rightResult };
}

/**
 * Module-level clipboard session (normative: `timeline.copy`/`timeline.cut`
 * place clips here; `timeline.paste` materialises them). The clipboard holds
 * cloned clips with their relative lane types and offsets, so pasting works
 * across apply() calls and across timelines within one process. Cross-process
 * clipboard is a host concern, not a model concern.
 */
interface ClipboardEntry {
  clip: Clip;
  laneType: TrackType;
  offsetFromFirst: Rational;
}
const EDITOR_CLIPBOARD: { entries: ClipboardEntry[] | null } = { entries: null };

/**
 * Normalize a client-supplied animation so projection round-trips cannot write
 * degenerate rationals (`undefined/undefineds`, NaN keyframe times) into the
 * document. Animations without a property or any finite keyframe are dropped.
 */
export function sanitizeAnimationInput(raw: Animation): Animation | undefined {
  if (!raw || typeof raw !== 'object' || !raw.property) return undefined;
  const finiteSeconds = (value: unknown, fallback: number): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const keyframes = (Array.isArray(raw.keyframes) ? raw.keyframes : [])
    .map((keyframe) => ({
      time: rat(Math.round(finiteSeconds(keyframe?.time, 0) * 1_000_000), 1_000_000),
      value: keyframe?.value ?? 0,
      easing: keyframe?.easing,
    }))
    .sort((a, b) => a.time.num * b.time.den - b.time.num * a.time.den);
  if (!keyframes.length) return undefined;
  const iterations = raw.iterations === 'infinite' || (Number.isFinite(Number(raw.iterations)) && Number(raw.iterations) > 0)
    ? raw.iterations
    : 1;
  const durationFallback = keyframes[keyframes.length - 1]!.time.num / keyframes[keyframes.length - 1]!.time.den;
  return {
    ...raw,
    start: rat(Math.round(finiteSeconds(raw.start, 0) * 1_000_000), 1_000_000),
    duration: rat(Math.round(Math.max(0.001, finiteSeconds(raw.duration, durationFallback)) * 1_000_000), 1_000_000),
    timeBase: raw.timeBase === 'project' ? 'project' : 'clip',
    easing: typeof raw.easing === 'string' && raw.easing ? raw.easing : 'linear',
    iterations,
    direction: raw.direction ?? 'normal',
    fill: raw.fill ?? 'both',
    compose: raw.compose ?? 'replace',
    enabled: raw.enabled !== false,
    keyframes,
  };
}

class Editor {
  readonly bag = new DiagnosticBag();
  readonly changed: string[] = [];
  project: Project;
  private readonly autoExtend: boolean;
  private readonly strict: boolean;
  private frameRate: Rational;

  constructor(project: Project, options: ApplyEditOptions) {
    this.project = options.mutate ? project : cloneProject(project);
    this.autoExtend = options.autoExtend ?? true;
    this.strict = options.strict ?? false;
    this.frameRate = options.frameRate ?? (project.composition?.frameRate ?? rat(30));
  }

  fail(code: string, message: string, objectId?: string): void {
    this.bag.error(code, message, objectId ? { objectId } : {});
    if (this.strict) {
      throw new VhtmlError(code, message, objectId ? { objectId } : {});
    }
  }

  warn(code: string, message: string, objectId?: string): void {
    this.bag.warning(code, message, objectId ? { objectId } : {});
  }

  time(value: TimeLike | undefined, label: string): Rational | undefined {
    if (value === undefined) return undefined;
    if (isRational(value)) return value;
    if (typeof value === 'number') {
      return rat(Math.round(value * 1e6), 1e6);
    }
    try {
      return parseTime(value, { frameRate: this.frameRate });
    } catch (error) {
      this.fail(ErrorCode.TIME_INVALID, `${label}: ${(error as Error).message}`);
      return undefined;
    }
  }

  apply(operation: EditOperation): void {
    switch (operation.op) {
      case 'batch':
        for (const child of operation.operations) this.apply(child);
        return;
      case 'project.set':
        this.projectSet(operation);
        return;
      case 'scene.set':
        this.sceneSet(operation);
        return;
      case 'asset.add':
        this.assetAdd(operation);
        return;
      case 'asset.remove':
        this.assetRemove(operation.assetId);
        return;
      case 'asset.set':
        this.assetSet(operation);
        return;
      case 'composition.set':
        this.compositionSet(operation.composition);
        return;
      case 'timeline.set':
        this.timelineSet(operation);
        return;
      case 'track.add':
        this.trackAdd(operation);
        return;
      case 'track.remove':
        this.trackRemove(operation.trackId);
        return;
      case 'track.set':
        this.trackSet(operation);
        return;
      case 'clip.add':
        this.clipAdd(operation);
        return;
      case 'clip.remove':
        this.clipRemove(operation.clipId, false);
        return;
      case 'clip.rippleDelete':
        this.clipRemove(operation.clipId, true);
        return;
      case 'clip.move':
        this.clipMove(operation);
        return;
      case 'clip.trim':
        this.clipTrim(operation);
        return;
      case 'clip.split':
        this.clipSplit(operation);
        return;
      case 'clip.slip':
        this.clipSlip(operation);
        return;
      case 'clip.slide':
        this.clipSlide(operation);
        return;
      case 'clip.roll':
        this.clipRoll(operation);
        return;
      case 'clip.speed':
        this.clipSpeed(operation);
        return;
      case 'clip.freeze':
        this.clipFreeze(operation);
        return;
      case 'clip.timeremap':
        this.clipTimeRemap(operation);
        return;
      case 'clip.timeremap.clear':
        this.clipTimeRemapClear(operation);
        return;
      case 'clip.duplicate':
        this.clipDuplicate(operation);
        return;
      case 'clip.splitMulti':
        this.clipSplitMulti(operation);
        return;
      case 'clip.detachAudio':
        this.clipDetachAudio(operation);
        return;
      case 'clip.replace':
        this.clipReplace(operation);
        return;
      case 'timeline.nest':
        this.timelineNest(operation);
        return;
      case 'timeline.unnest':
        this.timelineUnnest(operation);
        return;
      case 'timeline.rippleCut':
        this.timelineRippleCut(operation);
        return;
      case 'storyboard.apply':
        this.storyboardApply(operation);
        return;
      case 'timeline.insert':
        this.timelineInsert(operation);
        return;
      case 'timeline.overwrite':
        this.timelineOverwrite(operation);
        return;
      case 'clip.link':
        this.clipLink(operation);
        return;
      case 'clip.unlink':
        this.clipUnlink(operation);
        return;
      case 'timeline.moveBatch':
        this.timelineMoveBatch(operation);
        return;
      case 'timeline.copy':
        this.timelineCopy(operation, false);
        return;
      case 'timeline.cut':
        this.timelineCopy(operation, true);
        return;
      case 'timeline.paste':
        this.timelinePaste(operation);
        return;
      case 'clip.set':
        this.clipSet(operation);
        return;
      case 'transition.add':
        this.transitionAdd(operation);
        return;
      case 'transition.remove':
        this.transitionRemove(operation.transitionId);
        return;
      case 'animation.add':
        this.animationAdd(operation);
        return;
      case 'animation.remove':
        this.animationRemove(operation);
        return;
      case 'effect.add':
        this.effectAdd(operation);
        return;
      case 'effect.remove':
        this.effectRemove(operation);
        return;
      case 'marker.add':
        this.markerAdd(operation);
        return;
      case 'marker.remove':
        this.markerRemove(operation);
        return;
      case 'storyboard.add':
        this.storyboardAdd(operation);
        return;
      case 'storyboard.set':
        this.storyboardSet(operation);
        return;
      case 'storyboard.review':
        this.storyboardReview(operation);
        return;
      case 'storyboard.remove':
        this.storyboardRemove(operation.shotId);
        return;
      case 'storyboard.move':
        this.storyboardMove(operation.shotId, operation.to);
        return;
      case 'storyboard.reorder':
        this.storyboardReorder(operation.shotIds);
        return;
      default:
        this.fail(ErrorCode.EDIT_INVALID_OPERATION, `unknown edit operation "${(operation as { op: string }).op}"`);
    }
  }

  finish(): EditResult {
    reconcileTransitions(this.project, this.bag);
    return {
      project: this.project,
      ok: !this.bag.hasErrors,
      diagnostics: this.bag.items,
      changed: this.changed,
    };
  }

  private sceneSet(operation: Extract<EditOperation, { op: 'scene.set' }>): void {
    const scene = this.project.scenes.find((candidate) => candidate.id === operation.sceneId);
    if (!scene) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `scene "${operation.sceneId}" does not exist`);
      return;
    }
    if (operation.props.html !== undefined) scene.html = operation.props.html;
    if (operation.props.css !== undefined) scene.css = operation.props.css ?? undefined;
    if (operation.props.scripts !== undefined) scene.scripts = operation.props.scripts.length ? operation.props.scripts : undefined;
    if (operation.props.name !== undefined) scene.name = operation.props.name;
    if (operation.props.background !== undefined) scene.background = operation.props.background;
    if (operation.props.src !== undefined) scene.src = operation.props.src ?? undefined;
    this.changed.push(scene.id);
  }

  private assetAdd(operation: Extract<EditOperation, { op: 'asset.add' }>): void {
    const asset = structuredClone(operation.asset);
    if (!asset.id) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'asset.add requires an id');
      return;
    }
    if (idExists(this.project, asset.id)) {
      if (!operation.replace) {
        this.fail(ErrorCode.EDIT_CONFLICT, `id "${asset.id}" already exists`);
        return;
      }
      const index = this.project.assets.findIndex((candidate) => candidate.id === asset.id);
      if (index === -1) {
        this.fail(ErrorCode.EDIT_CONFLICT, `cannot replace non-asset id "${asset.id}"`);
        return;
      }
      this.project.assets[index] = asset;
    } else {
      this.project.assets.push(asset);
    }
    this.changed.push(asset.id);
  }

  private assetRemove(assetId: string): void {
    const asset = findAsset(this.project, assetId);
    if (!asset) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `asset "${assetId}" does not exist`);
      return;
    }
    const used = allClips(this.project).some(({ clip }) => {
      if (!clip.ref) return false;
      return clip.ref === assetId || clip.ref === `asset:${assetId}`;
    }) || this.project.generations.some((task) =>
      task.inputs.some((input) => input.ref === assetId || input.ref === `asset:${assetId}`),
    );
    if (used) {
      this.fail(ErrorCode.EDIT_CONFLICT, `asset "${assetId}" is still referenced; remove or relink references first`);
      return;
    }
    this.project.assets = this.project.assets.filter((candidate) => candidate.id !== assetId);
    this.changed.push(assetId);
  }

  private assetSet(operation: Extract<EditOperation, { op: 'asset.set' }>): void {
    const asset = findAsset(this.project, operation.assetId);
    if (!asset) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `asset "${operation.assetId}" does not exist`);
      return;
    }
    for (const [key, value] of Object.entries(operation.props)) {
      if (value === undefined) continue;
      (asset as unknown as Record<string, unknown>)[key] = value;
    }
    this.changed.push(asset.id);
  }

  private projectSet(operation: Extract<EditOperation, { op: 'project.set' }>): void {
    if (operation.title !== undefined) this.project.title = operation.title;
    if (operation.description !== undefined) this.project.description = operation.description;
    if (operation.lang !== undefined) this.project.lang = operation.lang;
    if (operation.seed !== undefined) this.project.composition.seed = operation.seed;
    if (operation.mainTimeline !== undefined) {
      if (!findTimeline(this.project, operation.mainTimeline)) {
        this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `timeline "${operation.mainTimeline}" does not exist`);
        return;
      }
      this.project.mainTimeline = operation.mainTimeline;
    }
    if (operation.composition) this.compositionSet(operation.composition);
    this.changed.push('project');
  }

  private compositionSet(composition: CompositionPatch): void {
    const target = this.project.composition;
    if (composition.width !== undefined) {
      if (!Number.isInteger(composition.width) || composition.width < 16 || composition.width > 16384) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'composition width must be an integer in 16–16384');
      } else target.width = composition.width;
    }
    if (composition.height !== undefined) {
      if (!Number.isInteger(composition.height) || composition.height < 16 || composition.height > 16384) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'composition height must be an integer in 16–16384');
      } else target.height = composition.height;
    }
    if (composition.frameRate !== undefined) {
      const rate: Rational = isRational(composition.frameRate)
        ? composition.frameRate
        : this.time(String(composition.frameRate), 'frameRate') ?? target.frameRate;
      if (rate.num <= 0) this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'frame rate must be positive');
      else target.frameRate = rate;
      this.frameRate = target.frameRate;
    }
    if (composition.duration !== undefined) {
      const duration = this.time(composition.duration, 'composition.duration');
      if (duration && gt(duration, ZERO)) target.duration = duration;
      else this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'composition duration must be positive');
    }
    if (composition.sampleRate !== undefined) {
      if (composition.sampleRate < 8000 || composition.sampleRate > 192000) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'sample rate must be 8000–192000');
      } else target.sampleRate = composition.sampleRate;
    }
    if (composition.channels !== undefined) {
      if (composition.channels < 1 || composition.channels > 8) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'channels must be 1–8');
      } else target.channels = composition.channels;
    }
    if (composition.background !== undefined) target.background = composition.background;
    if (composition.colorSpace !== undefined) target.colorSpace = composition.colorSpace;
    if (composition.seed !== undefined) target.seed = composition.seed;
    if (composition.deviceScaleFactor !== undefined) target.deviceScaleFactor = composition.deviceScaleFactor;
    this.changed.push('composition');
  }

  private timelineSet(operation: Extract<EditOperation, { op: 'timeline.set' }>): void {
    const timeline = findTimeline(this.project, operation.timelineId);
    if (!timeline) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `timeline "${operation.timelineId}" does not exist`);
      return;
    }
    if (operation.name !== undefined) timeline.name = operation.name;
    if (operation.duration !== undefined) {
      const duration = this.time(operation.duration, 'timeline.duration');
      if (!duration || !gt(duration, ZERO)) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'timeline duration must be positive');
        return;
      }
      const lastEnd = timeline.tracks.reduce(
        (max, track) => track.clips.reduce((inner, clip) => (gt(clipEnd(clip), inner) ? clipEnd(clip) : inner), max),
        ZERO,
      );
      if (lt(duration, lastEnd)) {
        this.fail(ErrorCode.EDIT_CONFLICT, 'timeline duration cannot be shorter than its clips; trim or ripple delete first');
        return;
      }
      timeline.duration = duration;
      if (timeline.id === this.project.mainTimeline) this.project.composition.duration = duration;
    }
    this.changed.push(timeline.id);
  }

  private trackAdd(operation: Extract<EditOperation, { op: 'track.add' }>): void {
    const timeline = findTimeline(this.project, operation.timelineId);
    if (!timeline) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `timeline "${operation.timelineId}" does not exist`);
      return;
    }
    const id = operation.track.id ?? uniqueId(this.project, `${operation.track.type}-lane`);
    if (findTrack(this.project, id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `lane id "${id}" already exists`);
      return;
    }
    const track: Track = {
      id,
      type: operation.track.type,
      name: operation.track.name,
      order: operation.track.order ?? timeline.tracks.length,
      enabled: operation.track.enabled ?? true,
      muted: operation.track.muted ?? false,
      locked: operation.track.locked ?? false,
      volume: operation.track.volume ?? 1,
      pan: operation.track.pan ?? 0,
      opacity: operation.track.opacity ?? 1,
      blend: operation.track.blend ?? 'normal',
      captionStyle: operation.track.captionStyle,
      clips: operation.track.clips ? structuredClone(operation.track.clips) : [],
      transitions: operation.track.transitions ? structuredClone(operation.track.transitions) : [],
      metadata: operation.track.metadata,
    };
    timeline.tracks.push(track);
    this.changed.push(id);
  }

  private trackRemove(trackId: string): void {
    const found = findTrack(this.project, trackId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${trackId}" does not exist`);
      return;
    }
    found.timeline.tracks = found.timeline.tracks.filter((track) => track.id !== trackId);
    this.changed.push(trackId);
  }

  private trackSet(operation: Extract<EditOperation, { op: 'track.set' }>): void {
    const found = findTrack(this.project, operation.trackId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.trackId}" does not exist`);
      return;
    }
    Object.assign(found.track, operation.props);
    this.changed.push(found.track.id);
  }

  private clipAdd(operation: Extract<EditOperation, { op: 'clip.add' }>): void {
    const found = findTrack(this.project, operation.trackId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.trackId}" does not exist`);
      return;
    }
    if (findClip(this.project, operation.clip.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `clip id "${operation.clip.id}" already exists`);
      return;
    }
    const clip = structuredClone(operation.clip);
    if (lt(clip.start, ZERO)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'clip start must not be negative');
      return;
    }
    if (!gt(clip.duration, ZERO)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'clip duration must be positive');
      return;
    }
    if (found.track.type === 'caption' && clip.kind !== 'caption') {
      this.fail(ErrorCode.EDIT_CONFLICT, 'caption lanes accept only cue clips');
      return;
    }
    if (found.track.type === 'audio' && clip.kind !== 'audio' && clip.kind !== 'video') {
      this.fail(ErrorCode.EDIT_CONFLICT, 'audio lanes accept only audio or video clips');
      return;
    }
    if (found.track.type === 'data' && clip.kind !== 'data') {
      this.fail(ErrorCode.EDIT_CONFLICT, 'data lanes accept only data clips');
      return;
    }
    found.track.clips.push(clip);
    ensureExtent(this.project, found.timeline, clipEnd(clip), this.autoExtend);
    this.changed.push(clip.id);
  }

  private clipRemove(clipId: string, ripple: boolean): void {
    const found = locate(this.project, clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${clipId}" does not exist`);
      return;
    }
    const { track, clip, timeline } = found;
    const removedEnd = clipEnd(clip);
    track.clips = track.clips.filter((candidate) => candidate.id !== clipId);
    track.transitions = track.transitions.filter(
      (transition) => transition.fromClipId !== clipId && transition.toClipId !== clipId,
    );
    if (ripple) {
      for (const other of track.clips) {
        if (gte(other.start, removedEnd)) {
          other.start = sub(other.start, clip.duration);
          if (lt(other.start, ZERO)) other.start = ZERO;
        }
      }
    }
    void timeline;
    this.changed.push(clipId);
  }

  private clipMove(operation: Extract<EditOperation, { op: 'clip.move' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const locatedStart = toNumber(found.clip.start);
    const start = this.time(operation.start, 'clip.start');
    if (operation.start !== undefined && !start) return;
    if (start && lt(start, ZERO)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'clip start must not be negative');
      return;
    }
    if (operation.trackId && operation.trackId !== found.track.id) {
      const destination = findTrack(this.project, operation.trackId);
      if (!destination) {
        this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.trackId}" does not exist`);
        return;
      }
      if (destination.timeline.id !== found.timeline.id) {
        this.fail(ErrorCode.EDIT_CONFLICT, 'clips cannot move between timelines with clip.move; remove and add instead');
        return;
      }
      if (destination.track.type === 'caption' && found.clip.kind !== 'caption') {
        this.fail(ErrorCode.EDIT_CONFLICT, 'caption lanes accept only cue clips');
        return;
      }
      if (destination.track.type === 'audio' && found.clip.kind !== 'audio' && found.clip.kind !== 'video') {
        this.fail(ErrorCode.EDIT_CONFLICT, 'audio lanes accept only audio or video clips');
        return;
      }
      found.track.clips = found.track.clips.filter((clip) => clip.id !== found.clip.id);
      found.track.transitions = found.track.transitions.filter(
        (transition) => transition.fromClipId !== found.clip.id && transition.toClipId !== found.clip.id,
      );
      destination.track.clips.push(found.clip);
      found.track = destination.track;
    }
    if (start) found.clip.start = start;
    ensureExtent(this.project, found.timeline, clipEnd(found.clip), this.autoExtend);
    // Linked clips (see clip.link) follow the primary's start delta.
    const linkId = found.clip.metadata?.linkId;
    if (linkId && operation.start !== undefined) {
      const primaryBefore = locatedStart;
      const delta = toNumber(found.clip.start) - primaryBefore;
      if (delta !== 0) {
        for (const sibling of allClips(this.project)) {
          if (
            sibling.clip.id !== found.clip.id &&
            sibling.timeline.id === found.timeline.id &&
            sibling.clip.metadata?.linkId === linkId
          ) {
            sibling.clip.start = rat(Math.round((toNumber(sibling.clip.start) + delta) * 1_000_000), 1_000_000);
            ensureExtent(this.project, sibling.timeline, clipEnd(sibling.clip), this.autoExtend);
            this.changed.push(sibling.clip.id);
          }
        }
      }
    }
    this.changed.push(found.clip.id);
  }

  private clipTrim(operation: Extract<EditOperation, { op: 'clip.trim' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const clip = found.clip;
    const oldStart = clip.start;
    const oldEnd = clipEnd(clip);
    const requestedStart = this.time(operation.start, 'trim.start');
    const requestedEnd = this.time(operation.end, 'trim.end');
    const requestedDuration = this.time(operation.duration, 'trim.duration');
    if (operation.start !== undefined && !requestedStart) return;
    if (operation.end !== undefined && !requestedEnd) return;
    if (operation.duration !== undefined && !requestedDuration) return;
    let newStart = requestedStart ?? oldStart;
    let newEnd = requestedEnd ?? (requestedDuration ? add(newStart, requestedDuration) : oldEnd);
    if (requestedDuration && !requestedEnd) newEnd = add(newStart, requestedDuration);
    if (!gt(newEnd, newStart)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'trimmed clip must have a positive duration');
      return;
    }
    if (lt(newStart, ZERO)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'clip start must not be negative');
      return;
    }
    const oldDuration = clip.duration;
    const newDuration = sub(newEnd, newStart);
    const deltaStart = sub(newStart, oldStart);

    if (isTimeBearing(clip) && !clip.freeze) {
      const sourceDuration = sourceDurationOf(this.project, clip);
      const speed = clip.speed;
      if (clip.reverse) {
        const oldOut = clipOut(clip);
        const newOut = sub(oldOut, mul(deltaStart, speed));
        const newIn = sub(newOut, mul(newDuration, speed));
        if (lt(newIn, ZERO)) {
          this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'trim exposes media before the start of the source');
          return;
        }
        if (sourceDuration && gt(newOut, sourceDuration)) {
          this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'trim exceeds the end of the source media');
          return;
        }
        clip.sourceIn = newIn;
        clip.sourceOut = newOut;
      } else {
        const newIn = add(clip.sourceIn, mul(deltaStart, speed));
        const newOut = add(newIn, mul(newDuration, speed));
        if (lt(newIn, ZERO)) {
          this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'trim exposes media before the start of the source');
          return;
        }
        if (sourceDuration && gt(newOut, sourceDuration)) {
          this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'trim exceeds the end of the source media');
          return;
        }
        clip.sourceIn = newIn;
        clip.sourceOut = newOut;
      }
    } else if (clip.kind === 'scene') {
      clip.sourceIn = add(clip.sourceIn, deltaStart);
      if (lt(clip.sourceIn, ZERO)) clip.sourceIn = ZERO;
    }
    clip.start = newStart;
    clip.duration = newDuration;
    ensureExtent(this.project, found.timeline, clipEnd(clip), this.autoExtend);
    void oldDuration;
    this.changed.push(clip.id);
  }

  private clipSplit(operation: Extract<EditOperation, { op: 'clip.split' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const at = this.time(operation.at, 'split.at');
    if (!at) return;
    const { clip, track, timeline } = found;
    if (!gt(at, clip.start) || !lt(at, clipEnd(clip))) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'split time must be strictly inside the clip');
      return;
    }
    const leftDuration = sub(at, clip.start);
    const rightDuration = sub(clipEnd(clip), at);
    const rightId = operation.id ?? uniqueId(this.project, `${clip.id}-b`);
    if (findClip(this.project, rightId)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `clip id "${rightId}" already exists`);
      return;
    }
    const left = clip;
    const right = structuredClone(clip);
    right.id = rightId;
    right.start = at;
    right.duration = rightDuration;
    left.duration = leftDuration;
    // Fades are durations measured from each end. A piece inherits both of
    // the original's fades, so when their sum exceeds the piece duration they
    // scale down proportionally (fadeIn + fadeOut <= duration is validated).
    for (const piece of [left, right]) {
      const pieceDuration = piece === left ? leftDuration : rightDuration;
      const inFade = piece.fadeIn;
      const outFade = piece.fadeOut;
      if (inFade && outFade) {
        const fadeSum = add(inFade, outFade);
        if (gt(fadeSum, pieceDuration)) {
          const scale = div(pieceDuration, fadeSum);
          piece.fadeIn = mul(inFade, scale);
          piece.fadeOut = mul(outFade, scale);
        }
      } else if (outFade) {
        if (gt(outFade, pieceDuration)) piece.fadeOut = pieceDuration;
      } else if (inFade) {
        if (gt(inFade, pieceDuration)) piece.fadeIn = pieceDuration;
      }
    }

    if (clip.timeRemap?.keyframes.length) {
      // Split the remap curve at the cut. Source offsets are relative to
      // sourceIn, so the right half absorbs the boundary source position into
      // its own sourceIn and shifts its curve by -boundary.
      const boundary = sampleTimeRemap(clip.timeRemap, leftDuration);
      left.sourceIn = clip.sourceIn;
      right.sourceIn = add(clip.sourceIn, boundary);
      left.timeRemap = {
        keyframes: [
          ...clip.timeRemap.keyframes.filter((keyframe) => lt(keyframe.at, leftDuration)),
          { at: leftDuration, source: boundary, easing: undefined },
        ],
        easing: clip.timeRemap.easing,
      };
      right.timeRemap = {
        keyframes: [
          { at: ZERO, source: ZERO, easing: undefined },
          ...clip.timeRemap.keyframes
            .filter((keyframe) => gt(keyframe.at, leftDuration))
            .map((keyframe) => ({
              at: sub(keyframe.at, leftDuration),
              source: sub(keyframe.source, boundary),
              easing: keyframe.easing,
            })),
        ],
        easing: clip.timeRemap.easing,
      };
      left.sourceOut = undefined;
      right.sourceOut = undefined;
    } else if (isTimeBearing(clip) && !clip.freeze) {
      const oldIn = clip.sourceIn;
      const oldOut = clipOut(clip);
      const speed = clip.speed;
      if (clip.reverse) {
        const splitSource = sub(oldOut, mul(leftDuration, speed));
        left.sourceIn = splitSource;
        left.sourceOut = oldOut;
        right.sourceIn = oldIn;
        right.sourceOut = splitSource;
      } else {
        const splitSource = add(oldIn, mul(leftDuration, speed));
        left.sourceIn = oldIn;
        left.sourceOut = splitSource;
        right.sourceIn = splitSource;
        right.sourceOut = oldOut;
      }
    } else if (clip.kind === 'scene' || clip.kind === 'timeline') {
      right.sourceIn = add(clip.sourceIn, leftDuration);
    }

    const reserved = new Set<string>();
    const animations = splitAnimations(this.project, clip.animations, leftDuration, reserved);
    left.animations = animations.left;
    right.animations = animations.right;
    // Animation copies must re-target the new piece, and copied effect ids
    // must be derived-unique (the left piece keeps the originals) — mirrors
    // the clipDuplicate convention.
    for (const animation of right.animations) animation.clipId = right.id;
    const effectSuffix = `-of-${right.id}`;
    for (const effect of right.effects) effect.id = `${effect.id}${effectSuffix}`;
    for (const effect of right.audioEffects) effect.id = `${effect.id}${effectSuffix}`;

    for (const transition of track.transitions) {
      if (transition.fromClipId === clip.id) transition.fromClipId = right.id;
    }
    track.clips.push(right);
    ensureExtent(this.project, timeline, clipEnd(right), this.autoExtend);
    this.changed.push(left.id, right.id);
  }

  private clipTimeRemap(operation: Extract<EditOperation, { op: 'clip.timeremap' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const keyframes: TimeRemapKeyframe[] = [];
    for (const keyframe of operation.keyframes) {
      const at = this.time(keyframe.at, 'timeremap.at');
      const source = this.time(keyframe.source, 'timeremap.source');
      if (!at || !source) return;
      keyframes.push({ at, source, easing: keyframe.easing });
    }
    keyframes.sort((a, b) => (lt(a.at, b.at) ? -1 : gt(a.at, b.at) ? 1 : 0));
    for (let index = 1; index < keyframes.length; index += 1) {
      if (!lt(keyframes[index - 1]!.at, keyframes[index]!.at)) {
        this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'time remap keyframes must have strictly increasing times');
        return;
      }
    }
    if (!keyframes.length) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'time remap requires at least one keyframe');
      return;
    }
    found.clip.timeRemap = { keyframes, easing: operation.easing ?? 'linear' };
    found.clip.freeze = undefined;
    this.changed.push(found.clip.id);
  }

  private clipTimeRemapClear(operation: Extract<EditOperation, { op: 'clip.timeremap.clear' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    if (!found.clip.timeRemap) {
      this.warn(ErrorCode.EDIT_INVALID_OPERATION, `clip "${found.clip.id}" has no time remap`, found.clip.id);
      return;
    }
    found.clip.timeRemap = undefined;
    this.changed.push(found.clip.id);
  }

  private clipDuplicate(operation: Extract<EditOperation, { op: 'clip.duplicate' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const newId = operation.id ?? uniqueId(this.project, `${found.clip.id}-copy`);
    if (findClip(this.project, newId)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `clip id "${newId}" already exists`);
      return;
    }
    const copy = structuredClone(found.clip);
    copy.id = newId;
    copy.start = operation.start !== undefined ? this.time(operation.start, 'duplicate.start') ?? copy.start : clipEnd(found.clip);
    // Deterministic unique ids for copied animations/effects follow the clip id.
    const suffix = `-of-${newId}`;
    for (const animation of copy.animations) animation.id = `${animation.id}${suffix}`;
    for (const effect of [...copy.effects, ...copy.audioEffects]) effect.id = `${effect.id}${suffix}`;
    found.track.clips.push(copy);
    ensureExtent(this.project, found.timeline, clipEnd(copy), this.autoExtend);
    this.changed.push(newId);
  }

  private clipSplitMulti(operation: Extract<EditOperation, { op: 'clip.splitMulti' }>): void {
    if (!operation.times.length) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'splitMulti requires at least one time');
      return;
    }
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    // Split at increasing absolute project times. clip.split takes the project
    // time directly, and each split's right side becomes the next target, so a
    // single pass produces N+1 segments with stable caller-chosen ids.
    const points = operation.times
      .map((time) => this.time(time, 'splitMulti.times'))
      .filter((time): time is Rational => time !== undefined)
      .sort((a, b) => toNumber(a) - toNumber(b));
    let currentId = operation.clipId;
    let previous = toNumber(found.clip.start);
    let segmentIndex = 1;
    for (const at of points) {
      const current = locate(this.project, currentId);
      if (!current) {
        this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${currentId}" does not exist`);
        return;
      }
      const atNumber = toNumber(at);
      if (!gt(at, current.clip.start) || !lt(at, clipEnd(current.clip))) {
        this.warn(
          ErrorCode.EDIT_OUT_OF_BOUNDS,
          `splitMulti time ${atNumber}s is not inside segment "${currentId}" (${toNumber(current.clip.start)}..${toNumber(clipEnd(current.clip))}s); skipped`,
          currentId,
        );
        continue;
      }
      void previous;
      const nextId = operation.ids?.[segmentIndex - 1] ?? uniqueId(this.project, `${operation.clipId}-s${segmentIndex}`);
      if (findClip(this.project, nextId)) {
        this.fail(ErrorCode.EDIT_CONFLICT, `clip id "${nextId}" already exists`);
        return;
      }
      this.apply({ op: 'clip.split', clipId: currentId, at, id: nextId });
      segmentIndex += 1;
      currentId = nextId;
    }
  }

  private clipDetachAudio(operation: Extract<EditOperation, { op: 'clip.detachAudio' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const { clip, track, timeline } = found;
    if (clip.kind !== 'video') {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, `detachAudio applies to video clips, not "${clip.kind}"`);
      return;
    }
    let audioLane = timeline.tracks.find((candidate) => candidate.id === operation.laneId);
    if (operation.laneId && !audioLane) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.laneId}" does not exist`);
      return;
    }
    if (!audioLane) {
      audioLane = timeline.tracks.find((candidate) => candidate.type === 'audio');
    }
    if (!audioLane) {
      audioLane = {
        id: uniqueId(this.project, 'audio'),
        type: 'audio',
        name: 'Audio',
        order: timeline.tracks.length,
        enabled: true,
        muted: false,
        locked: false,
        volume: 1,
        pan: 0,
        opacity: 1,
        blend: 'normal',
        clips: [],
        transitions: [],
      };
      timeline.tracks.push(audioLane);
    }
    const audioId = uniqueId(this.project, `${clip.id}-audio`);
    const audioClip = structuredClone(clip);
    audioClip.id = audioId;
    audioClip.kind = 'audio';
    audioClip.muted = false;
    audioClip.metadata = { ...(clip.metadata ?? {}), detachedFrom: clip.id };
    (audioClip as { loop?: boolean }).loop = undefined;
    audioLane.clips.push(audioClip);
    clip.muted = true;
    clip.metadata = { ...(clip.metadata ?? {}), audioDetachedTo: audioId };
    this.changed.push(clip.id, audioId);
  }

  private clipReplace(operation: Extract<EditOperation, { op: 'clip.replace' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const { clip } = found;
    if (clip.kind === 'caption' || clip.kind === 'data') {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, `replace does not apply to ${clip.kind} clips`);
      return;
    }
    const resolved = resolveReference(this.project, operation.ref);
    if (!resolved) {
      this.fail(ErrorCode.REFERENCE_NOT_FOUND, `replace ref "${operation.ref}" does not exist`);
      return;
    }
    const keepTiming = operation.keepTiming ?? 'in-out';
    const audioKinds = ['audio', 'video'];
    const visualMediaKinds = ['video', 'image', 'svg'];
    const resolvedKind = resolved.kind === 'asset' ? resolved.asset.kind : undefined;
    const targetKind = clip.kind;
    const compatible =
      resolved.kind === 'asset'
        ? targetKind === 'audio'
          ? audioKinds.includes(resolvedKind ?? '')
          : visualMediaKinds.includes(resolvedKind ?? '')
        : resolved.kind === 'generation' || resolved.kind === 'scene';
    if (!compatible) {
      this.fail(ErrorCode.REFERENCE_INCOMPATIBLE, `clip "${clip.id}" (${targetKind}) cannot be replaced by "${operation.ref}" (${resolved.kind}${resolvedKind ? ` ${resolvedKind}` : ''})`);
      return;
    }
    clip.ref = operation.ref.startsWith('gen:') || operation.ref.includes(':') || findAsset(this.project, operation.ref) ? (resolved.kind === 'asset' ? operation.ref : operation.ref) : operation.ref;
    clip.freeze = undefined;
    clip.timeRemap = undefined;
    const sourceDuration = resolved.kind === 'asset' ? resolved.asset.duration : resolved.kind === 'generation' ? resolved.task.constraints.duration : undefined;
    if (keepTiming === 'project') {
      clip.sourceIn = ZERO;
      clip.sourceOut = undefined;
      if (sourceDuration && gt(mul(clip.duration, clip.speed), sourceDuration)) {
        this.warn(ErrorCode.TIME_OUT_OF_SOURCE, `clip "${clip.id}" duration exceeds the new source; retime or trim`, clip.id);
      }
    } else {
      // Keep the source window; clamp to the new source length when known.
      const window = sub(clipOut(clip), clip.sourceIn);
      if (sourceDuration && gt(add(clip.sourceIn, window), sourceDuration)) {
        const clamped = sub(sourceDuration, clip.sourceIn);
        this.warn(ErrorCode.TIME_OUT_OF_SOURCE, `clip "${clip.id}" source window clamped from ${fmt(window)} to ${fmt(clamped)} by the new source`, clip.id);
        clip.sourceOut = add(clip.sourceIn, clamped);
        clip.duration = div(clamped, clip.speed);
      }
    }
    if (resolved.kind === 'asset' && resolvedKind === 'svg' && clip.kind === 'image') clip.kind = 'svg';
    if (resolved.kind === 'asset' && resolvedKind === 'image' && clip.kind === 'svg') clip.kind = 'image';
    this.changed.push(clip.id);
  }

  private timelineNest(operation: Extract<EditOperation, { op: 'timeline.nest' }>): void {
    if (operation.clipIds.length === 0) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'timeline.nest requires at least one clip');
      return;
    }
    // Defensive dedupe: repeated ids in the selection would nest one clip twice.
    const seenIds = new Set<string>();
    const clipIds = operation.clipIds.filter((clipId) => (seenIds.has(clipId) ? false : (seenIds.add(clipId), true)));
    const located = clipIds.map((clipId) => locate(this.project, clipId));
    const missing = clipIds.find((_, index) => !located[index]);
    if (missing) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${missing}" does not exist`);
      return;
    }
    const { timeline } = located[0]!;
    if (located.some((found) => found!.timeline.id !== timeline.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, 'timeline.nest requires all clips on the same timeline');
      return;
    }
    const clips = located.map((found) => found!.clip);
    const start = clips.reduce((min, clip) => (lt(clip.start, min) ? clip.start : min), clips[0]!.start);
    const end = clips.reduce((max, clip) => (gt(clipEnd(clip), max) ? clipEnd(clip) : max), clips[0]!.start);
    if (!gt(end, start)) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'nest range is empty');
      return;
    }
    const subTimelineId = operation.timelineId ?? uniqueId(this.project, 'nested');
    if (findTimeline(this.project, subTimelineId)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `timeline "${subTimelineId}" already exists`);
      return;
    }
    const nestClipId = operation.clipId ?? uniqueId(this.project, 'compound');
    if (findClip(this.project, nestClipId)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `clip id "${nestClipId}" already exists`);
      return;
    }
    const removeSource = operation.removeSource ?? true;
    const subTimeline: Timeline = {
      id: subTimelineId,
      duration: sub(end, start),
      tracks: [],
      markers: [],
    };
    const tracksById = new Map<string, Track>();
    for (const found of located) {
      const source = found!;
      const key = source.track.id;
      let subTrack = tracksById.get(key);
      if (!subTrack) {
        subTrack = structuredClone(source.track);
        subTrack.clips = [];
        subTrack.transitions = [];
        subTrack.id = `${source.track.id}-${subTimelineId}`;
        subTrack.name = source.track.name ?? source.track.id;
        tracksById.set(key, subTrack);
        subTimeline.tracks.push(subTrack);
      }
      const nestedClip = structuredClone(source.clip);
      nestedClip.start = sub(source.clip.start, start);
      if (nestedClip.kind === 'timeline' && nestedClip.ref === `timeline:${subTimelineId}`) {
        this.fail(ErrorCode.REFERENCE_CYCLE, 'nest would create a self-referencing timeline');
        return;
      }
      subTrack.clips.push(nestedClip);
      if (removeSource) {
        const index = source.track.clips.indexOf(source.clip);
        if (index !== -1) source.track.clips.splice(index, 1);
        source.track.transitions = source.track.transitions.filter(
          (transition) => transition.fromClipId !== source.clip.id && transition.toClipId !== source.clip.id,
        );
      }
    }
    this.project.timelines.push(subTimeline);
    const compoundLane = located[0]!.track;
    const compound = makeClipBase({ id: nestClipId, kind: 'timeline', start: { num: start.num, den: start.den }, duration: sub(end, start) }) as TimelineClip;
    compound.ref = `timeline:${subTimelineId}`;
    compound.loop = false;
    compoundLane.clips.push(compound);
    ensureExtent(this.project, timeline, clipEnd(compound), this.autoExtend);
    this.changed.push(nestClipId);
  }

  private timelineInsert(operation: Extract<EditOperation, { op: 'timeline.insert' }>): void {
    const found = findTrack(this.project, operation.laneId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.laneId}" does not exist`);
      return;
    }
    const { timeline, track } = found;
    const at = operation.at !== undefined ? this.time(operation.at, 'insert.at') : laneEnd(track);
    if (!at) return;
    const newClip = structuredClone(operation.clip);
    const clipStart = at;
    const clipStop = add(clipStart, newClip.duration);
    const shift = toNumber(newClip.duration);
    // Push everything from `at` (inclusive of the split tail) to the right.
    for (const clip of [...track.clips].sort((a, b) => toNumber(a.start) - toNumber(b.start))) {
      if (gte(clip.start, at)) {
        clip.start = rat(Math.round((toNumber(clip.start) + shift) * 1_000_000), 1_000_000);
      } else if (gt(clipEnd(clip), at)) {
        // Clip spans the insert point: split at `at` and push the tail.
        const rightId = uniqueId(this.project, `${clip.id}-push`);
        this.apply({ op: 'clip.split', clipId: clip.id, at, id: rightId });
        const pushed = track.clips.find((candidate) => candidate.id === rightId)!;
        pushed.start = rat(Math.round((toNumber(pushed.start) + shift) * 1_000_000), 1_000_000);
      }
    }
    newClip.start = clipStart;
    track.clips.push(newClip);
    ensureExtent(this.project, timeline, clipStop, this.autoExtend);
    this.changed.push(newClip.id);
  }

  private timelineOverwrite(operation: Extract<EditOperation, { op: 'timeline.overwrite' }>): void {
    const found = findTrack(this.project, operation.laneId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.laneId}" does not exist`);
      return;
    }
    const { timeline, track } = found;
    const at = operation.at !== undefined ? this.time(operation.at, 'overwrite.at') : laneEnd(track);
    if (!at) return;
    const newClip = structuredClone(operation.clip);
    newClip.start = at;
    const clipStop = add(at, newClip.duration);
    // Clear the target range: trim spanning clips at both edges and remove
    // fully contained ones (non-ripple; later content stays in place).
    for (const clip of [...track.clips]) {
      const clipStart = clip.start;
      const clipStopExisting = clipEnd(clip);
      if (!gt(clipStopExisting, at) || !lt(clipStart, clipStop)) continue;
      if (!gt(clipStart, at) && !lt(clipStopExisting, clipStop)) {
        if (eq(clipStart, at) && eq(clipStopExisting, clipStop)) {
          // Exact fit: the new clip replaces this one entirely.
          track.clips = track.clips.filter((candidate) => candidate.id !== clip.id);
          track.transitions = track.transitions.filter(
            (transition) => transition.fromClipId !== clip.id && transition.toClipId !== clip.id,
          );
          continue;
        }
        // Clip spans beyond both edges: keep head and tail, remove the middle.
        const tailId = uniqueId(this.project, `${clip.id}-tail`);
        this.apply({ op: 'clip.split', clipId: clip.id, at: clipStop, id: tailId });
        const middleId = uniqueId(this.project, `${clip.id}-mid`);
        this.apply({ op: 'clip.split', clipId: clip.id, at, id: middleId });
        this.apply({ op: 'clip.remove', clipId: middleId });
        continue;
      }
      if (eq(clipStart, at)) {
        // Clip starts exactly at the range: remove or trim its tail.
        if (lt(clipStopExisting, clipStop)) {
          track.clips = track.clips.filter((candidate) => candidate.id !== clip.id);
          track.transitions = track.transitions.filter(
            (transition) => transition.fromClipId !== clip.id && transition.toClipId !== clip.id,
          );
        } else {
          const rightId = uniqueId(this.project, `${clip.id}-keep`);
          this.apply({ op: 'clip.split', clipId: clip.id, at: clipStop, id: rightId });
          this.apply({ op: 'clip.remove', clipId: clip.id });
        }
        continue;
      }
      if (eq(clipStopExisting, clipStop)) {
        // Clip ends exactly at the range: trim its head via split+remove.
        const rightId = uniqueId(this.project, `${clip.id}-keep`);
        this.apply({ op: 'clip.split', clipId: clip.id, at: clipStart, id: rightId });
        this.apply({ op: 'clip.remove', clipId: clip.id });
        continue;
      }
      if (!gt(clipStart, at)) {
        // Head before the range: trim the tail.
        this.apply({ op: 'clip.trim', clipId: clip.id, duration: sub(at, clipStart) });
      } else if (!lt(clipStopExisting, clipStop)) {
        // Tail after the range: split at the end, remove the head part.
        const rightId = uniqueId(this.project, `${clip.id}-keep`);
        this.apply({ op: 'clip.split', clipId: clip.id, at: clipStop, id: rightId });
        this.apply({ op: 'clip.remove', clipId: clip.id });
      } else {
        // Fully inside.
        this.apply({ op: 'clip.remove', clipId: clip.id });
      }
    }
    track.clips.push(newClip);
    ensureExtent(this.project, timeline, clipStop, this.autoExtend);
    this.changed.push(newClip.id);
  }

  private clipLink(operation: Extract<EditOperation, { op: 'clip.link' }>): void {
    if (operation.clipIds.length < 2) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'clip.link requires at least two clips');
      return;
    }
    const located = operation.clipIds.map((clipId) => locate(this.project, clipId));
    const missing = operation.clipIds.find((_, index) => !located[index]);
    if (missing) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${missing}" does not exist`);
      return;
    }
    if (located.some((found) => found!.timeline.id !== located[0]!.timeline.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, 'clip.link requires all clips on the same timeline');
      return;
    }
    const linkId = uniqueId(this.project, 'link');
    for (const found of located) {
      const clip = found!.clip;
      clip.metadata = { ...(clip.metadata ?? {}), linkId };
      this.changed.push(clip.id);
    }
  }

  private clipUnlink(operation: Extract<EditOperation, { op: 'clip.unlink' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const linkId = found.clip.metadata?.linkId;
    if (!linkId) {
      this.warn(ErrorCode.EDIT_INVALID_OPERATION, `clip "${found.clip.id}" is not linked`, found.clip.id);
      return;
    }
    for (const { clip } of allClips(this.project)) {
      if (clip.metadata?.linkId === linkId) {
        const metadata = { ...(clip.metadata ?? {}) };
        delete metadata.linkId;
        clip.metadata = metadata;
        this.changed.push(clip.id);
      }
    }
  }

  private timelineMoveBatch(operation: Extract<EditOperation, { op: 'timeline.moveBatch' }>): void {
    if (!operation.clipIds.length) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'moveBatch requires at least one clip');
      return;
    }
    const start = this.time(operation.start, 'moveBatch.start');
    if (!start) return;
    const located = operation.clipIds.map((clipId) => locate(this.project, clipId));
    const missing = operation.clipIds.find((_, index) => !located[index]);
    if (missing) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${missing}" does not exist`);
      return;
    }
    if (located.some((found) => found!.timeline.id !== located[0]!.timeline.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, 'moveBatch requires all clips on the same timeline');
      return;
    }
    // Premiere-style group drag: the earliest selected clip lands exactly on
    // `start`; every other selected clip keeps its relative offset.
    const anchor = located.reduce(
      (min, found) => (lt(found!.clip.start, min) ? found!.clip.start : min),
      located[0]!.clip.start,
    );
    const delta = toNumber(sub(start, anchor));
    if (delta === 0) {
      this.warn(ErrorCode.EDIT_CONFLICT, 'moveBatch delta is zero; nothing moved');
      return;
    }
    // Move the earliest clip first so downstream linked propagation and
    // extent bookkeeping see deterministic intermediate states.
    for (const found of [...located].sort((a, b) => toNumber(a!.clip.start) - toNumber(b!.clip.start))) {
      this.apply({
        op: 'clip.move',
        clipId: found!.clip.id,
        start: rat(Math.round((toNumber(found!.clip.start) + delta) * 1_000_000), 1_000_000),
      });
    }
  }

  private timelineCopy(operation: Extract<EditOperation, { op: 'timeline.copy' | 'timeline.cut' }>, cut: boolean): void {
    if (!operation.clipIds.length) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'copy/cut requires at least one clip');
      return;
    }
    const located = operation.clipIds.map((clipId) => locate(this.project, clipId));
    const missing = operation.clipIds.find((_, index) => !located[index]);
    if (missing) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${missing}" does not exist`);
      return;
    }
    if (located.some((found) => found!.timeline.id !== located[0]!.timeline.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, 'copy/cut requires all clips on the same timeline');
      return;
    }
    const ordered = [...located].sort((a, b) => toNumber(a!.clip.start) - toNumber(b!.clip.start));
    const origin = ordered[0]!.clip.start;
    EDITOR_CLIPBOARD.entries = ordered.map((found) => ({
      clip: structuredClone(found!.clip),
      laneType: found!.track.type,
      offsetFromFirst: sub(found!.clip.start, origin),
    }));
    if (cut) {
      for (const clipId of operation.clipIds) {
        this.apply({ op: 'clip.rippleDelete', clipId });
      }
    }
    this.changed.push(`clipboard:${cut ? 'cut' : 'copy'}:${operation.clipIds.length}`);
  }

  private timelinePaste(operation: Extract<EditOperation, { op: 'timeline.paste' }>): void {
    const entries = EDITOR_CLIPBOARD.entries;
    if (!entries?.length) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'clipboard is empty; copy or cut clips first');
      return;
    }
    const timeline = findTimeline(this.project, this.project.mainTimeline) ?? this.project.timelines[0];
    if (!timeline) {
      this.fail(ErrorCode.VALIDATION_EMPTY_TIMELINE, 'project has no timeline');
      return;
    }
    const anchor = operation.at !== undefined ? this.time(operation.at, 'paste.at') : playheadHint(this.project);
    if (!anchor) return;
    const idPrefix = operation.idPrefix ?? 'pasted';
    const pasted: string[] = [];
    const mode = operation.mode ?? 'insert';
    for (const [index, entry] of entries.entries()) {
      let lane = operation.laneId
        ? timeline.tracks.find((candidate) => candidate.id === operation.laneId && candidate.type === entry.laneType)
        : timeline.tracks.find((candidate) => candidate.type === entry.laneType);
      if (!lane) {
        lane = {
          id: uniqueId(this.project, entry.laneType),
          type: entry.laneType,
          name: entry.laneType,
          order: timeline.tracks.length,
          enabled: true,
          muted: false,
          locked: false,
          volume: 1,
          pan: 0,
          opacity: 1,
          blend: 'normal',
          clips: [],
          transitions: [],
        };
        timeline.tracks.push(lane);
      }
      const newId = `${idPrefix}-${index + 1}`;
      if (findClip(this.project, newId)) {
        this.fail(ErrorCode.EDIT_CONFLICT, `clip id "${newId}" already exists`);
        return;
      }
      const clip = structuredClone(entry.clip);
      clip.id = newId;
      clip.start = rat(Math.round((toNumber(anchor) + toNumber(entry.offsetFromFirst)) * 1_000_000), 1_000_000);
      clip.animations = clip.animations.map((animation) => ({ ...animation, id: `${animation.id}-of-${newId}` }));
      for (const effect of [...clip.effects, ...clip.audioEffects]) effect.id = `${effect.id}-of-${newId}`;
      const metadata = { ...(clip.metadata ?? {}) };
      delete metadata.linkId;
      clip.metadata = metadata;
      if (mode === 'overwrite') {
        this.apply({ op: 'timeline.overwrite', laneId: lane.id, at: clip.start, clip });
      } else if (mode === 'add') {
        lane.clips.push(clip);
        ensureExtent(this.project, timeline, add(clip.start, clip.duration), this.autoExtend);
      } else {
        this.apply({ op: 'timeline.insert', laneId: lane.id, at: clip.start, clip });
      }
      pasted.push(newId);
    }
    this.changed.push(...pasted);
  }

  private timelineUnnest(operation: Extract<EditOperation, { op: 'timeline.unnest' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const compound = found.clip;
    if (compound.kind !== 'timeline') {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, `clip "${compound.id}" is not a nested timeline clip`);
      return;
    }
    if (toNumber(compound.speed) !== 1 || compound.reverse || compound.freeze || compound.timeRemap || (compound as { loop?: boolean }).loop) {
      this.fail(
        ErrorCode.EDIT_INVALID_OPERATION,
        `unnest requires a 1x forward compound clip without freeze/remap/loop; retime after unnesting`,
      );
      return;
    }
    const resolved = compound.ref ? resolveReference(this.project, compound.ref) : undefined;
    if (!resolved || resolved.kind !== 'timeline') {
      this.fail(ErrorCode.REFERENCE_NOT_FOUND, `compound clip "${compound.id}" references missing timeline "${compound.ref}"`);
      return;
    }
    const subTimeline = resolved.timeline;
    const suffix = `-${subTimeline.id}`;
    const offset = toNumber(compound.start);
    let moved = 0;
    for (const subTrack of subTimeline.tracks) {
      // Map a sub lane back to the parent lane: strip the nest lane suffix,
      // otherwise create/reuse a lane named after the compound clip.
      const baseLaneId = subTrack.id.endsWith(suffix)
        ? subTrack.id.slice(0, subTrack.id.length - suffix.length)
        : `${compound.id}-${subTrack.type}`;
      let parentLane = found.timeline.tracks.find((candidate) => candidate.id === baseLaneId);
      if (!parentLane) {
        parentLane = {
          id: uniqueId(this.project, baseLaneId),
          type: subTrack.type,
          name: subTrack.name ?? baseLaneId,
          order: subTrack.order,
          enabled: true,
          muted: subTrack.muted,
          locked: false,
          volume: subTrack.volume,
          pan: subTrack.pan,
          opacity: 1,
          blend: 'normal',
          clips: [],
          transitions: [],
        };
        found.timeline.tracks.push(parentLane);
      }
      for (const subClip of [...subTrack.clips]) {
        if (subClip.kind === 'timeline' && subClip.ref === compound.ref) {
          this.fail(ErrorCode.REFERENCE_CYCLE, 'unnest would create a self-referencing timeline');
          return;
        }
        subClip.start = add(compound.start, subClip.sourceIn ? subClip.start : subClip.start);
        parentLane.clips.push(subClip);
        moved += 1;
        ensureExtent(this.project, found.timeline, clipEnd(subClip), this.autoExtend);
      }
      for (const transition of subTrack.transitions) {
        found.timeline.tracks
          .find((candidate) => candidate.id === parentLane!.id)!
          .transitions.push(transition);
      }
      subTrack.clips = [];
      subTrack.transitions = [];
    }
    // Remove the compound clip and the now-empty sub timeline.
    const index = found.track.clips.indexOf(compound);
    if (index !== -1) found.track.clips.splice(index, 1);
    found.track.transitions = found.track.transitions.filter(
      (transition) => transition.fromClipId !== compound.id && transition.toClipId !== compound.id,
    );
    this.project.timelines = this.project.timelines.filter((candidate) => candidate.id !== subTimeline.id);
    if (!moved) {
      this.warn(ErrorCode.EDIT_INVALID_OPERATION, `compound clip "${compound.id}" contained no clips`, compound.id);
    }
    this.changed.push(compound.id);
  }

  private timelineRippleCut(operation: Extract<EditOperation, { op: 'timeline.rippleCut' }>): void {
    const start = this.time(operation.start, 'rippleCut.start');
    const end = this.time(operation.end, 'rippleCut.end');
    if (!start || !end) return;
    if (!lt(start, end)) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'rippleCut requires start < end');
      return;
    }
    const tracks = operation.trackIds.map((trackId) => findTrack(this.project, trackId));
    const missing = operation.trackIds.find((_, index) => !tracks[index]);
    if (missing) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${missing}" does not exist`);
      return;
    }
    // Two phases per lane, decided from FROZEN original extents: an early
    // rippleDelete shifts later clips in place, so overlap decisions made from
    // live positions would double-cut clips that flowed into the range.
    for (const pair of tracks) {
      const track = pair!.track;
      void pair!.timeline;
      // Phase 1: split every overlapping clip at the range edges that fall
      // strictly inside it (clip.split rejects boundary times, so a clip edge
      // already sitting on start/end is left unsplit).
      const frozen = track.clips.map((clip) => ({ id: clip.id, start: clip.start, stop: clipEnd(clip) }));
      for (const entry of frozen) {
        if (!gt(entry.stop, start) || !lt(entry.start, end)) continue;
        const headBefore = lt(entry.start, start); // head extends before the cut
        const tailAfter = gt(entry.stop, end); // tail extends past the cut
        if (headBefore && tailAfter) {
          const middleId = uniqueId(this.project, `${entry.id}-cut`);
          this.apply({ op: 'clip.split', clipId: entry.id, at: start, id: middleId });
          const rightId = uniqueId(this.project, `${entry.id}-keep`);
          this.apply({ op: 'clip.split', clipId: middleId, at: end, id: rightId });
        } else if (headBefore) {
          const tailId = uniqueId(this.project, `${entry.id}-tail`);
          this.apply({ op: 'clip.split', clipId: entry.id, at: start, id: tailId });
        } else if (tailAfter) {
          const rightId = uniqueId(this.project, `${entry.id}-keep`);
          this.apply({ op: 'clip.split', clipId: entry.id, at: end, id: rightId });
        }
        // else: the clip is fully contained — no split needed.
      }
      // Phase 2: remove every clip now fully inside the range, then close the
      // gap with ONE uniform shift. Accumulated per-clip ripple deletes would
      // double-count overlapping clips (caption cues may overlap); a uniform
      // shift moves the lane left by exactly (end - start).
      const middleIds = track.clips
        .filter((clip) => !lt(clip.start, start) && !gt(clipEnd(clip), end))
        .map((clip) => clip.id);
      for (const clipId of middleIds) {
        this.apply({ op: 'clip.remove', clipId });
      }
      const shift = sub(end, start);
      for (const other of track.clips) {
        if (lt(other.start, end)) continue;
        other.start = sub(other.start, shift);
        if (lt(other.start, ZERO)) other.start = ZERO;
      }
      for (const clipId of middleIds) this.changed.push(clipId);
    }
    // rippleDelete already closes the gap on each cut lane, so the content
    // after the cut flows left by exactly (end - start). No extra shift here:
    // a second pass would double-move clips across lanes.
  }

  private storyboardApply(operation: Extract<EditOperation, { op: 'storyboard.apply' }>): void {
    const shots = operation.shotIds
      ? operation.shotIds.map((shotId) => {
          const shot = (this.project.storyboard ?? []).find((candidate) => candidate.id === shotId);
          if (!shot) {
            this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `storyboard shot "${shotId}" does not exist`);
            return undefined;
          }
          return shot;
        })
      : [...(this.project.storyboard ?? [])].sort((a, b) => a.order - b.order);
    if (!shots.length || shots.some((shot) => !shot)) return;
    const timeline = findTimeline(this.project, this.project.mainTimeline) ?? this.project.timelines[0];
    if (!timeline) {
      this.fail(ErrorCode.VALIDATION_EMPTY_TIMELINE, 'project has no timeline to apply shots to');
      return;
    }
    let lane = operation.laneId
      ? timeline.tracks.find((candidate) => candidate.id === operation.laneId)
      : timeline.tracks.find((candidate) => candidate.type === 'video' || candidate.type === 'overlay');
    if (operation.laneId && !lane) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.laneId}" does not exist`);
      return;
    }
    if (!lane) {
      lane = {
        id: uniqueId(this.project, 'video'),
        type: 'video',
        name: 'Video',
        order: timeline.tracks.length,
        enabled: true,
        muted: false,
        locked: false,
        volume: 1,
        pan: 0,
        opacity: 1,
        blend: 'normal',
        clips: [],
        transitions: [],
      };
      timeline.tracks.push(lane);
    }
    const gap = operation.gap !== undefined ? toNumber(this.time(operation.gap, 'apply.gap') ?? ZERO) : 0;
    const appendMode = operation.at === undefined || operation.at === 'append';
    let cursor = appendMode
      ? lane.clips.reduce((max, clip) => Math.max(max, toNumber(clipEnd(clip))), 0)
      : toNumber(this.time(operation.at as TimeLike, 'apply.at') ?? ZERO);
    for (const shot of shots as NonNullable<typeof shots[number]>[]) {
      const ref = shot.generation ? `gen:${shot.generation}` : shot.asset ? `asset:${shot.asset}` : shot.scene ? `scene:${shot.scene}` : undefined;
      if (!ref) {
        this.warn(ErrorCode.VALIDATION_MISSING_REQUIRED, `shot "${shot.id}" has no scene/generation/asset link; skipped`, shot.id);
        continue;
      }
      const resolved = resolveReference(this.project, ref);
      if (!resolved) {
        this.warn(ErrorCode.REFERENCE_NOT_FOUND, `shot "${shot.id}" links missing "${ref}"; skipped`, shot.id);
        continue;
      }
      let duration = shot.duration
        ? this.time(shot.duration, 'apply.duration')
        : resolved.kind === 'scene' && resolved.scene.duration
          ? resolved.scene.duration
          : rat(3_000_000, 1_000_000);
      duration = duration ?? rat(3_000_000, 1_000_000);
      const clipId = `${operation.clipIdPrefix ?? 'shot'}-${shot.id}`;
      if (findClip(this.project, clipId)) {
        this.warn(ErrorCode.EDIT_CONFLICT, `clip "${clipId}" already exists; skipped`, clipId);
        continue;
      }
      let clip: Clip | undefined;
      const clipStart = rat(Math.round(cursor * 1_000_000), 1_000_000);
      if (resolved.kind === 'scene' || resolved.kind === 'timeline') {
        clip = makeClipBase({ id: clipId, kind: resolved.kind, start: clipStart, duration }) as unknown as Clip;
        clip.ref = ref;
      } else if (resolved.kind === 'asset' || resolved.kind === 'generation') {
        const assetKind = resolved.kind === 'asset' ? resolved.asset.kind : generationKindToAssetKind(resolved.task.kind);
        const clipKind: Clip['kind'] | undefined =
          assetKind === 'audio' ? 'audio' :
          assetKind === 'video' ? 'video' :
          assetKind === 'svg' ? 'svg' :
          assetKind === 'image' ? 'image' :
          undefined;
        if (clipKind) {
          const base = makeClipBase({ id: clipId, kind: clipKind, start: clipStart, duration });
          clip = { ...base, kind: clipKind, ref } as Clip;
        }
      }
      if (!clip) {
        this.warn(ErrorCode.REFERENCE_INCOMPATIBLE, `shot "${shot.id}" ref "${ref}" is not a clip material; skipped`, shot.id);
        continue;
      }
      clip.metadata = { ...(clip.metadata ?? {}), fromShot: shot.id };
      // Collision policy: warn and skip past overlaps rather than failing the batch.
      const overlaps = lane.clips.some(
        (existing) => toNumber(existing.start) < cursor + toNumber(duration) && toNumber(clipEnd(existing)) > cursor,
      );
      if (overlaps) {
        this.warn(ErrorCode.TIME_OVERLAP, `shot "${shot.id}" would overlap an existing clip on lane "${lane!.id}"; skipped`, shot.id);
        continue;
      }
      lane.clips.push(clip);
      ensureExtent(this.project, timeline, clipEnd(clip), this.autoExtend);
      this.changed.push(clipId);
      cursor += toNumber(duration) + gap;
    }
  }

  private clipSlip(operation: Extract<EditOperation, { op: 'clip.slip' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    if (!isTimeBearing(found.clip) || found.clip.freeze) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'slip applies to time-bearing clips that are not frozen');
      return;
    }
    if (found.clip.timeRemap) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'slip does not apply to time-remapped clips; edit the remap instead');
      return;
    }
    const delta = this.time(operation.delta, 'slip.delta');
    if (!delta) return;
    const shift = mul(delta, found.clip.speed);
    let newIn = add(found.clip.sourceIn, shift);
    let newOut = add(clipOut(found.clip), shift);
    const sourceDuration = sourceDurationOf(this.project, found.clip);
    if (lt(newIn, ZERO)) {
      newOut = add(newOut, sub(ZERO, newIn));
      newIn = ZERO;
      this.warn(ErrorCode.EDIT_OUT_OF_BOUNDS, 'slip clamped at the start of the source', found.clip.id);
    }
    if (sourceDuration && gt(newOut, sourceDuration)) {
      const overflow = sub(newOut, sourceDuration);
      newIn = sub(newIn, overflow);
      newOut = sourceDuration;
      this.warn(ErrorCode.EDIT_OUT_OF_BOUNDS, 'slip clamped at the end of the source', found.clip.id);
    }
    if (lt(newIn, ZERO)) newIn = ZERO;
    found.clip.sourceIn = newIn;
    found.clip.sourceOut = newOut;
    this.changed.push(found.clip.id);
  }

  private clipSlide(operation: Extract<EditOperation, { op: 'clip.slide' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const delta = this.time(operation.delta, 'slide.delta');
    if (!delta) return;
    const clips = [...found.track.clips].sort((a, b) => toNumber(a.start) - toNumber(b.start));
    const index = clips.findIndex((clip) => clip.id === found.clip.id);
    const previous = clips[index - 1];
    const next = clips[index + 1];
    if (!previous || !next || !eq(clipEnd(previous), found.clip.start) || !eq(clipEnd(found.clip), next.start)) {
      this.fail(ErrorCode.EDIT_CONFLICT, 'slide requires the clip to be exactly adjacent to both neighbours');
      return;
    }
    const newStart = add(found.clip.start, delta);
    const newEnd = add(clipEnd(found.clip), delta);
    if (!gt(newStart, previous.start) || !lt(newEnd, clipEnd(next))) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'slide would cross a neighbouring clip boundary');
      return;
    }
    this.apply({ op: 'clip.trim', clipId: previous.id, end: newStart });
    this.apply({ op: 'clip.trim', clipId: next.id, start: newEnd });
    found.clip.start = newStart;
    this.changed.push(found.clip.id);
  }

  private clipRoll(operation: Extract<EditOperation, { op: 'clip.roll' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const delta = this.time(operation.delta, 'roll.delta');
    if (!delta) return;
    const clips = [...found.track.clips].sort((a, b) => toNumber(a.start) - toNumber(b.start));
    const index = clips.findIndex((clip) => clip.id === found.clip.id);
    if (operation.edge === 'end') {
      const next = clips[index + 1];
      if (!next || !eq(clipEnd(found.clip), next.start)) {
        this.fail(ErrorCode.EDIT_CONFLICT, 'roll on end requires an adjacent following clip');
        return;
      }
      this.apply({ op: 'clip.trim', clipId: found.clip.id, end: add(clipEnd(found.clip), delta) });
      this.apply({ op: 'clip.trim', clipId: next.id, start: add(next.start, delta) });
    } else {
      const previous = clips[index - 1];
      if (!previous || !eq(clipEnd(previous), found.clip.start)) {
        this.fail(ErrorCode.EDIT_CONFLICT, 'roll on start requires an adjacent previous clip');
        return;
      }
      this.apply({ op: 'clip.trim', clipId: previous.id, end: add(clipEnd(previous), delta) });
      this.apply({ op: 'clip.trim', clipId: found.clip.id, start: add(found.clip.start, delta) });
    }
    this.changed.push(found.clip.id);
  }

  private clipSpeed(operation: Extract<EditOperation, { op: 'clip.speed' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const clip = found.clip;
    if (clip.kind !== 'video' && clip.kind !== 'audio' && clip.kind !== 'scene') {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'speed applies to video, audio and scene clips');
      return;
    }
    if (clip.freeze) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'a frozen clip has no speed');
      return;
    }
    if (clip.timeRemap) {
      this.warn(ErrorCode.EDIT_CONFLICT, `clip "${clip.id}" had a time remap; it was cleared by clip.speed`, clip.id);
      clip.timeRemap = undefined;
    }
    let speed: Rational;
    if (typeof operation.speed === 'number') {
      if (!Number.isFinite(operation.speed) || operation.speed <= 0) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'speed must be positive');
        return;
      }
      speed = rat(Math.round(operation.speed * 1e6), 1e6);
    } else if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(operation.speed)) {
      const [num, den] = operation.speed.split('/').map(Number);
      speed = rat(Math.round(num! * 1e6), Math.round(den! * 1e6));
    } else {
      const parsed = this.time(operation.speed, 'speed');
      if (!parsed || parsed.num <= 0) {
        this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'speed must be positive');
        return;
      }
      speed = parsed;
    }
    const sourceSpan = clipSourceSpan(clip);
    const newDuration = div(sourceSpan, speed);
    if (!gt(newDuration, ZERO)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'speed change collapses the clip');
      return;
    }
    clip.speed = speed;
    clip.duration = newDuration;
    if (isTimeBearing(clip)) {
      clip.sourceOut = add(clip.sourceIn, sourceSpan);
    }
    ensureExtent(this.project, found.timeline, clipEnd(clip), this.autoExtend);
    this.changed.push(clip.id);
  }

  private clipFreeze(operation: Extract<EditOperation, { op: 'clip.freeze' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    if (found.clip.kind !== 'video') {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'freeze applies to video clips');
      return;
    }
    let target: Clip = found.clip;
    if (operation.at) {
      const rightId = uniqueId(this.project, `${found.clip.id}-b`);
      this.apply({ op: 'clip.split', clipId: found.clip.id, at: operation.at, id: rightId });
      if (this.bag.hasErrors) return;
      const right = locate(this.project, rightId);
      if (!right) {
        this.fail(ErrorCode.EDIT_CONFLICT, 'freeze split did not produce a right-hand clip');
        return;
      }
      target = right.clip;
    }
    const sourceTime = this.time(operation.sourceTime, 'freeze.sourceTime') ?? target.sourceIn;
    target.freeze = sourceTime;
    this.changed.push(target.id);
  }

  private clipSet(operation: Extract<EditOperation, { op: 'clip.set' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const clip = found.clip;
    const props = operation.props;
    if (props.opacity !== undefined) {
      if (props.opacity < 0 || props.opacity > 1) this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'opacity must be 0..1');
      else clip.opacity = props.opacity;
    }
    if (props.blend !== undefined) clip.blend = props.blend;
    if (props.fit !== undefined) clip.fit = props.fit;
    if (props.transform !== undefined) clip.transform = { ...clip.transform, ...props.transform };
    if (props.crop !== undefined) clip.crop = props.crop === null ? undefined : props.crop;
    if (props.effects !== undefined) clip.effects = structuredClone(props.effects);
    if (props.animations !== undefined) clip.animations = props.animations
      .map((animation) => sanitizeAnimationInput(animation))
      .filter((animation): animation is Animation => animation !== undefined);
    if (props.volume !== undefined) clip.volume = Math.max(0, props.volume);
    if (props.pan !== undefined) clip.pan = Math.max(-1, Math.min(1, props.pan));
    if (props.fadeIn !== undefined) clip.fadeIn = props.fadeIn === null ? undefined : this.time(props.fadeIn, 'fadeIn');
    if (props.audioOffset !== undefined) clip.audioOffset = props.audioOffset === null ? undefined : this.time(props.audioOffset, 'audioOffset');
    if (props.fadeOut !== undefined) clip.fadeOut = props.fadeOut === null ? undefined : this.time(props.fadeOut, 'fadeOut');
    if (props.enabled !== undefined) clip.enabled = props.enabled;
    if (props.z !== undefined) clip.z = props.z;
    if (props.name !== undefined) clip.name = props.name;
    if (props.className !== undefined) clip.className = props.className;
    if (props.metadata !== undefined) {
      // Whole-replace semantics; link pairing lives here, so callers send the
      // merged record. An empty record clears all metadata.
      clip.metadata = { ...props.metadata };
    }
    if (props.loop !== undefined && clip.kind === 'scene') clip.loop = props.loop;
    if (props.muted !== undefined && (clip.kind === 'video' || clip.kind === 'audio')) clip.muted = props.muted;
    if (props.text !== undefined && clip.kind === 'caption') clip.text = props.text;
    if (props.speaker !== undefined && clip.kind === 'caption') clip.speaker = props.speaker;
    if (props.style !== undefined && clip.kind === 'caption') clip.style = props.style;
    if (props.value !== undefined && clip.kind === 'data') clip.value = props.value;
    if (props.ref !== undefined && props.ref !== clip.ref) {
      clip.ref = props.ref;
    }
    this.changed.push(clip.id);
  }

  private transitionAdd(operation: Extract<EditOperation, { op: 'transition.add' }>): void {
    const found = findTrack(this.project, operation.trackId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `lane "${operation.trackId}" does not exist`);
      return;
    }
    const from = found.track.clips.find((clip) => clip.id === operation.transition.fromClipId);
    const to = found.track.clips.find((clip) => clip.id === operation.transition.toClipId);
    if (!from || !to) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, 'transition endpoints must both be on the target lane');
      return;
    }
    const overlapStart = gt(from.start, to.start) ? from.start : to.start;
    const overlapEnd = lt(clipEnd(from), clipEnd(to)) ? clipEnd(from) : clipEnd(to);
    const overlap = sub(overlapEnd, overlapStart);
    if (!gt(overlap, ZERO)) {
      this.fail(ErrorCode.EDIT_CONFLICT, 'transition clips do not overlap; extend one clip first');
      return;
    }
    const duration = this.time(operation.transition.duration, 'transition.duration');
    if (!duration || !gt(duration, ZERO)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'transition duration must be positive');
      return;
    }
    if (gt(duration, overlap)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, `transition duration exceeds the ${overlap.num}/${overlap.den}s overlap`);
      return;
    }
    const id = operation.transition.id ?? uniqueId(this.project, `${from.id}-${to.id}`);
    if (found.track.transitions.some((transition) => transition.id === id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `transition id "${id}" already exists`);
      return;
    }
    found.track.transitions.push({
      easing: 'ease-in-out',
      direction: 'left',
      color: '#000000',
      ...structuredClone(operation.transition),
      id,
      trackId: found.track.id,
      duration,
      // Authored transitions may omit params; the serializer and renderer
      // both assume the record exists.
      params: { ...(operation.transition.params ?? {}) },
    });
    this.changed.push(id);
  }

  private transitionRemove(transitionId: string): void {
    for (const timeline of this.project.timelines) {
      for (const track of timeline.tracks) {
        const before = track.transitions.length;
        track.transitions = track.transitions.filter((transition) => transition.id !== transitionId);
        if (track.transitions.length !== before) {
          this.changed.push(transitionId);
          return;
        }
      }
    }
    this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `transition "${transitionId}" does not exist`);
  }

  private animationAdd(operation: Extract<EditOperation, { op: 'animation.add' }>): void {
    if (findAnimation(this.project, operation.animation.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `animation id "${operation.animation.id}" already exists`);
      return;
    }
    const animation = sanitizeAnimationInput(operation.animation);
    if (!animation) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, 'animation requires a property and at least one finite keyframe');
      return;
    }
    animation.id = operation.animation.id;
    if (operation.clipId) {
      const found = locate(this.project, operation.clipId);
      if (!found) {
        this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
        return;
      }
      animation.clipId = operation.clipId;
      found.clip.animations.push(animation);
    } else {
      this.project.animations.push(animation);
    }
    this.changed.push(operation.animation.id);
  }

  private animationRemove(operation: Extract<EditOperation, { op: 'animation.remove' }>): void {
    if (operation.clipId) {
      const found = locate(this.project, operation.clipId);
      if (!found) {
        this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
        return;
      }
      const before = found.clip.animations.length;
      found.clip.animations = found.clip.animations.filter((animation) => animation.id !== operation.animationId);
      if (found.clip.animations.length !== before) this.changed.push(operation.animationId);
      return;
    }
    const before = this.project.animations.length;
    this.project.animations = this.project.animations.filter((animation) => animation.id !== operation.animationId);
    if (this.project.animations.length !== before) this.changed.push(operation.animationId);
    for (const located of allClips(this.project)) {
      located.clip.animations = located.clip.animations.filter((animation) => animation.id !== operation.animationId);
    }
  }

  private effectAdd(operation: Extract<EditOperation, { op: 'effect.add' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const list = operation.audio ? found.clip.audioEffects : found.clip.effects;
    if (list.some((effect) => effect.id === operation.effect.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `effect id "${operation.effect.id}" already exists on the clip`);
      return;
    }
    list.push(structuredClone(operation.effect));
    this.changed.push(operation.effect.id);
  }

  private effectRemove(operation: Extract<EditOperation, { op: 'effect.remove' }>): void {
    const found = locate(this.project, operation.clipId);
    if (!found) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `clip "${operation.clipId}" does not exist`);
      return;
    }
    const list = operation.audio ? found.clip.audioEffects : found.clip.effects;
    const before = list.length;
    if (operation.audio) found.clip.audioEffects = list.filter((effect) => effect.id !== operation.effectId);
    else found.clip.effects = list.filter((effect) => effect.id !== operation.effectId);
    if ((operation.audio ? found.clip.audioEffects.length : found.clip.effects.length) !== before) {
      this.changed.push(operation.effectId);
    }
  }

  private storyboardShots(): StoryboardShot[] {
    if (!this.project.storyboard) this.project.storyboard = [];
    return this.project.storyboard;
  }

  private normalizeStoryboard(): void {
    this.storyboardShots().forEach((shot, index) => {
      shot.order = index + 1;
    });
  }

  private storyboardAdd(operation: Extract<EditOperation, { op: 'storyboard.add' }>): void {
    const shots = this.storyboardShots();
    if (shots.some((shot) => shot.id === operation.shot.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `shot "${operation.shot.id}" already exists`);
      return;
    }
    const { duration: durationInput, ...rest } = operation.shot;
    const shot: StoryboardShot = { ...rest, order: 0 };
    if (!STORYBOARD_STATUSES.has(shot.status)) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, `invalid shot status "${String(shot.status)}"`);
      return;
    }
    if (durationInput !== undefined) {
      const duration = this.time(durationInput, 'storyboard.duration');
      if (!duration) return;
      shot.duration = duration;
    }
    const at = operation.at === undefined ? shots.length : Math.max(0, Math.min(shots.length, Math.trunc(operation.at)));
    shots.splice(at, 0, shot);
    this.normalizeStoryboard();
    this.changed.push(shot.id);
  }

  private storyboardSet(operation: Extract<EditOperation, { op: 'storyboard.set' }>): void {
    const shots = this.storyboardShots();
    const shot = shots.find((candidate) => candidate.id === operation.shotId);
    if (!shot) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `shot "${operation.shotId}" does not exist`);
      return;
    }
    const props = operation.props;
    if (props.status !== undefined && !STORYBOARD_STATUSES.has(props.status)) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, `invalid shot status "${String(props.status)}"`);
      return;
    }
    if (props.order !== undefined && (!Number.isFinite(props.order) || props.order < 1)) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'storyboard order must be >= 1');
      return;
    }
    if ('duration' in props) {
      if (props.duration === null || props.duration === undefined) delete shot.duration;
      else shot.duration = this.time(props.duration, 'storyboard.duration') ?? shot.duration;
    }
    if (props.order !== undefined) {
      const index = shots.indexOf(shot);
      shots.splice(index, 1);
      const target = Math.max(0, Math.min(shots.length, Math.trunc(props.order) - 1));
      shots.splice(target, 0, shot);
    }
    for (const [key, value] of Object.entries(props)) {
      if (key === 'duration' || key === 'order') continue;
      if (value === undefined || value === null || (value === '' && (key === 'scene' || key === 'generation' || key === 'asset'))) {
        delete (shot as unknown as Record<string, unknown>)[key];
      } else {
        (shot as unknown as Record<string, unknown>)[key] = value;
      }
    }
    this.normalizeStoryboard();
    this.changed.push(shot.id);
  }

  /** RFC-0018: record a review decision; the previous review moves to history. */
  private storyboardReview(operation: Extract<EditOperation, { op: 'storyboard.review' }>): void {
    const shot = this.storyboardShots().find((candidate) => candidate.id === operation.shotId);
    if (!shot) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `shot "${operation.shotId}" does not exist`);
      return;
    }
    const review = operation.review;
    if (!GENERATION_REVIEW_STATUSES.has(review.status)) {
      this.fail(ErrorCode.EDIT_INVALID_OPERATION, `invalid shot review status "${String(review.status)}"`);
      return;
    }
    if (shot.review) {
      shot.reviewHistory = [...(shot.reviewHistory ?? []), shot.review];
    }
    shot.review = { ...review };
    // A decision that advances the shot keeps the status field honest: an
    // approved review marks the shot approved, a rejection sends it back.
    if (review.status === 'approved' && shot.status !== 'ready') shot.status = 'approved';
    if (review.status === 'changes-requested' || review.status === 'rejected') {
      shot.status = shot.status === 'idea' ? 'idea' : 'boarded';
    }
    this.changed.push(shot.id);
  }

  private storyboardRemove(shotId: string): void {
    const shots = this.storyboardShots();
    const before = shots.length;
    this.project.storyboard = shots.filter((shot) => shot.id !== shotId);
    if (this.project.storyboard.length === before) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `shot "${shotId}" does not exist`);
      return;
    }
    this.normalizeStoryboard();
    this.changed.push(shotId);
  }

  private storyboardMove(shotId: string, to: number): void {
    const shots = this.storyboardShots();
    const index = shots.findIndex((shot) => shot.id === shotId);
    if (index === -1) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `shot "${shotId}" does not exist`);
      return;
    }
    const [shot] = shots.splice(index, 1);
    const target = Math.max(0, Math.min(shots.length, Math.trunc(to)));
    shots.splice(target, 0, shot!);
    this.normalizeStoryboard();
    this.changed.push(shotId);
  }

  private storyboardReorder(shotIds: string[]): void {
    const shots = this.storyboardShots();
    if (shotIds.length !== shots.length || new Set(shotIds).size !== shotIds.length) {
      this.fail(ErrorCode.EDIT_OUT_OF_BOUNDS, 'storyboard.reorder must list every shot exactly once');
      return;
    }
    const byId = new Map(shots.map((shot) => [shot.id, shot]));
    const next: StoryboardShot[] = [];
    for (const id of shotIds) {
      const shot = byId.get(id);
      if (!shot) {
        this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `shot "${id}" does not exist`);
        return;
      }
      next.push(shot);
    }
    this.project.storyboard = next;
    this.normalizeStoryboard();
    this.changed.push('storyboard');
  }

  private markerAdd(operation: Extract<EditOperation, { op: 'marker.add' }>): void {
    const timeline = findTimeline(this.project, operation.timelineId);
    if (!timeline) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `timeline "${operation.timelineId}" does not exist`);
      return;
    }
    const time = this.time(operation.marker.time, 'marker.time');
    if (!time) return;
    if (timeline.markers.some((marker) => marker.id === operation.marker.id)) {
      this.fail(ErrorCode.EDIT_CONFLICT, `marker id "${operation.marker.id}" already exists`);
      return;
    }
    timeline.markers.push({ ...operation.marker, time });
    this.changed.push(operation.marker.id);
  }

  private markerRemove(operation: Extract<EditOperation, { op: 'marker.remove' }>): void {
    const timeline = findTimeline(this.project, operation.timelineId);
    if (!timeline) {
      this.fail(ErrorCode.EDIT_TARGET_NOT_FOUND, `timeline "${operation.timelineId}" does not exist`);
      return;
    }
    const before = timeline.markers.length;
    timeline.markers = timeline.markers.filter((marker) => marker.id !== operation.markerId);
    if (timeline.markers.length !== before) this.changed.push(operation.markerId);
  }
}

function findAnimation(project: Project, id: string): Animation | undefined {
  const projectAnimation = project.animations.find((animation) => animation.id === id);
  if (projectAnimation) return projectAnimation;
  for (const located of allClips(project)) {
    const found = located.clip.animations.find((animation) => animation.id === id);
    if (found) return found;
  }
  return undefined;
}

export function applyEditOperations(
  project: Project,
  operations: EditOperation[],
  options: ApplyEditOptions = {},
): EditResult {
  const editor = new Editor(project, options);
  for (const operation of operations) {
    editor.apply(operation);
    if (editor.bag.hasErrors) break;
  }
  return editor.finish();
}

export function applyEditOperation(
  project: Project,
  operation: EditOperation,
  options: ApplyEditOptions = {},
): EditResult {
  return applyEditOperations(project, [operation], options);
}

/** Snapshot-based undo/redo session used by the studio and CLI edit mode. */
export class EditSession {
  project: Project;
  private readonly history: Project[] = [];
  private index = 0;
  private readonly limit: number;

  constructor(project: Project, limit = 100) {
    this.project = structuredClone(project);
    this.history.push(structuredClone(project));
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  apply(operations: EditOperation[], options: ApplyEditOptions = {}): EditResult {
    const result = applyEditOperations(this.project, operations, { ...options, mutate: false });
    if (result.ok) {
      this.project = result.project;
      this.history.splice(this.index + 1);
      this.history.push(structuredClone(this.project));
      if (this.history.length > this.limit) this.history.shift();
      this.index = this.history.length - 1;
    }
    return result;
  }

  undo(): Project | undefined {
    if (!this.canUndo) return undefined;
    this.index -= 1;
    this.project = structuredClone(this.history[this.index]!);
    return this.project;
  }

  redo(): Project | undefined {
    if (!this.canRedo) return undefined;
    this.index += 1;
    this.project = structuredClone(this.history[this.index]!);
    return this.project;
  }

  get depth(): { undo: number; redo: number } {
    return { undo: this.index, redo: this.history.length - 1 - this.index };
  }
}

/** Create a complete clip object from a partial description (SDK/editor helper). */
export function makeClipBase(partial: Partial<ClipBase> & { id?: string; kind?: Clip['kind'] } = {}): ClipBase {
  const id = partial.id ?? 'clip';
  return {
    id,
    kind: (partial.kind ?? 'scene') as ClipBase['kind'],
    ref: partial.ref,
    name: partial.name,
    className: partial.className,
    start: partial.start ?? ZERO,
    duration: partial.duration ?? ZERO,
    sourceIn: partial.sourceIn ?? ZERO,
    sourceOut: partial.sourceOut,
    speed: partial.speed ?? rat(1),
    reverse: partial.reverse ?? false,
    freeze: partial.freeze,
    enabled: partial.enabled ?? true,
    z: partial.z ?? 0,
    opacity: partial.opacity ?? 1,
    blend: partial.blend ?? 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0.5, anchorY: 0.5, ...(partial.transform ?? {}) },
    crop: partial.crop,
    fit: partial.fit ?? 'cover',
    effects: partial.effects ?? [],
    animations: partial.animations ?? [],
    volume: partial.volume ?? 1,
    pan: partial.pan ?? 0,
    fadeIn: partial.fadeIn,
    fadeOut: partial.fadeOut,
    audioEffects: partial.audioEffects ?? [],
    metadata: partial.metadata,
  };
}

export function cloneProjectForEdit(project: Project): Project {
  return cloneProject(project);
}

export function projectDuration(project: Project): Rational {
  const main = findTimeline(project, project.mainTimeline);
  return main?.duration ?? project.composition.duration;
}

export function totalClipTime(project: Project, trackId: string): Rational {
  const found = findTrack(project, trackId);
  if (!found) return ZERO;
  return found.track.clips.reduce((sum, clip) => add(sum, clip.duration), ZERO);
}

export function clipSourceBounds(project: Project, clip: Clip): { in: Rational; out: Rational; duration?: Rational } {
  const sourceDuration = sourceDurationOf(project, clip);
  return { in: clip.sourceIn, out: clipOut(clip), duration: sourceDuration };
}

export function isEditableScene(project: Project, clip: Clip): boolean {
  if (clip.kind !== 'scene' || !clip.ref) return false;
  return Boolean(findScene(project, clip.ref.replace(/^scene:/, '')));
}
