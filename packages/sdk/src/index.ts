/**
 * VHTML code-first authoring SDK.
 *
 * Videos are ordinary TypeScript/JavaScript programs: loops, functions, data
 * and AI generation are just code. The SDK emits the exact same Core Model
 * used by the parser and renderer, so hand-written .vhtml, SDK-generated
 * projects and inline authoring programs are interchangeable.
 *
 * The pure builders (html, css, clip, lane, caption, animate, effect,
 * transition, …) live in `@sdkwork/vhtml-core/authoring` and are re-exported
 * here unchanged; the inline authoring-program sandbox uses the same builders.
 */

import {
  SPEC_VERSION,
  type Asset,
  type Clip,
  type Composition,
  type GenerationTask,
  type Project,
  type Scene,
  type Timeline,
  type Track,
  type TrackType,
} from '@sdkwork/vhtml-core/model';
import { ZERO, parseFrameRate, rat, sub, toNumber, type Rate } from '@sdkwork/vhtml-core/time';
import { assertValidDocument } from '@sdkwork/vhtml-core/validate';
import { serializeDocument, serializeProject } from '@sdkwork/vhtml-core/serialize';
import { DEFAULT_CLIP } from '@sdkwork/vhtml-core/model';
import {
  buildClip,
  createSceneIndex,
  marker as buildMarker,
  outputConfig,
  resolveClipKind,
  scene as buildScene,
  storyboardShot as buildStoryboardShot,
  generationTask as buildGenerationTask,
  bible as buildBible,
  extension as buildExtension,
  t3,
  transitionId,
  type AssetSpec,
  type CaptionSpec,
  type ClipSpec,
  type GenerationSpec,
  type LaneSpec,
  type MarkerSpec,
  type OutputSpec,
  type StoryboardShotSpec,
  type TimeInput,
} from '@sdkwork/vhtml-core/authoring';

// Re-export the shared authoring surface (public SDK API is unchanged).
export { parseSubtitleBlocks, cueToSeconds } from '@sdkwork/vhtml-core/captions';
export type { SubtitleCue } from '@sdkwork/vhtml-core/captions';
export {
  html,
  rawHtml,
  css,
  t3,
  asset,
  scene,
  animate,
  effect,
  timeRemap,
  clip,
  caption,
  transition,
  lane,
  marker,
  durationFrames,
  bible,
  character,
  styleGuide,
  extension,
  resetAuthoringIds,
} from '@sdkwork/vhtml-core/authoring';
export type {
  TimeInput,
  HtmlEscaped,
  AssetSpec,
  SceneSpec,
  AnimationSpec,
  EffectSpec,
  TimeRemapSpec,
  ClipSpec,
  TransitionSpec,
  LaneSpec,
  CaptionSpec,
  MarkerSpec,
  OutputSpec,
  GenerationSpec,
  StoryboardShotSpec,
  BibleSpec,
  ExtensionSpec,
} from '@sdkwork/vhtml-core/authoring';
// Internal helpers re-exported for tooling compatibility.
export { resolveClipKind, createSceneIndex } from '@sdkwork/vhtml-core/authoring';

export interface VideoDefinition {
  id: string;
  title?: string;
  description?: string;
  lang?: string;
  width?: number;
  height?: number;
  fps?: string | number | Rate;
  duration: TimeInput;
  background?: string;
  colorSpace?: Composition['colorSpace'];
  sampleRate?: number;
  channels?: number;
  seed?: number;
  assets?: Array<Omit<Asset, 'duration'> & { duration?: TimeInput }>;
  scenes?: import('@sdkwork/vhtml-core/authoring').SceneSpec[];
  /** Global CSS for stage-level styles. */
  styles?: string[];
  lanes: LaneSpec[];
  captions?: CaptionSpec[];
  captionStyle?: string;
  markers?: MarkerSpec[];
  generations?: GenerationSpec[];
  /**
   * Versioned character bible library (RFC-0014). Accepts plain specs or
   * pre-built profiles; entries default to `kind: 'character'`.
   */
  characters?: Array<import('@sdkwork/vhtml-core/authoring').BibleSpec | import('@sdkwork/vhtml-core/model').BibleProfile>;
  /** Versioned style guides; merged into the bible library (RFC-0014). */
  styleGuides?: Array<Omit<import('@sdkwork/vhtml-core/authoring').BibleSpec, 'kind'> | import('@sdkwork/vhtml-core/model').BibleProfile>;
  /** Declared extensions / effect-transition plugin registry (RFC-0015). */
  extensions?: import('@sdkwork/vhtml-core/authoring').ExtensionSpec[];
  storyboard?: StoryboardShotSpec[];
  outputs?: OutputSpec[];
  metadata?: Record<string, string>;
}

