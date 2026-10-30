# Changelog

## 1.1.4

### Studio: professional-editing polish, round 4 (CapCut alignment)

- **Effects & transitions library**: a new Effects tab renders every runtime
  visual effect, audio effect and transition as draggable chips (33 chips
  from the runtime catalogs — new built-in types appear automatically, pinned
  by the existing catalog guard tests). Drag an effect chip onto a clip to
  apply it, an audio chip onto a video/audio clip, or a transition chip onto
  the overlap window between two clips (duration 0.4s clamped to the
  overlap); clicking a chip applies it to the current selection. Bad drops
  get specific toasts ("drop onto the overlap between two clips").
- **Drag auto-scroll**: moving/trimming/rolling/slipping a clip near the
  timeline's left or right edge pans the view (48px edge zone, 30fps interval)
  so long timelines stay editable without zooming out.
- **Fixed: adding a transition via the edit API broke the save round-trip.**
  `transition.add` accepted operations without `params`, but the stored
  transition kept `params: undefined` and the serializer threw "Cannot
  convert undefined or null to object" — the transition landed in the model
  and on screen while every save failed with a 500. The op input type now
  treats renderer-defaulted fields (params/easing/direction/color) as
  optional, `transitionAdd` normalizes them (`params` defaults to `{}`), and
  `paramAttrs` is defensive. Unit test: add without params → serialize →
  re-parse.

### Studio: professional-editing polish, round 3 (CapCut alignment)

- **Fixed: `clip.split` id and fade semantics (core).** The right piece kept
  the original effect/audio-effect ids (duplicate-id validation rejected any
  later batch that split an effected clip) and animation copies kept pointing
  at the original clip (`animation targets clip X but is nested in clip Y`).
  Split now derives `-of-<right-id>` effect ids (matching `clip.duplicate`),
  re-targets copied animation `clipId`s, and scales inherited
  `fadeIn`/`fadeOut` proportionally when their sum exceeds a piece's duration
  (spec editing.md §5 updated). Two unit tests cover both.
- **Roll edit gesture**: dragging the shared edge between two adjacent clips
  rolls the cut point — both clips trim together and no gap opens
  (`clip.roll`), with a live cut-point readout, magnetic snapping (Shift
  bypasses) and an atomic rejection toast when a source-window invariant
  blocks the move.
- **Lift In→Out**: the ruler menu gains the non-ripple complement to ripple
  cut — remove the marked range on every unlocked lane while keeping the
  gaps, composed from split + remove ops in one atomic edit. Clips that
  anchor a transition are left untouched (splitting a transition endpoint can
  leave `from.start === to.start`, which the strict transition validation
  rejects); the lift keeps those gaps.
- **Color tags**: single clips take red / orange / green / blue / purple tags
  stored in `clip.metadata.clipColor` and rendered as a strip on the timeline
  block. `clip.set` gains whole-replace `metadata` support in Core (the
  caller sends the merged record, so link pairing survives; an empty record
  clears), which also gives agents a general metadata channel through the
  edit API. Unit test covers set-then-roundtrip with link preservation.
- **Title templates**: the Captions tab offers main title / lower third /
  corner badge / highlight presets — one click adds a caption clip with
  per-cue CSS (font, color, background, position) at the playhead, creating
  the caption lane when missing. `/api/caption` accepts `style` and the
  Studio model projection exposes per-cue `style`.
- **Easing presets**: the keyframe editor's easing picker adds cubic-bezier
  presets (sharp in-out, soft decay, overshoot, anticipate) and steps —
  custom curves already work end-to-end because `EasingName` accepts any
  string and the core solver parses `cubic-bezier(...)`.

### Studio: professional-editing polish, round 2 (CapCut alignment)

