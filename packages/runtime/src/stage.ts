/**
 * Chromium stage builder.
 *
 * Produces a standards-compliant HTML document that renders the project's HTML
 * content in a real browser. The VHTML runtime is bundled separately and
 * injected before project scripts.
 */

import fs from 'node:fs';
import type { Asset, Clip, Project, Scene, Timeline, Track } from '@sdkwork/vhtml-core/model';
import { findTimeline, resolveReference } from '@sdkwork/vhtml-core/model';
import { scopeCss } from './css.ts';

export interface StageBuildOptions {
  project: Project;
  timelineId?: string;
  mode: 'deterministic' | 'preview';
  runtimeSource: string;
  includeAudio?: boolean;
  /** Extra CSS appended after project CSS (studio overlays etc). */
  extraCss?: string;
  /**
   * Rewrite local video/audio sources to a proxy resolver (e.g. the Studio's
   * 360p /api/media/proxy) for smooth scrubbing on heavy footage. Remote and
   * data: sources pass through untouched. Ignored in deterministic mode.
   */
  proxySources?: boolean;
}

const BOOTSTRAP_SOURCE = fs.readFileSync(new URL('./browser/bootstrap.js', import.meta.url), 'utf8');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string | number): string {
  return escapeHtml(String(value));
}

function scriptSafe(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function jsonForScript(value: unknown): string {
  return scriptSafe(JSON.stringify(value));
}

function resolveAsset(project: Project, clip: Clip): Asset | undefined {
  if (!clip.ref) return undefined;
  const ref = clip.ref.replace(/^(asset|gen):/, '');
  return project.assets.find((asset) => asset.id === ref || asset.id === clip.ref);
}

function timelineOf(project: Project, id?: string): Timeline | undefined {
  return findTimeline(project, id ?? project.mainTimeline) ?? project.timelines[0];
}

const MAX_STAGE_NESTING = 8;

/**
 * Timelines reachable from the root timeline through nested timeline clips.
 * Their clips need stage layers (and audio elements) even though they are not
 * the render root: the flattened frame state references their clip ids.
 */
export function collectNestedTimelines(project: Project, root: Timeline): Timeline[] {
  const result: Timeline[] = [];
  const seen = new Set<string>([root.id]);
  const walk = (timeline: Timeline, depth: number): void => {
    if (depth >= MAX_STAGE_NESTING) return;
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (clip.kind !== 'timeline' || !clip.ref) continue;
        const resolved = resolveReference(project, clip.ref);
        if (resolved?.kind === 'timeline' && !seen.has(resolved.timeline.id)) {
          seen.add(resolved.timeline.id);
          result.push(resolved.timeline);
          walk(resolved.timeline, depth + 1);
        }
      }
    }
  };
  walk(root, 0);
  return result;
}

function sceneOf(project: Project, clip: Clip): Scene | undefined {
  if (!clip.ref) return undefined;
  const id = clip.ref.replace(/^scene:/, '');
  return project.scenes.find((scene) => scene.id === id);
}

function clipKindClass(clip: Clip): string {
  return `vhtml-${clip.kind}`;
}

function transformOrigin(clip: Clip): string {
  return `${Math.round(clip.transform.anchorX * 10000) / 100}% ${Math.round(clip.transform.anchorY * 10000) / 100}%`;
}

function fitCss(clip: Clip): string {
  return clip.fit === 'fill' ? 'fill' : clip.fit;
}

function mediaElement(project: Project, clip: Clip, tag: 'img' | 'video', proxySources = false): string {
  const asset = resolveAsset(project, clip);
  const raw = asset?.src ?? '';
  // Only local project-relative media goes through the proxy resolver.
  const src = proxySources && tag === 'video' && raw && !/^(https?:|data:|blob:)/i.test(raw)
    ? `/api/media/proxy?asset=${encodeURIComponent(asset?.id ?? '')}`
    : raw;
  const alt = escapeAttr(asset?.alt ?? '');
  if (tag === 'video') {
    return `<video class="vhtml-media" src="${escapeAttr(src)}" muted playsinline preload="auto" disablepictureinpicture draggable="false" style="object-fit:${fitCss(clip)}"></video>`;
  }
  return `<img class="vhtml-media" src="${escapeAttr(src)}" alt="${alt}" draggable="false" decoding="sync" style="object-fit:${fitCss(clip)}" />`;
}

function captionText(clip: Clip): string {
  if (clip.kind !== 'caption') return '';
  return escapeHtml(clip.text).replace(/\n/g, '<br />');
}

