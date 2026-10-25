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
 * Vertical social teaser: authored once at 9:16, with platform-safe captions and
 * delivery-profile friendly composition. Export with:
 *   vhtml export . --delivery tiktok
 *   vhtml export . --delivery reels
 *   vhtml export . --delivery shorts
 */
const css = `
  @keyframes rise{from{opacity:0;transform:translateY(48px)}to{opacity:1;transform:none}}
  @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  .stage{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 9%;color:#fff;font-family:Inter,system-ui,sans-serif}
  .eyebrow{font-size:24px;letter-spacing:.42em;color:#6ee7ff;font-weight:700;margin-bottom:28px;animation:rise .6s both}
  .title{font-size:112px;line-height:.92;letter-spacing:-6px;font-weight:800;margin:0;animation:rise .7s .08s both}
  .title em{font-style:normal;color:#ffd166}
  .copy{font-size:34px;line-height:1.35;color:#a9bdd8;margin-top:32px;max-width:820px;animation:rise .7s .16s both}
  .chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:44px;animation:rise .7s .24s both}
  .chip{border:1px solid rgba(110,231,255,.45);border-radius:999px;padding:14px 24px;font-size:26px;color:#dff9ff;background:rgba(110,231,255,.07)}
  .cta{margin-top:48px;display:inline-flex;align-items:center;gap:14px;font-size:30px;font-weight:700;color:#041018;background:#6ee7ff;border-radius:999px;padding:20px 30px;animation:rise .7s .3s both}
  .rail{position:absolute;left:9%;right:9%;bottom:20%;height:5px;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden}
  .rail i{display:block;height:100%;background:#6ee7ff;transform-origin:left;animation:grow 1.7s .2s both}
  .tag{position:absolute;top:7%;left:9%;font-size:18px;letter-spacing:.3em;color:#7189aa}
`;

const scenes = [
  {
    id: 'hook',
    duration: '2.2s',
    css,
    html: html`
      <div class="tag">VHTML / VERTICAL</div>
      <div class="stage">
        <div class="eyebrow">ONE PROJECT</div>
        <h1 class="title">Make it <em>vertical.</em></h1>
        <p class="copy">The same HTML timeline, reframed for the feed.</p>
        <div class="rail"><i></i></div>
      </div>
    `,
  },
  {
    id: 'features',
    duration: '2.2s',
    css,
    html: html`
      <div class="tag">VHTML / VERTICAL</div>
      <div class="stage">
        <div class="eyebrow">BUILT FOR SOCIAL</div>
        <h1 class="title">9:16 by design.</h1>
        <div class="chips">
          <span class="chip">Safe captions</span>
          <span class="chip">Kinetic HTML</span>
          <span class="chip">One timeline</span>
        </div>
        <p class="copy">No re-authoring. One model, many deliveries.</p>
        <div class="rail"><i></i></div>
      </div>
    `,
  },
  {
    id: 'cta',
    duration: '2.2s',
    css,
    html: html`
      <div class="tag">VHTML / VERTICAL</div>
      <div class="stage">
        <div class="eyebrow">SHIP EVERYWHERE</div>
        <h1 class="title">Six formats.<br /><em>One file.</em></h1>
        <div class="cta">vhtml export --delivery tiktok</div>
        <div class="rail"><i></i></div>
      </div>
    `,
  },
];

const clips = scenes.map((scene, index) =>
  clip(`scene:${scene.id}`, {
    id: `vertical-${index}`,
    start: index * 1.8,
    duration: '2.2s',
    animations: [animate({ property: 'opacity', from: 0, to: 1, duration: '0.3s' })],
  }),
);

export default defineVideo({
  id: 'vertical-social',
  title: 'Vertical social teaser',
  width: 1080,
  height: 1920,
  fps: '30/1',
  duration: '6s',
  background: '#070c16',
  styles: [
    `html,body{margin:0;background:#070c16}
     body::before{content:'';position:fixed;inset:-20%;background:
       radial-gradient(circle at 20% 10%,rgba(30,136,229,.4),transparent 38%),
       radial-gradient(circle at 90% 80%,rgba(110,231,255,.18),transparent 40%);pointer-events:none}`,
  ],
  scenes,
  lanes: [
    lane('video', 'vertical-scenes', clips, {
      transitions: [
        transition(clips[0]!.id!, clips[1]!.id!, { type: 'slide', duration: '0.3s', direction: 'left' }),
        transition(clips[1]!.id!, clips[2]!.id!, { type: 'zoom', duration: '0.3s' }),
      ],
    }),
  ],
  captions: [
    caption('Make it vertical.', '0.3s', { duration: '1.7s' }),
    caption('9:16 by design — safe for the feed.', '2.1s', { duration: '1.7s' }),
    caption('Six formats from one timeline.', '3.9s', { duration: '1.8s' }),
  ],
  captionStyle: 'font-size:32px;bottom:16%;color:#eaf7ff;padding:0 12%',
  outputs: [{ format: 'mp4', path: 'renders/vertical.mp4', crf: 20 }],
});