- **Fixed: clip metadata never persisted.** `clip.metadata` — the carrier for
  link pairs (`linkId`), detach-audio pairing (`detachedFrom` /
  `audioDetachedTo`) and storyboard provenance (`fromShot`) — was dropped by
  the XML serializer, so linked AV pairs silently separated on every
  save/reload. Clips/cues now serialize `<metadata><meta name="…" value="…">`
  children (name/value form keeps camelCase keys intact; the HTML parser
  lowercases attribute names), the parser reads both forms, and the Studio
  model projection exposes metadata to the client. Spec §3.4 documents the
  element. Round-trip unit test included.
- **Fixed: `timeline.rippleCut` boundary and overlap semantics.** Clips whose
  edge sits exactly on a cut boundary tripped `clip.split`'s
  strictly-interior requirement and rejected the whole edit; a stale snapshot
  loop re-cut clips that an earlier ripple had shifted into the range;
  overlapping clips (caption cues) accumulated double shifts. RippleCut now
  works in two phases — all splits decided from frozen original extents, then
  one uniform (end − start) shift per lane with overlapping middles removed
  once. Three new unit tests cover head/tail-aligned edges and overlapping
  cues.
- **Slip gesture (Ctrl+drag)**: dragging a media clip body with Ctrl held
  slips its source window (`clip.slip`) with a live source-in readout;
  project timing never moves. Plain Ctrl+click still toggles selection
  (deferred to pointerup when nothing moved).
- **Link / Unlink / Replace source / Ripple cut In→Out in the UI**: clip
  context menu gains Link clips (multi-selection), Unlink (linked clip) and
  Replace source from Assets…, which arms the Assets tab with a per-asset ↔
  button executing `clip.replace` (timing kept, type compatibility
  pre-screened to match the engine). The ruler menu gains Ripple cut
  In→Out (all unlocked lanes).
- **SRT / WebVTT caption import**: new `/api/captions/import` endpoint runs
  the normative `cuesToClips` converter (cue JSON / SRT / WebVTT) and adds
  every cue to the caption lane at its original timestamps, creating the lane
  when missing and keeping ids unique across repeated imports; the Captions
  panel gets a paste-and-import flow. Integration test included.
- **Lane height resize**: drag a lane's bottom edge (30–200 px, persisted per
  lane in localStorage); clip blocks and waveforms grow with the lane.

### Studio: professional-editing polish (CapCut alignment)

- **Fixed: blank Studio UI.** Five unbalanced-paren syntax errors inside the
  embedded `STUDIO_HTML` script (invisible to `tsc` because the UI ships as a
  template literal) aborted the whole boot script — nothing loaded. New unit
  test compiles every inline script with `node:vm` so the class of failure is
  caught on every run; catalog tests pin the Studio effect palette to the
  runtime's `VISUAL_EFFECT_TYPES` / `AUDIO_EFFECT_TYPES`.
- **Fixed: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y were unreachable** — the global
  Ctrl-key early return in `setupKeys` ran before the undo/redo handlers.
- **Effect catalog completed to the runtime surface**: visual effects gain
  `chroma-key` (green screen: color/tolerance/spill), `color-overlay` and
  `css`; the audio palette gains **gain, high-pass, low-pass, compressor,
  echo/reverb, pitch shift** (defaults matching the export mixer) alongside
  ducking. Friendly labels with zh-CN translations; effect ids gain a call
  counter so batch adds never collide.
- **Batch effect application** (CapCut-style): adding an effect with a
  multi-selection lands on every selected unlocked visual clip.
- **Video filmstrip thumbnails**: clips render a poster-tile strip across
  their source window (server poster cache makes re-renders cheap) instead of
  a single start frame.
- **Ctrl+wheel timeline zoom** now exists (the docs already promised it),
  anchored at the pointer.

## 1.1.3

### Deterministic frame cache (RFC-0016)

- Content-addressed PNG frame cache at `.vhtml/cache/frames/<key>/` keyed by
  canonical project serialization + sampling range/fps + asset file
  fingerprints (size+mtime) + renderer fingerprint.
- `exportProject({ frameCacheDir })` reads cached frames and writes misses;
  fully-cached runs skip Chromium entirely. `ExportResult.frameCache` reports
  `{ dir, key, hits, misses }`.
