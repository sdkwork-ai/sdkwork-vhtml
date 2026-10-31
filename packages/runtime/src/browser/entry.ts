/**
 * VHTML stage runtime (browser entry, bundled into an IIFE by the renderer).
 *
 * Responsibilities:
 *  - apply evaluated frame state to the DOM;
 *  - seek media and CSS/WAAPI animations deterministically;
 *  - run user seek hooks with explicit await/timeout semantics;
 *  - expose the `vhtml` authoring API and the host `__vhtml` protocol.
 */

import { evaluateFrame, type ClipFrameState, type FrameState } from '../evaluate.ts';
import { frameTime, seconds, toNumber, type Rate } from '@sdkwork/vhtml-core/time';
import type { Project } from '@sdkwork/vhtml-core/model';

interface StageData {
  project: Project;
  timelineId: string;
  mode: 'deterministic' | 'preview';
  seed: number;
  frameRate: Rate;
  duration: { num: number; den: number };
  width: number;
  height: number;
}

interface ClockApi {
  now: number;
  advance(ms: number): void;
  settle(): void;
  takeErrors(): string[];
  realNow(): number;
  realSetTimeout(fn: () => void, ms: number): number;
  realClearTimeout(id: number): void;
  realRaf(fn: (time: number) => void): number;
}

interface SeekContext {
  time: number;
  frame: number;
  fps: number;
  duration: number;
  mode: 'deterministic' | 'preview';
}

type SeekHook = (context: SeekContext) => void | Promise<void>;

const data = (window as unknown as { __VHTML_STAGE__?: StageData }).__VHTML_STAGE__ as StageData;
if (!data) throw new Error('VHTML stage data is missing');
const project = data.project;
const deterministic = data.mode === 'deterministic';
const clock = (window as unknown as { __VHTML_CLOCK__?: ClockApi }).__VHTML_CLOCK__;
const stage = document.getElementById('vhtml-stage') as HTMLElement;
if (!stage) throw new Error('VHTML stage element is missing');

const fps = data.frameRate.num / data.frameRate.den;
const duration = toNumber(data.duration);
const realSetTimeout: (fn: () => void, ms: number) => number =
  clock?.realSetTimeout ?? window.setTimeout.bind(window);
const realNow: () => number = clock?.realNow ?? Date.now.bind(Date);
const stableRaf: (fn: (time: number) => void) => number =
  clock?.realRaf ?? window.requestAnimationFrame.bind(window);

const clipElements = new Map<string, HTMLElement>();
const videos = new Map<string, HTMLVideoElement>();
const audios = new Map<string, HTMLAudioElement>();
const captions = new Map<string, HTMLElement>();
const chromaCanvases = new Map<string, HTMLCanvasElement>();
for (const element of stage.querySelectorAll<HTMLElement>('.vhtml-clip[data-clip-id]')) {
  const id = element.dataset.clipId!;
  clipElements.set(id, element);
  const video = element.querySelector('video');
  if (video) videos.set(id, video);
  const caption = element.querySelector<HTMLElement>('.vhtml-caption');
  if (caption) captions.set(id, caption);
  const canvas = element.querySelector<HTMLCanvasElement>('canvas.vhtml-chroma');
  if (canvas) chromaCanvases.set(id, canvas);
}
for (const audio of document.querySelectorAll<HTMLAudioElement>('audio[data-audio-clip-id]')) {
  audios.set(audio.dataset.audioClipId!, audio);
}

const transitionContainer = stage.querySelector<HTMLElement>('.vhtml-transition-overlays');
const transitionElements = new Map<string, HTMLElement>();
const trackedStyles = new WeakMap<Element, Set<string>>();
const trackedTargets = new Set<Element>();
const trackCaptionStyle = new Map<string, string>();
for (const track of project.timelines.flatMap((timeline) => timeline.tracks)) {
  if (track.captionStyle) trackCaptionStyle.set(track.id, track.captionStyle);
}

