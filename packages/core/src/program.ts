/**
 * Inline authoring-program materialisation (code authoring extension).
 *
 * A `.vhtml` document may contain a `<program>`/`<script
 * type="application/vhtml+javascript">` element plus `<data>` JSON blocks.
 * `materializeDocument` executes that program once, in a deterministic
 * sandbox, against the parsed project model: the program adds scenes, lanes,
 * clips, captions, animations, generations and edit operations with ordinary
 * code. After materialisation the document is a plain declarative project for
 * every downstream consumer (validator, stage, mixer, exporter).
 *
 * Determinism contract:
 * - no network, filesystem, dynamic import or process access in the sandbox;
 * - `Date.now()` is fixed and `Math.random` is a seeded PRNG;
 * - auto ids and the PRNG reset on every run, so the same document, params and
 *   library versions always produce the same model.
 */

import vm from 'node:vm';
import { ErrorCode, type Diagnostic, errorDiagnostic } from './errors.ts';
import {
  type Asset,
  type AuthoringProgram,
  type Clip,
  type DataBlock,
  type Effect,
  type EasingName,
  type GenerationTask,
  type Marker,
  type OutputConfig,
  type Project,
  type Scene,
  type TimeRemap,
  type Timeline,
  type Track,
  type TrackType,
  type Transition,
  type VhtmlDocument,
} from './model.ts';
import { applyEditOperations, type EditOperation } from './edits.ts';
import {
  animate,
  asset as buildAsset,
  buildClip,
  captionSpec,
  css,
  easingFunction,
  generationTask,
  html,
  laneSpec,
  marker as buildMarker,
  outputConfig,
  rat,
  resetAuthoringIds,
  scene as buildScene,
  storyboardShot,
  timeRemap,
  transitionId,
  type CaptionSpec,
  type ClipSpec,
  type GenerationSpec,
  type LaneSpec,
  type MarkerSpec,
  type OutputSpec,
  type StoryboardShotSpec,
  type TimeInput,
} from './authoring.ts';
import { parseSubtitleBlocks } from './captions.ts';
import { formatRate, parseTime, toNumber, type Rate, type Rational } from './time.ts';

export interface MaterializeOptions {
  /** Extra `vhtml.ctx.params` values merged over program params. */
  params?: Record<string, string>;
  /** Sandbox execution budget in milliseconds. */
  timeoutMs?: number;
}

export interface MaterializeResult {
  document: VhtmlDocument;
  diagnostics: Diagnostic[];
  /** True when a program ran. */
  materialized: boolean;
}

/** Deterministic PRNG (mulberry32) shared with the seeded renderer contract. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function diagnostic(
  code: string,
  message: string,
  severity: Diagnostic['severity'],
  objectId?: string,
): Diagnostic {
  return { code, message, severity, objectId };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      freezeDeep((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function sandboxTime(value: TimeInput, fps: Rate): Rational {
  if (typeof value === 'object' && 'num' in value) return value;
  if (typeof value === 'number') return rat(Math.round(value * 1_000_000), 1_000_000);
  return parseTime(value, { frameRate: fps });
}

/**
 * Build the `vhtml` authoring API object exposed inside the sandbox.
 * Exported for testing; the CLI/runtime always go through `materializeDocument`.
 */