- `vhtml export --frame-cache` / `--frame-cache-refresh`; `--batch` enables
  the cache by default (`--no-frame-cache` to opt out) so every preset after
  the first is a pure cache hit — one Chromium sampling pass serves all
  delivery presets.
- mtime-bounded prune keeps the newest 8 keys (`VHTML_FRAME_CACHE_KEEP`),
  enumerating exact key directories inside the cache root (no wildcard
  deletion).

### Explicit audio downmix policy (RFC-0017)

- `OutputConfig.downmix: 'mono' | 'stereo'` (`<output downmix="mono">`) with
  parser/serializer/schema/validator support; SDK `OutputSpec.downmix` and
  `ExportOptions.downmix`; CLI `vhtml export --downmix mono|stereo`.
- `mono` folds L/R to one channel at the mixer (pan applied before the fold);
  explicit policies export without a downmix issue, implicit >2ch folds keep
  a policy-pointing issue. Channel layouts beyond stereo remain an open gap.

### Storyboard review & approval history (RFC-0018)

- `StoryboardShot.review` + append-only `reviewHistory`
  (`<shot><review status reviewer reviewed-at>` children; the last element is
  the current record).
- `storyboard.review` edit op archives the previous review and keeps shot
  status honest (approved → `approved`; changes-requested/rejected →
  `boarded`). Review-status set hoisted to Core `GENERATION_REVIEW_STATUSES`
  shared with generation tasks.
- storyboard.md §9; schema `generationReview` def + shot `review`/
  `reviewHistory`.

### Capability report

- New features: `frame-cache`, `audio-downmix-policy`, `storyboard-review`.


## 1.1.2

### Generation usage & quota (RFC-0013)

- `<generate><usage>` record: `cost`/`currency`, `tokens`, `credits`,
  `compute-seconds`, `output-bytes`, `recorded-at` (model
  `GenerationTask.usage`); vendor units round-trip as extra attributes.
- `materializeGenerations` records observed compute time + output bytes per
  provider call; providers may return a `GenerationRun` envelope with
  provider-reported `usage` and `providerJobId` (bare `GeneratedFile[]` stays
  valid).
- Spending ceilings: `GenerateOptions.quota` / CLI `--max-cost`,
  `--max-credits`, `--max-compute-seconds`, `--currency`; exceeding a cap
  fails with the new stable code `GENERATION_QUOTA_EXCEEDED` before further
  provider calls.
- Export report (`vhtml.export-report/1`): per-generation `usage` plus
  `provenance.usageTotals`.
- `GenerateOptions.providers` injects/overrides the provider registry
  (tests, embedded hosts).
- generation.md §13; schemas: model `usage`, export-report `usage` +
  `usageTotals`; `--json` generate output includes `usage`.

### Character & style bibles (RFC-0014)

- `<characters>` project library of versioned `BibleProfile` entries:
  `<character>` / `<style-guide>` with `<description>`, `<negative>` and
  `<reference ref role/>` anchors.
- `character:`/`style:` reference namespaces resolve against the library;
  a missing bible fails generation before any provider call.
- Bible profiles (including reference file hashes) participate in the
  generation cache key — bumping `version` invalidates cached outputs.
- `buildVendorPayload` carries a resolved `bibles` section; prompts are never
  silently rewritten.
- Code-first: SDK `character()` / `styleGuide()` / `bible()` builders +
  `defineVideo({ characters, styleGuides })`; authoring program
  `vhtml.addCharacter` / `vhtml.addStyleGuide`.
- generation.md §14; schema `bibleProfile` + `project.bibles`.

### Effect/transition plugin registry (RFC-0015)

- `<extension kind="effect|audio-effect|transition" base="<builtin>">`
  declares a custom type that renders as its built-in base; declared default
  `<params>` merge under clip params.
- Validator: declared types no longer warn; declarations must desugar onto a
  same-family built-in (`EXTENSION_INVALID`).
