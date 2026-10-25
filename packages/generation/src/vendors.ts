/**
 * Vendor capability catalog for generation adapters.
 *
 * The catalog documents, per vendor, how their generation API parameters map
 * onto the VHTML core model (prompt, negativePrompt, constraints, direction,
 * input roles) and which parameters belong in the vendor `params` namespace
 * (`<vendorId>.<param>`). It is normative documentation, not a driver: actual
 * transport happens through vendor-specific provider adapters or the neutral
 * `http` provider.
 *
 * Sources: vendor API references as of 2026-10 (Runway, Luma, Kling, Pika,
 * Hailuo/MiniMax, Google Veo, OpenAI Sora, Alibaba Wan, Vidu, PixVerse,
 * ByteDance Seedance, ElevenLabs). Update the entry, not the core, when a
 * vendor changes its schema.
 */

import type { GenerationKind } from '@sdkwork/vhtml-core/model';

export interface VendorParamMapping {
  /** Vendor API parameter name. */
  vendor: string;
  /** VHTML core field (`prompt`, `constraints.duration`, `direction.video.loop`, …) or `params` namespace. */
  vhtml: string;
  /** Short mapping note (scales, enums, defaults). */
  note?: string;
}

export interface VendorProfile {
  /** Lowercase namespace id used for `params["<id>.<param>"]`. */
  id: string;
  label: string;
  /** API reference URL. */
  docs: string;
  /** Generation kinds the vendor is commonly used for. */
  kinds: GenerationKind[];
  /** Generation modes covered: t2v/i2v/r2v/v2v/extend/lipsync/keyframes … */
  modes: string[];
  /** Parameter mapping table. */
  mapping: VendorParamMapping[];
}