function clipLayer(project: Project, clip: Clip, zIndex: number, index: number, proxySources = false): string {
  const classes = ['vhtml-clip', clipKindClass(clip)];
  if (clip.className) classes.push(clip.className);
  const style = [
    `display:none`,
    `z-index:${zIndex}`,
    `transform-origin:${transformOrigin(clip)}`,
  ];
  const attrs: string[] = [
    `class="${escapeAttr(classes.join(' '))}"`,
    `data-clip-id="${escapeAttr(clip.id)}"`,
    `data-clip-kind="${escapeAttr(clip.kind)}"`,
    `data-vhtml-index="${index}"`,
    `style="${style.join(';')}"`,
  ];

  if (clip.kind === 'caption') {
    return `<div ${attrs.join(' ')}><div class="vhtml-caption" role="caption">${captionText(clip)}</div></div>`;
  }
  if (clip.kind === 'data') {
    return `<div ${attrs.join(' ')} data-vhtml-data="true"></div>`;
  }
  if (clip.kind === 'scene') {
    const scene = sceneOf(project, clip);
    if (!scene) {
      return `<div ${attrs.join(' ')}><div class="vhtml-missing">Missing scene ${escapeHtml(clip.ref ?? '')}</div></div>`;
    }
    const fx = `<div class="vhtml-fx-slot" data-fx="0"></div><div class="vhtml-fx-slot" data-fx="1"></div><div class="vhtml-fx-slot" data-fx="2"></div><div class="vhtml-fx-slot" data-fx="3"></div>`;
    return `<div ${attrs.join(' ')}>
  <div class="vhtml-scene-root" data-vhtml-scene="${escapeAttr(scene.id)}">${scene.html}</div>
  ${fx}
</div>`;
  }
  const media = clip.kind === 'video' ? mediaElement(project, clip, 'video', proxySources) : mediaElement(project, clip, 'img');
  const chroma = clip.effects.some((effect) => effect.enabled && effect.type === 'chroma-key')
    ? `<canvas class="vhtml-chroma" width="${project.composition.width}" height="${project.composition.height}" hidden></canvas>`
    : '';
  const fx = `<div class="vhtml-fx-slot" data-fx="0"></div><div class="vhtml-fx-slot" data-fx="1"></div><div class="vhtml-fx-slot" data-fx="2"></div><div class="vhtml-fx-slot" data-fx="3"></div>`;
  return `<div ${attrs.join(' ')}>
  ${media}
  ${chroma}
  ${fx}
</div>`;
}

function trackZIndex(track: Track, visualOrder: number, clip: Clip): number {
  return visualOrder * 1000 + clip.z;
}

function audioElements(project: Project, timeline: Timeline): string {
  const elements: string[] = [];
  const timelines = [timeline, ...collectNestedTimelines(project, timeline)];
  for (const nested of timelines) for (const track of nested.tracks) {
    if (track.type !== 'audio') continue;
    for (const clip of track.clips) {
      if (clip.kind !== 'audio' && clip.kind !== 'video') continue;
      const asset = resolveAsset(project, clip);
      if (!asset) continue;
      elements.push(
        `<audio data-audio-clip-id="${escapeAttr(clip.id)}" src="${escapeAttr(asset.src)}" preload="auto"></audio>`,
      );
    }
  }
  return elements.join('\n');
}

const BASE_CSS = `
html,body{margin:0;padding:0;overflow:hidden;background:transparent;}
#vhtml-stage{position:relative;overflow:hidden;isolation:isolate;transform:translateZ(0);}
#vhtml-stage .vhtml-clip{position:absolute;inset:0;display:none;will-change:transform,opacity,filter;backface-visibility:hidden;transform-origin:50% 50%;pointer-events:none;}
#vhtml-stage .vhtml-scene-root{position:absolute;inset:0;overflow:hidden;}
#vhtml-stage .vhtml-media{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;}
#vhtml-stage .vhtml-caption{position:absolute;left:6%;right:6%;bottom:8%;margin:0 auto;text-align:center;color:#fff;font:600 42px/1.28 "Segoe UI",system-ui,-apple-system,"Noto Sans",sans-serif;text-shadow:0 2px 6px rgba(0,0,0,.72);white-space:pre-wrap;word-break:break-word;}
#vhtml-stage .vhtml-caption[data-speaker]{color:#fff;}
#vhtml-stage .vhtml-fx-slot{position:absolute;inset:0;pointer-events:none;opacity:0;background-repeat:repeat;background-size:cover;}
#vhtml-stage .vhtml-chroma{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;}
#vhtml-stage .vhtml-missing{position:absolute;inset:0;display:grid;place-items:center;background:#2a0f16;color:#ff9bb3;font:600 24px system-ui;border:2px dashed #ff5577;}
#vhtml-stage .vhtml-transition-overlays{position:absolute;inset:0;pointer-events:none;z-index:850000;}
#vhtml-stage .vhtml-transition-overlay{position:absolute;inset:0;pointer-events:none;opacity:0;}
#vhtml-stage .vhtml-diag{position:absolute;inset:0;display:none;}
#vhtml-stage .vhtml-fx-slot[data-fx="0"]{}
`;

