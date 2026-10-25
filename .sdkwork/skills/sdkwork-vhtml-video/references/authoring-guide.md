# VHTML Authoring Guide（创作参考）

Reference for authoring VHTML 1.1 projects. Normative sources:
`specification/VHTML-1.1-Specification.md` (core), `specification/project-layout.md`
(layout), `specification/video-authoring.md` (programs/remap/nesting/ducking),
`docs/sdk.md` (SDK). This file condenses what an agent needs per session; do
not copy it into deliverables.

---

## 1. Project anatomy

A project is a directory:

```text
my-video/
  vhtml.json              manifest: entry / source / paths / preview / export
  video.ts                optional SDK source (compiled by `vhtml build`)
  video.vhtml             canonical entry document
  scenes/*.html           external Scene fragments (optional, `vhtml split`)
  assets/images|video|audio|fonts/   hand-authored media
  generated/              provider outputs (never hand-edit)
  renders/                exports
  .vhtml/cache/           generation cache (never hand-edit)
```

Minimal `vhtml.json`:

```json
{
  "version": "1.1",
  "id": "my-video",
  "entry": "video.vhtml",
  "source": "video.ts",
  "paths": {
    "assets": "assets", "images": "assets/images", "video": "assets/video",
    "audio": "assets/audio", "fonts": "assets/fonts", "scenes": "scenes",
    "generated": "generated", "renders": "renders", "cache": ".vhtml/cache"
  },
  "build": { "out": "video.vhtml" },
  "preview": { "port": 4173, "open": false },
  "export": { "outDir": "renders", "format": "mp4", "crf": 20 }
}
```

`entry` is what validate/render/export load; `source` is the SDK file `vhtml
build` compiles into `build.out`. A bare `.vhtml` file is also a valid project
argument everywhere.

---

## 2. Three equivalent authoring modes

All modes produce the same Core Model. Pick per job, not per team:

| Mode | Best for | Source of truth |
|---|---|---|
| Declarative `.vhtml` | Hand-authored, small/medium projects, maximum Git-diff readability | the `.vhtml` file |
| SDK TypeScript (`video.ts`) | Loops, data, reuse, type-checked authoring | `video.ts` (`.vhtml` is build output) |
| Single-file program document | Self-contained data-driven templates, parameterized renders, no build step | the `.vhtml` file (program + data blocks) |