- Runtime/mixer desugar declared effect and transition types deterministically;
  built-in type sets are hoisted to Core Model constants
  (`VISUAL_EFFECT_TYPES` / `AUDIO_EFFECT_TYPES` / `TRANSITION_TYPES`).
- Code-first: SDK `extension()` builder + `defineVideo({ extensions })`;
  authoring program `vhtml.addExtension`.

### Delivery & docs

- PNG-sequence export now honors delivery fit/dimensions (same Lanczos
  cover/contain/stretch filter as video encoders) instead of writing
  composition-size frames with an explicit issue.
- Capability report features: `generation-usage`, `character-bibles`,
  `effect-registry`.
- New RFCs 0013/0014/0015; specification README + main-spec revision history;
  standard-audit ledger updated (three gaps closed, one restated).


## 1.1.1

### Standard profiles

- Project directory layout + optional `vhtml.json` manifest (entry/source,
  `assets/`, `scenes/`, `generated/`, `renders/`, `.vhtml/cache/`).
- External `<scene src>` HTML fragments with relative URL rebasing, CSS scoping
  and script extraction; `src` preserved on serialization.
- Project modularization: `vhtml split` moves inline Scenes into
  `scenes/*.html`, rebases relative HTML/CSS URLs, preserves scripts and guards
  generated source entries. `vhtml split --detach` makes the split `.vhtml`
  canonical for SDK-generated projects. `vhtml import` aliases resource import.
- Deployment profile: `vhtml serve` with `--host`, `--port`, Basic auth
  (`VHTML_AUTH`/`VHTML_TOKEN`), public health probe, loopback-by-default and a
  non-loopback auth guard. Docker image + compose include Chromium and FFmpeg.
- Delivery profiles: `DELIVERY_PRESETS` + `outputForDelivery` and
  `vhtml export --delivery` for web/YouTube 4K/vertical/TikTok/Reels/Shorts/
  square/portrait/cinema/GIF/audio. `OutputConfig.fit` adds cover/contain/stretch
  so aspect changes never silently stretch.
- Asset inventory across HTML/CSS/`@import`/scripts/generation outputs;
  missing/external/outside-root/unused classification.
- Portable `.vhtmlpkg` ZIP with `vhtml.package.json` and a generated-asset
  registry restored on unpack.
- WYSIWYG profile: model-first direct manipulation, snapping, asset drop,
  captions, transitions, atomic validated saves.
- AI generation profile: image, storyboard, video, avatar, lipsync, speech, dub,
  music, sfx, audio, matte, edit, translation and text; portable `direction`
  (shot/image/video/speech/music/sfx/edit), input roles, generation dependency
  graph, review/rights/safety and provider request/response schemas.
- Storyboard profile: ordered `StoryboardShot` planning objects with Scene,
  generation and asset links, planned duration, status, tags, description,
  prompt, notes and direction; `storyboard.add/set/remove/move/reorder` edits
  with rollback and validation; Storyboard Studio tab with drag/drop, duplicate,
  delete and inline field editing.
- Commercial delivery profile: C0–C3 readiness, rights/consent/AI disclosure,
  `vhtml.export-report/1` with final SHA-256 and generation provenance,
  commercial QC/security/collaboration requirements, and an industry-alignment
  matrix (HTML/FFmpeg/WebVTT/EBU R128/OTIO/C2PA/social delivery).
- Element-level editing: hover/click any authored HTML node (`E` / `⌖ Element`),
  edit ID/class, attributes, leaf text or inner HTML and inline CSS in the
  Element inspector. Inline Scenes use undoable `scene.set`; external Scene
  files are patched with parse5 and reloaded atomically.
- New RFC-0005/0006 and schemas for project manifests and packages.

### Implementation

- pnpm workspace with 12 independently publishable packages under `packages/`:
  core, schema, ffmpeg, runtime, media, project, generation, sdk, editor,
  studio, cli and the `@sdkwork/vhtml` meta package.
- Every package compiles to ESM + `.d.ts` with subpath exports, source maps,
  `sideEffects: false`, README/LICENSE and npm publish metadata.
