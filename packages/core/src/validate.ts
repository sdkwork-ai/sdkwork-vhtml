/**
 * VHTML validator.
 *
 * Structural, referential, temporal, capability and security checks that can be
 * performed without launching a browser or probing media. File existence checks
 * are opt-in so that validation of in-memory projects and CI fixtures is cheap.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  allClips,
  allTracks,
  clipEnd,
  findAsset,
  findBible,
  findClip,
  findGeneration,
  findScene,
  findTimeline,
  findTrack,
  generatedAssetId,
  resolveReference,
  AUDIO_EFFECT_TYPES,
  VISUAL_EFFECT_TYPES,
  TRANSITION_TYPES,
  type Asset,
  type Clip,
  type ExtensionDeclaration,
  type GenerationTask,
  type OutputConfig,
  type Project,
  type SceneClip,
  type Track,
  type Timeline,
  type Transition,
  type VhtmlDocument,
} from './model.ts';
import { DiagnosticBag, ErrorCode, VhtmlError, type Diagnostic } from './errors.ts';
import {
  ZERO,
  add,
  frameCount,
  gt,
  gte,
  isZero,
  lt,
  mul,
  rateToNumber,
  sub,
  type Rational,
} from './time.ts';

export interface ValidateOptions {
  /** Project root for file checks and path security. */
  root?: string;
  /** Stat referenced files and reject missing assets (default true when root given). */
  checkFiles?: boolean;
  /** Allow http(s) asset sources. The deterministic runtime must still fetch them. */
  allowRemoteAssets?: boolean;
  /** Maximum asset size in bytes before a warning is emitted. */
  maxAssetSize?: number;
  /** Runtime feature identifiers this implementation claims. */
  supportedFeatures?: ReadonlySet<string>;
  /** Extra diagnostics inherited from parsing. */
  diagnostics?: Diagnostic[];
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  document: VhtmlDocument;
}

/** Requirements the reference runtime can satisfy end-to-end. */
export const DEFAULT_SUPPORTED_FEATURES: ReadonlySet<string> = new Set([
  'html',
  'html5',
  'css',
  'css-animations',
  'web-animations',
  'svg',
  'canvas-2d',
  'javascript',
  'deterministic',
  'video',
  'audio',
  'captions',
  'timeline',
  'transitions',
  'effects',
  'keyframes',
  'generation',
  'chapters',
  'webgl',
  'audio-mixing',
  'h264',
  'vp9',
  'aac',
  'opus',
  'gif',
  'wav',
]);

const CLIP_PROPERTIES = new Set([
  'opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'blur', 'brightness',
  'contrast', 'saturate', 'grayscale', 'sepia', 'invert', 'hueRotate', 'volume', 'pan',
  'clip-path', 'border-radius', 'filter', 'transform',
]);

const KNOWN_SCHEMES = ['http:', 'https:', 'data:', 'file:'];

function resolveAssetPath(root: string, src: string): { absolute: string; inside: boolean } {
  const clean = src.split('#')[0]!.split('?')[0]!;
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw path */
  }
  const absolute = path.resolve(root, decoded);
  const relative = path.relative(root, absolute);
  const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  return { absolute, inside };
}

function realPathInside(root: string, file: string): boolean {
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(file);
    const relative = path.relative(realRoot, realFile);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  } catch {
    return true;
  }
}

function fmt(value: Rational): string {
  return `${value.num}/${value.den}s`;
}

class ProjectValidator {
  readonly bag = new DiagnosticBag();
  readonly options: ValidateOptions & {
    checkFiles: boolean;
    allowRemoteAssets: boolean;
    maxAssetSize: number;
  };
  readonly document: VhtmlDocument;
  readonly root: string;
  readonly features: ReadonlySet<string>;

  constructor(document: VhtmlDocument, options: ValidateOptions) {
    this.document = document;
    this.root = options.root ?? document.source?.root ?? process.cwd();
    this.options = {
      ...options,
      root: this.root,
      checkFiles: options.root ? (options.checkFiles ?? true) : false,
      allowRemoteAssets: options.allowRemoteAssets ?? false,
      maxAssetSize: options.maxAssetSize ?? 512 * 1024 * 1024,
    };
    this.features = options.supportedFeatures ?? DEFAULT_SUPPORTED_FEATURES;
    for (const diagnostic of options.diagnostics ?? []) this.bag.add(diagnostic);
  }

  validate(): ValidationResult {
    const project = this.document.project;
    this.validateComposition(project);
    this.validateIds(project);
    this.validateAssets(project);
    this.validateScenes(project);
    this.validateTimelines(project);
    this.validateTimelineGraph(project);
    this.validateGenerationDirection(project);
    this.validateGenerations(project);
    this.validateBibles(project);
    this.validateExtensionRegistry(project);
    this.validateStoryboard(project);
    this.validateOutputs(project);
    this.validateRequirements(project);
    this.validateMetadata(project);
    const diagnostics = this.bag.items;
    return {
      ok: !diagnostics.some((d) => d.severity === 'error'),
      diagnostics,
      errors: diagnostics.filter((d) => d.severity === 'error'),
      warnings: diagnostics.filter((d) => d.severity === 'warning'),
      document: this.document,
    };
  }