export const VENDOR_CATALOG: VendorProfile[] = [
  {
    id: 'runway',
    label: 'Runway (Gen-3/Gen-4)',
    docs: 'https://docs.dev.runwayml.com/api',
    kinds: ['video', 'image'],
    modes: ['t2v', 'i2v', 'v2v (restore/act)', 'upscale'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'ratio', vhtml: 'constraints.aspectRatio', note: 'values like "1280:720"; normalise to W:H' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '5 or 10 seconds' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'promptImage', vhtml: 'inputs[role="first-frame"]' },
      { vendor: 'watermark', vhtml: 'params.runway.watermark' },
      { vendor: 'motion bucket (Gen-2 legacy)', vhtml: 'direction.video.motionStrength', note: 'rescaled 0..1' },
    ],
  },
  {
    id: 'luma',
    label: 'Luma Dream Machine (Ray)',
    docs: 'https://docs.lumalabs.ai/docs/video-generation',
    kinds: ['video'],
    modes: ['t2v', 'i2v', 'keyframes', 'extend', 'loop'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'frame0', vhtml: 'inputs[role="first-frame"] + direction.video.firstFrame' },
      { vendor: 'frame1', vhtml: 'inputs[role="last-frame"] + direction.video.lastFrame' },
      { vendor: 'keyframes (multi, up to 16)', vhtml: 'inputs[role="keyframe"] in order' },
      { vendor: 'loop', vhtml: 'direction.video.loop' },
      { vendor: 'aspect_ratio', vhtml: 'constraints.aspectRatio' },
      { vendor: 'resolution', vhtml: 'constraints.resolution', note: 'tier string' },
      { vendor: 'duration', vhtml: 'constraints.duration' },
      { vendor: 'camera concept/movement', vhtml: 'direction.video.cameraMove' },
      { vendor: 'extend', vhtml: 'kind="edit" + direction.edit.operation="extend" + inputs[role="reference-video"]' },
    ],
  },
  {
    id: 'kling',
    label: 'Kling (Kuaishou)',
    docs: 'https://kling.ai/document-api/apiReference/model/textToVideo',
    kinds: ['video', 'avatar', 'image'],
    modes: ['t2v', 'i2v', 'r2v (elements)', 'keyframes (image_tail)', 'lipsync', 'motion control'],
    mapping: [
      { vendor: 'prompt / negative_prompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'mode', vhtml: 'params.kling.mode', note: '"std" | "pro"' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '3–15s depending on model' },
      { vendor: 'aspect_ratio', vhtml: 'constraints.aspectRatio' },
      { vendor: 'cfg_scale', vhtml: 'params.kling.cfgScale', note: 'prompt adherence 0..1' },
      { vendor: 'camera_control', vhtml: 'direction.video.cameraMove', note: 'preset + intensity' },
      { vendor: 'image', vhtml: 'inputs[role="first-frame"]' },
      { vendor: 'image_tail', vhtml: 'inputs[role="last-frame"]' },
      { vendor: 'elements (multi image)', vhtml: 'inputs[role="subject" | "reference-image"]' },
      { vendor: 'lip sync', vhtml: 'kind="lipsync" + direction.video.lipSync' },
    ],
  },
  {
    id: 'pika',
    label: 'Pika',
    docs: 'https://dev.pika.art',
    kinds: ['video'],
    modes: ['t2v', 'i2v', 'keyframes (Pikaframes)', 'effects', 'modify region'],
    mapping: [
      { vendor: 'promptText / negativePrompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'promptImage', vhtml: 'inputs[role="first-frame"]' },
      { vendor: 'aspectRatio', vhtml: 'constraints.aspectRatio' },
      { vendor: 'resolution', vhtml: 'constraints.resolution' },
      { vendor: 'duration', vhtml: 'constraints.duration' },
      { vendor: 'seed', vhtml: 'constraints.seed', note: 'consistency = same seed + same prompts' },
      { vendor: 'motionStrength', vhtml: 'direction.video.motionStrength', note: 'vendor 0..4 → normalised 0..1' },
      { vendor: 'with_sound', vhtml: 'direction.video.withAudio' },
      { vendor: 'keyframe', vhtml: 'inputs[role="keyframe" | "first-frame" | "last-frame"]' },
      { vendor: 'modifyRegion / mask', vhtml: 'inputs[role="mask"] + kind="edit"' },
      { vendor: 'consistency (image refs)', vhtml: 'inputs[role="subject" | "reference-image"]' },
    ],
  },
  {
    id: 'hailuo',
    label: 'Hailuo / MiniMax',
    docs: 'https://platform.minimax.io/docs/guides/video-generation',
    kinds: ['video', 'music', 'speech'],
    modes: ['t2v', 'i2v', 'keyframes (first/last frame)', 'subject reference', 'lipsync', 'extend'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt', note: '≤2000 chars' },
      { vendor: 'first_frame_image / last_frame_image', vhtml: 'inputs[role="first-frame" | "last-frame"]' },
      { vendor: 'subject_reference', vhtml: 'inputs[role="subject"]' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '6 or 10 seconds' },
      { vendor: 'resolution', vhtml: 'constraints.resolution', note: '512p/768p/1080p' },
      { vendor: 'camera movement', vhtml: 'direction.video.cameraMove' },
      { vendor: 'prompt_optimizer', vhtml: 'params.hailuo.promptOptimizer' },
    ],
  },
  {
    id: 'veo',
    label: 'Google Veo',
    docs: 'https://cloud.google.com/vertex-ai/generative-ai/docs/video/overview',
    kinds: ['video'],
    modes: ['t2v', 'i2v', 'interpolation (first/last)', 'reference images', 'extend', 'native audio'],
    mapping: [
      { vendor: 'prompt / negativePrompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'aspectRatio', vhtml: 'constraints.aspectRatio', note: '16:9 | 9:16' },
      { vendor: 'resolution', vhtml: 'constraints.resolution', note: '720p | 1080p' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '4–8s' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'personGeneration', vhtml: 'params.veo.personGeneration', note: 'safety-gated' },
      { vendor: 'generateAudio', vhtml: 'direction.video.withAudio' },
      { vendor: 'interpolation (first/last frame)', vhtml: 'inputs[role="first-frame" | "last-frame"]' },
      { vendor: 'reference images', vhtml: 'inputs[role="reference-image" | "subject"]' },
      { vendor: 'extend', vhtml: 'kind="edit" + direction.edit.operation="extend" + inputs[role="reference-video"]' },
    ],
  },
  {
    id: 'sora',
    label: 'OpenAI Sora',
    docs: 'https://platform.openai.com/docs/guides/video-generation',
    kinds: ['video'],
    modes: ['t2v', 'i2v (reference_image)', 'remix', 'native audio'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'model', vhtml: 'model', note: 'sora-2 | sora-2-pro' },
      { vendor: 'seconds', vhtml: 'constraints.duration', note: '"4" | "8" | "12"' },
      { vendor: 'size', vhtml: 'constraints.width/height', note: '1280x720 | 720x1280 …' },
      { vendor: 'input_reference', vhtml: 'inputs[role="reference-image" | "first-frame"]' },
      { vendor: 'remix', vhtml: 'kind="edit" + direction.edit.operation="remix" + inputs[role="reference-video"]' },
      { vendor: 'native audio', vhtml: 'direction.video.withAudio', note: 'always on for sora-2; false not supported' },
    ],
  },
  {
    id: 'wan',
    label: 'Wan (Alibaba)',
    docs: 'https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference',
    kinds: ['video', 'speech', 'image'],
    modes: ['t2v', 'i2v', 'r2v', 'keyframes (first/last)', 'speak/lipsync', 'extend', 'native audio'],
    mapping: [
      { vendor: 'prompt / negative_prompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'resolution', vhtml: 'constraints.resolution', note: '480p/720p/1080p tiers' },
      { vendor: 'duration', vhtml: 'constraints.duration' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'prompt_extend (rewriting)', vhtml: 'params.wan.promptExtend' },
      { vendor: 'audio (sound-image sync)', vhtml: 'direction.video.withAudio' },
      { vendor: 'first/last frame', vhtml: 'inputs[role="first-frame" | "last-frame"]' },
      { vendor: 'reference-to-video', vhtml: 'inputs[role="subject" | "reference-image"]' },
      { vendor: 'speak (lipsync)', vhtml: 'kind="lipsync" + inputs[role="voice"]' },
      { vendor: 'video extend', vhtml: 'kind="edit" + direction.edit.operation="extend"' },
    ],
  },
  {
    id: 'vidu',
    label: 'Vidu (Shengshu)',
    docs: 'https://platform.vidu.com/docs/text-to-video',
    kinds: ['video'],
    modes: ['t2v', 'i2v', 'keyframes (start-end)', 'reference2video', 'extend'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '1–10s by model' },
      { vendor: 'resolution', vhtml: 'constraints.resolution', note: '540p/720p/1080p' },
      { vendor: 'aspect_ratio', vhtml: 'constraints.aspectRatio', note: '16:9, 9:16, 3:4, 4:3, 1:1' },
      { vendor: 'movement_amplitude', vhtml: 'direction.video.motionStrength', note: 'auto/normal/slow/fast → normalised' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'start/end frames', vhtml: 'inputs[role="first-frame" | "last-frame"]' },
      { vendor: 'reference2video (subjects)', vhtml: 'inputs[role="subject"]' },
      { vendor: 'bg / removal options', vhtml: 'params.vidu.bg' },
    ],
  },
  {
    id: 'pixverse',
    label: 'PixVerse',
    docs: 'https://docs.comfy.org/built-in-nodes/partner-node/video/pixverse/pixverse-text-to-video',
    kinds: ['video'],
    modes: ['t2v', 'i2v', 'keyframes (first/last)', 'effects templates', 'lipsync', 'transition'],
    mapping: [
      { vendor: 'prompt / negative_prompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '5s | 8s' },
      { vendor: 'quality', vhtml: 'constraints.resolution', note: '360p…1080p' },
      { vendor: 'motion_mode', vhtml: 'direction.video.motion', note: 'normal | fast' },
      { vendor: 'ci (content consistency)', vhtml: 'params.pixverse.ci' },
      { vendor: 'effects template', vhtml: 'params.pixverse.effect' },
      { vendor: 'first/last frame', vhtml: 'inputs[role="first-frame" | "last-frame"]' },
      { vendor: 'transition', vhtml: 'kind="edit" + direction.edit.operation="transition"' },
    ],
  },
  {
    id: 'seedance',
    label: 'Seedance (ByteDance)',
    docs: 'https://docs.byteplus.com/en/docs/ModelArk/seedance-2-0',
    kinds: ['video'],
    modes: ['t2v', 'i2v', 'r2v (references)', 'video editing (adaptive)', 'native audio'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'resolution', vhtml: 'constraints.resolution', note: '480p/720p/1080p' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '4–15s (2.5: up to 30s)' },
      { vendor: 'aspect_ratio', vhtml: 'constraints.aspectRatio', note: '"adaptive" when editing' },
      { vendor: 'camerafixed', vhtml: 'direction.video.cameraMove', note: 'true → "none"' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'references (images/video)', vhtml: 'inputs[role="reference-image" | "subject" | "reference-video"]' },
    ],
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    docs: 'https://elevenlabs.io/docs/api-reference/voices/settings/update',
    kinds: ['speech', 'dub', 'sfx', 'music'],
    modes: ['tts', 'voice clone', 'dubbing', 'sfx', 'music'],
    mapping: [
      { vendor: 'text', vhtml: 'prompt' },
      { vendor: 'voice_id', vhtml: 'direction.speech.voice' },
      { vendor: 'model_id', vhtml: 'model' },
      { vendor: 'stability / similarity_boost / style', vhtml: 'params.elevenlabs.stability | similarityBoost | style' },
      { vendor: 'speed', vhtml: 'direction.speech.rate', note: '1.0 = native pace' },
      { vendor: 'language (dubbing)', vhtml: 'constraints.language' },
    ],
  },
  {
    id: 'stability-svd',
    label: 'Stability AI (Stable Video Diffusion)',
    docs: 'https://platform.stability.ai/docs/api-reference',
    kinds: ['video', 'image'],
    modes: ['i2v', 't2i (image models)', 'audio (Stable Audio)'],
    mapping: [
      { vendor: 'image', vhtml: 'inputs[role="first-frame"]' },
      { vendor: 'fps_id / fps', vhtml: 'constraints.frameRate' },
      { vendor: 'motion_bucket_id', vhtml: 'direction.video.motionStrength', note: 'rescaled 0..1 (1..255 vendor range)' },
      { vendor: 'noise_aug_strength', vhtml: 'params.stability-svd.noiseAugStrength' },
      { vendor: 'cfg_scale', vhtml: 'constraints.guidance' },
      { vendor: 'steps', vhtml: 'constraints.steps' },
      { vendor: 'negative_prompt', vhtml: 'negativePrompt' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
    ],
  },
  {
    id: 'hunyuan',
    label: 'Hunyuan (Tencent)',
    docs: 'https://cloud.tencent.com/document/product/1770',
    kinds: ['video', 'image', 'speech'],
    modes: ['t2v', 'i2v', 't2i', 'speech'],
    mapping: [
      { vendor: 'Prompt', vhtml: 'prompt' },
      { vendor: 'NegativePrompt', vhtml: 'negativePrompt' },
      { vendor: 'Resolution', vhtml: 'constraints.resolution', note: 'tier string' },
      { vendor: 'Duration', vhtml: 'constraints.duration' },
      { vendor: 'Seed', vhtml: 'constraints.seed' },
      { vendor: 'ImageUrl', vhtml: 'inputs[role="first-frame"]' },
    ],
  },
  {
    id: 'firefly',
    label: 'Adobe Firefly',
    docs: 'https://www.adobe.io/apis/experienceplatform/firefly-api.html',
    kinds: ['image', 'video'],
    modes: ['t2i', 'i2i', 't2v', 'i2v', 'generative fill'],
    mapping: [
      { vendor: 'prompt / negativePrompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'aspectRatio', vhtml: 'constraints.aspectRatio' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: '2s shots' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'style presets', vhtml: 'direction.image.style' },
      { vendor: 'mask (generative fill)', vhtml: 'inputs[role="mask"] + kind="edit"' },
    ],
  },
  {
    id: 'flux',
    label: 'Flux (Black Forest Labs)',
    docs: 'https://docs.bfl.ml',
    kinds: ['image'],
    modes: ['t2i', 'i2i (up to 10 reference images)'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'width / height', vhtml: 'constraints.width / height' },
      { vendor: 'steps', vhtml: 'constraints.steps' },
      { vendor: 'guidance', vhtml: 'constraints.guidance' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'prompt_upsampling', vhtml: 'params.flux.promptUpsampling' },
      { vendor: 'safety_tolerance', vhtml: 'params.flux.safetyTolerance', note: '0-2 moderation strictness' },
      { vendor: 'output_format', vhtml: 'params.flux.outputFormat', note: 'jpeg | png' },
      { vendor: 'reference images', vhtml: 'inputs[role="reference-image" | "character"]' },
    ],
  },
  {
    id: 'stability-image',
    label: 'Stability AI images (SDXL / SD3)',
    docs: 'https://platform.stability.ai/docs/api-reference',
    kinds: ['image', 'edit'],
    modes: ['t2i', 'i2i', 'inpaint', 'outpaint', 'upscale', 'style presets'],
    mapping: [
      { vendor: 'prompt / negative_prompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'aspect_ratio', vhtml: 'constraints.aspectRatio' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'steps', vhtml: 'constraints.steps' },
      { vendor: 'cfg_scale', vhtml: 'constraints.guidance' },
      { vendor: 'image (init)', vhtml: 'inputs[role="reference-image"]' },
      { vendor: 'mask (inpaint)', vhtml: 'inputs[role="mask"] + kind="edit"' },
      { vendor: 'style_preset', vhtml: 'direction.image.style' },
    ],
  },
  {
    id: 'openai-image',
    label: 'OpenAI images (gpt-image-1)',
    docs: 'https://platform.openai.com/docs/api-reference/images',
    kinds: ['image', 'edit'],
    modes: ['t2i', 'i2i (edits)', 'mask-based edit'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'size', vhtml: 'constraints.width / height' },
      { vendor: 'quality', vhtml: 'params.openai-image.quality', note: 'low | medium | high (tier)' },
      { vendor: 'background / output_format', vhtml: 'params.openai-image.background | outputFormat' },
      { vendor: 'n (variants)', vhtml: 'outputs', note: 'one gen-output per variant' },
      { vendor: 'image + mask (edits)', vhtml: 'inputs[role="reference-image" | "mask"] + kind="edit"' },
    ],
  },
  {
    id: 'midjourney',
    label: 'Midjourney (via proxy APIs)',
    docs: 'https://docs.midjourney.com',
    kinds: ['image'],
    modes: ['t2i (imagine)', 'blend', 'describe', 'vary region'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: '--ar', vhtml: 'constraints.aspectRatio' },
      { vendor: '--stylize / --chaos / --weird', vhtml: 'params.midjourney.stylize | chaos | weird' },
      { vendor: '--seed', vhtml: 'constraints.seed' },
      { vendor: 'image prompts / blend', vhtml: 'inputs[role="reference-image"]' },
      { vendor: 'vary region', vhtml: 'inputs[role="mask"] + kind="edit"' },
    ],
  },
  {
    id: 'ideogram',
    label: 'Ideogram',
    docs: 'https://developer.ideogram.ai',
    kinds: ['image'],
    modes: ['t2i', 'i2i', 'text rendering'],
    mapping: [
      { vendor: 'prompt / negative_prompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'aspect_ratio', vhtml: 'constraints.aspectRatio' },
      { vendor: 'resolution', vhtml: 'constraints.resolution' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'magic_prompt_option', vhtml: 'params.ideogram.magicPrompt' },
      { vendor: 'style_type', vhtml: 'direction.image.style' },
    ],
  },
  {
    id: 'qwen-image',
    label: 'Qwen/Wanxiang image (Alibaba)',
    docs: 'https://www.alibabacloud.com/help/en/model-studio/text-to-image-api-reference',
    kinds: ['image', 'edit'],
    modes: ['t2i', 'i2i', 'text rendering'],
    mapping: [
      { vendor: 'prompt / negative_prompt', vhtml: 'prompt / negativePrompt' },
      { vendor: 'size', vhtml: 'constraints.width / height' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
      { vendor: 'prompt_extend', vhtml: 'params.qwen-image.promptExtend' },
      { vendor: 'watermark', vhtml: 'params.qwen-image.watermark' },
      { vendor: 'ref_img (i2i)', vhtml: 'inputs[role="reference-image"]' },
    ],
  },
  {
    id: 'suno',
    label: 'Suno',
    docs: 'https://docs.sunoapi.org/suno-api/generate-music',
    kinds: ['music'],
    modes: ['t2m (song)', 'lyrics-driven', 'continuation'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt', note: 'lyrics fallback when lyrics absent' },
      { vendor: 'lyrics', vhtml: 'direction.music.lyrics' },
      { vendor: 'style', vhtml: 'direction.music.genre + mood' },
      { vendor: 'instrumental', vhtml: 'direction.music.instrumental', note: 'equivalent to vocals="none"' },
    ],
  },
  {
    id: 'stable-audio',
    label: 'Stable Audio (Stability AI)',
    docs: 'https://stability.ai/guides/stable-audio-3-prompt-guide',
    kinds: ['music', 'audio', 'sfx'],
    modes: ['t2a', 'audio-to-audio'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'duration', vhtml: 'constraints.duration', note: 'up to ~190s by model' },
      { vendor: 'format', vhtml: 'params.stable-audio.format', note: 'sampleRate/channels via constraints' },
      { vendor: 'audio input (a2a)', vhtml: 'inputs[role="reference-audio"]' },
      { vendor: 'seed', vhtml: 'constraints.seed' },
    ],
  },
  {
    id: 'musicgen',
    label: 'MusicGen (Meta Audiocraft)',
    docs: 'https://facebookresearch.github.io/audiocraft/api_docs/audiocraft/models/musicgen.html',
    kinds: ['music'],
    modes: ['t2m', 'melody-conditioned'],
    mapping: [
      { vendor: 'prompt', vhtml: 'prompt' },
      { vendor: 'duration', vhtml: 'constraints.duration' },
      { vendor: 'melody', vhtml: 'inputs[role="reference-audio"]', note: 'melody conditioning ~12s' },
      { vendor: 'temperature', vhtml: 'params.musicgen.temperature' },
      { vendor: 'cfg_coef', vhtml: 'constraints.guidance' },
    ],
  },
  {
    id: 'openai-tts',
    label: 'OpenAI TTS',
    docs: 'https://platform.openai.com/docs/guides/text-to-speech',
    kinds: ['speech'],
    modes: ['tts', 'instructions-steered'],
    mapping: [
      { vendor: 'input', vhtml: 'prompt' },
      { vendor: 'voice', vhtml: 'direction.speech.voice' },
      { vendor: 'speed', vhtml: 'direction.speech.rate' },
      { vendor: 'instructions', vhtml: 'direction.speech.style' },
      { vendor: 'response_format', vhtml: 'params.openai-tts.format' },
    ],
  },
  {
    id: 'whisper',
    label: 'OpenAI Whisper (transcription)',
    docs: 'https://platform.openai.com/docs/guides/speech-to-text',
    kinds: ['transcribe'],
    modes: ['audio-to-text', 'translate', 'word timestamps'],
    mapping: [
      { vendor: 'file (audio/video)', vhtml: 'inputs[role="voice" | "video"]', note: 'kind="transcribe"' },
      { vendor: 'model', vhtml: 'model' },
      { vendor: 'language', vhtml: 'constraints.language' },
      { vendor: 'prompt (steer vocabulary)', vhtml: 'params.whisper.prompt' },
      { vendor: 'timestamp_granularities', vhtml: 'outputs', note: 'segment/word timings -> cue rows' },
    ],
  },
  {
    id: 'deepgram',
    label: 'Deepgram (speech-to-text)',
    docs: 'https://developers.deepgram.com/docs',
    kinds: ['transcribe', 'dub'],
    modes: ['streaming', 'pre-recorded', 'diarization', 'word timestamps'],
    mapping: [
      { vendor: 'audio', vhtml: 'inputs[role="voice" | "video"]' },
      { vendor: 'model / tier', vhtml: 'model' },
      { vendor: 'language', vhtml: 'constraints.language' },
      { vendor: 'diarize (speakers)', vhtml: 'outputs', note: 'speaker per cue -> cue.speaker' },
      { vendor: 'punctuate / paragraphs', vhtml: 'params.deepgram.punctuate' },
    ],
  },
  {
    id: 'azure-stt',
    label: 'Azure Speech to Text',
    docs: 'https://learn.microsoft.com/azure/ai-services/speech-service',
    kinds: ['transcribe'],
    modes: ['batch transcription', 'word timestamps', 'diarization'],
    mapping: [
      { vendor: 'audio', vhtml: 'inputs[role="voice" | "video"]' },
      { vendor: 'language', vhtml: 'constraints.language' },
      { vendor: 'diarization', vhtml: 'outputs', note: 'speaker -> cue.speaker' },
      { vendor: 'profanity / phrasing', vhtml: 'params.azure-stt.profanity' },
    ],
  },
  {
    id: 'elevenlabs-scribe',
    label: 'ElevenLabs Scribe',
    docs: 'https://elevenlabs.io/docs/api-reference/speech-to-text',
    kinds: ['transcribe'],
    modes: ['audio-to-text', 'word timestamps', 'diarization'],
    mapping: [
      { vendor: 'file', vhtml: 'inputs[role="voice" | "video"]' },
      { vendor: 'model_id', vhtml: 'model' },
      { vendor: 'language_code', vhtml: 'constraints.language' },
      { vendor: 'timestamps', vhtml: 'outputs', note: 'word/char timings' },
      { vendor: 'diarize', vhtml: 'outputs', note: 'speaker -> cue.speaker' },
    ],
  },
  {
    id: 'azure-tts',
    label: 'Azure Speech (SSML)',
    docs: 'https://learn.microsoft.com/azure/ai-services/speech-service',
    kinds: ['speech', 'dub'],
    modes: ['tts', 'ssml', 'style/role steering'],
    mapping: [
      { vendor: 'text', vhtml: 'prompt' },
      { vendor: 'voice name', vhtml: 'direction.speech.voice' },
      { vendor: 'style / styledegree / role', vhtml: 'direction.speech.style | emotion' },
      { vendor: 'rate / pitch (prosody)', vhtml: 'direction.speech.rate | pitch' },
      { vendor: 'language', vhtml: 'constraints.language' },
    ],
  }
];

export function findVendorProfile(id: string): VendorProfile | undefined {
  const normalized = id.toLowerCase();
  return VENDOR_CATALOG.find((profile) => profile.id === normalized);
}

/** Params namespace helper: `"runway.watermark"` → `{ vendor: "runway", param: "watermark" }`. */
export function splitNamespacedParam(key: string): { vendor?: string; param: string } {
  const index = key.indexOf('.');
  if (index === -1) return { param: key };
  return { vendor: key.slice(0, index), param: key.slice(index + 1) };
}

import type { GenerationTask, Project } from '@sdkwork/vhtml-core/model';
import { toNumber } from '@sdkwork/vhtml-core/time';

/**
 * Extract a vendor's own parameters from a task: keys namespaced
 * `<vendorId>.<param>` are returned with the prefix stripped. Other vendors'
 * namespaced keys and bare keys are excluded, so adapters receive exactly the
 * knobs addressed to them.
 */
export function vendorParams(task: GenerationTask, vendorId: string): Record<string, string | number | boolean> {
  const prefix = `${vendorId.toLowerCase()}.`;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(task.params)) {
    if (key.toLowerCase().startsWith(prefix)) result[key.slice(prefix.length)] = value;
  }
  return result;
}

export interface VendorPayloadOptions {
  /** Resolve input refs to project-relative src + mime for the envelope. */
  resolveSrc?: (project: Project, ref: string) => { src?: string; mimeType?: string } | undefined;
}

/**
 * Build the vendor-neutral envelope an adapter (or the `http` provider)
 * transforms into a vendor request: core fields verbatim, constraints
 * flattened to vendor-friendly scalars, direction passed through, and
 * `params` reduced to the addressed vendor's namespace. The catalog row
 * `vhtml` columns document how each envelope field maps onto the vendor's
 * own schema.
 */
export function buildVendorPayload(
  task: GenerationTask,
  project: Project | undefined,
  options: VendorPayloadOptions = {},
): Record<string, unknown> {
  const vendorId = (task.provider ?? '').toLowerCase();
  const constraints: Record<string, unknown> = {
    aspectRatio: task.constraints.aspectRatio,
    resolution: task.constraints.resolution,
    language: task.constraints.language,
    seed: task.constraints.seed,
    steps: task.constraints.steps,
    guidance: task.constraints.guidance,
    frameRate: task.constraints.frameRate,
    sampleRate: task.constraints.sampleRate,
    channels: task.constraints.channels,
  };
  const width = task.constraints.width;
  const height = task.constraints.height;
  if (width !== undefined) constraints.width = width;
  if (height !== undefined) constraints.height = height;
  if (task.constraints.duration) constraints.durationSeconds = toNumber(task.constraints.duration);
  const inputs = task.inputs.map((input) => {
    const resolved = options.resolveSrc && project ? options.resolveSrc(project, input.ref) : undefined;
    return {
      ref: input.ref,
      role: input.role,
      src: resolved?.src,
      mimeType: resolved?.mimeType,
    };
  });
  return {
    schema: 'vhtml.generation/1.1',
    taskId: task.id,
    kind: task.kind,
    model: task.model,
    prompt: task.prompt,
    negativePrompt: task.negativePrompt,
    constraints,
    direction: task.direction,
    params: vendorParams(task, vendorId || 'vendor'),
    inputs,
    rights: task.rights,
    safety: task.safety,
  };
}