- Examples are private workspace packages with `build`/`validate`/`preview`/
  `export` scripts. `07-ppt-video` exports a 13.8s, 1920×1080, 414-frame slide
  deck with fade/slide/wipe transitions and an audit report.
- `packages/project/` split/inline-Scene extraction, manifest discovery, asset
  inventory/import/relink and
  pack/unpack.
- CLI: directory/manifest inputs everywhere; `assets list|verify|import|relink`;
  `pack`/`unpack`; `init` scaffolds the full layout and external Scene sample.
- Studio: WYSIWYG move/scale/rotate, magnetic snapping, cross-lane drag,
  asset upload/import/relink/drag-drop, image/SVG timeline thumbnails, quick
  effect presets, captions, transitions, Reload, export preflight.
- Studio pro-NLE alignment (剪映/CapCut round): multi-select (Shift/Ctrl+click,
  marquee, Ctrl+A) with group move/delete; normative `timeline.copy/cut/paste`
  clipboard ops with linked audio/video pairs and `timeline.insert/overwrite`
  place modes; right-click context menus for clips/lanes/ruler/transitions;
  markers (`marker.add/remove`) and In/Out points feeding the export range;
  speed presets 0.25×–4×, freeze frame, detach audio; fade in/out drag handles;
  audio waveforms (`/api/media/peaks`, FFmpeg peaks cached under
  `.vhtml/cache/studio-media/`) and video poster thumbnails
  (`/api/media/poster`); per-property keyframe editor (opacity/position/scale/
  rotation with time/value/easing); 16-type effect catalog with per-parameter
  editing; transition dialog (crossfade/fade/dip/wipe/slide/zoom/blur with
  direction/color); lane mute/solo/hide/lock/rename/add/remove
  (`track.set` model semantics); composition guides, fullscreen preview,
  Ctrl+wheel zoom, SMPTE/`mm:ss` timecode entry; export dialog with delivery
  presets (`/api/presets`), burn-in captions, WebVTT sidecar, EBU R128
  loudness normalization and audit reports.
- Studio polish round 2: canvas/project settings dialog (`composition.set` with
  ratio presets, fps, background), layer ordering (forward/backward/front/back),
  lane drag-reorder, caption-style editor (`track.captionStyle`), keyboard help
  dialog (`?`), saved-revision badge, live transform/time tooltips during drags,
  rotation angle snapping, align-selection-to-playhead and double-click stage
  text to edit (`vhtml:command` postMessage bridge completed for embed hosts).
- Studio polish round 3 + renderer: the `crop` model field now renders
  (deterministic inset clip-path region reveal; a mask effect wins the
  clip-path channel with an explicit conflict issue), with crop percentage
  fields in the Properties panel; draggable volume line on audio clips
  (0-200% via `clip.set volume`); compound-clip creation/unnest in the clip
  context menu (`timeline.nest`/`timeline.unnest`); "Apply to timeline" button
  in the Storyboard tab (`storyboard.apply`, append + 0.25s gap); marker flags
  drag horizontally to retime.
- Studio polish round 4: timeline auto-scroll during playback, up/down
  chronological clip selection, "split all lanes at playhead", draggable
  keyframe diamonds (retiming via `clip.set animations`), lane volume/pan in
  the lane context menu, an audio-effects panel for sidechain ducking, and a
  model-integrity fix — `clip.set animations` now normalizes degenerate
  projection round-trips (missing iterations/direction/compose, non-finite
  start/duration/keyframe times) at the edit boundary, and the Studio
  projection carries every animation field losslessly.
- Studio polish round 5: interactive speed-curve (time remap) editor with
  draggable points, interpolated click-to-add and per-segment speed labels;
  a single-frame snapshot endpoint (`/api/snapshot` job to `renders/*.png`)
  with a transport button; In/Out looped playback review; Alt+drag duplicate;
  Z zoom-to-selection.
