/**
 * Runtime capability declaration.
 */

import os from 'node:os';
import type { Rate } from '@sdkwork/vhtml-core/time';
import { DELIVERY_PRESETS } from '@sdkwork/vhtml-core/presets';

export interface CapabilityReport {
  implementation: string;
  version: string;
  specVersion: string;
  profiles: {
    parser: boolean;
    webRenderer: boolean;
    mediaRenderer: boolean;
    fullRuntime: boolean;
  };
  determinism: {
    structural: boolean;
    temporal: boolean;
    visualTolerance: string;
    pixelExact: string;
  };
  formats: string[];
  codecs: string[];
  deliveryPresets: Array<{
    id: string;
    label: string;
    width: number;
    height: number;
    format: string;
    aspectRatio: string;
    platforms: string[];
  }>;
  generationKinds: string[];
  features: Record<string, boolean | string>;
  limits: Record<string, number | string>;
  environment: {
    platform: string;
    arch: string;
    node: string;
    browser: string;
    cpus: number;
    memoryMiB: number;
  };
  limitations: string[];
}

export const SUPPORTED_FORMATS = ['mp4', 'webm', 'gif', 'png-sequence', 'wav', 'mp3'];
export const SUPPORTED_CODECS = ['libx264', 'libvpx', 'libvpx-vp9', 'aac', 'libopus', 'libmp3lame', 'gif', 'png'];
export const GENERATION_KINDS = [
  'image', 'storyboard', 'video', 'avatar', 'lipsync', 'speech', 'dub',
  'music', 'sfx', 'audio', 'matte', 'edit', 'translation', 'text', 'transcribe',
];

export function capabilityReport(options: { browserVersion?: string; ffmpegVersion?: string; frameRate?: Rate } = {}): CapabilityReport {
  return {
    implementation: '@sdkwork/vhtml',
    version: '1.1.3',
    specVersion: '1.1',
    profiles: {
      parser: true,
      webRenderer: true,
      mediaRenderer: true,
      fullRuntime: true,
    },
    determinism: {
      structural: true,
      temporal: true,
      visualTolerance: 'same browser build, fonts, DPR, color profile and software rasteriser: PNG equality expected; otherwise perceptual comparison with SSIM >= 0.995',
      pixelExact: 'only guaranteed for the recorded browser/font/OS/GPU profile',
    },
    formats: SUPPORTED_FORMATS,
    codecs: SUPPORTED_CODECS,
    deliveryPresets: DELIVERY_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      width: preset.width,
      height: preset.height,
      format: preset.format,
      aspectRatio: preset.aspectRatio,
      platforms: preset.platforms,
    })),
    generationKinds: GENERATION_KINDS,
    features: {
      html5: true,
      css: true,
      'css-animations': 'paused and seeked through the Web Animations API',
      'web-animations': true,
      javascript: 'virtual clock, timers, rAF, seeded randomness, network policy',
      svg: true,
      'canvas-2d': true,
      webgl: 'rendered through Chromium; pixel determinism depends on the GPU/SwiftShader profile',
      video: true,
      audio: 'sample-accurate PCM mixer',
      captions: 'burn-in and WebVTT sidecar',
      transitions: 'crossfade, fade, dip, wipe, slide, zoom, blur',
      effects: 'filters, overlays, vignette, grain, chroma key, masks (clip-path polygons, feathered gradient masks), rounded corners',
      keyframes: 'cubic-bezier, steps, per-keyframe easing, compose replace/add/accumulate',
      generation: 'procedural, manifest and HTTP providers; direction, review, rights, dependency graph',
      'generation-vendors': 'vendor catalog with parameter mappings for 26 vendors across video (Runway, Luma, Kling, Pika, Hailuo, Veo, Sora, Wan, Vidu, PixVerse, Seedance, SVD, Hunyuan, Firefly), image (Flux, SDXL, gpt-image-1, Midjourney, Ideogram, Qwen), music (Suno, Stable Audio, MusicGen) and speech (ElevenLabs, OpenAI, Azure); vhtml providers --known',
      'generation-kinds': GENERATION_KINDS.join(', '),
      'audio-mixing': 'gain, pan, fades, volume automation, transitions, ducking, loudness normalisation; per-clip audio effects (gain, highpass, lowpass, compressor, echo, pitch, normalize, denoise) in the export mixdown',
      'authoring-programs': 'inline <script type="application/vnd.vhtml.program+javascript"> with inline and external (<data src>) data blocks; deterministic sandboxed materialisation',
      'authoring-params': 'repeatable CLI --param k=v merged into vhtml.ctx.params (external values override document params)',
      'time-remap': 'keyframed source-time curves (speed ramps) with exact easing interpolation',
      'nested-timelines': 'compound clips via timeline: references; cycle-checked, depth limit 8',
      'audio-ducking': 'sidechain ducking (threshold, reduction, attack, release, hold) in the export mixer',
      'av-sync': 'unified rational project time; per-clip audio-offset (lip-sync/latency correction); SMPTE frame timecodes (HH:MM:SS:FF, drop-frame ;FF); time-remap audio with exact curve reads',
      'caption-import': 'SRT/WebVTT parsing (parseSubtitleBlocks / vhtml.parseCaptions) for code-first caption alignment',
      'generation-usage': 'per-task usage records (<usage> cost/credits/tokens/compute-seconds), quota ceilings and export-report totals',
      'character-bibles': 'versioned character/style bible library (<characters>) referenced as character:/style: inputs; versions participate in the generation cache key',
      'effect-registry': 'declared effect/audio-effect/transition types via <extension kind=... base=...>; renderers desugar onto the built-in base',
      'frame-cache': 'deterministic read-through frame cache (RFC-0016) keyed by project hash + range + renderer fingerprint; batch presets share one sampling pass',
      'audio-downmix-policy': 'explicit output downmix=mono|stereo (RFC-0017); implicit >2ch folds are reported as issues',
      'storyboard-review': 'per-shot review records with append-only approval history and the storyboard.review edit op (RFC-0018)',
      chapters: true,
      'delivery-presets': 'web, social vertical/square/portrait, cinema, GIF and audio-only profiles',
    },
    limits: {
      maxWidth: 16384,
      maxHeight: 16384,
      maxFrameRate: 240,
      maxDurationSeconds: 24 * 60 * 60,
      maxProjectSizeMiB: 2048,
      defaultFrameTimeoutMs: 15000,
    },
    environment: {
      platform: os.platform(),
      arch: os.arch(),
      node: process.version,
      browser: options.browserVersion ?? 'Chrome (detected at render time)',
      cpus: os.cpus().length,
      memoryMiB: Math.round(os.totalmem() / 1024 / 1024),
    },
    limitations: [
      'Pixel-identical rendering requires a pinned Chrome build, font set, DPR, color profile and rasteriser.',
      'Arbitrary JavaScript that depends on wall-clock time, network responses or user input cannot be made retroactively seekable; the runtime virtualises common APIs and reports residual risks.',
      'WebGL/WebGPU output is captured through Chromium but may differ across GPU drivers.',
      'Cross-origin media is blocked by default; download it into the project or allow it explicitly.',
      'CSS @keyframes names are not renamed when scene CSS is scoped; use unique names per scene.',
      'SMIL/SVG declarative animation is not seeked by the deterministic profile.',
    ],
  };
}