const seekHooks = new Set<SeekHook>();
const readinessTasks = new Set<Promise<unknown>>();
const runtimeIssues: string[] = [];
let currentState: FrameState | null = null;
let currentTime = 0;
let currentFrame = 0;
let playing = false;
let playRaf = 0;
let playStartedAt = 0;
let playOffset = 0;
let seekCounter = 0;
let queue: Promise<unknown> = Promise.resolve();

const timeApi = {
  current: 0,
  frame: 0,
  fps,
  duration,
  mode: data.mode,
  playing: false,
};

function recordIssue(message: string): void {
  if (runtimeIssues.length < 200) runtimeIssues.push(message);
}

function realDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    realSetTimeout(resolve, Math.max(0, ms));
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = realSetTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    promise.then(
      (value) => {
        if (clock) clock.realClearTimeout(timer);
        else window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (clock) clock.realClearTimeout(timer);
        else window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitForEvent(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = realSetTimeout(() => {
      target.removeEventListener(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (): void => {
      if (clock) clock.realClearTimeout(timer);
      else window.clearTimeout(timer);
      target.removeEventListener(event, handler);
      resolve();
    };
    target.addEventListener(event, handler, { once: true });
  });
}

function clearTracked(element: Element): void {
  const properties = trackedStyles.get(element);
  if (!properties) return;
  const style = (element as HTMLElement).style;
  for (const property of properties) style.removeProperty(property);
  trackedStyles.delete(element);
}

function clearAllTracked(): void {
  for (const element of trackedTargets) clearTracked(element);
  trackedTargets.clear();
}

function setTracked(element: Element, property: string, value: string): void {
  const style = (element as HTMLElement).style;
  let properties = trackedStyles.get(element);
  if (!properties) {
    properties = new Set();
    trackedStyles.set(element, properties);
    trackedTargets.add(element);
  }
  properties.add(property);
  style.setProperty(property, value);
}

function applyElementStyles(root: ParentNode, states: FrameState['globalStyles']): void {
  for (const state of states) {
    let matches: Element[] = [];
    try {
      if (root instanceof Element && root.matches(state.selector)) matches.push(root);
      matches = matches.concat(Array.from(root.querySelectorAll(state.selector)));
    } catch (error) {
      recordIssue(`invalid selector "${state.selector}": ${(error as Error).message}`);
      continue;
    }
    for (const element of matches) {
      for (const [property, value] of Object.entries(state.properties)) {
        setTracked(element, property, value);
      }
    }
  }
}

function applyClipStyle(layer: HTMLElement, state: ClipFrameState): void {
  const style = state.style;
  layer.style.display = 'block';
  layer.style.opacity = String(style.opacity);
  layer.style.transform = style.transform || 'none';
  layer.style.filter = style.filter || 'none';
  if (style.maskImage) {
    // Feathered mask: an alpha ramp rides the mask-image channel; clip-path
    // stays empty so the two reveal channels never stack.
    layer.style.clipPath = 'none';
    layer.style.maskImage = style.maskImage;
    layer.style.setProperty('-webkit-mask-image', style.maskImage);
    if (style.maskComposite) {
      layer.style.maskComposite = style.maskComposite;
      layer.style.setProperty('-webkit-mask-composite', 'source-in');
    }
  } else {
    layer.style.maskImage = 'none';
    layer.style.setProperty('-webkit-mask-image', 'none');
    layer.style.clipPath = style.clipPath ?? 'none';
  }
  layer.style.borderRadius = style.borderRadius ?? '0';
  layer.style.mixBlendMode = style.mixBlendMode || 'normal';
  layer.style.zIndex = String(style.zIndex);
  if (style.css) {
    for (const [property, value] of Object.entries(style.css)) setTracked(layer, property, value);
  }
  const slots = layer.querySelectorAll<HTMLElement>('.vhtml-fx-slot');
  slots.forEach((slot, index) => {
    const overlay = style.overlays[index];
    if (!overlay) {
      slot.style.opacity = '0';
      slot.style.background = 'transparent';
      return;
    }
    slot.style.background = overlay.background;
    slot.style.opacity = String(overlay.opacity);
    slot.style.mixBlendMode = overlay.blendMode;
  });
  // Element-scoped animations are applied relative to the scene root.
  const sceneRoot = layer.querySelector<HTMLElement>('.vhtml-scene-root') ?? layer;
  applyElementStyles(sceneRoot, state.elementStyles);
}

function parseHexColor(color: string): [number, number, number] | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function chromaKeyFrame(
  canvas: HTMLCanvasElement,
  media: HTMLImageElement | HTMLVideoElement,
  color: string,
  tolerance: number,
  spill: number,
): void {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const naturalWidth = (media as HTMLVideoElement).videoWidth || (media as HTMLImageElement).naturalWidth;
  const naturalHeight = (media as HTMLVideoElement).videoHeight || (media as HTMLImageElement).naturalHeight;
  if (!naturalWidth || !naturalHeight) return;
  const scale = Math.max(width / naturalWidth, height / naturalHeight);
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const key = parseHexColor(color) ?? [0, 255, 0];
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const threshold = Math.max(0.01, tolerance) * 441;
  for (let index = 0; index < pixels.length; index += 4) {
    const dr = pixels[index]! - key[0];
    const dg = pixels[index + 1]! - key[1];
    const db = pixels[index + 2]! - key[2];
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance < threshold) {
      pixels[index + 3] = Math.round(pixels[index + 3]! * Math.max(0, distance / threshold));
      if (spill > 0) {
        pixels[index + 1] = Math.max(0, pixels[index + 1]! - spill * 120);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

async function waitForMedia(element: HTMLMediaElement, timeoutMs: number): Promise<void> {
  if (element.readyState >= 1) return;
  try {
    await withTimeout(waitForEvent(element, 'loadedmetadata', timeoutMs), timeoutMs + 100, 'media metadata');
  } catch (error) {
    recordIssue(`${(error as Error).message} for ${element.currentSrc || element.src}`);
  }
}

async function seekMedia(
  media: HTMLMediaElement,
  target: number,
  timeoutMs: number,
): Promise<void> {
  if (!Number.isFinite(target)) return;
  if (media.readyState === 0) await waitForMedia(media, timeoutMs);
  const upper = Number.isFinite(media.duration) && media.duration > 0 ? media.duration - 0.0005 : target;
  const clamped = Math.max(0, Math.min(upper, target));
  if (Math.abs(media.currentTime - clamped) < 0.0005) return;
  try {
    media.currentTime = clamped;
    await withTimeout(waitForEvent(media, 'seeked', timeoutMs), timeoutMs, 'media seek');
  } catch (error) {
    recordIssue(`seek failed at ${clamped.toFixed(3)}s: ${(error as Error).message}`);
  }
  if (media instanceof HTMLVideoElement && typeof media.requestVideoFrameCallback === 'function') {
    await Promise.race([
      new Promise<void>((resolve) => {
        media.requestVideoFrameCallback(() => resolve());
      }),
      realDelay(200),
    ]);
  }
}

async function applyFrame(state: FrameState): Promise<void> {
  currentState = state;
  clearAllTracked();
  const active = new Map(state.clips.map((clip) => [clip.clipId, clip]));
  for (const [clipId, layer] of clipElements) {
    if (!active.has(clipId)) {
      layer.style.display = 'none';
      const video = videos.get(clipId);
      if (video) {
        video.pause();
      }
      const audio = audios.get(clipId);
      if (audio) audio.pause();
    }
  }

  for (const clip of state.clips) {
    const layer = clipElements.get(clip.clipId);
    if (!layer) continue;
    if (clip.kind === 'audio' || clip.kind === 'data') continue;
    applyClipStyle(layer, clip);
    if (clip.caption) {
      const caption = captions.get(clip.clipId);
      if (caption) {
        caption.textContent = clip.caption.text;
        caption.style.color = clip.caption.color;
        if (clip.caption.backgroundColor) caption.style.backgroundColor = clip.caption.backgroundColor;
        else caption.style.removeProperty('background-color');
        caption.style.opacity = '1';
        caption.style.transform = 'none';
        caption.style.textAlign = clip.caption.textAlign;
        caption.style.whiteSpace = 'pre-wrap';
        const css = trackCaptionStyle.get(clip.trackId);
        if (css) {
          for (const declaration of css.split(';')) {
            const index = declaration.indexOf(':');
            if (index > 0) caption.style.setProperty(declaration.slice(0, index).trim(), declaration.slice(index + 1).trim());
          }
        }
        for (const [property, value] of Object.entries(clip.caption.style)) {
          if (property === 'color') continue;
          caption.style.setProperty(property, value);
        }
        if (clip.caption.speaker) caption.dataset.speaker = clip.caption.speaker;
      }
    }

    const media = (videos.get(clip.clipId) ?? layer.querySelector('img.vhtml-media')) as
      | HTMLVideoElement
      | HTMLImageElement
      | null;
    const chroma = clip.style.chromaKey;
    const canvas = chromaCanvases.get(clip.clipId);
    if (media) {
      media.style.visibility = chroma && canvas ? 'hidden' : 'visible';
      if (media instanceof HTMLVideoElement) {
        if (deterministic || !playing || clip.reverse) {
          media.pause();
          if (clip.mediaTime !== undefined) await seekMedia(media, clip.mediaTime, 4000);
        } else {
          const rate = Math.abs(clip.playbackRate) || 1;
          media.playbackRate = Math.min(16, rate);
          if (media.paused && clip.active) {
            try {
              await media.play();
            } catch (error) {
              recordIssue(`video playback blocked: ${(error as Error).message}`);
            }
          }
          if (clip.mediaTime !== undefined && Math.abs(media.currentTime - clip.mediaTime) > 0.35) {
            await seekMedia(media, clip.mediaTime, 1500);
          }
        }
      } else if (clip.kind === 'image' || clip.kind === 'svg') {
        try {
          await (media as HTMLImageElement).decode();
        } catch {
          /* broken images are reported during readiness */
        }
      }
    }
    if (chroma && canvas && media) {
      canvas.hidden = false;
      chromaKeyFrame(canvas, media, chroma.color, chroma.tolerance, chroma.spill);
    } else if (canvas) {
      canvas.hidden = true;
    }
  }

  applyElementStyles(stage, state.globalStyles);

  if (transitionContainer) {
    const activeIds = new Set(state.transitionOverlays.map((overlay) => overlay.id));
    for (const [id, element] of transitionElements) {
      if (!activeIds.has(id)) {
        element.style.opacity = '0';
      }
    }
    for (const overlay of state.transitionOverlays) {
      let element = transitionElements.get(overlay.id);
      if (!element) {
        element = document.createElement('div');
        element.className = 'vhtml-transition-overlay';
        element.dataset.transitionId = overlay.id;
        transitionContainer.appendChild(element);
        transitionElements.set(overlay.id, element);
      }
      element.style.background = overlay.color;
      element.style.opacity = String(overlay.opacity);
    }
  }

  if (deterministic || !playing) {
    await seekWebAnimations(state);
  }

  if (!deterministic) {
    applyPreviewAudio(state);
  } else {
    for (const audio of audios.values()) audio.pause();
  }

  timeApi.current = state.time;
  timeApi.frame = state.frameIndex;
  timeApi.playing = playing;
  stage.dataset.vhtmlTime = state.time.toFixed(6);
  stage.dataset.vhtmlFrame = String(state.frameIndex);
  void stage.offsetHeight;
}

async function seekWebAnimations(state: FrameState): Promise<void> {
  let animations: Animation[] = [];
  try {
    animations = document.getAnimations();
  } catch {
    return;
  }
  const clipStates = new Map(state.clips.map((clip) => [clip.clipId, clip]));
  for (const animation of animations) {
    try {
      if (animation.playState !== 'paused') animation.pause();
      const effect = animation.effect as KeyframeEffect | null;
      const target = effect?.target as Element | null | undefined;
      let time = state.time;
      if (target) {
        const layer = target.closest?.('.vhtml-clip[data-clip-id]') as HTMLElement | null;
        if (layer?.dataset.clipId) {
          const clip = clipStates.get(layer.dataset.clipId);
          if (clip) time = clip.kind === 'scene' ? clip.sceneTime : clip.localTime;
        }
      }
      animation.currentTime = Math.max(0, time * 1000);
    } catch (error) {
      recordIssue(`animation seek failed: ${(error as Error).message}`);
    }
  }
  await Promise.resolve();
}

function applyPreviewAudio(state: FrameState): void {
  const active = new Map(state.clips.filter((clip) => clip.audio).map((clip) => [clip.clipId, clip]));
  for (const [clipId, audio] of audios) {
    const clip = active.get(clipId);
    if (!clip?.audio || !clip.active || clip.audio.muted) {
      audio.pause();
      continue;
    }
    audio.volume = Math.max(0, Math.min(1, clip.audio.gain));
    if (!playing) {
      audio.pause();
      if (Math.abs(audio.currentTime - clip.audio.sourceTime) > 0.02) {
        audio.currentTime = Math.max(0, clip.audio.sourceTime);
      }
      continue;
    }
    audio.playbackRate = Math.min(4, Math.max(0.25, clip.audio.rate));
    if (Math.abs(audio.currentTime - clip.audio.sourceTime) > 0.35) {
      audio.currentTime = Math.max(0, clip.audio.sourceTime);
    }
    if (audio.paused) {
      audio.play().catch((error) => recordIssue(`audio playback blocked: ${(error as Error).message}`));
    }
  }
}

async function runHooks(state: FrameState): Promise<void> {
  if (!seekHooks.size) return;
  const context: SeekContext = {
    time: state.time,
    frame: state.frameIndex,
    fps,
    duration,
    mode: data.mode,
  };
  for (const hook of seekHooks) {
    try {
      const result = hook(context);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await withTimeout(Promise.resolve(result), 15_000, 'vhtml.onSeek hook');
      }
    } catch (error) {
      recordIssue(`onSeek hook failed: ${(error as Error).message}`);
    }
  }
}

async function prepareDocument(): Promise<void> {
  if (document.readyState !== 'complete') {
    if (clock) {
      let stopped = false;
      const pump = (): void => {
        if (stopped) return;
        clock.advance(clock.now);
        clock.settle();
        clock.realSetTimeout(pump, 2);
      };
      window.addEventListener('load', () => { stopped = true; }, { once: true });
      pump();
    }
    await withTimeout(
      new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true })),
      30_000,
      'window load',
    );
  }
  try {
    await withTimeout(document.fonts.ready, 10_000, 'fonts');
  } catch (error) {
    recordIssue((error as Error).message);
  }
  const images = Array.from(document.querySelectorAll('img'));
  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      try {
        await withTimeout(image.decode(), 8000, 'image decode');
      } catch {
        recordIssue(`image failed to load: ${image.currentSrc || image.src}`);
      }
    }),
  );
  const media = [
    ...Array.from(document.querySelectorAll('video')),
    ...Array.from(document.querySelectorAll('audio')),
  ] as HTMLMediaElement[];
  await Promise.all(media.map((element) => waitForMedia(element, 10_000)));
  await Promise.all(Array.from(readinessTasks).map((task) => Promise.resolve(task).catch((error) => recordIssue(String(error)))));
}

