# Changelog

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