  private error(code: string, message: string, extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}): void {
    this.bag.error(code, message, extra);
  }

  private warn(code: string, message: string, extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}): void {
    this.bag.warning(code, message, extra);
  }

  private validateComposition(project: Project): void {
    const composition = project.composition;
    if (!composition) {
      this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, 'project.composition is missing');
      return;
    }
    if (composition.width <= 0 || composition.height <= 0) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, 'composition width and height must be positive', {
        path: '/composition',
      });
    }
    const rate = rateToNumber(composition.frameRate);
    if (!Number.isFinite(rate) || rate < 1 || rate > 240) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `frame-rate ${rate} is outside the supported range 1–240`, {
        path: '/composition/frame-rate',
      });
    }
    if (isZero(composition.duration) || lt(composition.duration, ZERO)) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, 'composition duration must be positive', {
        path: '/composition/duration',
      });
    } else if (frameCount(composition.duration, composition.frameRate) === 0) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, 'composition is shorter than one frame', {
        path: '/composition/duration',
      });
    }
    if (![1, 2, 4, 6, 8].includes(composition.channels)) {
      this.warn(ErrorCode.VALIDATION_OUT_OF_RANGE, `unusual channel count ${composition.channels}`, {
        path: '/composition/channels',
      });
    }
    if (composition.sampleRate < 8_000 || composition.sampleRate > 192_000) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `sample-rate ${composition.sampleRate} is outside 8000–192000`, {
        path: '/composition/sample-rate',
      });
    }
    if (composition.deviceScaleFactor !== 1) {
      this.warn(
        ErrorCode.RENDER_DETERMINISM_RISK,
        'device-scale-factor other than 1 is allowed but increases device-specific rasterisation differences',
        { path: '/composition/device-scale-factor' },
      );
    }
    if (!project.timelines.some((timeline) => timeline.id === project.mainTimeline)) {
      this.error(ErrorCode.REFERENCE_NOT_FOUND, `main timeline "${project.mainTimeline}" does not exist`, {
        path: '/mainTimeline',
      });
    }
  }

  private validateIds(project: Project): void {
    const ids = new Map<string, string>();
    const add = (id: string, kind: string): void => {
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(id)) {
        this.error(
          ErrorCode.VALIDATION_INVALID_VALUE,
          `id "${id}" must start with a letter or underscore and contain only letters, digits, "_", ".", ":" or "-"`,
          { objectId: id },
        );
      }
      const previous = ids.get(id);
      if (previous) {
        this.error(
          ErrorCode.VALIDATION_DUPLICATE_ID,
          `duplicate id "${id}" used by ${previous} and ${kind}`,
          { objectId: id },
        );
      }
      ids.set(id, kind);
    };
    add(project.id, 'project');
    for (const asset of project.assets) add(asset.id, 'asset');
    for (const scene of project.scenes) add(scene.id, 'scene');
    for (const timeline of project.timelines) {
      add(timeline.id, 'timeline');
      for (const track of timeline.tracks) {
        add(track.id, 'lane');
        for (const clip of track.clips) add(clip.id, 'clip');
        for (const transition of track.transitions) add(transition.id, 'transition');
        for (const clip of track.clips) {
          for (const effect of clip.effects) if (effect.id) add(effect.id, 'effect');
          for (const effect of clip.audioEffects) if (effect.id) add(effect.id, 'audio-effect');
          for (const animation of clip.animations) add(animation.id, 'animation');
        }
      }
    }
    for (const task of project.generations) add(task.id, 'generate');
    for (const shot of project.storyboard ?? []) add(shot.id, 'shot');
    for (const output of project.outputs) add(output.id, 'output');
    for (const animation of project.animations) add(animation.id, 'animation');
  }

  private validateAssets(project: Project): void {
    for (const asset of project.assets) {
      this.validateAsset(project, asset);
    }
  }

  private validateAsset(project: Project, asset: Asset): void {
    if (!asset.src) {
      this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, `asset "${asset.id}" has no src`, { objectId: asset.id, path: `/assets/${asset.id}` });
      return;
    }
    const generated = Boolean(asset.generatedBy) || asset.provenance?.source === 'generated';
    const isRemote = /^https?:\/\//i.test(asset.src);
    if (isRemote) {
      if (!this.options.allowRemoteAssets) {
        this.warn(
          ErrorCode.SECURITY_NETWORK_BLOCKED,
          `asset "${asset.id}" points to a remote URL; deterministic export requires the network policy to allow it`,
          { objectId: asset.id },
        );
      }
      return;
    }
    if (asset.src.startsWith('data:')) {
      if (!/^data:(image|audio|video|font)\//i.test(asset.src)) {
        this.warn(ErrorCode.SECURITY_NETWORK_BLOCKED, `asset "${asset.id}" uses an unsupported data URI`, { objectId: asset.id });
      }
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(asset.src)) {
      const scheme = asset.src.slice(0, asset.src.indexOf(':') + 1).toLowerCase();
      if (!KNOWN_SCHEMES.includes(scheme)) {
        this.error(ErrorCode.ASSET_UNSUPPORTED_TYPE, `asset "${asset.id}" uses unsupported scheme ${scheme}`, { objectId: asset.id });
      }
      return;
    }
    const { absolute, inside } = resolveAssetPath(this.root, asset.src);
    if (!inside) {
      this.error(
        ErrorCode.SECURITY_PATH_ESCAPE,
        `asset "${asset.id}" resolves outside the project root (${asset.src})`,
        { objectId: asset.id },
      );
      return;
    }
    if (!this.options.checkFiles) return;
    if (!fs.existsSync(absolute)) {
      this.error(ErrorCode.ASSET_NOT_FOUND, `asset "${asset.id}" file does not exist: ${asset.src}`, {
        objectId: asset.id,
        path: `/assets/${asset.id}/src`,
      });
      return;
    }
    if (!realPathInside(this.root, absolute)) {
      this.error(ErrorCode.SECURITY_PATH_ESCAPE, `asset "${asset.id}" resolves outside the project root via a link`, {
        objectId: asset.id,
      });
      return;
    }
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) {
        this.error(ErrorCode.ASSET_NOT_FOUND, `asset "${asset.id}" is not a file: ${asset.src}`, { objectId: asset.id });
      } else if (stat.size > this.options.maxAssetSize) {
        this.warn(
          ErrorCode.ASSET_TOO_LARGE,
          `asset "${asset.id}" is ${(stat.size / 1024 / 1024).toFixed(1)} MiB; large assets slow deterministic export`,
          { objectId: asset.id },
        );
      }
    } catch (error) {
      this.error(ErrorCode.IO_FAILED, `cannot stat asset "${asset.id}": ${(error as Error).message}`, { objectId: asset.id });
    }
    if (asset.kind === 'video' || asset.kind === 'audio') {
      if (asset.duration && lt(asset.duration, ZERO)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `asset "${asset.id}" has a negative duration`, { objectId: asset.id });
      }
    }
  }

  private validateScenes(project: Project): void {
    for (const scene of project.scenes) {
      if (scene.src) {
        // The parser owns the "external Scene must be local" diagnostic; a URL
        // cannot be resolved as a project path here.
        const remote = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(scene.src);
        if (!remote) {
          const resolved = resolveAssetPath(this.root, scene.src);
          if (!resolved.inside) {
            this.error(ErrorCode.SECURITY_PATH_ESCAPE, `scene "${scene.id}" src escapes the project root: ${scene.src}`, {
              objectId: scene.id,
            });
          } else if (this.options.checkFiles && !fs.existsSync(resolved.absolute)) {
            this.error(ErrorCode.ASSET_NOT_FOUND, `scene "${scene.id}" external file not found: ${scene.src}`, {
              objectId: scene.id,
            });
          } else if (this.options.checkFiles && !realPathInside(this.root, resolved.absolute)) {
            this.error(ErrorCode.SECURITY_PATH_ESCAPE, `scene "${scene.id}" src resolves outside the project root via a link`, {
              objectId: scene.id,
            });
          }
        }
      } else if (!scene.html.trim()) {
        this.warn(ErrorCode.PARSE_INVALID_TAG, `scene "${scene.id}" has no HTML content`, { objectId: scene.id });
      }
      if (scene.duration && lt(scene.duration, ZERO)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `scene "${scene.id}" has a negative duration`, { objectId: scene.id });
      }
      if (scene.scripts?.length) {
        this.warn(
          ErrorCode.RENDER_DETERMINISM_RISK,
          `scene "${scene.id}" contains scripts; deterministic export virtualises time and randomness but cannot make arbitrary scripts seekable. Prefer the vhtml.onSeek API.`,
          { objectId: scene.id },
        );
      }
      if (scene.css && /url\(\s*['"]?https?:/i.test(scene.css)) {
        this.warn(ErrorCode.SECURITY_NETWORK_BLOCKED, `scene "${scene.id}" CSS references a remote URL`, { objectId: scene.id });
      }
    }
  }

  private validateTimelines(project: Project): void {
    for (const timeline of project.timelines) {
      if (isZero(timeline.duration) || lt(timeline.duration, ZERO)) {
        this.warn(ErrorCode.VALIDATION_EMPTY_TIMELINE, `timeline "${timeline.id}" has zero duration`, {
          objectId: timeline.id,
          path: `/timelines/${timeline.id}`,
        });
      }
      const orders = new Map<number, string>();
      for (const track of timeline.tracks) {
        const existing = orders.get(track.order);
        if (existing) {
          this.warn(
            ErrorCode.VALIDATION_INVALID_VALUE,
            `lanes "${existing}" and "${track.id}" share order ${track.order}; document order breaks the tie`,
            { objectId: track.id },
          );
        }
        orders.set(track.order, track.id);
        this.validateTrack(project, timeline, track);
      }
      for (const marker of timeline.markers) {
        if (gt(marker.time, timeline.duration)) {
          this.warn(ErrorCode.TIME_INVALID, `marker "${marker.id}" lies after the timeline end`, { objectId: marker.id });
        }
      }
      if (timeline.id === project.mainTimeline && gt(timeline.duration, project.composition.duration)) {
        this.warn(
          ErrorCode.TIME_INVALID,
          `main timeline is longer than the composition; trailing content (${fmt(sub(timeline.duration, project.composition.duration))}) will not be rendered`,
          { objectId: timeline.id },
        );
      }
    }
  }

  /**
   * Nested timeline clips must form a DAG: report cycles and self-references
   * before any renderer can recurse into them.
   */
  private validateTimelineGraph(project: Project): void {
    const edges = new Map<string, Set<string>>();
    const edgeClips = new Map<string, Map<string, string>>();
    for (const { timeline, track, clip } of allClips(project)) {
      if (clip.kind !== 'timeline' || !clip.ref) continue;
      const resolved = resolveReference(project, clip.ref);
      if (!resolved || resolved.kind !== 'timeline') continue;
      const target = resolved.timeline.id;
      if (!edges.has(timeline.id)) edges.set(timeline.id, new Set());
      edges.get(timeline.id)!.add(target);
      if (!edgeClips.has(timeline.id)) edgeClips.set(timeline.id, new Map());
      edgeClips.get(timeline.id)!.set(target, clip.id);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        const cycleStart = stack.indexOf(id);
        const cycle = [...stack.slice(cycleStart), id].join(' -> ');
        const from = cycleStart >= 0 ? stack[cycleStart]! : id;
        this.error(
          ErrorCode.REFERENCE_CYCLE,
          `nested timeline cycle: ${cycle}`,
          { objectId: edgeClips.get(from)?.get(stack[(cycleStart + 1) % stack.length] ?? '') },
        );
        return;
      }
      visiting.add(id);
      stack.push(id);
      for (const next of edges.get(id) ?? []) visit(next);
      stack.pop();
      visiting.delete(id);
      visited.add(id);
    };
    for (const timeline of project.timelines) visit(timeline.id);
  }

  private validateTrack(project: Project, timeline: Timeline, track: Track): void {
    const clipIds = new Set(track.clips.map((clip) => clip.id));
    if (clipIds.size !== track.clips.length) {
      this.error(ErrorCode.VALIDATION_DUPLICATE_ID, `lane "${track.id}" contains duplicate clip ids`, { objectId: track.id });
    }
    for (const clip of track.clips) {
      this.validateClip(project, timeline, track, clip);
    }
    for (const transition of track.transitions) {
      this.validateTransition(track, transition);
    }
    for (const clip of track.clips) {
      for (const animation of clip.animations) {
        if (animation.clipId && animation.clipId !== clip.id) {
          this.warn(
            ErrorCode.REFERENCE_INCOMPATIBLE,
            `animation "${animation.id}" targets clip "${animation.clipId}" but is nested in clip "${clip.id}"`,
            { objectId: animation.id },
          );
        }
      }
    }
    if (track.type === 'caption') {
      const hasCues = track.clips.every((clip) => clip.kind === 'caption');
      if (!hasCues) this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `caption lane "${track.id}" must contain only cues`, { objectId: track.id });
    }
  }

  private validateClip(project: Project, timeline: Timeline, track: Track, clip: Clip): void {
    const context = { objectId: clip.id, path: `/timelines/${timeline.id}/lanes/${track.id}/clips/${clip.id}` };
    const end = clipEnd(clip);
    if (lt(clip.start, ZERO)) {
      this.error(ErrorCode.TIME_INVALID, `clip "${clip.id}" starts before zero`, context);
    }
    if (lt(clip.duration, ZERO) || isZero(clip.duration)) {
      this.error(ErrorCode.TIME_INVALID, `clip "${clip.id}" has no duration`, context);
    }
    if (gt(end, timeline.duration)) {
      this.error(ErrorCode.VALIDATION_CLIP_OVERFLOW, `clip "${clip.id}" ends after the timeline`, context);
    }
    if (clip.speed.num <= 0) {
      this.error(ErrorCode.TIME_INVALID, `clip "${clip.id}" speed must be positive`, context);
    }
    if (clip.volume < 0) this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" volume must not be negative`, context);
    if (clip.pan < -1 || clip.pan > 1) this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" pan must be within -1..1`, context);
    if (clip.opacity < 0 || clip.opacity > 1) this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" opacity must be within 0..1`, context);
    if (clip.transform.scaleX === 0 || clip.transform.scaleY === 0) {
      this.warn(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" has a zero scale and may be invisible`, context);
    }
    if (!Number.isFinite(clip.transform.x) || !Number.isFinite(clip.transform.y) || !Number.isFinite(clip.transform.rotate)) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `clip "${clip.id}" has non-finite transform values`, context);
    }
    if (clip.fadeIn && gt(clip.fadeIn, clip.duration)) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" fade-in exceeds duration`, context);
    }
    if (clip.fadeOut && gt(clip.fadeOut, clip.duration)) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" fade-out exceeds duration`, context);
    }
    if (clip.fadeIn && clip.fadeOut && gt(add(clip.fadeIn, clip.fadeOut), clip.duration)) {
      this.warn(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" fades overlap`, context);
    }
    if (clip.crop) {
      const crop = clip.crop;
      if (crop.left + crop.right >= 1 || crop.top + crop.bottom >= 1) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `clip "${clip.id}" crop hides the whole frame`, context);
      }
    }

    const trackType = track.type;
    if (trackType === 'audio') {
      if (!['audio', 'video'].includes(clip.kind)) {
        this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `audio lane "${track.id}" cannot contain ${clip.kind} clip "${clip.id}"`, context);
      }
    } else if (trackType === 'caption') {
      if (clip.kind !== 'caption') {
        this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `caption lane "${track.id}" cannot contain ${clip.kind} clip "${clip.id}"`, context);
      }
    } else if (trackType === 'data') {
      if (clip.kind !== 'data') {
        this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `data lane "${track.id}" cannot contain ${clip.kind} clip "${clip.id}"`, context);
      }
    } else if (clip.kind === 'caption') {
      this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `cue "${clip.id}" must be on a caption lane`, context);
    } else if (clip.kind === 'audio') {
      this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `audio clip "${clip.id}" must be on an audio lane`, context);
    } else if (clip.kind === 'data') {
      this.error(ErrorCode.VALIDATION_INCOMPATIBLE_TRACK, `data clip "${clip.id}" must be on a data lane`, context);
    }

    if (clip.kind === 'caption' && !clip.text.trim()) {
      this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, `cue "${clip.id}" has no text`, context);
    }

    if (['scene', 'video', 'image', 'svg', 'audio'].includes(clip.kind)) {
      const ref = clip.ref;
      if (!ref) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `clip "${clip.id}" has no ref`, context);
      } else {
        const resolved = resolveReference(project, ref);
        if (!resolved) {
          const isGenerated = ref.startsWith('gen:');
          if (!isGenerated) {
            this.error(ErrorCode.REFERENCE_NOT_FOUND, `clip "${clip.id}" references missing object "${ref}"`, context);
          } else {
            const taskId = ref.slice(4);
            if (!findGeneration(project, taskId)) {
              this.error(ErrorCode.GENERATION_TASK_NOT_FOUND, `clip "${clip.id}" references missing generation task "${taskId}"`, context);
            } else {
              this.bag.info(
                ErrorCode.ASSET_UNAVAILABLE,
                `clip "${clip.id}" references generated asset "${ref}" which must be materialised before export`,
                { objectId: clip.id },
              );
            }
          }
        } else if (clip.kind === 'scene' && resolved.kind !== 'scene') {
          this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `clip "${clip.id}" expects a scene but "${ref}" is a ${resolved.kind}`, context);
        } else if (clip.kind === 'audio') {
          if (resolved.kind === 'scene') {
            this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `audio clip "${clip.id}" cannot reference a scene`, context);
          } else if (resolved.kind === 'asset' && resolved.asset.kind !== 'audio' && resolved.asset.kind !== 'video') {
            this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `audio clip "${clip.id}" needs audio or video media`, context);
          }
        } else if (clip.kind === 'video' && resolved.kind === 'asset' && resolved.asset.kind !== 'video') {
          this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `video clip "${clip.id}" needs a video asset`, context);
        } else if (clip.kind === 'image' && resolved.kind === 'asset' && resolved.asset.kind !== 'image') {
          this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `image clip "${clip.id}" needs an image asset`, context);
        } else if (clip.kind === 'svg' && resolved.kind === 'asset' && resolved.asset.kind !== 'svg' && resolved.asset.kind !== 'image') {
          this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `svg clip "${clip.id}" needs an SVG image asset`, context);
        }
        if (resolved?.kind === 'scene' && clip.kind === 'scene') {
          const scene = resolved.scene;
          const sceneClip = clip as SceneClip;
          if (scene.duration && !sceneClip.loop && gt(clip.duration, scene.duration)) {
            this.warn(
              ErrorCode.TIME_OUT_OF_SOURCE,
              `scene clip "${clip.id}" is longer than scene "${scene.id}"; scene-local time continues beyond its nominal duration`,
              context,
            );
          }
        }
        if (clip.kind === 'video' || clip.kind === 'audio') {
          let sourceDuration: Rational | undefined;
          if (resolved?.kind === 'asset') sourceDuration = resolved.asset.duration;
          else if (resolved?.kind === 'generation') sourceDuration = resolved.task.constraints.duration;
          if (sourceDuration && !clip.freeze) {
            const actualOut = clip.sourceOut ?? add(clip.sourceIn, mul(clip.duration, clip.speed));
            if (lt(clip.sourceIn, ZERO)) {
              this.error(ErrorCode.TIME_OUT_OF_SOURCE, `clip "${clip.id}" source in-point is negative`, context);
            }
            if (gt(actualOut, sourceDuration)) {
              this.error(
                ErrorCode.TIME_OUT_OF_SOURCE,
                `clip "${clip.id}" source window ${fmt(clip.sourceIn)}..${fmt(actualOut)} exceeds source duration ${fmt(sourceDuration)}`,
                context,
              );
            }
          }
        }
      }
    }

    if (clip.freeze && clip.timeRemap) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `clip "${clip.id}" sets both freeze and time remap`, context);
    }
    if (clip.timeRemap) {
      const keys = clip.timeRemap.keyframes;
      if (!keys.length) {
        this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, `clip "${clip.id}" has an empty time remap`, context);
      } else {
        if (!isZero(keys[0]!.at)) {
          this.warn(
            ErrorCode.TIME_INVALID,
            `clip "${clip.id}" time remap does not start at 0; earlier clip time holds the first source position`,
            context,
          );
        }
        for (let index = 1; index < keys.length; index += 1) {
          if (gte(keys[index - 1]!.at, keys[index]!.at)) {
            this.error(ErrorCode.TIME_INVALID, `clip "${clip.id}" time remap keyframes must have strictly increasing times`, context);
            break;
          }
        }
        for (const keyframe of keys) {
          if (lt(keyframe.source, ZERO)) {
            this.warn(ErrorCode.TIME_OUT_OF_SOURCE, `clip "${clip.id}" time remap has a negative source position`, context);
          }
        }
        if ((clip.kind === 'video' || clip.kind === 'audio') && keys.length > 2) {
          this.bag.info(
            ErrorCode.RENDER_UNSUPPORTED_FEATURE,
            `clip "${clip.id}" remaps audio time with a curve; the soundtrack uses a piecewise-constant approximation between keyframes`,
            { objectId: clip.id },
          );
        }
      }
    }
    if (clip.kind === 'timeline' && clip.ref) {
      const resolved = resolveReference(project, clip.ref);
      if (!resolved) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `timeline clip "${clip.id}" references missing timeline "${clip.ref}"`, context);
      } else if (resolved.kind !== 'timeline') {
        this.error(ErrorCode.REFERENCE_INCOMPATIBLE, `timeline clip "${clip.id}" expects a timeline but "${clip.ref}" is a ${resolved.kind}`, context);
      }
    }
    if (clip.audioOffset) {
      if (clip.kind !== 'audio' && clip.kind !== 'video' && clip.kind !== 'timeline') {
        this.warn(
          ErrorCode.VALIDATION_INVALID_VALUE,
          `clip "${clip.id}" has an audio-offset but produces no audio; the offset is ignored`,
          context,
        );
      } else {
        let sourceDuration: Rational | undefined;
        const ref = clip.ref ? resolveReference(project, clip.ref) : undefined;
        if (ref?.kind === 'asset') sourceDuration = ref.asset.duration;
        else if (ref?.kind === 'generation') sourceDuration = ref.task.constraints.duration;
        if (sourceDuration) {
          const readStart = add(clip.sourceIn, clip.audioOffset);
          const readEnd = add(clip.sourceOut ?? add(clip.sourceIn, mul(clip.duration, clip.speed)), clip.audioOffset);
          if (lt(readStart, ZERO)) {
            this.warn(
              ErrorCode.TIME_OUT_OF_SOURCE,
              `clip "${clip.id}" audio-offset leads before the start of the source; the silent lead is padded`,
              context,
            );
          }
          if (gt(readEnd, sourceDuration)) {
            this.warn(
              ErrorCode.TIME_OUT_OF_SOURCE,
              `clip "${clip.id}" audio-offset pushes the audio read past the end of the source (${fmt(readEnd)} > ${fmt(sourceDuration)}); the tail is silent`,
              context,
            );
          }
        }
      }
    }

    for (const effect of [...clip.effects, ...clip.audioEffects]) {
      if (!effect.enabled) continue;
      const isVisual = clip.effects.includes(effect);
      const known = isVisual ? VISUAL_EFFECT_TYPES : AUDIO_EFFECT_TYPES;
      if (!known.has(effect.type) && !this.declaredTypes(project, isVisual ? 'effect' : 'audio-effect').has(effect.type)) {
        this.warn(
          ErrorCode.RENDER_UNSUPPORTED_FEATURE,
          `unknown ${isVisual ? 'visual' : 'audio'} effect "${effect.type}" on clip "${clip.id}"; declare it with <extension kind="${isVisual ? 'effect' : 'audio-effect'}" base="..."> or replace it`,
          { objectId: clip.id },
        );
      }
      if (effect.type === 'ducking') {
        const reduction = Number(effect.params.reduction ?? 0.25);
        if (!Number.isFinite(reduction) || reduction < 0 || reduction > 1) {
          this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `ducking on clip "${clip.id}" needs reduction within 0..1`, { objectId: clip.id });
        }
        const sidechain = String(effect.params['sidechain-track'] ?? effect.params['sidechainTrack'] ?? '');
        if (!sidechain) {
          this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, `ducking on clip "${clip.id}" requires a sidechain-track param`, { objectId: clip.id });
        } else if (!project.timelines.some((candidate) => candidate.tracks.some((track) => track.id === sidechain))) {
          this.error(ErrorCode.REFERENCE_NOT_FOUND, `ducking on clip "${clip.id}" references missing sidechain track "${sidechain}"`, { objectId: clip.id });
        }
        for (const [name, fallbackMax] of [['attack', 5], ['release', 5], ['hold', 5]] as const) {
          const value = Number(effect.params[name] ?? 0);
          if (!Number.isFinite(value) || value < 0 || value > fallbackMax) {
            this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `ducking ${name} on clip "${clip.id}" must be within 0..${fallbackMax}s`, { objectId: clip.id });
          }
        }
      }
    }

    for (const animation of clip.animations) {
      this.validateAnimation(project, animation, clip.id, context);
    }
    void clip;
  }

  /** Soft validation for portable generation-direction vocabularies. */
  private validateGenerationDirection(project: Project): void {
    const cameraMoves = new Set([
      'none', 'push-in', 'pull-out', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right',
      'tilt-up', 'tilt-down', 'orbit', 'crane-up', 'crane-down', 'handheld', 'follow',
    ]);
    for (const task of project.generations) {
      const video = task.direction?.video;
      if (video?.cameraMove && !cameraMoves.has(video.cameraMove)) {
        this.warn(
          ErrorCode.VALIDATION_INVALID_VALUE,
          `generation "${task.id}" cameraMove "${video.cameraMove}" is outside the recommended vocabulary; adapters may not map it`,
          { objectId: task.id },
        );
      }
      if (video?.motionStrength !== undefined && (video.motionStrength < 0 || video.motionStrength > 1)) {
        this.warn(
          ErrorCode.VALIDATION_OUT_OF_RANGE,
          `generation "${task.id}" motionStrength must be within 0..1 (normalised)`,
          { objectId: task.id },
        );
      }
      if (task.direction?.music?.instrumental && task.direction.music.vocals && task.direction.music.vocals !== 'none') {
        this.warn(
          ErrorCode.VALIDATION_INVALID_VALUE,
          `generation "${task.id}" sets instrumental=true with vocals="${task.direction.music.vocals}"; instrumental wins`,
          { objectId: task.id },
        );
      }
    }
  }

  private validateAnimation(project: Project, animation: NonNullable<Clip['animations'][number]>, clipId: string | undefined, context: Omit<Diagnostic, 'code' | 'message' | 'severity'>): void {
    if (animation.keyframes.length === 0) {
      this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, `animation "${animation.id}" has no keyframes`, { ...context, objectId: animation.id });
    }
    if (isZero(animation.duration) || lt(animation.duration, ZERO)) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `animation "${animation.id}" has zero duration`, { ...context, objectId: animation.id });
    }
    let previous = ZERO;
    for (const keyframe of animation.keyframes) {
      if (lt(keyframe.time, ZERO)) {
        this.error(ErrorCode.TIME_INVALID, `animation "${animation.id}" has a negative keyframe time`, { ...context, objectId: animation.id });
      }
      if (lt(keyframe.time, previous)) {
        this.error(ErrorCode.TIME_INVALID, `animation "${animation.id}" keyframes are not ordered`, { ...context, objectId: animation.id });
      }
      if (gt(keyframe.time, animation.duration)) {
        this.error(ErrorCode.TIME_INVALID, `animation "${animation.id}" keyframe exceeds duration`, { ...context, objectId: animation.id });
      }
      previous = keyframe.time;
    }
    if (animation.clipId && !findClip(project, animation.clipId)) {
      this.error(ErrorCode.REFERENCE_NOT_FOUND, `animation "${animation.id}" targets missing clip "${animation.clipId}"`, { ...context, objectId: animation.id });
    }
    if (!animation.clipId && !animation.selector && !clipId) {
      this.error(ErrorCode.VALIDATION_MISSING_REQUIRED, `animation "${animation.id}" has no selector`, { ...context, objectId: animation.id });
    }
    const known = CLIP_PROPERTIES.has(animation.property);
    const custom = animation.property.startsWith('--') || animation.property.includes('-') || animation.property.startsWith('css:');
    if (!known && !custom) {
      this.warn(
        ErrorCode.RENDER_UNSUPPORTED_FEATURE,
        `animation property "${animation.property}" is not a core property; it is applied as a CSS property when targeting HTML elements`,
        { ...context, objectId: animation.id },
      );
    }
  }

  private validateTransition(track: Track, transition: Transition): void {
    const from = findClipInTrack(track, transition.fromClipId);
    const to = findClipInTrack(track, transition.toClipId);
    if (!from || !to) {
      this.error(ErrorCode.REFERENCE_NOT_FOUND, `transition "${transition.id}" references clips outside its lane`, { objectId: transition.id });
      return;
    }
    const fromEnd = clipEnd(from);
    const toEnd = clipEnd(to);
    const overlapStart = gt(from.start, to.start) ? from.start : to.start;
    const overlapEnd = lt(fromEnd, toEnd) ? fromEnd : toEnd;
    const overlap = sub(overlapEnd, overlapStart);
    if (!gt(overlap, ZERO)) {
      this.error(
        ErrorCode.TIME_TRANSITION_INVALID,
        `transition "${transition.id}" needs overlapping clips`,
        { objectId: transition.id },
      );
    } else if (gt(transition.duration, overlap)) {
      this.error(
        ErrorCode.TIME_TRANSITION_INVALID,
        `transition "${transition.id}" duration ${fmt(transition.duration)} exceeds overlap ${fmt(overlap)}`,
        { objectId: transition.id },
      );
    }
    if (!lt(from.start, to.start)) {
      this.error(ErrorCode.TIME_TRANSITION_INVALID, `transition "${transition.id}" requires from to start before to`, { objectId: transition.id });
    }
  }

  private validateGenerations(project: Project): void {
    for (const task of project.generations) {
      if (!task.prompt.trim()) {
        this.warn(ErrorCode.GENERATION_PROVIDER_ERROR, `generation "${task.id}" has an empty prompt`, { objectId: task.id });
      }
      if (task.constraints.duration && !gt(task.constraints.duration, ZERO)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `generation "${task.id}" duration must be positive`, { objectId: task.id });
      }
      for (const input of task.inputs) {
        if (!resolveReference(project, input.ref)) {
          this.error(ErrorCode.REFERENCE_NOT_FOUND, `generation "${task.id}" input "${input.ref}" does not exist`, { objectId: task.id });
        }
      }
      const generated = generatedAssetId(task.id);
      if (!findAsset(project, generated) && task.outputs.length === 0) {
        this.bag.info(
          ErrorCode.ASSET_UNAVAILABLE,
          `generation "${task.id}" has not been materialised; run "vhtml generate" or export with --generate`,
          { objectId: task.id },
        );
      }
      for (const output of task.outputs) {
        if (output.path) {
          const resolved = path.resolve(this.root, output.path);
          const relative = path.relative(this.root, resolved);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            this.error(ErrorCode.SECURITY_PATH_ESCAPE, `generation "${task.id}" output path escapes the project root`, { objectId: task.id });
          }
        }
      }
      if ((task.rights?.likeness === 'consented' || task.rights?.voiceCloning === 'consented') && !task.rights?.consent) {
        this.warn(ErrorCode.GENERATION_PROVIDER_ERROR, `generation "${task.id}" declares consented likeness/voice but has no consent reference`, { objectId: task.id });
      }
      if (task.usage?.cost !== undefined && !task.usage.currency) {
        this.warn(ErrorCode.VALIDATION_INVALID_VALUE, `generation "${task.id}" records cost without a currency; totals will mix units`, { objectId: task.id });
      }
    }

    const byId = new Map(project.generations.map((task) => [task.id, task]));
    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const visit = (task: GenerationTask): void => {
      const current = state.get(task.id) ?? 0;
      if (current === 2) return;
      if (current === 1) {
        const cycle = [...stack.slice(stack.indexOf(task.id)), task.id].join(' -> ');
        this.error(ErrorCode.GENERATION_DEPENDENCY_CYCLE, `generation dependency cycle: ${cycle}`, { objectId: task.id });
        return;
      }
      state.set(task.id, 1);
      stack.push(task.id);
      for (const input of task.inputs) {
        const ref = input.ref.startsWith('gen:') ? input.ref.slice(4) : input.ref;
        const dependency = byId.get(ref);
        if (dependency) visit(dependency);
      }
      stack.pop();
      state.set(task.id, 2);
    };
    for (const task of project.generations) visit(task);
  }

  /** Validate the character & style bible library (RFC-0014). */
  private validateBibles(project: Project): void {
    for (const bible of project.bibles ?? []) {
      const context = { objectId: bible.id };
      if (!bible.description && bible.references.length === 0) {
        this.bag.info(
          ErrorCode.VALIDATION_MISSING_REQUIRED,
          `${bible.kind === 'character' ? 'character' : 'style-guide'} "${bible.id}" has neither a description nor reference sheets; it cannot anchor generation consistency`,
          context,
        );
      }
      for (const reference of bible.references) {
        if (!resolveReference(project, reference.ref)) {
          this.error(
            ErrorCode.REFERENCE_NOT_FOUND,
            `${bible.kind} "${bible.id}" references missing "${reference.ref}"`,
            context,
          );
        }
      }
    }
  }

  /**
   * Validate the extension registry (RFC-0015). Plugin declarations must
   * desugar onto a built-in behaviour of the same family so that rendering
   * degrades deterministically instead of silently.
   */
  private validateExtensionRegistry(project: Project): void {
    const families: Record<string, ReadonlySet<string>> = {
      effect: VISUAL_EFFECT_TYPES,
      'audio-effect': AUDIO_EFFECT_TYPES,
      transition: TRANSITION_TYPES,
    };
    for (const declaration of Object.values(project.extensions ?? {})) {
      if (!declaration.kind) continue;
      const context = { objectId: declaration.name };
      const known = families[declaration.kind];
      if (!declaration.base || !known?.has(declaration.base)) {
        this.error(
          ErrorCode.EXTENSION_INVALID,
          `extension "${declaration.name}" kind="${declaration.kind}" must declare base="${
            [...(known ?? [])].join('|')
          }"; got ${declaration.base ? `"${declaration.base}"` : 'no base'}`,
          context,
        );
      }
    }
  }

  /** Effect/transition types contributed by plugin declarations (RFC-0015). */
  private declaredTypes(project: Project, kind: ExtensionDeclaration['kind']): Map<string, ExtensionDeclaration> {
    const result = new Map<string, ExtensionDeclaration>();
    for (const declaration of Object.values(project.extensions ?? {})) {
      if (declaration.kind === kind) result.set(declaration.name, declaration);
    }
    return result;
  }

  private validateStoryboard(project: Project): void {
    const shots = project.storyboard ?? [];
    const orders = new Set<number>();
    for (const shot of shots) {
      if (shot.order < 1) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `shot "${shot.id}" order must be >= 1`, { objectId: shot.id });
      }
      if (orders.has(shot.order)) {
        this.error(ErrorCode.VALIDATION_DUPLICATE_ID, `shot "${shot.id}" has duplicate order ${shot.order}`, { objectId: shot.id });
      }
      orders.add(shot.order);
      if (shot.scene && !findScene(project, shot.scene)) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `shot "${shot.id}" references missing Scene "${shot.scene}"`, { objectId: shot.id });
      }
      if (shot.generation && !findGeneration(project, shot.generation)) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `shot "${shot.id}" references missing generation "${shot.generation}"`, { objectId: shot.id });
      }
      if (shot.asset && !findAsset(project, shot.asset)) {
        this.error(ErrorCode.REFERENCE_NOT_FOUND, `shot "${shot.id}" references missing asset "${shot.asset}"`, { objectId: shot.id });
      }
      if (shot.duration && !gt(shot.duration, ZERO)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `shot "${shot.id}" duration must be positive`, { objectId: shot.id });
      }
      const task = shot.generation ? findGeneration(project, shot.generation) : undefined;
      if (task && ['audio', 'music', 'speech', 'sfx', 'dub'].includes(task.kind)) {
        this.warn(ErrorCode.VALIDATION_INVALID_VALUE, `shot "${shot.id}" links a non-visual ${task.kind} generation`, { objectId: shot.id });
      }
    }
  }

  private validateOutputs(project: Project): void {
    for (const output of project.outputs) {
      this.validateOutput(project, output);
    }
  }

  private validateOutput(project: Project, output: OutputConfig): void {
    const timeline = findTimeline(project, output.timeline);
    if (!timeline) {
      this.error(ErrorCode.REFERENCE_NOT_FOUND, `output "${output.id}" references missing timeline "${output.timeline}"`, { objectId: output.id });
    }
    if (output.width <= 0 || output.height <= 0) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `output "${output.id}" needs positive dimensions`, { objectId: output.id });
    }
    if (output.fit && !['stretch', 'contain', 'cover'].includes(output.fit)) {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `output "${output.id}" has unknown fit "${output.fit}"`, { objectId: output.id });
    }
    if (output.pixelFormat === 'yuv420p' && (output.width % 2 !== 0 || output.height % 2 !== 0)) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `output "${output.id}" uses yuv420p but dimensions are odd`, { objectId: output.id });
    }
    const rate = rateToNumber(output.frameRate);
    if (!Number.isFinite(rate) || rate < 1 || rate > 240) {
      this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `output "${output.id}" frame rate must be 1–240`, { objectId: output.id });
    }
    const videoFormats = ['mp4', 'webm', 'gif', 'png-sequence'];
    if (videoFormats.includes(output.format)) {
      if (output.videoCodec === 'none' || !output.videoCodec) {
        this.error(ErrorCode.VALIDATION_INVALID_VALUE, `output "${output.id}" needs a video codec`, { objectId: output.id });
      }
    }
    if (['wav', 'mp3'].includes(output.format) && output.audioCodec === 'none') {
      this.error(ErrorCode.VALIDATION_INVALID_VALUE, `output "${output.id}" needs an audio codec`, { objectId: output.id });
    }
    if (output.rangeStart || output.rangeDuration) {
      const start = output.rangeStart ?? ZERO;
      if (lt(start, ZERO)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `output "${output.id}" range starts before zero`, { objectId: output.id });
      }
      if (!output.rangeDuration || !gt(output.rangeDuration, ZERO)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `output "${output.id}" range needs a positive duration`, { objectId: output.id });
      }
      if (timeline && output.rangeDuration && gt(add(start, output.rangeDuration), timeline.duration)) {
        this.error(ErrorCode.VALIDATION_OUT_OF_RANGE, `output "${output.id}" range exceeds the timeline`, { objectId: output.id });
      }
    }
    if (output.path) {
      const absolute = path.resolve(this.root, output.path);
      const relative = path.relative(this.root, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        this.error(ErrorCode.SECURITY_PATH_ESCAPE, `output "${output.id}" path escapes the project root`, { objectId: output.id });
      }
    }
    if (output.burnCaptions && timeline && !timeline.tracks.some((track) => track.type === 'caption')) {
      this.warn(ErrorCode.VALIDATION_INVALID_VALUE, `output "${output.id}" enables burn-captions but the timeline has no caption lane`, { objectId: output.id });
    }
  }

  private validateRequirements(project: Project): void {
    for (const requirement of project.requirements ?? []) {
      if (!this.features.has(requirement)) {
        this.error(
          ErrorCode.CAPABILITY_MISSING,
          `project requires capability "${requirement}" which this runtime does not declare`,
          { objectId: project.id, path: '/requirements' },
        );
      }
    }
    if (project.extensions) {
      for (const [name, value] of Object.entries(project.extensions)) {
        const required = Boolean((value as { required?: boolean }).required);
        if (required && !this.features.has(`extension:${name}`)) {
          this.error(ErrorCode.EXTENSION_UNKNOWN_REQUIRED, `required extension "${name}" is not supported`, { objectId: project.id });
        }
      }
    }
    if (project.scripts?.length) {
      this.warn(
        ErrorCode.RENDER_DETERMINISM_RISK,
        'project scripts run in the renderer. The deterministic profile virtualises Date, Math.random, timers and rAF, but scripts that depend on network responses may not be reproducible.',
      );
    }
  }

  private validateMetadata(project: Project): void {
    const raw = this.document.source?.raw ?? '';
    if (raw && /(sk-[A-Za-z0-9]{20,}|api[_-]?key\s*=|authorization\s*:\s*bearer)/i.test(raw)) {
      this.error(
        ErrorCode.SECURITY_CREDENTIAL_IN_DOCUMENT,
        'document may contain an API key or bearer token. VHTML credentials must be supplied by the host runtime, never stored in a .vhtml file.',
        { objectId: project.id },
      );
    }
  }
}

function findClipInTrack(track: Track, id: string): Clip | undefined {
  return track.clips.find((clip) => clip.id === id);
}

export function validateDocument(document: VhtmlDocument, options: ValidateOptions = {}): ValidationResult {
  return new ProjectValidator(document, options).validate();
}

export function assertValidDocument(document: VhtmlDocument, options: ValidateOptions = {}): ValidationResult {
  const result = validateDocument(document, options);
  if (!result.ok) {
    throw VhtmlError.fromDiagnostic(result.errors[0]!);
  }
  return result;
}

/** Validate a bare project (used by editing APIs and SDK builders). */
export function validateProject(project: Project, options: ValidateOptions = {}): ValidationResult {
  return validateDocument({ specVersion: '1.1', project, source: options.root ? { path: options.root, root: options.root } : undefined }, options);
}

export function summarizeDiagnostics(diagnostics: Diagnostic[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
  };
}
