import {
  defineVideo,
  clip,
  lane,
  transition,
  html,
} from '@sdkwork/vhtml/sdk';

const W = 1920;
const H = 1080;
const SLIDE = 3;
const OVERLAP = 0.3;
const STEP = SLIDE - OVERLAP;
const TOTAL = 5 * SLIDE - 4 * OVERLAP;

const css = `
  *{box-sizing:border-box}
  html,body{margin:0;background:#070b14;color:#f4f7ff;font-family:"Microsoft YaHei","PingFang SC",Inter,system-ui,sans-serif}
  body::before{content:"";position:fixed;inset:0;background:
    radial-gradient(1100px 700px at 78% 16%,rgba(70,115,255,.20),transparent 60%),
    radial-gradient(900px 700px at 12% 88%,rgba(110,231,255,.12),transparent 60%);
    pointer-events:none}
  .slide{position:absolute;inset:0;padding:72px 100px;overflow:hidden;
    background:linear-gradient(135deg,#070b14 0%,#0a1222 52%,#07101d 100%)}
  .slide::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;
    background-image:linear-gradient(rgba(140,170,255,.055) 1px,transparent 1px),
      linear-gradient(90deg,rgba(140,170,255,.055) 1px,transparent 1px);
    background-size:80px 80px;mask-image:radial-gradient(circle at 70% 30%,#000,transparent 78%)}
  .brand{display:flex;align-items:center;gap:14px;font-size:16px;letter-spacing:.32em;color:#8fa9cf;font-weight:700}
  .brand i{width:10px;height:10px;border-radius:2px;background:#6ee7ff;box-shadow:0 0 18px #6ee7ff}
  .slide-no{position:absolute;right:100px;top:78px;font-size:14px;letter-spacing:.22em;color:#647b9e;font-variant-numeric:tabular-nums}
  .footer{position:absolute;left:100px;right:100px;bottom:48px;display:flex;justify-content:space-between;
    align-items:center;font-size:13px;letter-spacing:.14em;color:#5e7598;text-transform:uppercase}
  .bar{position:absolute;left:100px;right:100px;bottom:78px;height:3px;background:rgba(255,255,255,.08);overflow:hidden;border-radius:2px}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#6ee7ff,#7c8cff);transform-origin:left;
    animation:grow ${TOTAL}s linear both}
  .eyebrow{font-size:18px;letter-spacing:.42em;color:#6ee7ff;font-weight:700;margin-bottom:24px}
  h1{font-size:110px;line-height:.96;letter-spacing:-5px;font-weight:800;margin:0}
  h1 em{font-style:normal;color:#6ee7ff}
  .sub{font-size:28px;line-height:1.55;color:#9db0cd;max-width:880px;margin-top:30px}
  .chips{display:flex;gap:12px;margin-top:36px}
  .chip{border:1px solid rgba(110,231,255,.30);background:rgba(110,231,255,.055);color:#c7efff;
    border-radius:999px;padding:10px 18px;font-size:16px;letter-spacing:.06em}
  .rise{animation:rise .72s cubic-bezier(.2,.8,.2,1) both}
  .d1{animation-delay:.08s}.d2{animation-delay:.18s}.d3{animation-delay:.28s}.d4{animation-delay:.38s}
  @keyframes rise{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
  @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  .orb{position:absolute;border-radius:50%;border:1px solid rgba(110,231,255,.22);filter:drop-shadow(0 0 18px rgba(110,231,255,.18))}
  .orb.one{width:560px;height:560px;right:-120px;top:130px}
  .orb.two{width:420px;height:420px;right:-40px;top:200px;border-color:rgba(124,140,255,.30)}
  .orb.three{width:250px;height:250px;right:60px;top:285px;background:radial-gradient(circle at 35% 30%,rgba(110,231,255,.30),rgba(110,231,255,.02) 62%)}
  .big-stat{font-size:72px;font-weight:800;letter-spacing:-3px;color:#fff;line-height:1}
  .big-stat small{font-size:22px;letter-spacing:.02em;color:#6ee7ff;font-weight:700;margin-left:10px}
  .stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:54px}
  .stat{padding:28px 26px;border:1px solid rgba(140,180,255,.18);border-radius:14px;
    background:linear-gradient(155deg,rgba(20,38,66,.70),rgba(8,16,30,.55))}
  .stat b{display:block;font-size:20px;color:#fff;margin-top:14px}
  .stat span{display:block;font-size:15px;line-height:1.55;color:#8fa6c5;margin-top:8px}
  .stat u{display:block;width:32px;height:3px;background:#6ee7ff;border-radius:2px;text-decoration:none}
  .flow{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:58px;align-items:stretch}
  .node{padding:26px 22px;border:1px solid rgba(140,180,255,.20);border-radius:14px;
    background:linear-gradient(160deg,rgba(22,41,70,.75),rgba(8,15,27,.58));position:relative}
  .node:not(:last-child)::after{content:"→";position:absolute;right:-18px;top:42%;color:#6ee7ff;font-size:22px}
  .node b{display:block;font-size:20px;color:#fff}.node span{display:block;font-size:14px;color:#94a9c8;margin-top:10px;line-height:1.5}
  .node i{display:block;font-size:11px;letter-spacing:.18em;color:#6ee7ff;margin-bottom:12px}
  .code{margin-top:42px;padding:22px 26px;border:1px solid rgba(110,231,255,.18);border-radius:12px;
    background:rgba(3,8,16,.72);font-family:Consolas,"Cascadia Mono",monospace;font-size:17px;line-height:1.7;color:#9fdff0}
  .code b{color:#7c8cff;font-weight:400}.code em{color:#ffd166;font-style:normal}
  .grid-six{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:42px}
  .tile{border:1px solid rgba(140,180,255,.18);border-radius:12px;padding:20px 20px;
    background:linear-gradient(150deg,rgba(22,41,70,.62),rgba(8,15,27,.45));min-height:132px}
  .tile b{display:block;font-size:18px;color:#fff}.tile span{display:block;font-size:13px;line-height:1.5;color:#8ca2c0;margin-top:8px}
  .tile i{display:block;font-size:10px;letter-spacing:.2em;color:#6ee7ff;margin-bottom:12px}
  .road{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:46px}
  .phase{padding:24px 24px;border-left:2px solid #6ee7ff;background:rgba(10,22,40,.54)}
  .phase b{display:block;font-size:18px;color:#fff}.phase span{display:block;font-size:14px;color:#8fa6c5;margin-top:8px;line-height:1.55}
  .phase em{display:block;font-style:normal;font-size:11px;letter-spacing:.2em;color:#6ee7ff;margin-bottom:10px}
  .cta{display:inline-flex;align-items:center;gap:12px;margin-top:40px;padding:16px 26px;border-radius:999px;
    background:#6ee7ff;color:#041018;font-size:20px;font-weight:800;letter-spacing:.01em}
  .cta span{font-size:14px;font-weight:600;opacity:.65}
`;

