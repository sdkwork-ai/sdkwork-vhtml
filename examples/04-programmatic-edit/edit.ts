import {
  defineVideo,
  clip,
  lane,
  animate,
  transition,
  html,
} from '@sdkwork/vhtml/sdk';
import { applyEditOperations } from '@sdkwork/vhtml/core';

/**
 * Programmatic editing example: build a base cut, then use the same
 * non-destructive edit operations as the studio/CLI to split, trim, move and
 * add a transition before exporting the Project.
 *
 *   vhtml build examples/04-programmatic-edit/edit.ts --out examples/04-programmatic-edit/edit.vhtml
 */
const base = defineVideo({
  id: 'programmatic-edit',
  title: 'Programmatic edit',
  width: 1280,
  height: 720,
  fps: '30/1',
  duration: '6s',
  background: '#08101d',
  styles: [
    `.card{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:800 96px system-ui;letter-spacing:-4px;background:radial-gradient(900px 500px at 30% 20%,#123a63,#070c16)}`,
  ],
  scenes: [
    { id: 'a', duration: '3s', html: html`<div class="card">BEFORE</div>` },
    { id: 'b', duration: '3s', html: html`<div class="card" style="background:radial-gradient(900px 500px at 70% 30%,#5a2a6e,#0b0a1b)">AFTER</div>` },
  ],
  lanes: [
    lane('video', 'cut', [
      clip('scene:a', { id: 'a-clip', start: 0, duration: '3.2s' }),
      clip('scene:b', { id: 'b-clip', start: 3, duration: '3s' }),
    ]),
  ],
  outputs: [{ format: 'mp4', path: 'out/programmatic-edit.mp4' }],
});

// Split the first clip at 1.4s, ripple-delete the first half, and add a
// crossfade at the remaining overlap. Edits return a fresh project.
const edited = applyEditOperations(base, [
  { op: 'clip.split', clipId: 'a-clip', at: '1.4s' },
  { op: 'clip.rippleDelete', clipId: 'a-clip' },
  { op: 'transition.add', trackId: 'cut', transition: { fromClipId: 'a-clip-b', toClipId: 'b-clip', type: 'crossfade', duration: '0.2s', easing: 'ease-in-out', direction: 'left', color: '#000000', params: {} } },
]);

if (!edited.ok) {
  throw new Error(edited.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
}

export default edited.project;