export function createAuthoringApi(
  project: Project,
  program: AuthoringProgram,
  dataBlocks: DataBlock[],
  extraParams: Record<string, string> | undefined,
  consoleCapture: { warnings: string[]; infos: string[] },
): Record<string, unknown> {
  const fps: Rate = project.composition.frameRate;
  const params: Record<string, string> = { ...(program.params ?? {}), ...(extraParams ?? {}) };
  const data = new Map<string, unknown>();
  for (const block of dataBlocks) data.set(block.id, block.value);
  let clipCounter = 0;
  let shotCounter = 0;
  let effectCounter = 0;

  function requireTimeline(id: string) {
    const timeline = project.timelines.find((candidate) => candidate.id === id);
    if (!timeline) throw new Error(`timeline "${id}" not found`);
    return timeline;
  }

  function requireLane(laneId: string): Track {
    for (const timeline of project.timelines) {
      const track = timeline.tracks.find((candidate) => candidate.id === laneId);
      if (track) return track;
    }
    throw new Error(`lane "${laneId}" not found`);
  }

  function sceneIndex() {
    return {
      scenes: new Map(project.scenes.map((item) => [item.id, item])),
      assets: new Map(project.assets.map((item) => [item.id, item])),
      generations: new Map(project.generations.map((item) => [item.id, item])),
    };
  }

  function resolveClip(spec: ClipSpec, id: string): Clip {
    const fullSpec: ClipSpec = { ...spec, id };
    if (fullSpec.html !== undefined && !project.scenes.some((candidate) => candidate.id === `${id}-scene`)) {
      project.scenes.push(buildScene({ id: `${id}-scene`, html: fullSpec.html, css: fullSpec.css }));
    }
    return buildClip(fullSpec, id, sceneIndex(), project.composition);
  }

  function findClipById(clipId: string): (Clip & { effects: Effect[]; audioEffects: Effect[] }) | undefined {
    for (const timeline of project.timelines) {
      for (const track of timeline.tracks) {
        const clip = track.clips.find((candidate) => candidate.id === clipId);
        if (clip) return clip as Clip & { effects: Effect[]; audioEffects: Effect[] };
      }
    }
    return undefined;
  }

  function addTransitionImpl(trackId: string, transition: Omit<Transition, 'id' | 'trackId'> & { id?: string }): Transition {
    const lane = requireLane(trackId);
    const value: Transition = {
      ...transition,
      easing: transition.easing ?? 'ease-in-out',
      direction: transition.direction ?? 'left',
      color: transition.color ?? '#000000',
      duration: sandboxTime(transition.duration as TimeInput, fps),
      params: transition.params ?? {},
      id: transition.id ?? transitionId(trackId, lane.transitions.length),
      trackId,
    };
    lane.transitions.push(value);
    return value;
  }

  const api: Record<string, unknown> = {
    version: project.version,
    ctx: freezeDeep({
      fps,
      fpsNumber: toNumber(fps),
      fpsLabel: formatRate(fps),
      width: project.composition.width,
      height: project.composition.height,
      duration: project.composition.duration,
      durationSeconds: toNumber(project.composition.duration),
      sampleRate: project.composition.sampleRate,
      channels: project.composition.channels,
      seed: program.seed ?? project.composition.seed,
      params: freezeDeep({ ...params }),
    }),
    data: {
      get(id: string): unknown {
        const value = data.get(id);
        if (value === undefined) throw new Error(`data block "${id}" not found`);
        return value;
      },
      has(id: string): boolean {
        return data.has(id);
      },
      keys(): string[] {
        return [...data.keys()];
      },
    },
    // ---- pure builders -------------------------------------------------
    rat,
    time: (value: TimeInput): Rational => sandboxTime(value, fps),
    frames: (count: number): Rational => rat(count * fps.den, fps.num),
    clip: (refOrSpec: string | ClipSpec, options: Omit<ClipSpec, 'ref'> = {}): ClipSpec =>
      typeof refOrSpec === 'string' ? { ref: refOrSpec, ...options } : { ...refOrSpec },
    caption: (text: string, start: TimeInput, options: Omit<CaptionSpec, 'text' | 'start'> = {}): CaptionSpec =>
      captionSpec(text, start, options),
    scene: (spec: Parameters<typeof buildScene>[0]): Scene => buildScene(spec),
    asset: (spec: Parameters<typeof buildAsset>[0]): Asset => buildAsset(spec),
    animate: (spec: Parameters<typeof animate>[0]): ReturnType<typeof animate> => animate(spec, fps),
    effect: (type: string, effectParams?: Record<string, string | number | boolean>) => ({
      id: `fx-${type}-${++effectCounter}`,
      type,
      params: effectParams ?? {},
      enabled: true,
    }),
    timeRemap: (spec: Parameters<typeof timeRemap>[0]): TimeRemap => timeRemap(spec, fps),
    marker: (spec: MarkerSpec): Marker => buildMarker(spec, fps),
    generation: (spec: GenerationSpec): GenerationTask => generationTask(spec, fps),
    output: (spec: OutputSpec): OutputConfig => outputConfig(spec, project.composition, project.outputs.length, project.mainTimeline),
    storyboardShot: (spec: StoryboardShotSpec) => storyboardShot(spec, 0, fps),
    lane: (type: TrackType, id: string, clips: ClipSpec[], options: Omit<LaneSpec, 'type' | 'id' | 'clips'> = {}) =>
      laneSpec(type, id, clips, options),
    html,
    css,
    parseCaptions: (source: string) => parseSubtitleBlocks(String(source)),
    easing: {
      sample: (name: EasingName, progress: number): number =>
        easingFunction(name)(Math.min(1, Math.max(0, progress))),
      names: ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'],
    },
    // ---- mutators ------------------------------------------------------
    addScene(spec: Parameters<typeof buildScene>[0]): Scene {
      if (project.scenes.some((candidate) => candidate.id === spec.id)) {
        throw new Error(`scene "${spec.id}" already exists`);
      }
      const value = buildScene(spec);
      project.scenes.push(value);
      return value;
    },
    addAsset(spec: Parameters<typeof buildAsset>[0]): Asset {
      if (project.assets.some((candidate) => candidate.id === spec.id)) {
        throw new Error(`asset "${spec.id}" already exists`);
      }
      const value = buildAsset(spec);
      project.assets.push(value);
      return value;
    },
    addTimeline(spec: { id?: string; duration?: TimeInput } = {}): Timeline {
      const id = spec.id ?? (project.timelines.some((candidate) => candidate.id === 'main') ? `timeline-${project.timelines.length + 1}` : 'main');
      if (project.timelines.some((candidate) => candidate.id === id)) {
        throw new Error(`timeline "${id}" already exists`);
      }
      const timeline: Timeline = {
        id,
        duration: spec.duration !== undefined ? sandboxTime(spec.duration, fps) : project.composition.duration,
        tracks: [],
        markers: [],
      };
      project.timelines.push(timeline);
      return timeline;
    },
    addLane(spec: LaneSpec & { timelineId?: string }, timelineId?: string): Track {
      const targetId = timelineId ?? spec.timelineId ?? project.mainTimeline;
      const target = requireTimeline(targetId);
      if (target.tracks.some((candidate) => candidate.id === spec.id)) {
        throw new Error(`lane "${spec.id}" already exists in timeline "${targetId}"`);
      }
      const clips: Clip[] = [];
      for (const clipSpec of spec.clips ?? []) {
        const id = clipSpec.id ?? `${spec.id}-clip-${++clipCounter}`;
        clips.push(resolveClip(clipSpec, id));
      }
      const track: Track = {
        id: spec.id,
        type: spec.type ?? 'video',
        name: spec.name,
        order: spec.order ?? target.tracks.length,
        enabled: spec.enabled ?? true,
        muted: spec.muted ?? false,
        locked: false,
        volume: spec.volume ?? 1,
        pan: spec.pan ?? 0,
        opacity: spec.opacity ?? 1,
        blend: spec.blend ?? 'normal',
        captionStyle: spec.captionStyle,
        clips,
        transitions: [],
      };
      target.tracks.push(track);
      for (let index = 0; index < (spec.transitions ?? []).length; index += 1) {
        const transitionSpec = spec.transitions![index]!;
        addTransitionImpl(spec.id, {
          fromClipId: transitionSpec.from,
          toClipId: transitionSpec.to,
          type: transitionSpec.type ?? 'crossfade',
          duration: transitionSpec.duration !== undefined
            ? sandboxTime(transitionSpec.duration as TimeInput, fps)
            : rat(0),
          easing: transitionSpec.easing ?? 'ease-in-out',
          direction: transitionSpec.direction ?? 'left',
          color: transitionSpec.color ?? '#000000',
          params: transitionSpec.params ?? {},
        });
      }
      return track;
    },
    addClip(laneId: string, spec: ClipSpec): Clip {
      const lane = requireLane(laneId);
      const id = spec.id ?? `${laneId}-clip-${++clipCounter}`;
      const value = resolveClip(spec, id);
      lane.clips.push(value);
      return value;
    },
    addCue(spec: CaptionSpec): Clip {
      const main = requireTimeline(project.mainTimeline);
      let captionsLane = main.tracks.find((track) => track.type === 'caption');
      if (!captionsLane) {
        captionsLane = {
          id: 'captions',
          type: 'caption',
          name: 'Captions',
          order: main.tracks.length,
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
        main.tracks.push(captionsLane);
      }
      const start = sandboxTime(spec.start, fps);
      const duration = spec.duration !== undefined
        ? sandboxTime(spec.duration, fps)
        : spec.end !== undefined
          ? {
              num: sandboxTime(spec.end, fps).num - start.num,
              den: sandboxTime(spec.end, fps).den,
            }
          : rat(2_000_000, 1_000_000);
      const clip = resolveClip(
        {
          kind: 'caption',
          text: spec.text,
          start,
          duration,
          id: spec.id ?? `cue-${captionsLane.clips.length + 1}`,
          speaker: spec.speaker,
          style: spec.style,
          opacity: spec.opacity,
        },
        spec.id ?? `cue-${captionsLane.clips.length + 1}`,
      );
      captionsLane.clips.push(clip);
      return clip;
    },
    addMarker(timelineIdOrSpec: string | MarkerSpec, specOrTime?: MarkerSpec | TimeInput, name?: string): Marker {
      const timelineId = typeof timelineIdOrSpec === 'string' ? timelineIdOrSpec : project.mainTimeline;
      const markerSpec: MarkerSpec = typeof timelineIdOrSpec === 'string'
        ? typeof specOrTime === 'object' && specOrTime !== null && 'time' in (specOrTime as MarkerSpec)
          ? specOrTime as MarkerSpec
          : ({ time: specOrTime as TimeInput, name } as MarkerSpec)
        : timelineIdOrSpec;
      const value = buildMarker(markerSpec, fps);
      requireTimeline(timelineId).markers.push(value);
      return value;
    },
    addTransition: addTransitionImpl,
    addGeneration(spec: GenerationSpec | GenerationTask): GenerationTask {
      const value = 'status' in spec ? spec as GenerationTask : generationTask(spec as GenerationSpec, fps);
      if (project.generations.some((candidate) => candidate.id === value.id)) {
        throw new Error(`generation task "${value.id}" already exists`);
      }
      project.generations.push(value);
      return value;
    },
    addStoryboardShot(spec: StoryboardShotSpec | ReturnType<typeof storyboardShot>): ReturnType<typeof storyboardShot> {
      const value = 'order' in (spec as ReturnType<typeof storyboardShot>) && 'status' in (spec as ReturnType<typeof storyboardShot>)
        ? spec as ReturnType<typeof storyboardShot>
        : storyboardShot(spec as StoryboardShotSpec, ++shotCounter, fps);
      project.storyboard ??= [];
      project.storyboard.push(value);
      return value;
    },
    addOutput(spec: OutputSpec): OutputConfig {
      const value = outputConfig(spec, project.composition, project.outputs.length, project.mainTimeline);
      project.outputs.push(value);
      return value;
    },
    addAnimation(animation: ReturnType<typeof animate>, clipId?: string): void {
      const value = { ...animation, clipId: clipId ?? animation.clipId };
      if (value.clipId) {
        const located = findClipById(value.clipId);
        if (!located) throw new Error(`clip "${value.clipId}" not found`);
        (located as unknown as { animations: unknown[] }).animations.push(value);
      } else {
        project.animations.push(value);
      }
    },
    addEffect(clipId: string, target: Effect, audio?: boolean): void {
      const located = findClipById(clipId);
      if (!located) throw new Error(`clip "${clipId}" not found`);
      (audio ? located.audioEffects : located.effects).push(target);
    },
    setComposition(patch: Partial<Project['composition']>): void {
      Object.assign(project.composition, patch);
    },
    setDuration(duration: Rational | number | string): void {
      const value = sandboxTime(duration as TimeInput, fps);
      project.composition.duration = value;
      for (const timeline of project.timelines) timeline.duration = value;
    },
    addStyle(value: string): void {
      project.styles.push(value);
    },
    addScript(value: string): void {
      project.scripts ??= [];
      project.scripts.push(value);
    },
    setMetadata(key: string, value: string): void {
      project.metadata[key] = value;
    },
    edit(operations: EditOperation[] | EditOperation): { ok: boolean; diagnostics: Diagnostic[] } {
      const list = Array.isArray(operations) ? operations : [operations];
      const result = applyEditOperations(project, list);
      return { ok: result.ok, diagnostics: result.diagnostics };
    },
    warn(message: string): void {
      consoleCapture.warnings.push(String(message));
    },
    info(message: string): void {
      consoleCapture.infos.push(String(message));
    },
    project,
  };
  return api;
}

/**
 * Execute a document's authoring program, if any, and return the materialised
 * document plus diagnostics. The input document is not mutated.
 */
export function materializeDocument(document: VhtmlDocument, options: MaterializeOptions = {}): MaterializeResult {
  const program = document.program;
  const diagnostics: Diagnostic[] = [];
  if (!program || !program.code.trim()) {
    return { document, diagnostics, materialized: false };
  }
  resetAuthoringIds();
  const project = structuredClone(document.project);
  const consoleCapture = { warnings: [] as string[], infos: [] as string[] };
  const api = createAuthoringApi(project, program, document.dataBlocks ?? [], options.params, consoleCapture);

  const seed = program.seed ?? project.composition.seed;
  const rng = mulberry32(seed);

  class FixedDate extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(0);
      else super(...(args as ConstructorParameters<typeof Date>));
    }
    static override now(): number {
      return 0;
    }
  }

  const sandbox: Record<string, unknown> = {
    vhtml: api,
    Math: Object.freeze({ ...Math, random: rng }),
    JSON,
    Date: FixedDate,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    Symbol,
    Error,
    TypeError,
    RangeError,
    Infinity,
    NaN,
    console: {
      log: (...args: unknown[]) => consoleCapture.infos.push(args.map(String).join(' ')),
      info: (...args: unknown[]) => consoleCapture.infos.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => consoleCapture.warnings.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => consoleCapture.warnings.push(args.map(String).join(' ')),
    },
  };
  sandbox.globalThis = sandbox;

  try {
    vm.runInNewContext(program.code, sandbox, {
      timeout: options.timeoutMs ?? 2_000,
      filename: program.source?.file ?? 'vhtml-program.js',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = /Script execution timed out/i.test(message);
    diagnostics.push(diagnostic(
      isTimeout ? ErrorCode.SCRIPT_TIMEOUT : ErrorCode.SCRIPT_ERROR,
      `authoring program failed: ${message}`,
      'error',
      'program',
    ));
    return { document: { ...document, project }, diagnostics, materialized: true };
  }

  for (const message of consoleCapture.warnings) {
    diagnostics.push(diagnostic(ErrorCode.VALIDATION_INVALID_VALUE, `program: ${message}`, 'warning', 'program'));
  }
  for (const message of consoleCapture.infos) {
    diagnostics.push(diagnostic(ErrorCode.VALIDATION_INVALID_VALUE, `program: ${message}`, 'info', 'program'));
  }
  return { document: { ...document, project }, diagnostics, materialized: true };
}