function laneType(spec: LaneSpec, index: ReturnType<typeof createSceneIndex>): TrackType {
  if (spec.type) return spec.type;
  const kinds = spec.clips.map((clipSpec) => resolveClipKind(clipSpec, index));
  if (kinds.length && kinds.every((kind) => kind === 'caption')) return 'caption';
  if (kinds.length && kinds.every((kind) => kind === 'audio')) return 'audio';
  if (kinds.length && kinds.every((kind) => kind === 'data')) return 'data';
  return 'video';
}

/** Build a complete Project from a declarative code specification. */
export function defineVideo(definition: VideoDefinition): Project {
  const fps = definition.fps !== undefined ? (typeof definition.fps === 'object' ? definition.fps : parseFrameRate(String(definition.fps))) : rat(30);
  const duration = t3(definition.duration, fps);
  const scenes = new Map<string, Scene>();
  for (const sceneSpec of definition.scenes ?? []) {
    scenes.set(sceneSpec.id, {
      ...buildScene(sceneSpec),
      duration: sceneSpec.duration !== undefined ? t3(sceneSpec.duration, fps) : undefined,
    });
  }
  const assets = new Map<string, Asset>();
  for (const assetSpec of definition.assets ?? []) {
    assets.set(assetSpec.id, {
      ...assetSpec,
      duration: assetSpec.duration !== undefined
        ? typeof assetSpec.duration === 'string' || typeof assetSpec.duration === 'number'
          ? t3(assetSpec.duration, fps)
          : assetSpec.duration
        : undefined,
    });
  }
  const generations = new Map<string, GenerationTask>();
  for (const generation of definition.generations ?? []) {
    generations.set(generation.id, buildGenerationTask(generation, fps));
  }
  const bibles = [
    ...(definition.characters ?? []).map((spec) => buildBible({ ...spec, kind: spec.kind ?? 'character' })),
    ...(definition.styleGuides ?? []).map((spec) => buildBible({ ...spec, kind: 'style' })),
  ];
  const extensionDeclarations = (definition.extensions ?? []).map(buildExtension);
  const composition: Composition = {
    width: definition.width ?? 1920,
    height: definition.height ?? 1080,
    frameRate: fps,
    duration,
    sampleRate: definition.sampleRate ?? 48_000,
    channels: definition.channels ?? 2,
    background: definition.background ?? '#000000',
    colorSpace: definition.colorSpace ?? 'srgb',
    seed: definition.seed ?? 1,
    deviceScaleFactor: 1,
  };
  const index = createSceneIndex({
    id: definition.id,
    version: SPEC_VERSION,
    composition,
    assets: [...assets.values()],
    scenes: [...scenes.values()],
    timelines: [],
    generations: [...generations.values()],
    storyboard: [],
    outputs: [],
    styles: [],
    animations: [],
    metadata: {},
    mainTimeline: 'main',
  });
  const lanes: Track[] = [];
  let clipCounter = 0;

  for (const laneSpec of definition.lanes) {
    const clips: Clip[] = [];
    for (const clipSpec of laneSpec.clips) {
      const id = clipSpec.id ?? `${laneSpec.id}-clip-${++clipCounter}`;
      if (clipSpec.html !== undefined && !scenes.has(`${id}-scene`)) {
        const newScene: Scene = {
          id: `${id}-scene`,
          html: clipSpec.html,
          css: clipSpec.css,
        };
        scenes.set(newScene.id, newScene);
        index.scenes.set(newScene.id, newScene);
      }
      clips.push(buildClip({ ...clipSpec, id }, id, index, composition));
    }
    const type = laneType(laneSpec, index);
    const transitions = (laneSpec.transitions ?? []).map((transitionSpec, transitionIndex) => ({
      id: transitionId(laneSpec.id, transitionIndex),
      trackId: laneSpec.id,
      fromClipId: transitionSpec.from,
      toClipId: transitionSpec.to,
      type: transitionSpec.type ?? 'crossfade',
      duration:
        transitionSpec.duration !== undefined
          ? t3(transitionSpec.duration, fps)
          : defaultTransitionDuration(clips, transitionSpec.from, transitionSpec.to),
      easing: transitionSpec.easing ?? 'ease-in-out',
      direction: transitionSpec.direction ?? 'left',
      color: transitionSpec.color ?? '#000000',
      params: transitionSpec.params ?? {},
    }));
    lanes.push({
      id: laneSpec.id,
      type,
      name: laneSpec.name,
      order: laneSpec.order ?? lanes.length,
      enabled: laneSpec.enabled ?? true,
      muted: laneSpec.muted ?? false,
      locked: false,
      volume: laneSpec.volume ?? 1,
      pan: laneSpec.pan ?? 0,
      opacity: laneSpec.opacity ?? 1,
      blend: laneSpec.blend ?? 'normal',
      captionStyle: laneSpec.captionStyle,
      clips,
      transitions,
    });
  }

  if (definition.captions?.length) {
    const cueLane: Track = {
      id: 'captions',
      type: 'caption',
      name: 'Captions',
      order: lanes.length,
      enabled: true,
      muted: false,
      locked: false,
      volume: 1,
      pan: 0,
      opacity: 1,
      blend: 'normal',
      captionStyle: definition.captionStyle,
      clips: [],
      transitions: [],
    };
    definition.captions.forEach((captionSpec, captionIndex) => {
      const starts = t3(captionSpec.start, fps);
      let clipDuration = captionSpec.duration !== undefined ? t3(captionSpec.duration, fps) : undefined;
      if (!clipDuration && captionSpec.end !== undefined) clipDuration = sub(t3(captionSpec.end, fps), starts);
      if (!clipDuration) clipDuration = rat(2);
      cueLane.clips.push({
        ...DEFAULT_CLIP,
        id: captionSpec.id ?? `cue-${captionIndex + 1}`,
        kind: 'caption',
        start: starts,
        duration: clipDuration,
        sourceIn: ZERO,
        text: captionSpec.text,
        speaker: captionSpec.speaker,
        style: captionSpec.style,
        opacity: captionSpec.opacity ?? 1,
      } as Clip);
    });
    lanes.push(cueLane);
  }

  const timeline: Timeline = {
    id: 'main',
    duration,
    tracks: lanes,
    markers: (definition.markers ?? []).map((markerSpec) => buildMarker({ ...markerSpec }, fps)),
  };
  const outputs = (definition.outputs ?? []).map(
    (outputSpec, outputIndex) => outputConfig(outputSpec, composition, outputIndex, 'main'),
  );
  if (!outputs.length) {
    outputs.push(outputConfig({ id: 'mp4' }, composition, 0, 'main'));
  }
  const project: Project = {
    id: definition.id,
    version: SPEC_VERSION,
    title: definition.title,
    description: definition.description,
    lang: definition.lang,
    composition,
    assets: [...assets.values()],
    scenes: [...scenes.values()],
    timelines: [timeline],
    generations: [...generations.values()],
    bibles: bibles.length ? bibles : undefined,
    storyboard: (definition.storyboard ?? []).map((shotSpec, shotIndex) =>
      buildStoryboardShot(shotSpec, shotIndex + 1, fps),
    ),
    outputs,
    styles: definition.styles ?? [],
    animations: [],
    metadata: definition.metadata ?? {},
    extensions: extensionDeclarations.length ? Object.fromEntries(extensionDeclarations.map((declaration) => [declaration.name, declaration])) : undefined,
    mainTimeline: 'main',
  };
  return project;
}

function defaultTransitionDuration(clips: Clip[], fromId: string, toId: string) {
  const from = clips.find((candidate) => candidate.id === fromId);
  const to = clips.find((candidate) => candidate.id === toId);
  if (!from || !to) return rat(0);
  const start = Math.max(toNumber(from.start), toNumber(to.start));
  const end = Math.min(
    toNumber(from.start) + toNumber(from.duration),
    toNumber(to.start) + toNumber(to.duration),
  );
  const seconds = Math.max(0, end - start);
  return rat(Math.round(seconds * 1_000_000), 1_000_000);
}

export function serializeVideo(project: Project): string {
  return serializeProject(project);
}

export function serializeVideoDocument(project: Project): string {
  return serializeDocument({ specVersion: SPEC_VERSION, project });
}

export function validateVideo(project: Project, root = process.cwd()): ReturnType<typeof assertValidDocument> {
  return assertValidDocument(
    { specVersion: SPEC_VERSION, project, source: { path: root, root } },
    { root, checkFiles: false },
  );
}
