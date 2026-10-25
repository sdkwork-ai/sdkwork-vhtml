# Standard Audit — VHTML 1.1.1

This audit records concrete gaps found in the current standard/implementation and
the changes made in this round. It is intentionally not a claim of perfection:
a format that claims to render arbitrary HTML needs explicit boundaries and a
controlled upgrade path.

## Fixed in this round

| Area | Gap | Change |
|---|---|---|
| Delivery aspect ratio | Changing output width/height stretched the composition | `OutputConfig.fit` (`stretch`/`contain`/`cover`), parser/serializer/schema/validator and FFmpeg filters |
| Delivery presets | No standard targets for vertical/square/cinema/audio | `DELIVERY_PRESETS`, `outputForDelivery`, `vhtml export --delivery`, capability report |
| Parser output range | `range-start` attribute was read as `range-star` | Parser accepts `range-start` |
| Project modularity | Inline Scenes required manual extraction; SDK source regenerated entries | `splitInlineScenes`, URL/CSS rebasing, `vhtml split`, `--detach` for durable source-project splits |
| Resource import | Import was only under `assets` | `vhtml import` alias, directory/project detection |
| Remote authoring | Studio was loopback-only and unauthenticated | `serve`, host/auth/token env, non-loopback guard, Basic auth, Docker |
| Conformance | No capability list for delivery profiles | `capabilities --json` lists presets; tests assert uniqueness/even sizes |
| AI generation taxonomy | Only image/video/audio/music/speech/text/edit | Added storyboard, avatar, lipsync, dub, sfx, matte, translation; provider kinds/capabilities |
| AI creative control | Free-form params only | Portable `direction` for shot/image/video/speech/music/sfx/edit; schema + round-trip |
| AI generation graph | Task order was declaration order; no cycle detection | Topological ordering, auto dependencies, cycle errors before provider calls |
| AI governance | No review/rights/safety fields | `review`, `rights` (consent/likeness/voice cloning/AI disclosure), `safety`, parser/serializer/schema |
| Storyboard | `storyboard` existed only as an image generation kind | First-class ordered `StoryboardShot` planning layer; Scene/generation/asset links, planned duration, status, tags, direction; free add/set/remove/move/reorder edits; Studio drag/drop editor |
| Commercial audit | Export had no checksum/provenance report | `vhtml.export-report/1` with SHA-256, probe, generation provenance, licenses, consents, AI disclosure; JSON Schema + `--report` |
| Video regression | Examples were only compiled, not decoded end-to-end | `pnpm verify:videos`: exports 1s of every example, checks stream/frame count/unique frame hashes |
| Free file loading | Encoded Scene/asset paths failed validation, nested rebase double-encoded, asset studio URLs double-encoded | Decode-after-strip path rules, single encoding, `%23`/`%3F` filenames, realpath/junction checks, asset URL normalization; unit + real render regression |
| Code authoring in-document | Writing code required an external TS compile step; single-file programs were impossible | Inline authoring programs (`<script type="application/vnd.vhtml.program+javascript">`), `<data>` JSON blocks, deterministic sandbox (`core/program`), builder API shared with the SDK (`core/authoring`), editor freeze semantics, `vhtml build` freeze (`--keep-program`); RFC-0007 |
| Speed ramps / time remap | Constant `speed` could not express ramps | `ClipBase.timeRemap` keyframed source-time curves (After Effects semantics), parser/serializer/schema/validator/evaluator/mixer, `clip.timeremap` edit op with split-aware curves; RFC-0008 |
| Nested timelines / compound clips | No reusable sub-sequences | `timeline:` clip kind with recursive flattening, cycle detection (`REFERENCE_CYCLE`), stage layer/audio/CSS mounting, depth limit 8; RFC-0009 |
| Audio ducking / sidechain | No cross-track level dependency | `audio-effect type="ducking"` (threshold/reduction/attack/release/hold), two-pass mixer with deterministic envelope, validation; RFC-0010 |
| A/V sync addressing & correction | Editing workflows address clips in SMPTE frame timecodes; lip-sync/latency fixes were undeclarable; caption alignment needed manual parsing | Frame timecodes `HH:MM:SS:FF`/`;FF` with frame-rate context + `formatFrameTimecode`; per-clip `audio-offset` through parser/serializer/schema/edits/evaluate/mixer; `parseSubtitleBlocks` (SRT/WebVTT) exposed as `vhtml.parseCaptions`; RFC-0011 |
| Parametric templates & external data | Batch production could not pass per-render parameters; large datasets had to be inlined | Repeatable CLI `--param k=v` merged into `vhtml.ctx.params` (external wins); `<data src>` external data blocks under the scene path sandbox with reference-form round-trip; RFC-0012 |
| Vendor generation coverage | Video/audio/music/image generation tags had no vendor-by-vendor capability audit; cross-vendor concepts (resolution tiers, motion strength, camera moves, native audio, lyrics, speech rate) had no portable fields | Audited Runway/Luma/Kling/Pika/Hailuo/Veo/Sora/Wan/Vidu/PixVerse/Seedance/ElevenLabs API parameter sets; added `constraints.resolution/steps/guidance`, `direction.video.motionStrength/cameraMove/withAudio`, `direction.music.lyrics/instrumental`, `direction.speech.rate`; normative `<vendor>.<param>` namespacing; machine-readable `VENDOR_CATALOG` (26 vendors across video/image/music/speech) + `vhtml providers --known` + `vendorParams`/`buildVendorPayload` adapter helpers; resolution now accepts tiers (720p/1080p/4k) alongside WxH; direction vocabulary soft validation; generation.md §12 annex |
| AI-era editing loop | No ASR task kind (auto-captions / text-based editing entry point); NLE primitives missing for detach-audio, replace-source, duplicate and nesting a selection | `transcribe` generation kind (cues output, speaker diarization mapping) with Whisper/Deepgram/Azure STT/ElevenLabs Scribe catalog rows; `clip.duplicate` / `clip.detachAudio` / `clip.replace` / `timeline.nest` edit ops documented in editing.md §9 with agent workflows |
| Storyboard→timeline application (closed) | Shots were planning-only; no structured materialisation onto the timeline | `storyboard.apply` op: shot refs (scene/generation/asset) → clips in order with gap, collision warnings and `fromShot` metadata; cycle/compat checks apply; editing.md §9 |
| Text-based editing primitive | Removing a transcript-marked range required composing split+rippleDelete+move per lane | `timeline.rippleCut` (multi-lane, gap-closing, remap-correct) and `timeline.unnest` inverse of nest; editing.md §9 |
| NLE editing modes & linking | No insert/overwrite placement (three-point editing) and no clip linking — table stakes for Premiere/Resolve/FCP alignment | `timeline.insert` (span-split + push, gap-free adjacency verified) and `timeline.overwrite` (span-keep-ends + remove-middle) ops; `clip.link`/`clip.unlink` with `clip.move` linked propagation; Studio gestures (Duplicate/Detach Audio buttons, drag-drop place mode add|insert|overwrite); wysiwyg.md §1 contract updated |
| Clipboard operations | No copy/cut/paste — every NLE's most-used loop (Ripple/Copy/Paste) was missing at the model level | `timeline.copy`/`timeline.cut`/`timeline.paste` with a session clipboard (lane-type aware multi-track paste, offset preservation, id-rebasing for animations/effects, linkId stripped); overwrite boundary cases (exact-fit, head-at-range, end-at-range) fixed; Studio Ctrl+C/X/V with paste-at-playhead following the place-mode selector; editing.md §9 |
| Audio automation & group drag in WYSIWYG | Studio keyframe palette covered only visual properties (volume/pan automation was model-only); no batch-selection move op for agent/editor group drags | Keyframe palette extended with `volume`/`pan` for audible clips (mixer evaluates them per-sample — verified gain ramp); `timeline.moveBatch` op (anchor-on-start group move with offset preservation, zero-delta/missing/cross-timeline diagnostics); wysiwyg.md §1 + editing.md §9 updated |
| Track solo & speed-ramp UI | Audio lanes had mute but no solo (an NLE staple); the speed section showed remap state but offered no way to apply a ramp | `Track.solo` through model/parser/serialize/edits/schema with mixer + preview gating (`audioSoloActive`; soloed lanes keep sound, others silent); Studio S button on audio lanes; Speed section ramp presets (Ramp in / Ramp out / Smooth S) emitting `clip.timeremap`; wysiwyg.md §1 |
| Chapter export & WYSIWYG generation loop | Timeline chapter markers were decorative (no MP4 chapter atoms); generating AI assets required leaving the Studio for the CLI | `export --chapters` / `ExportOptions.chapters` muxes `type="chapter"` markers as ffmetadata chapter atoms (ffprobe-verified titles and times; explicit skip issue when no chapter markers); Studio `POST /api/generate` + toolbar button materialises tasks in-session with per-task failure reporting; generation.md §7.1 |
| Product shell: launcher, autosave, shortcuts | `vhtml studio` required an existing project (no first-run path); a crash lost nothing on disk but offered no restore point; no shortcut discovery | Project launcher (`startStudioLauncher`: scan/scaffold/open with per-editor supervisor) served by bare `vhtml studio`; autosave checkpoints (`<entry>.autosave`, revision-triggered, `VHTML_AUTOSAVE_MS`/`autosaveMs`) with restore/discard APIs + recovery banner; keyboard shortcut overlay (`?`); embedding.md updated |
| Marker navigation & batch delivery | No prev/next marker jump (every NLE's marker loop); multi-platform delivery required repeated export invocations | Studio marker navigation (Shift+, / Shift+.) over timeline markers; `export --batch <presets>` renders all delivery profiles in one pass with shared generation, per-preset reports and ffprobe-verified dimensions; multi-platform safe-area overlays in guides; wysiwyg.md §1 + deploy.md |
| Proxy media for heavy footage | 4K timeline scrubbing decodes full-resolution sources in the browser (the audit's "incremental render and proxies" gap, preview half) | `GET /api/media/proxy` renders 360p H.264 fast-start copies under the media cache (content-addressed); `POST /api/proxy-mode` + stage `proxySources` rewrites local video sources for preview (export stays full-res); Studio Proxy toggle persisted per host; embedding.md §3.1 API surface catalogue |
| Desktop shell & in-app batch delivery | No first-class desktop app form; in-Studio export was single-preset only | `desktop/` Electron scaffold (`startStudioServer` + embedUrl BrowserWindow, packaging notes); export modal "render all delivery presets" batch loop with per-preset progress; server export files now named `<project>-<delivery>.<ext>`; embedding.md + deploy.md + standard-audit updated |
| i18n & responsive layout | Studio UI was English-only with a fixed desktop layout — blockers for non-English markets and laptop/small-window use | `STUDIO_LOCALES` dictionary (en/zh-CN, keyed by English string, graceful fallback) exported from `@sdkwork/vhtml-studio/i18n`; language toggle button persisted via `vhtml-lang`, browser-language detection; all chrome (header/tabs/inspector/context menus/toasts/export modal/shortcuts/recover banner) wrapped via `t()` + static `data-i18n` boot pass; responsive breakpoints 1100px/880px with inspector drawer, lane-label and toolbar adaptation; launcher page localized; parity + surface tests |
| Agent workflow last mile | edit ops required a temp file (no stdin); transcribe cue data had no command-level path into caption clips; beat-grid cutting needed chained splits with manual id tracking | `vhtml edit --ops -` reads operations from stdin; `vhtml captions --from-gen <task> --lane <id>` materialises cue JSON/SRT/VTT into caption clips via `cuesToClips`; `clip.splitMulti` splits at N points with caller-chosen segment ids; editing.md §9.2 |
| Industry alignment | No explicit mapping to OTIO/EBU R128/C2PA/social platforms | `industry-alignment.md` + `commercial.md` define mappings and honest gaps |
| AI provider protocol | No machine-readable request/response schema | Provider request/response JSON Schemas + tests |
| Visual/audio inconsistency | Channels >2 and Display-P3 were silently changed by export | Explicit export issues instead of silent behavior |

## Remaining high-priority gaps

| Gap | Why it matters | Proposed direction |
|---|---|---|
| HDR / WCG / alpha delivery | `display-p3` is declared but encoded as BT.709; no alpha WebM/ProRes | Explicit color pipeline, alpha-capable codecs, capability flags |
| Automatic reframe / safe-area layout | Profiles expose safe areas but do not move content | Responsive scene variants or declarative anchors; never mutate authored HTML implicitly |
| Effect/transition plugin registry | Types are hard-coded; third-party effects have no contract | Versioned effect schema, parameter definitions, capability negotiation |
| Audio ducking / sidechain / >2ch | Podcast/interview mixes need it; encoder downmixes silently | Sidechain graph, channel layout, explicit downmix policy |
| Collaborative locking and history | Remote creation is single-writer | Project lock, conflict detection, revision history/CRDT boundary |
| Incremental render and proxies | Full re-render is expensive for long videos | Frame cache keyed by model hash, proxy media, render manifest |
| PNG-sequence delivery fit | PNG path writes composition size | Renderer-level fit or post-scale; currently emits an explicit issue |
| Golden conformance | Only structural/temporal tests are broad | Golden frames/audio for every transition/effect under pinned Chrome |
| AI content credentials | Rights/disclosure are declarations, not cryptographic proof | C2PA/content credentials, watermark adapters, publish-side checks |
| AI cost/quota | No portable budget fields | Optional cost/quota metadata, provider usage reports, preflight estimates |
| AI character memory | Consistency relies on reference assets/prompts | Versioned character/style bibles and embedding references |
| AI evaluation | No quality benchmark per model/prompt | Prompt suites, shot-level scoring, human review integration |
| Storyboard→timeline application | Storyboard is planning; no automatic shot-to-clip materialisation | Explicit “apply shot(s) to timeline” operation with collision policies |
| Storyboard versioning | Shot history is project-level undo only | Per-shot revisions, comments and approval history |

## What "perfect" means here

- The Core Model remains deterministic and small.
- Every capability is declared; degradation is explicit.
- Additive changes do not break old documents.
- Profiles can evolve independently of the core.
- A second implementation can pass the same conformance suite.

The versioning policy is in [versioning.md](../specification/versioning.md).
Delivery profiles are in [delivery-profiles.md](../specification/delivery-profiles.md).
