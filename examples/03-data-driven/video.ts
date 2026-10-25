import {
  defineVideo,
  clip,
  lane,
  animate,
  transition,
  caption,
  html,
} from '@sdkwork/vhtml/sdk';

/**
 * Data-driven video: one function renders every scene from the same data, and
 * the timeline is assembled in a loop. This is the core advantage of authoring
 * video as code instead of editing a document by hand.
 */
const metrics = [
  { value: '12.4脳', label: 'faster iteration', detail: 'From idea to rendered cut in one command.' },
  { value: '1', label: 'source of truth', detail: 'A text project that reviews and diffs like code.' },
  { value: '0', label: 'manual exports', detail: 'Deterministic frames, audio and captions together.' },
  { value: '100%', label: 'HTML/CSS', detail: 'Use the browser engine you already know.' },
];

const sceneCss = `
  @keyframes metricIn{from{opacity:0;transform:translateY(26px) scale(.98)}to{opacity:1;transform:none}}
  .metric{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 10%;}
  .value{font-size:150px;line-height:1;font-weight:800;letter-spacing:-8px;color:#6ee7ff;animation:metricIn .55s cubic-bezier(.2,.8,.2,1) both}
  .label{font-size:38px;font-weight:700;margin-top:18px;color:#fff;animation:metricIn .55s .08s both}
  .detail{font-size:24px;color:#9fb3d9;margin-top:16px;max-width:760px;animation:metricIn .55s .16s both}
  .rule{width:70px;height:4px;border-radius:2px;background:#6ee7ff;margin-top:36px;animation:metricIn .55s .22s both}
  .head{position:absolute;top:70px;left:10%;font-size:14px;letter-spacing:.4em;color:#7d94b8}
`;

const generation = {
  id: 'backdrop',
  kind: 'video' as const,
  prompt: 'slow abstract dark blue data field, soft moving light',
  provider: 'procedural',
  constraints: { duration: '9s', width: 1280, height: 720 },
};

const scenes = metrics.flatMap((metric, index) => [
  {
    id: `metric-${index}`,
    duration: '2.2s',
    css: sceneCss,
    html: html`
      <div class="head">VHTML / DATA-DRIVEN CUT</div>
      <div class="metric">
        <div class="value">${metric.value}</div>
        <div class="label">${metric.label}</div>
        <div class="detail">${metric.detail}</div>
        <div class="rule"></div>
      </div>
    `,
  },
]);

const clips = scenes.map((scene, index) =>
  clip(`scene:${scene.id}`, {
    id: `metric-clip-${index}`,
    start: index * 2,
    duration: '2.2s',
    animations: [animate({ property: 'opacity', from: 0, to: 1, duration: '0.35s' })],
  }),
);

export default defineVideo({
  id: 'data-driven-metrics',
  title: 'Data-driven metrics',
  width: 1280,
  height: 720,
  fps: '30/1',
  duration: '9s',
  background: '#050a13',
  generations: [generation],
  styles: [
    `
      .footer{position:absolute;left:10%;bottom:7%;font-size:15px;letter-spacing:.22em;color:#6983a8}
      .footer b{color:#6ee7ff;font-weight:600}
    `,
  ],
  scenes,
  lanes: [
    lane('video', 'backdrop-lane', [
      clip('gen:backdrop', { id: 'backdrop-clip', start: 0, duration: '9s', effects: [] }),
    ]),
    lane('video', 'metrics', clips, {
      transitions: clips.slice(0, -1).map((current, index) =>
        transition(current.id!, clips[index + 1]!.id!, {
          type: index % 2 === 0 ? 'wipe' : 'crossfade',
          duration: '0.2s',
          direction: 'left',
        }),
      ),
    }),
  ],
  captions: metrics.map((metric, index) => ({
    text: `${metric.value} ${metric.label}`,
    start: `${index * 2 + 0.15}s`,
    duration: '1.8s',
  })),
  captionStyle: 'font-size:26px;bottom:5%',
  outputs: [{ format: 'mp4', path: 'out/metrics.mp4', crf: 20 }],
});
