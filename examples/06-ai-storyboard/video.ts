import { defineVideo, lane, clip } from '@sdkwork/vhtml/sdk';

/**
 * Offline AI-storyboard pipeline:
 *   image cover -> video shot (first-frame dependency)
 *   music bed + whoosh SFX
 *
 * `procedural` is deterministic and needs no network. Swap the provider/model
 * for `http` to use a real image/video/music service.
 */
export default defineVideo({
  id: 'ai-storyboard',
  title: 'AI storyboard pipeline',
  width: 1280,
  height: 720,
  fps: '30/1',
  duration: '3s',
  background: '#070c16',
  scenes: [],
  generations: [
    {
      id: 'cover',
      kind: 'image',
      provider: 'procedural',
      prompt: 'cinematic teal cover frame, soft light, abstract product stage',
      constraints: { width: 1280, height: 720, seed: 12 },
      direction: {
        image: { style: 'cinematic', composition: 'centered', background: 'teal gradient' },
        shot: { framing: 'wide', lighting: 'soft rim light', mood: 'premium' },
      },
    },
    {
      id: 'shot',
      kind: 'video',
      provider: 'procedural',
      prompt: 'slow camera push through a teal product stage with floating light',
      model: 'procedural-gradient-v1',
      constraints: { duration: '3s', width: 1280, height: 720, frameRate: '30/1', seed: 12 },
      inputs: [{ ref: 'gen:cover', role: 'first-frame' }],
      direction: {
        shot: { camera: 'slow push in', framing: 'wide', continuity: 'same teal palette' },
        video: { firstFrame: 'gen:cover', loop: false },
      },
      rights: { commercialUse: true, aiDisclosure: true },
    },
    {
      id: 'score',
      kind: 'music',
      provider: 'procedural',
      prompt: 'minimal cinematic synth bed, uplifting, no vocals',
      constraints: { duration: '3s', sampleRate: 48000, seed: 12 },
      direction: {
        music: { genre: 'cinematic synth', mood: 'uplifting', bpm: 96, key: 'D minor', vocals: 'none', loop: false },
      },
    },
    {
      id: 'whoosh',
      kind: 'sfx',
      provider: 'procedural',
      prompt: 'soft transition whoosh',
      constraints: { duration: '0.6s', sampleRate: 48000, seed: 12 },
      direction: { sfx: { category: 'whoosh', environment: 'studio', intensity: 'medium', loop: false } },
    },
  ],
  lanes: [
    lane('video', 'generated-video', [
      clip('gen:shot', { id: 'shot-clip', start: 0, duration: '3s' }),
    ]),
    lane('audio', 'generated-score', [
      clip('gen:score', { id: 'score-clip', start: 0, duration: '3s', volume: 0.55, fadeOut: '0.6s' }),
    ], { order: 1 }),
    lane('audio', 'generated-sfx', [
      clip('gen:whoosh', { id: 'whoosh-clip', start: '0.8s', duration: '0.6s', volume: 0.8 }),
    ], { order: 2 }),
  ],
  storyboard: [
    {
      id: 'shot-cover',
      title: 'Cover frame',
      description: 'Teal stage, centered product, soft rim light.',
      generation: 'cover',
      duration: '0.8s',
      status: 'ready',
      tags: ['cover', 'product'],
      direction: { shot: { framing: 'wide', lighting: 'soft rim light', mood: 'premium' } },
    },
    {
      id: 'shot-push',
      title: 'Push in',
      description: 'Slow push through floating light; hold the same palette.',
      generation: 'shot',
      duration: '3s',
      status: 'boarded',
      tags: ['hero', 'camera'],
      direction: { shot: { camera: 'slow push in', continuity: 'same teal palette' }, video: { loop: false } },
    },
  ],
  outputs: [{ format: 'mp4', path: 'renders/ai-storyboard.mp4', crf: 20 }],
});
