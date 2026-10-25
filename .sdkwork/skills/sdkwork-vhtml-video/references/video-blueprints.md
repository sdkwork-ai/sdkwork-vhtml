# Video Blueprints（视频蓝本）

`scripts/new-video.mjs` scaffolds a ready-to-validate project from a
blueprint. Each blueprint is a complete, valid VHTML 1.1 document modeled on
the repository examples (`examples/01`–`08`). Replace placeholder content
(markers like `YOUR PRODUCT`, sample rows) with the real brief; the structure,
lane stack and safe areas are the value.

| Blueprint | Canvas / duration | Shape | Modeled on |
|---|---|---|---|
| `hello` | 1920×1080 · 5s | one scene, one clip, one caption | `examples/01-hello` |
| `promo` | 1280×720 · 8s | hero → features → outro + generated background/cover/music + crossfades | `examples/02-product-promo` |
| `vertical` | 1080×1920 · 8s | native 9:16 teaser, safe-area captions, slide/zoom transitions | `examples/05-vertical-social` |
| `ppt` | 1920×1080 · 6 slides | slide deck with fade/slide/wipe transitions, program document | `examples/07-ppt-video` |
| `data` | 1280×720 · N×1s cards | data-driven program document: scenes + cues generated from a JSON block | `examples/03-data-driven`, `examples/08-code-video` |
| `storyboard` | 1280×720 · 12s | AI storyboard: cover image → first-frame video, music, sfx, captions | `examples/06-ai-storyboard` |

## Choosing a blueprint

- **Product/service/marketing film** → `promo` (landscape) or `vertical`
  (social). Both include procedural generation tasks you can later swap to
  real providers via the generate skill.
- **Talking-head/UGC/short-form post** → `vertical`; author content inside the
  6%/12%/18% safe-area insets and keep captions above the bottom inset.
- **Explainer/lecture/report deck** → `ppt`; one scene per slide, transitions
  on the story lane, cues for narration. Slide scenes are plain HTML/CSS, so
  diagrams are SVG and layouts are flex/grid.
- **Charts/dashboards/leaderboards from data** → `data`; edit the JSON data
  block (or point `<data src>` at `assets/data/rows.json`), not the program.
- **Multi-shot AI film** → `storyboard`; then extend with the generate skill
  (direction, rights, dependency graph) and materialise per shot.

## Blueprint details and customization points

### `promo` (declarative document)

- Scenes `hero` / `features` / `outro` on lane `story`, 0.4s/0.5s overlap
  windows with `crossfade`/`fade` transitions.
- Lane stack bottom-up: `background` (`gen:bg` + vignette/grain), `story`,
  `cover-overlay` (`gen:cover`, `blend="screen"`, opacity animation),
  `music-lane` (`gen:music`, `volume`, `fade-in/out`), `captions`.
- Customize: scene HTML/CSS, generation prompts, cue texts, `<output>` path.
- Re-brand via the `--accent` CSS custom property convention
  (`:root{--accent:#6ee7ff}`) — change one line.

### `vertical` (declarative document)

- Same story structure at 1080×1920; hook scene in the first 2 seconds.
- `caption-style` positions cues inside the platform UI safe area
  (`bottom:22%`).
- Deliver natively (no cropping): export with `--delivery tiktok|reels|shorts`
  via the export skill. For a landscape master re-framed to 9:16, use
  `--delivery tiktok` on a landscape project instead (`fit=cover` center-crops).

### `ppt` (program document)

- `<script type="application/vnd.vhtml.program+javascript">` builds one scene
  per row of the `slides` JSON block: title, bullets, optional kicker.
- Story lane clips get 0.6s overlaps and alternating `fade`/`slide`/`wipe`
  transitions; a cue lane carries narration.
- Customize: the `slides` data block, per-slide accent colors, durations in
  the data (`duration` field per slide), then `vhtml build` to freeze.
- Parameterize: `--param slides=assets/data/slides.json` style external data
  keeps one template for many decks.

### `data` (program document)

- The program loops `rows` (id, title, value, accent, at) → scenes + clips +
  cues; duration derives from the last row.
- Replace the data block with real data or `<data id="rows"
  src="assets/data/rows.json" />`; sort rows by `at` (strictly increasing
  starts; rows must fit the composition duration — extend `duration` if not).
- Add value-bar animation per row (CSS `@keyframes` on a `.bar` element) for
  chart motion.

### `storyboard` (declarative document with generation graph)

- Generation tasks: `cover` (image) → `shot-1`/`shot-2` (video,
  `gen-input role="first-frame"` → `gen:cover`), `music`, `sfx`.
- Clips reference `gen:<task>` on visual/audio lanes; first export
  materialises them (`vhtml export --generate`, cached under
  `.vhtml/cache/generated.json`).
- Extend per shot with direction JSON (`shot.camera`, `image.style`,
  `music.bpm`…), `rights` and `review` via the generate skill; keep prompts in
  the tasks, not scattered in scene code.

## After scaffolding

```bash
node .sdkwork/skills/sdkwork-vhtml-video/scripts/check-project.mjs my-video
pnpm exec vhtml preview my-video --open
```

Then follow `workflows/create-video.md` steps 3–6. To convert an inline
document into external scene files later: `vhtml split <dir> --dry-run` then
`vhtml split <dir>`.
