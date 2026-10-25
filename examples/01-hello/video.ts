import { defineVideo, clip, lane, animate, caption, html } from '@sdkwork/vhtml/sdk';

/**
 * Minimal code-first example: one scene, one animation, one caption.
 *
 *   vhtml build examples/01-hello/video.ts --out examples/01-hello/hello.vhtml
 *   vhtml export examples/01-hello/hello.vhtml --out examples/01-hello/out/hello.mp4
 */
export default defineVideo({
  id: 'hello-vhtml',
  title: 'Hello VHTML',
  width: 1920,
  height: 1080,
  fps: '30/1',
  duration: '5s',
  background: '#070c16',
  styles: [
    `
    .stage{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#fff;font-family:system-ui,sans-serif}
    .eyebrow{font-size:26px;letter-spacing:.42em;color:#6ee7ff;font-weight:700}
    h1{font-size:136px;letter-spacing:-5px;margin:18px 0 0;line-height:.95}
    p{font-size:34px;color:#93a9cc;margin-top:26px}
    .line{height:1px;background:linear-gradient(90deg,transparent,#6ee7ff,transparent);width:420px;margin:34px auto 0;opacity:.55}
    `,
  ],
  scenes: [
    {
      id: 'hello',
      duration: '5s',
      html: html`
        <div class="stage">
          <div>
            <div class="eyebrow">VHTML 1.1</div>
            <h1>Hello, video.</h1>
            <p>HTML and CSS, on a real timeline, rendered deterministically.</p>
            <div class="line"></div>
          </div>
        </div>
      `,
    },
  ],
  lanes: [
    lane('video', 'visual', [
      clip('scene:hello', {
        id: 'hello-clip',
        start: 0,
        duration: '5s',
        animations: [
          animate({ property: 'opacity', from: 0, to: 1, duration: '0.8s', easing: 'ease-out' }),
          animate({ property: 'scale', from: 1.04, to: 1, duration: '5s', easing: 'ease-out' }),
        ],
      }),
    ]),
  ],
  captions: [caption('Code is the source of truth.', '0.8s', { duration: '3.4s' })],
  captionStyle: 'font-size:30px;bottom:8%',
  outputs: [{ format: 'mp4', path: 'out/hello.mp4', crf: 20 }],
});
