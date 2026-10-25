# VHTML Architecture

## Layers

```text
.vhtml / SDK code
      │
      ▼
Parser (parse5) ──► Core Model / IR ──► Validator
      │                    │
      │                    ├──► Editor operations / Studio
      │                    ├──► Generation materialisation
      │                    ├──► Audio mixer (PCM)
      │                    └──► Timeline evaluator
      │                                │
      ▼                                ▼
Serializer                     Stage builder ──► Chromium
                                                   │
                                                   ▼
                                             PNG frames
                                                   │
Audio WAV ────────────────────────────────► FFmpeg mux/encode
                                                   │
                                                   ▼
                                      MP4 / WebM / GIF / PNG / WAV
```

## Core packages

| Module | Responsibility |
|---|---|
| `packages/core/src/time.ts` | rational time, rates, frame/sample mapping, timecode |
| `packages/core/src/model.ts` | typed Project IR, defaults, references |
| `packages/core/src/parser.ts` | HTML5 parse, context recognition, HTML subtree extraction |
| `packages/core/src/validate.ts` | semantic validation, security/capability checks |
| `packages/core/src/serialize.ts` | canonical `.vhtml` output |
| `packages/core/src/animation.ts` | easing, interpolation, keyframe sampling |
| `packages/core/src/edits.ts` | non-destructive timeline operations, undo session |
| `packages/ffmpeg/src/index.ts` | FFmpeg/ffprobe process helpers |
| `packages/runtime/src/evaluate.ts` | frame state (visual/audio/captions/transitions) |
| `packages/runtime/src/stage.ts` | HTML stage, scene CSS scoping, media elements |
| `packages/runtime/src/browser/` | virtual clock, DOM application, seek protocol |
| `packages/runtime/src/renderer.ts` | project server + Chromium + screenshots |
| `packages/media/src/audio.ts` | FFmpeg decode + PCM mixing |
| `packages/media/src/export.ts` | streaming encode/mux/report |
| `packages/generation/src/` | providers, cache, provenance |
| `packages/project/src/` | `vhtml.json` manifest, asset inventory/import, `.vhtmlpkg` |
| `packages/sdk/src/` | code-first authoring |
| `packages/studio/src/` | preview/WYSIWYG/edit/save/export UI and API |
| `packages/cli/src/` | command line interface |
| `packages/schema/schemas/` | JSON Schemas for model/manifest/package |

The modules are published as independent `@sdkwork/vhtml-*` packages. The
dependency direction is enforced by the workspace graph: `core` → SDK/editor;
`core` + `runtime` → media; `core` + `ffmpeg` → project; `core` + `project` +
`ffmpeg` → generation; `studio` depends on runtime/media/project/generation;
`cli` and the `@sdkwork/vhtml` meta package sit at the top. `project` never pulls
Chromium, and `schema` has no dependencies.

## Key decisions

**The model is not the DOM.** Parsing builds a typed Project; rendering builds a
separate stage DOM. This allows editors, validators, generators and future
renderers to work without a browser.

**Shared evaluator.** The Node audio/caption planner and the browser stage runtime
both use `packages/runtime/src/evaluate.ts`, so visual and audio timing cannot drift.

**Rational everywhere.** No accumulated floats. Seconds are only used at the
browser boundary (CSS/HTML APIs require numbers), from a single exact conversion.

**Generation is a dependency phase.** Tasks materialise into files and `Asset`
records before rendering. The stage and mixer only see assets, never provider
calls.

**Non-destructive editing.** Clip changes adjust source windows; assets are
immutable. Transitions live on lanes and are reconciled after every edit.

**Project root is the file boundary.** A project may be a directory with a
manifest. All local URLs resolve from the project root; external Scenes are
rebased during parsing and their `src` is preserved on serialization. The asset
inventory is a projection of the model plus HTML/CSS references, not a second
source of truth.

**WYSIWYG writes the model.** Studio's stage handles are a direct-manipulation UI
over `clip.transform`. Pointer moves may mutate the live layer for feedback, but
pointer-up commits one `clip.set`, validates and saves. The preview DOM is never
the persisted source.

## Determinism boundary

The deterministic profile controls:

- project time and frame index;
- timers, rAF, Date and randomness;
- CSS/WAAPI animation currentTime;
- video seek and frame delivery;
- resource/network policy;
- frame readiness.

It does not control: GPU driver/rasterizer, font availability, arbitrary network
responses, user input, or external clocks. Those are documented limits, not
silent best-effort.

## Failure policy

- Parser collects diagnostics and continues where safe.
- Validation errors block render/export; warnings do not.
- Renderer samples return diagnostics per frame.
- Export aborts on encoder/renderer errors and cleans temp files.
- Studio rejects invalid edits and restores the previous project.