const slide = (no: number, body: string): string => `
  <div class="slide">
    <div class="brand"><i></i>VHTML / PRESENTATION</div>
    <div class="slide-no">SLIDE ${String(no).padStart(2, '0')} / 05</div>
    ${body}
    <div class="bar"><i></i></div>
    <div class="footer"><span>VHTML 1.1 · AI video operating system</span><span>${no} / 5</span></div>
  </div>
`;

const scenes = [
  {
    id: 'title',
    duration: `${SLIDE}s`,
    html: slide(1, html`
      <div class="orb one"></div><div class="orb two"></div><div class="orb three"></div>
      <div style="position:absolute;left:100px;top:246px;max-width:1040px">
        <div class="eyebrow rise">THE NEXT PRODUCTION STACK</div>
        <h1 class="rise d1">Build video<br /><em>like software.</em></h1>
        <p class="sub rise d2">One HTML timeline for slides, AI shots, voice, music and delivery.<br />Write it. Review it. Ship it.</p>
        <div class="chips rise d3"><span class="chip">HTML-native</span><span class="chip">AI-native</span><span class="chip">Deterministic export</span></div>
      </div>
    `),
  },
  {
    id: 'why',
    duration: `${SLIDE}s`,
    html: slide(2, html`
      <div style="position:absolute;left:100px;top:180px;right:100px">
        <div class="eyebrow rise">WHY VHTML</div>
        <h1 class="rise d1" style="font-size:78px">One timeline.<br /><em>Every screen.</em></h1>
        <div class="stat-grid">
          <div class="stat rise d2"><u></u><div class="big-stat">14<small>modalities</small></div><b>Multimodal by design</b><span>Image, video, speech, music, SFX, avatar, lipsync, storyboard.</span></div>
          <div class="stat rise d3"><u></u><div class="big-stat">1<small>model</small></div><b>No re-authoring</b><span>16:9, 9:16, 4:5 and 2.39:1 from the same project.</span></div>
          <div class="stat rise d4"><u></u><div class="big-stat">C2<small>audit</small></div><b>Commercial delivery</b><span>SHA-256, provenance, rights and AI disclosure in every report.</span></div>
        </div>
      </div>
    `),
  },
  {
    id: 'pipeline',
    duration: `${SLIDE}s`,
    html: slide(3, html`
      <div style="position:absolute;left:100px;top:168px;right:100px">
        <div class="eyebrow rise">THE PIPELINE</div>
        <h1 class="rise d1" style="font-size:76px">From code to master.</h1>
        <div class="flow">
          <div class="node rise d2"><i>01 / AUTHOR</i><b>HTML + SDK</b><span>Scenes, timing, AI tasks and storyboard as code.</span></div>
          <div class="node rise d2"><i>02 / MODEL</i><b>Core Model</b><span>Exact rational time, references, rights and edits.</span></div>
          <div class="node rise d3"><i>03 / RENDER</i><b>Chromium</b><span>Seek every frame deterministically; mix audio offline.</span></div>
          <div class="node rise d3"><i>04 / SHIP</i><b>FFmpeg + QC</b><span>MP4/WebM/GIF, delivery profiles and audit report.</span></div>
        </div>
        <div class="code rise d4"><b>vhtml</b> export ./deck --delivery youtube-4k <em>--report</em> renders/report.json</div>
      </div>
    `),
  },
  {
    id: 'multimodal',
    duration: `${SLIDE}s`,
    html: slide(4, html`
      <div style="position:absolute;left:100px;top:160px;right:100px">
        <div class="eyebrow rise">MULTIMODAL CREATION</div>
        <h1 class="rise d1" style="font-size:70px">Every asset is<br /><em>a first-class object.</em></h1>
        <div class="grid-six">
          <div class="tile rise d2"><i>IMAGE</i><b>Cover & stills</b><span>Text/image, reference, mask, transparent.</span></div>
          <div class="tile rise d2"><i>VIDEO</i><b>Shots & motion</b><span>Text/image, first/last frame, reference video.</span></div>
          <div class="tile rise d3"><i>VOICE</i><b>Speech & dub</b><span>TTS, language, emotion, consent-aware cloning.</span></div>
          <div class="tile rise d3"><i>MUSIC</i><b>Score & stems</b><span>BPM, key, structure, vocals, multi-output.</span></div>
          <div class="tile rise d4"><i>SFX</i><b>Sound design</b><span>Category, environment, intensity, loop.</span></div>
          <div class="tile rise d4"><i>STORYBOARD</i><b>Shot planning</b><span>Free-edit cards linked to scenes and generation.</span></div>
        </div>
      </div>
    `),
  },
  {
    id: 'close',
    duration: `${SLIDE}s`,
    html: slide(5, html`
      <div style="position:absolute;left:100px;top:176px;right:100px">
        <div class="eyebrow rise">ROADMAP</div>
        <h1 class="rise d1" style="font-size:78px">Ship the next cut.</h1>
        <div class="road">
          <div class="phase rise d2"><em>NOW</em><b>Deterministic studio</b><span>Storyboard, AI generation, WYSIWYG, audit export.</span></div>
          <div class="phase rise d3"><em>NEXT</em><b>Post-production bridge</b><span>OTIO/FCPXML, HLS/DASH, HDR and alpha.</span></div>
          <div class="phase rise d4"><em>THEN</em><b>Team operating system</b><span>Review, locking, approvals and regulated delivery.</span></div>
        </div>
        <div class="cta rise d4">Start with one HTML file <span>vhtml.dev</span></div>
      </div>
    `),
  },
];