export function buildStageHtml(options: StageBuildOptions): string {
  const { project, mode, runtimeSource, includeAudio = true } = options;
  const proxySources = Boolean(options.proxySources) && mode === 'preview';
  const timeline = timelineOf(project, options.timelineId);
  if (!timeline) throw new Error('VHTML: project has no timeline to render');
  const composition = project.composition;
  const width = composition.width;
  const height = composition.height;

  const nestedTimelines = collectNestedTimelines(project, timeline);
  const visualTracks = [...timeline.tracks, ...nestedTimelines.flatMap((nested) => nested.tracks)]
    .filter((track) => track.type === 'video' || track.type === 'overlay' || track.type === 'caption')
    .sort((a, b) => a.order - b.order);

  const layers: string[] = [];
  let visualOrder = 0;
  let clipIndex = 0;
  const usedScenes = new Set<string>();
  for (const track of visualTracks) {
    for (const clip of track.clips) {
      if (clip.kind === 'scene') {
        const scene = sceneOf(project, clip);
        if (scene) usedScenes.add(scene.id);
      }
      if (clip.kind === 'timeline') {
        // Nested timelines contribute their inner scenes through their own
        // clips below; the compound clip itself renders nothing.
        continue;
      }
      const z = track.type === 'caption' ? 900_000 + clip.z : trackZIndex(track, visualOrder, clip);
      layers.push(clipLayer(project, clip, z, clipIndex++, proxySources));
    }
    visualOrder += 1;
  }

  const sceneCss = project.scenes
    .filter((scene) => usedScenes.has(scene.id))
    .filter((scene) => scene.css)
    .map((scene) => `/* scene:${scene.id} */\n${scopeCss(scene.css!, scene.id)}`)
    .join('\n');

  const globalCss = project.styles.map((css) => stripStyleClose(css)).join('\n');
  const stylesheetLinks = (project.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}" />`)
    .join('\n');

  const runtimeProject = {
    ...project,
    scenes: project.scenes.map((scene) => ({ id: scene.id, duration: scene.duration })),
    scripts: undefined,
  };
  const stageData = {
    project: runtimeProject,
    timelineId: timeline.id,
    mode,
    seed: composition.seed,
    frameRate: composition.frameRate,
    duration: timeline.duration,
    width,
    height,
  };

  const sceneScripts: string[] = [];
  const seenScripts = new Set<string>();
  for (const sceneId of usedScenes) {
    const scene = project.scenes.find((candidate) => candidate.id === sceneId);
    for (const script of scene?.scripts ?? []) {
      if (seenScripts.has(script)) continue;
      seenScripts.add(script);
      sceneScripts.push(script);
    }
  }
  const projectScripts = (project.scripts ?? []).filter((script) => {
    if (seenScripts.has(script)) return false;
    seenScripts.add(script);
    return true;
  });

  const bootstrapMode = JSON.stringify(mode);
  const seed = JSON.stringify(composition.seed);
  const bootstrap = scriptSafe(BOOTSTRAP_SOURCE);

  return `<!doctype html>
<html lang="${escapeAttr(project.lang ?? 'en')}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}, height=${height}, initial-scale=1" />
<base href="/" />
<title>${escapeHtml(project.title ?? project.id)}</title>
${stylesheetLinks}
<style data-vhtml="reset">${BASE_CSS}</style>
<style data-vhtml="global">${globalCss}</style>
<style data-vhtml="scenes">${sceneCss}</style>
<style data-vhtml="stage">#vhtml-stage{width:${width}px;height:${height}px;background:${escapeAttr(composition.background)};}</style>
${options.extraCss ? `<style data-vhtml="extra">${options.extraCss}</style>` : ''}
<script>window.__VHTML_MODE__=${bootstrapMode};window.__VHTML_SEED__=${seed};</script>
<script>${bootstrap}</script>
</head>
<body>
<div id="vhtml-stage" data-vhtml-mode="${escapeAttr(mode)}">
${layers.join('\n')}
<div class="vhtml-transition-overlays"></div>
</div>
${includeAudio ? audioElements(project, timeline) : ''}
<script>window.__VHTML_STAGE__=${jsonForScript(stageData)};</script>
<script>${scriptSafe(runtimeSource)}</script>
${projectScripts.join('\n')}
${sceneScripts.join('\n')}
</body>
</html>`;
}

function stripStyleClose(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

/** Summarise which runtime features a project actually uses. */
export function usedFeatureSet(project: Project): Set<string> {
  const features = new Set<string>(['html', 'css', 'timeline']);
  if (project.scripts?.length || project.scenes.some((scene) => scene.scripts?.length)) features.add('javascript');
  if (project.scenes.some((scene) => scene.html.includes('<svg'))) features.add('svg');
  if (project.scenes.some((scene) => scene.html.includes('<canvas'))) features.add('canvas-2d');
  if (project.assets.some((asset) => asset.kind === 'video')) features.add('video');
  if (project.assets.some((asset) => asset.kind === 'audio')) features.add('audio');
  if (project.timelines.some((timeline) => timeline.tracks.some((track) => track.type === 'caption'))) features.add('captions');
  if (project.timelines.some((timeline) => timeline.tracks.some((track) => track.transitions.length))) features.add('transitions');
  if (project.timelines.some((timeline) => timeline.tracks.some((track) => track.clips.some((clip) => clip.effects.length)))) features.add('effects');
  if (project.timelines.some((timeline) => timeline.tracks.some((track) => track.clips.some((clip) => clip.animations.length))) || project.animations.length) {
    features.add('keyframes');
  }
  if (project.generations.length) features.add('generation');
  return features;
}