async function doSeek(timeSeconds: number, frameIndex?: number, sampleRate?: Rate): Promise<{
  issues: string[];
  time: number;
  frame: number;
}> {
  seekCounter += 1;
  const token = seekCounter;
  const clamped = Math.max(0, Math.min(duration, Number.isFinite(timeSeconds) ? timeSeconds : 0));
  const frame =
    frameIndex !== undefined && Number.isInteger(frameIndex) && frameIndex >= 0
      ? frameIndex
      : Math.floor(clamped * fps + 1e-7);
  const rational =
    frameIndex !== undefined ? frameTime(frame, sampleRate ?? data.frameRate) : seconds(clamped);
  if (deterministic && clock) {
    clock.advance(clamped * 1000);
    clock.settle();
  }
  const state = evaluateFrame(project, rational, {
    timelineId: data.timelineId,
    mode: data.mode,
    frameIndex: frame,
  });
  if (token !== seekCounter) return { issues: [], time: clamped, frame };
  await applyFrame(state);
  if (token !== seekCounter) return { issues: [], time: clamped, frame };
  await runHooks(state);
  const issues = [...state.issues];
  if (clock) issues.push(...clock.takeErrors());
  issues.push(...runtimeIssues);
  runtimeIssues.length = 0;
  if (token !== seekCounter) return { issues: [], time: clamped, frame };
  currentTime = clamped;
  currentFrame = frame;
  return { issues, time: clamped, frame };
}