- Studio polish round 6: CapCut-style **volume envelope automation** on audio
  clips (double-click the volume line to drop keyframe points, drag green dots
  to automate level/timing, double-click to remove; piecewise-linear envelope
  rendered over the waveform and evaluated per-sample by the mixer);
  `animation.add` now sanitizes through the same edit-boundary normalization
  as `clip.set animations`; Alt+arrow frame nudging; ruler double-click drops
  a marker; caption clips expose the optional `speaker` field.
- Generation cache canonical path `.vhtml/cache/generated.json` with legacy
  `.vhtml-cache/` read compatibility; configurable generated/cache paths.
- Generation providers expose capability catalogs (`vhtml providers`), and
  materialisation topologically orders `gen:` dependencies with cycle detection
  before any provider call.
- Provider request/response JSON Schemas, plus parser/serializer support for
  generation direction, review, rights and safety.
- `vhtml export --report` emits `vhtml.export-report/1` with SHA-256, probe,
  provenance, licenses, consents and AI-disclosure flags; backed by
  `export-report.schema.json`.
- Free file loading hardened for percent-encoded paths, spaces/Unicode, `%23`/
  `%3F` filenames, query/hash suffixes, single-encoded rebased URLs, symlink
  root checks and encoded asset URLs.
- `pnpm verify:videos` exports one second of every example and verifies video
  stream, frame count and frame-hash motion as a delivery QC gate.

### Verification

- 70 unit/integration tests, package export/import checks, external consumer
  type-check, npm tarball pack/install verification, Studio API/UI interaction,
  seven-example build (including native 9:16, image→video AI chain and PPT
  presentation video), TikTok delivery export, split→external Scene→MP4
  end-to-end (including `--detach` source projects), storyboard
  parse/serialize/edit/validation and Studio Storyboard API/UI interaction,
  pack→unpack→render.

## 1.1.0

### Standard

- HTML-safe core element names: `lane`, `cue`, `gen-input`, `gen-output`.
- Self-closing recovery for project semantics; canonical explicit end tags.
- Global unique IDs and namespaced references.
- Exact rational time, frame count and half-open interval rules.
- Source mapping for speed, reverse, freeze and scene loop.
- Explicit editing operations (trim, split, ripple delete, move, slip, slide,
  roll, speed, freeze, transitions, effects, animations, markers).
- Transitions defined as clip overlap windows.
- Generation tasks with `gen:<id>` assets, cache, provenance and providers.
- Deterministic frame protocol, capability declarations, stable error codes.
- JSON Schema (draft 2020-12), conformance fixtures, RFCs.

### Reference implementation

- Parser/validator/serializer for the full 1.1 syntax.
- Optional project directory + `vhtml.json` manifest with standard asset/scene/
  generated/render/cache paths.
- External `<scene src>` fragments with relative URL rebasing and CSS scoping.
- Asset inventory (`assets list/verify`), import/relink, hash dedupe, metadata
  probing, portable `.vhtmlpkg` pack/unpack.
- Code-first TypeScript SDK.
- Chromium stage runtime with virtual clock, CSS/WAAPI seeking, media seeking,
  network policy and `vhtml.onSeek`.
- Shared timeline evaluator for visuals, audio, transitions, captions, effects.
- Sample-accurate PCM audio mixer.
- MP4/WebM/GIF/PNG-sequence/WAV/MP3 export with captions and reports.
- Procedural, manifest and generic HTTP generation providers.
- Local Studio with timeline editing, WYSIWYG stage transforms, magnetic
  snapping, asset upload/import/relink/drag-drop, thumbnails, quick effects,
  captions, transitions, undo/redo, save, reload and export.
- CLI: init, build, validate, inspect, render, export, preview, generate, edit,
  audio, captions, assets, pack, unpack, capabilities, doctor.
- Examples and integration tests for deterministic rendering and export.

### Incompatible with the 1.0 draft

- `<track>` → `<lane>`; `<caption>` → `<cue>`.
- Generate inputs/outputs use `<gen-input>` / `<gen-output>`.
- Transitions require overlap; no implicit source handles.
- Generated assets use `gen:` IDs and cache registration.