### 2.1 Declarative `.vhtml`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Video</title>
    <style>
      html, body { margin: 0; background: #070c16; }
      .stage { position: absolute; inset: 0; display: grid; place-items: center;
               color: #fff; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <vhtml version="1.1">
      <project id="my-video" version="1.1" title="My Video">
        <settings>
          <composition width="1920" height="1080" frame-rate="30/1"
                       duration="5s" background="#070c16" />
        </settings>
        <assets>
          <asset id="logo" type="image" src="assets/images/logo.png" />
        </assets>
        <scenes>
          <scene id="intro" duration="5s">
            <style> /* scene-scoped CSS */ </style>
            <div class="stage"><h1>Hello video</h1></div>
          </scene>
        </scenes>
        <timelines>
          <timeline id="main" duration="5s">
            <lane id="visual" type="video">
              <clip id="intro-clip" ref="scene:intro" start="0s" duration="5s">
                <animate property="opacity" from="0" to="1" duration="0.8s" easing="ease-out" />
              </clip>
            </lane>
            <lane id="captions" type="caption" caption-style="font-size:30px;bottom:8%">
              <cue id="cue1" start="0.8s" duration="3.4s" text="Code is the source of truth." />
            </lane>
          </timeline>
        </timelines>
        <outputs>
          <output id="mp4" format="mp4" width="1920" height="1080"
                  frame-rate="30/1" path="renders/my-video.mp4" />
        </outputs>
      </project>
    </vhtml>
  </body>
</html>
```

Document rules that bite:

- VHTML elements are HTML-safe: `lane`, `cue`, `gen-input`, `gen-output` and
  self-closing recovery for `<asset />`, `<clip />` etc. Everything else
  inside `<scene>` is authored HTML.
- Global `<style>` in `<head>` is project CSS; `<style>` inside a `<scene>` is
  scene-scoped. Scene HTML is absolutely positioned and fills the stage.
- External Scene fragments: `<scene id="intro" src="scenes/intro.html" />`;
  relative URLs are rebased to the project root. Do not combine `src` with
  inline HTML.

### 2.2 SDK TypeScript

```ts
import { defineVideo, clip, lane, animate, transition, caption, effect, html, css } from '@sdkwork/vhtml/sdk';

export default defineVideo({
  id: 'demo', width: 1280, height: 720, fps: '30/1', duration: '6s',
  background: '#070c16', seed: 11,
  assets: [{ id: 'logo', type: 'image', src: 'assets/images/logo.png' }],
  scenes: [{ id: 'hero', duration: '6s', css: `…`, html: html`<div class="hero">…</div>` }],
  styles: [`body { margin:0 }`],
  lanes: [lane('video', 'visual', [clip('scene:hero', { start: 0, duration: '6s',
    animations: [animate({ property: 'opacity', from: 0, to: 1, duration: '0.6s' })] })],
    { transitions: [transition('a-clip', 'b-clip', { type: 'wipe', duration: '0.4s', direction: 'left' })] })),
  ],
  captions: [caption('HTML on a real timeline.', '1s', { duration: '3s' })],
  captionStyle: 'font-size:30px;bottom:8%',
  generations: [{ id: 'hero', kind: 'video', provider: 'procedural',
    prompt: '…', constraints: { duration: '5s', width: 1920, height: 1080 } }],
  outputs: [{ format: 'mp4', path: 'renders/demo.mp4' }],
});
```

Compile and validate: `pnpm exec vhtml build <dir>` then
`pnpm exec vhtml validate <dir>`. `clip('', { html, css })` creates an inline
scene with an auto id. `applyEditOperations(project, ops)` is available for
post-production inside `video.ts`.

### 2.3 Single-file program document

The `.vhtml` file carries a skeleton `<project>` plus an inline program and
JSON data blocks; the program runs once, deterministically, at load and the
document becomes a plain declarative project:

```html
<vhtml version="1.1">
  <project id="charts" version="1.1">
    <settings><composition width="1280" height="720" frame-rate="30/1" duration="6s" seed="11" /></settings>
    <timelines><timeline id="main" duration="6s"></timeline></timelines>
  </project>
  <script type="application/vnd.vhtml.program+javascript">
    vhtml.addLane({ id: 'visual', type: 'video', clips: [] });
    for (const row of vhtml.data.get('rows')) {
      vhtml.addScene({ id: 'row-' + row.id, html: '<h1>' + row.title + '</h1>' });
      vhtml.addClip('visual', { ref: 'scene:row-' + row.id, start: row.at, duration: 1 });
    }
  </script>
  <script type="application/json" id="rows">
    [{ "id": "a", "title": "Hello", "at": 0 }]
  </script>
</vhtml>
```

Program rules:

- Exactly one program per document; must be **synchronous** (no `await`, no
  timers, no I/O, no `require`/`import`); 2000 ms sandbox budget.
- Deterministic: `Date.now()` is 0, `Math.random` is seeded from
  `program seed ?? composition seed`. Same document + params = same video.
- **Sandbox `Math` only guarantees `Math.random`** (the seeded PRNG). Other
  `Math` methods are absent in the reference sandbox — write plain arithmetic
  (`((x + 0.5) | 0)` to round, ternaries for min/max) instead of
  `Math.round`/`Math.min`/`Math.floor`.
- API: read-only context (`vhtml.ctx.width/height/fps/duration/params`,
  `vhtml.data.get(id)`), pure builders (`clip`, `scene`, `animate`, `effect`,
  `lane`, `caption`, `html` template tag, `css`), mutators (`addScene`,
  `addLane`, `addClip`, `addTimeline`, `addTransition`, `addCue`,
  `addGeneration`, `addOutput`, `addStyle`, `setDuration`, `edit(ops)`,
  `warn/info`). Full list: `specification/video-authoring.md` §2.3.
- Parameterize renders: `vhtml export video.vhtml --param accent=%236ee7ff
  --param cards=5` merges into `vhtml.ctx.params` (external wins).
- `vhtml build video.vhtml` **freezes** the materialised model and strips the
  program; keep the source document in version control.
- Captions from SRT/VTT data: `for (const cue of vhtml.parseCaptions(vhtml.data.get('script'))) vhtml.addCue({ text: cue.text, start: cue.start, end: cue.end });`
- Editors freeze programs on save. If `vhtml edit`/Studio strips your program,
  re-freeze from the source document with `vhtml build`.

---

## 3. Core model cheat sheet

### Time

- Accepts `'1.5s'`, `'500ms'`, `'90f'` (frames), `'00:00:01.500'`, SMPTE
  `'00:00:12:15'` (context = composition fps), numbers = seconds (SDK).
- Frame rate is an exact ratio (`'30000/1001'`); frame counts are
  `ceil(duration * fps)`; intervals are half-open `[start, start+duration)`.
- Clips must stay within `[0, timeline.duration]`; edit ops auto-extend the
  timeline when authorized.

### Lane types

| type | plays | notes |
|---|---|---|
| `video` | scene / video / image / timeline refs, stacked bottom-up by lane order | base visuals |
| `overlay` | same, on top of video lanes | watermarks, covers |
| `audio` | audio/video/`gen:` audio clips | **only lane type mixed into export audio** |
| `caption` | cues | one cue lane per style; `caption-style` CSS declarations |
| `data` | data values | metadata lanes |

`order` attribute (0 = bottom) controls stacking within a timeline.

### Clip essentials

`ref` values: `scene:<id>`, `asset:<id>`, `gen:<taskId>`,
`timeline:<id>` (compound clip; `kind="timeline"`). Key attributes: `start`,
`duration` (and `out`), `in` (source in-point), `speed`, `reverse`, `freeze`,
`loop`, `opacity`, `blend`, `fit` (`cover|contain`), `transform`
(`scale/x/y/rotate`), `crop`, `volume`, `pan`, `fade-in`, `fade-out`,
`muted`, `audio-offset`, `time-remap` (speed ramps), `className`, `z`.

Source-window invariant for media: `out = in + duration * speed`; never let
`in < 0` or `out > asset.duration`.

### Animations

- Clip-level (no selector): `opacity, x, y, scale, scaleX, scaleY, rotate,
  blur, brightness, contrast, saturate, grayscale, sepia, invert, hueRotate,
  volume, pan`.
- Element-level: add `selector=".title"`; arbitrary CSS properties allowed.
- `time-base="clip"` (default) or `"scene"`; values via `from/to` + `duration`,
  or `values[] + times[]`, or `<keyframe at value>` children; `easing`,
  `compose: add|accumulate`, `fill`.
- CSS `@keyframes` inside scene `<style>` are also fine — the runtime pauses
  and seeks them deterministically. Prefer CSS animations for entrance
  choreography, model animations for cuts/scrubbing (split auto-splits
  keyframes at the cut point).

### Transitions

Declared on the lane between two clips that **overlap** by at least the
transition duration:

```html
<transition id="t1" from="hero-clip" to="features-clip" type="crossfade" duration="0.5s" />
```

Types: `crossfade, fade, dip, wipe, slide, zoom, blur` (+ `direction`,
`easing`). Editing reconciliation removes transitions whose clips no longer
overlap and clamps over-long durations.

### Effects

Per-clip children: `<effect type="vignette" amount="0.5" />`, `blur`,
`filter`, `tint`, `drop-shadow`, `glow`, `rounded`, `mask`, `chroma-key`,
`grain` (with `opacity`), plus overlay effects. Audio effects: `<audio-effect
type="ducking" sidechain-track="sfx" threshold="-24" reduction="0.2"
attack="0.05" release="0.4" hold="0.2" />`.

### Audio rules (critical)

- Sound exists **only** from clips on `type="audio"` lanes. A video clip with
  embedded audio must sit on an audio lane to be heard in export; `muted`
  silences it. On visual lanes it is preview-only.
- `volume` (0..n), `pan` (-1..1), `fade-in/fade-out`, `audio-offset`
  (positive = audio lags; lip-sync fix), `speed` via `atempo`, time-remap for
  ramped audio reads.
- Master normalization and EBU R128 loudness (`--loudness -14`) happen at
  export.

### Captions

```html
<lane id="captions" type="caption" caption-style="font-size:28px;bottom:7%;color:#eaf7ff">
  <cue id="cue-1" start="0.9s" duration="3s" text="Write the page." />
</lane>
```

`cue` accepts `speaker`, `style`. Safe areas: 9:16 platforms reserve roughly
top 8% / right 12% / bottom 18% / left 6% for UI — keep captions above the
bottom inset. Sidecar `.vtt`/`.srt` files are written by
`vhtml captions`/`vhtml export --captions`.

### Outputs

```html
<output id="mp4" format="mp4" width="1280" height="720" frame-rate="30"
        video-codec="libx264" audio-codec="aac" crf="20" path="renders/film.mp4" />
```

Formats: `mp4, webm, gif, png-sequence, wav, mp3`. Delivery profiles
(`vhtml export --delivery tiktok`) derive an output without touching the
timeline — see the export skill.

---

## 4. Scene design conventions (determinism-safe)

- The stage is exactly `width × height` px; scene content is absolutely
  positioned (`position:absolute; inset:0`) and centered via flex/grid.
- Use system-ui font stacks or bundled fonts in `assets/fonts/` — remote
  fonts fetch nothing at render time (network is blocked).
- Deterministic motion: CSS animations are paused and seeked by project time;
  avoid `IntersectionObserver`, rAF-driven timelines, `Math.random` without
  seed, or `Date`-based logic in scene scripts. Seeded randomness for
  authored variation belongs in program documents or the SDK (`seed` field).
- Design text at ~2× final CSS size for 1080p legibility (see blueprint
  examples: 92–136 px titles at 1080–1920 px canvases).
- Keep per-scene scripts logic-light; heavy per-frame work belongs in the
  authoring program, not the stage.

## 5. Author → verify loop

```bash
pnpm exec vhtml build <dir>            # SDK/program → canonical model
node .sdkwork/skills/sdkwork-vhtml-video/scripts/check-project.mjs <dir>
pnpm exec vhtml render <dir> --frame 60 --out frame.png      # spot check
pnpm exec vhtml render <dir> --time 2.5s --out frame-2.5s.png
pnpm exec vhtml preview <dir> --open   # WYSIWYG Studio (save writes back)
```

`vhtml validate --json` gives stable machine-readable diagnostics; exit codes
`0` success / `1` validation or runtime failure / `2` usage error.

## 6. Frequent failure modes

| Symptom | Cause / fix |
|---|---|
| `REFERENCE_NOT_FOUND` on a clip | `ref` target missing or misspelled (`scene:`, `asset:`, `gen:`, `timeline:` namespaces are exact) |
| `PARSE_DUPLICATE_ID` / `SCRIPT_ERROR: lane "…" not found` | **IDs are one global namespace across the whole document** — timeline, lane, scene, clip, asset, generation, output and the `<project>` id must all be unique. A lane named like its timeline collides; in programs, `addClip('visual', …)` targets a *lane* id, not the timeline id |
| `VALIDATION_DUPLICATE_ID … used by output and output` | the parser auto-injects a default output with id `mp4` when the document has none; a program `addOutput({ id: 'mp4' })` then collides — use a distinct id (e.g. `main-mp4`) |
| Clip silent in export | clip is on a visual lane; move it (or its audio) to an `audio` lane |
| Transition dropped with warning | clips no longer overlap; extend one clip or shorten the transition |
| `TIME_OUT_OF_SOURCE` warning | `in/duration/speed` reads past the source end; trim or slow down |
| `vhtml edit` exits 0 but nothing changed | the ops file held a bare single-op object (silently treated as an empty list) — always send an array, or use `scripts/apply-edits.mjs`; treat "(0 object(s))" as a red flag |
| `TypeError: Math.round is not a function` in a program | the sandbox `Math` exposes only `random`; use plain arithmetic (`((x + 0.5) | 0)`, ternaries) |
| Program edits disappear after Studio save | editors freeze programs; re-apply via `vhtml build` from the source document |
| Frozen/black first frame | media not ready or duration 0 clip; check a `--frame 0` render and clip ranges |
| `SCRIPT_TIMEOUT` / `SCRIPT_ERROR` | program too slow (2s budget) or threw; check `vhtml validate` diagnostics |
| `GENERATION_CAPABILITY_MISSING: … does not support transcribe` | built-in providers (procedural/manifest/http) list no `transcribe` kind yet; register a custom provider via `@sdkwork/vhtml-generation`, or drive captions from an external transcript |