function seek(
  timeSeconds: number,
  frameIndex?: number,
  sampleRate?: Rate,
): Promise<{ issues: string[]; time: number; frame: number }> {
  const run = queue.then(() => doSeek(timeSeconds, frameIndex, sampleRate));
  queue = run.catch(() => undefined);
  return run;
}

function play(): void {
  if (deterministic) {
    recordIssue('play() is disabled in deterministic mode; use seek()');
    return;
  }
  if (playing) return;
  playing = true;
  timeApi.playing = true;
  playOffset = currentTime;
  playStartedAt = realNow();
  void seek(playOffset);
  try {
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'paused') animation.play();
    }
  } catch { /* ignore */ }
  const loop = (): void => {
    if (!playing) return;
    const elapsed = (realNow() - playStartedAt) / 1000;
    const time = playOffset + elapsed;
    if (time >= duration) {
      playing = false;
      timeApi.playing = false;
      void seek(duration - 1 / fps);
      return;
    }
    void seek(time);
    playRaf = stableRaf(loop);
  };
  playRaf = stableRaf(loop);
}

function pause(): void {
  playing = false;
  timeApi.playing = false;
  if (playRaf) {
    window.cancelAnimationFrame(playRaf);
    playRaf = 0;
  }
  for (const video of videos.values()) video.pause();
  for (const audio of audios.values()) audio.pause();
  if (!deterministic) {
    void seek(currentTime);
  }
}

