# Code-first SDK

The SDK builds the same Core Model as the parser. Projects can be authored entirely
in TypeScript, generated from data, or mixed with hand-written `.vhtml`.

Published as **`@sdkwork/vhtml-sdk`** (depends on
`@sdkwork/vhtml-core`). The complete `@sdkwork/vhtml` meta package also exposes
it as `@sdkwork/vhtml/sdk`.

```bash
pnpm add @sdkwork/vhtml-sdk
```

```ts
import {
  defineVideo, scene, asset, lane, clip, caption,
  animate, effect, transition, html, css,
  applyEditOperations,
} from '@sdkwork/vhtml/sdk';
```

## `defineVideo(spec)`

Key fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | project id |
| `width/height` | number | canvas |
| `fps` | number \| string \| Rate | e.g. `30`, `'30000/1001'` |
| `duration` | TimeInput | `'8s'`, frames, timecode |
| `background` | CSS color | stage background |
| `seed` | number | deterministic random |
| `assets` | asset specs | `{ id, type, src, duration… }` |
| `scenes` | scene specs | `html`/`css` or external `src` |
| `styles` | string[] | global CSS |
| `lanes` | LaneSpec[] | tracks and clips |
| `captions` | CaptionSpec[] | adds a caption lane |
| `captionStyle` | string | CSS declarations for cues |
| `generations` | GenerationSpec[] | AI/procedural tasks |
| `outputs` | OutputSpec[] | export configs |

`TimeInput = Rational | string | number`; numbers are seconds.

### External Scene HTML

A Scene can live in its own HTML fragment; the path is relative to the project
root and is preserved when the SDK is serialized:

```ts
defineVideo({
  // …
  scenes: [
    { id: 'intro', src: 'scenes/intro.html', duration: '4s' },
  ],
  lanes: [lane('video', 'visual', [clip('scene:intro', { start: 0, duration: '4s' })])],
});
```

The fragment’s relative URLs are rebased to the project root at parse time, and
its `<style>`/`<script>` follow the normal Scene scoping rules. Inline `html` and
`src` should not be combined.

## Clip

```ts
clip('scene:intro', {
  id: 'intro-clip',
  start: '0.5s',
  duration: '3s',
  in: '0s',
  speed: 1,
  reverse: false,
  freeze: undefined,
  opacity: 1,
  blend: 'normal',
  fit: 'cover',
  transform: { scale: 1.1, y: 40, rotate: -2 },
  crop: { top: 0.1, bottom: 0.1 },
  effects: [effect('vignette', { amount: 0.5 })],
  animations: [animate({ property: 'opacity', from: 0, to: 1, duration: '0.6s' })],
  volume: 0.8,
  pan: 0,
  fadeIn: '0.2s',
  fadeOut: '0.4s',
  className: 'my-layer',
});
```

Inline scenes:

```ts
clip('', {
  html: html`<div class="card">${title}</div>`,
  css: `.card { color: #6ee7ff }`,
  duration: '3s',
});
```

The SDK creates a scene id automatically.

## Animation

```ts
animate({ property: 'opacity', from: 0, to: 1, duration: '0.6s', easing: 'ease-out' });
animate({ property: 'x', values: [0, 40, 0], times: ['0s', '0.5s', '1s'] });
animate({
  property: 'opacity',
  keyframes: [{ at: 0, value: 0 }, { at: '0.4s', value: 1 }],
  selector: '.title',
  timeBase: 'clip',
});
```

- `selector` animates HTML elements inside the clip.
- Without selector the animation applies to the clip layer.
- Properties: `opacity`, `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotate`,
  `blur`, `brightness`, `contrast`, `saturate`, `grayscale`, `sepia`, `invert`,
  `hueRotate`, `volume`, `pan`; arbitrary CSS properties work on element targets.
- `compose: 'add' | 'accumulate'` supported.

## Transitions

```ts
lane('video', 'story', [a, b], {
  transitions: [transition('a-clip', 'b-clip', {
    type: 'wipe',
    duration: '0.4s',
    direction: 'left',
    easing: 'ease-in-out',
  })],
});
```

`a` and `b` must overlap by at least the transition duration.

## Generation

```ts
generations: [{
  id: 'hero',
  kind: 'video',
  provider: 'procedural',
  prompt: 'cinematic gradient product reveal',
  constraints: { duration: '5s', width: 1920, height: 1080 },
}],
lanes: [lane('video', 'v', [clip('gen:hero', { start: 0, duration: '5s' })])],
```

Export auto-materialises or run `vhtml generate`.

### Usage & quota

Tasks may carry a `usage` record (`<usage>`); runs report what they spent, and
CLI/`materializeGenerations` enforce ceilings (`--max-cost`, `--max-credits`,
`--max-compute-seconds`) with the stable `GENERATION_QUOTA_EXCEEDED` error.
See [generation.md §13](../specification/generation.md).

### Character & style bibles

```ts
characters: [character({ id: 'aria', version: 2, description: 'silver-haired host', negative: 'no glasses' })],
styleGuides: [styleGuide({ id: 'noir', description: 'high-contrast noir' })],
generations: [{
  id: 'shot', kind: 'image', prompt: 'Aria at dawn',
  inputs: [{ ref: 'character:aria', role: 'character' }, { ref: 'style:noir', role: 'style' }],
}],
```

Bibles are the project's versioned consistency library; bumping `version`
invalidates cached generations. See [generation.md §14](../specification/generation.md).

### Effect / transition plugins

```ts
extensions: [{ name: 'brandDip', kind: 'transition', base: 'dip', version: '1.0.0', params: { color: '#0b2740' } }],
```

Declared types render as their built-in `base` with declared default params;
see [../specification/rfc/RFC-0015-extension-plugin-registry.md](../specification/rfc/RFC-0015-extension-plugin-registry.md).

## Editing

```ts
const result = applyEditOperations(project, [
  { op: 'clip.split', clipId: 'hero', at: '2s' },
  { op: 'clip.rippleDelete', clipId: 'intro' },
  { op: 'clip.trim', clipId: 'hero', start: '0.2s', duration: '4s' },
]);
if (!result.ok) console.error(result.diagnostics);
export default result.project;
```

## Inline authoring programs

SDK builders and the in-document authoring program sandbox share the same
implementation (`@sdkwork/vhtml-core/authoring`), so a `defineVideo` project and
a single-file program document produce the same Core Model. Inside a program
(`vhtml.*`), `clip`/`caption`/`lane`/`timeRemap` accept the same specs as the
SDK, plus mutators (`addScene`, `addClip`, `addLane`, `addTimeline`,
`addGeneration`, `addCue`, `edit`, …). See
[../specification/video-authoring.md](../specification/video-authoring.md).

`ClipSpec` also accepts `timeRemap: { keyframes: [{ at, source, easing? }],
easing? }` (speed ramps) and `ref: 'timeline:<id>'` clips (compound clips).

## Serialize / validate

```ts
import { serializeVideoDocument, validateVideo } from '@sdkwork/vhtml/sdk';

validateVideo(project);
const text = serializeVideoDocument(project);
```

CLI equivalent:

```bash
vhtml build video.ts --out video.vhtml
```