const clips = scenes.map((scene, index) =>
  clip(`scene:${scene.id}`, {
    id: `slide-${index + 1}`,
    start: index * STEP,
    duration: `${SLIDE}s`,
  }),
);

export default defineVideo({
  id: 'ppt-video',
  title: 'VHTML presentation video',
  width: W,
  height: H,
  fps: '30/1',
  duration: `${TOTAL}s`,
  background: '#070b14',
  styles: [css],
  scenes,
  lanes: [
    lane('video', 'slides', clips, {
      transitions: [
        transition(clips[0]!.id!, clips[1]!.id!, { type: 'fade', duration: `${OVERLAP}s` }),
        transition(clips[1]!.id!, clips[2]!.id!, { type: 'slide', duration: `${OVERLAP}s`, direction: 'left' }),
        transition(clips[2]!.id!, clips[3]!.id!, { type: 'wipe', duration: `${OVERLAP}s`, direction: 'left' }),
        transition(clips[3]!.id!, clips[4]!.id!, { type: 'fade', duration: `${OVERLAP}s` }),
      ],
    }),
  ],
  storyboard: [
    { id: 'shot-title', title: 'Title', scene: 'title', duration: `${SLIDE}s`, status: 'ready', tags: ['title'] },
    { id: 'shot-why', title: 'Why VHTML', scene: 'why', duration: `${SLIDE}s`, status: 'ready', tags: ['value'] },
    { id: 'shot-pipeline', title: 'Pipeline', scene: 'pipeline', duration: `${SLIDE}s`, status: 'ready', tags: ['product'] },
    { id: 'shot-multimodal', title: 'Multimodal', scene: 'multimodal', duration: `${SLIDE}s`, status: 'ready', tags: ['ai'] },
    { id: 'shot-close', title: 'Roadmap', scene: 'close', duration: `${SLIDE}s`, status: 'ready', tags: ['closing'] },
  ],
  outputs: [{ format: 'mp4', path: 'renders/ppt-video.mp4', crf: 18 }],
});