const ready = (async () => {
  await prepareDocument();
  await seek(0, 0);
})();

const hostApi = {
  version: '1.1.3',
  mode: data.mode,
  ready,
  seek,
  play,
  pause,
  state: () => ({
    time: currentTime,
    frame: currentFrame,
    fps,
    duration,
    playing,
    issues: currentState?.issues ?? [],
  }),
  frameState: () => currentState,
  issues: () => runtimeIssues,
  sceneRoots: (sceneId?: string): HTMLElement[] => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.vhtml-scene-root'));
    return sceneId ? nodes.filter((node) => node.dataset.vhtmlScene === sceneId) : nodes;
  },
};

const authoringApi = {
  version: '1.1.3',
  mode: data.mode,
  time: timeApi,
  ready,
  whenReady: () => ready,
  onSeek(hook: SeekHook): () => void {
    seekHooks.add(hook);
    return () => seekHooks.delete(hook);
  },
  defer(task: Promise<unknown>): void {
    readinessTasks.add(task);
  },
  sceneRoots(sceneId?: string): HTMLElement[] {
    return hostApi.sceneRoots(sceneId);
  },
  seek(timeSeconds: number, frameIndex?: number, sampleRate?: Rate) {
    return seek(timeSeconds, frameIndex, sampleRate);
  },
};

(window as unknown as { __vhtml: typeof hostApi }).__vhtml = hostApi;
(window as unknown as { vhtml: typeof authoringApi }).vhtml = authoringApi;
void currentFrame;
