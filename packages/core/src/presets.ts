/**
 * Delivery profiles for common video channels.
 *
 * A delivery profile never changes the authored timeline. It derives an
 * `OutputConfig` (dimensions, fps, codecs, bitrate, safe area) so one project can
 * publish a 16:9 master, a 9:16 social cut, a square post or an audio-only feed.
 */

import { rat } from './time.ts';
import type { OutputConfig, OutputFitMode, OutputFormat, Project } from './model.ts';

export type DeliveryPresetId =
  | 'web-1080p'
  | 'web-720p'
  | 'youtube-4k'
  | 'vertical-1080p'
  | 'tiktok'
  | 'reels'
  | 'shorts'
  | 'square-1080p'
  | 'portrait-1080p'
  | 'cinema-4k'
  | 'gif-preview'
  | 'podcast-audio';

export interface DeliverySafeArea {
  /** Percent of composition height reserved at the top. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DeliveryPreset {
  id: DeliveryPresetId;
  label: string;
  description: string;
  format: OutputFormat;
  width: number;
  height: number;
  frameRate: ReturnType<typeof rat>;
  aspectRatio: string;
  fit: OutputFitMode;
  platforms: string[];
  safeArea: DeliverySafeArea;
  videoBitrate?: string;
  audioBitrate?: string;
  crf?: number;
  maxDurationSeconds?: number;
}

const FULL_SAFE: DeliverySafeArea = { top: 5, right: 5, bottom: 5, left: 5 };

export const DELIVERY_PRESETS: readonly DeliveryPreset[] = [
  {
    id: 'web-1080p',
    label: 'Web 1080p',
    description: 'Default landscape master for the web and presentations.',
    format: 'mp4',
    width: 1920,
    height: 1080,
    frameRate: rat(30),
    aspectRatio: '16:9',
    fit: 'contain',
    platforms: ['web', 'youtube', 'vimeo', 'presentation'],
    safeArea: FULL_SAFE,
    videoBitrate: '8M',
    audioBitrate: '192k',
    crf: 20,
  },
  {
    id: 'web-720p',
    label: 'Web 720p',
    description: 'Lightweight preview/master for slow connections.',
    format: 'mp4',
    width: 1280,
    height: 720,
    frameRate: rat(30),
    aspectRatio: '16:9',
    fit: 'contain',
    platforms: ['web', 'preview'],
    safeArea: FULL_SAFE,
    videoBitrate: '4M',
    audioBitrate: '160k',
    crf: 22,
  },
  {
    id: 'youtube-4k',
    label: 'YouTube 4K',
    description: 'UHD landscape master for YouTube and archival delivery.',
    format: 'mp4',
    width: 3840,
    height: 2160,
    frameRate: rat(30),
    aspectRatio: '16:9',
    fit: 'contain',
    platforms: ['youtube', 'archive'],
    safeArea: FULL_SAFE,
    videoBitrate: '45M',
    audioBitrate: '256k',
    crf: 18,
    maxDurationSeconds: 12 * 60 * 60,
  },
  {
    id: 'vertical-1080p',
    label: 'Vertical 1080p',
    description: 'Generic 9:16 vertical master.',
    format: 'mp4',
    width: 1080,
    height: 1920,
    frameRate: rat(30),
    aspectRatio: '9:16',
    fit: 'cover',
    platforms: ['mobile', 'story'],
    safeArea: { top: 8, right: 8, bottom: 16, left: 8 },
    videoBitrate: '10M',
    audioBitrate: '192k',
    crf: 20,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: '1080x1920 with generous bottom overlay safe area.',
    format: 'mp4',
    width: 1080,
    height: 1920,
    frameRate: rat(30),
    aspectRatio: '9:16',
    fit: 'cover',
    platforms: ['tiktok'],
    safeArea: { top: 8, right: 12, bottom: 18, left: 6 },
    videoBitrate: '10M',
    audioBitrate: '192k',
    crf: 20,
    maxDurationSeconds: 10 * 60,
  },
  {
    id: 'reels',
    label: 'Instagram Reels',
    description: '1080x1920 with Instagram Reels UI safe area.',
    format: 'mp4',
    width: 1080,
    height: 1920,
    frameRate: rat(30),
    aspectRatio: '9:16',
    fit: 'cover',
    platforms: ['instagram', 'reels'],
    safeArea: { top: 10, right: 10, bottom: 20, left: 6 },
    videoBitrate: '10M',
    audioBitrate: '192k',
    crf: 20,
    maxDurationSeconds: 15 * 60,
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    description: '1080x1920 with Shorts navigation safe area.',
    format: 'mp4',
    width: 1080,
    height: 1920,
    frameRate: rat(30),
    aspectRatio: '9:16',
    fit: 'cover',
    platforms: ['youtube', 'shorts'],
    safeArea: { top: 8, right: 8, bottom: 15, left: 8 },
    videoBitrate: '10M',
    audioBitrate: '192k',
    crf: 20,
    maxDurationSeconds: 3 * 60,
  },
  {
    id: 'square-1080p',
    label: 'Square 1080',
    description: '1:1 feed post.',
    format: 'mp4',
    width: 1080,
    height: 1080,
    frameRate: rat(30),
    aspectRatio: '1:1',
    fit: 'cover',
    platforms: ['instagram', 'feed'],
    safeArea: { top: 6, right: 6, bottom: 6, left: 6 },
    videoBitrate: '8M',
    audioBitrate: '192k',
    crf: 20,
  },
  {
    id: 'portrait-1080p',
    label: 'Portrait 4:5',
    description: '1080x1350 portrait feed post.',
    format: 'mp4',
    width: 1080,
    height: 1350,
    frameRate: rat(30),
    aspectRatio: '4:5',
    fit: 'cover',
    platforms: ['instagram', 'feed'],
    safeArea: { top: 6, right: 6, bottom: 8, left: 6 },
    videoBitrate: '8M',
    audioBitrate: '192k',
    crf: 20,
  },
  {
    id: 'cinema-4k',
    label: 'Cinema 4K 2.39:1',
    description: 'Widescreen cinema master.',
    format: 'mp4',
    width: 3840,
    height: 1608,
    frameRate: rat(24),
    aspectRatio: '2.39:1',
    fit: 'contain',
    platforms: ['cinema', 'archive'],
    safeArea: { top: 5, right: 5, bottom: 5, left: 5 },
    videoBitrate: '60M',
    audioBitrate: '320k',
    crf: 16,
  },
  {
    id: 'gif-preview',
    label: 'GIF preview',
    description: 'Small, silent loop for docs and chat.',
    format: 'gif',
    width: 640,
    height: 360,
    frameRate: rat(15),
    aspectRatio: '16:9',
    fit: 'contain',
    platforms: ['web', 'chat'],
    safeArea: FULL_SAFE,
    maxDurationSeconds: 12,
  },
  {
    id: 'podcast-audio',
    label: 'Podcast audio',
    description: 'Audio-only delivery (the video track is ignored).',
    format: 'wav',
    width: 1920,
    height: 1080,
    frameRate: rat(30),
    aspectRatio: '16:9',
    fit: 'contain',
    platforms: ['podcast', 'audio'],
    safeArea: FULL_SAFE,
    audioBitrate: '256k',
  },
];

export function getDeliveryPreset(id: string): DeliveryPreset | undefined {
  return DELIVERY_PRESETS.find((preset) => preset.id === id);
}

export function requireDeliveryPreset(id: string): DeliveryPreset {
  const preset = getDeliveryPreset(id);
  if (!preset) {
    throw new Error(`unknown delivery preset "${id}"; expected one of: ${DELIVERY_PRESETS.map((item) => item.id).join(', ')}`);
  }
  return preset;
}

function defaultOutput(project: Project, format: OutputFormat): OutputConfig {
  return {
    id: 'delivery',
    timeline: project.mainTimeline,
    format,
    width: project.composition.width,
    height: project.composition.height,
    frameRate: project.composition.frameRate,
    videoCodec: format === 'webm' ? 'libvpx-vp9' : 'libx264',
    audioCodec: format === 'webm' ? 'libopus' : format === 'wav' ? 'pcm_s16le' : format === 'mp3' ? 'libmp3lame' : 'aac',
    sampleRate: project.composition.sampleRate,
    channels: project.composition.channels,
    pixelFormat: 'yuv420p',
    colorSpace: project.composition.colorSpace,
    background: project.composition.background,
    burnCaptions: false,
  };
}

/** Build a delivery-specific OutputConfig from the project defaults. */
export function outputForDelivery(
  project: Project,
  presetId: string,
  options: { baseOutputId?: string; id?: string } = {},
): OutputConfig {
  const preset = requireDeliveryPreset(presetId);
  const base = options.baseOutputId
    ? project.outputs.find((output) => output.id === options.baseOutputId)
    : project.outputs[0];
  const output = base
    ? structuredClone(base)
    : defaultOutput(project, preset.format);
  output.id = options.id ?? preset.id;
  output.format = preset.format;
  output.width = preset.width;
  output.height = preset.height;
  output.frameRate = preset.frameRate;
  output.fit = preset.fit;
  output.videoCodec = preset.format === 'webm' ? 'libvpx-vp9' : preset.format === 'gif' ? 'gif' : preset.format === 'png-sequence' ? 'png' : preset.format === 'wav' || preset.format === 'mp3' ? 'none' : 'libx264';
  output.audioCodec = preset.format === 'gif' || preset.format === 'png-sequence' ? 'none' : preset.format === 'webm' ? 'libopus' : preset.format === 'wav' ? 'pcm_s16le' : preset.format === 'mp3' ? 'libmp3lame' : 'aac';
  output.videoBitrate = preset.videoBitrate;
  output.audioBitrate = preset.audioBitrate;
  if (preset.crf !== undefined) output.crf = preset.crf;
  output.sampleRate = base?.sampleRate ?? project.composition.sampleRate;
  output.channels = base?.channels ?? project.composition.channels;
  output.metadata = {
    ...(base?.metadata ?? {}),
    deliveryPreset: preset.id,
    deliveryLabel: preset.label,
    aspectRatio: preset.aspectRatio,
    safeArea: JSON.stringify(preset.safeArea),
    platforms: preset.platforms.join(','),
  };
  output.path = undefined;
  return output;
}
