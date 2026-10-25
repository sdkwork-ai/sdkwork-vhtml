# VHTML Workspace & Package Plan

The repository is a **pnpm workspace**. Every public capability is an
independently installable npm package, while the root workspace provides the
specification, examples, conformance fixtures, tests and release tooling.

## Package matrix

| Package | Responsibility | Key exports | Runtime deps |
|---|---|---|---|
| `@sdkwork/vhtml-core` | exact time, Core Model, storyboard, HTML parser, validator, serializer, animation, delivery presets, edit operations | `parseVhtml`, `validateDocument`, `serializeDocument`, `DELIVERY_PRESETS`, `outputForDelivery`, `applyEditOperations`, `EditSession`, `StoryboardShot`, all model types | `parse5` |
| `@sdkwork/vhtml-schema` | draft 2020-12 schemas for model, project manifest, package metadata, provider request/response and commercial export report | `modelSchema`, `projectSchema`, `packageSchema`, `providerRequestSchema`, `providerResponseSchema`, `exportReportSchema`, `loadSchema`, `schemaPath` | none |
| `@sdkwork/vhtml-ffmpeg` | FFmpeg/ffprobe process helpers | `runTool`, `probeMedia`, `ffmpegPath`, `ffprobePath`, `ffmpegVersion` | none |
| `@sdkwork/vhtml-runtime` | deterministic Chromium stage, evaluator, renderer, project server, capabilities | `VhtmlRenderer`, `buildStageHtml`, `startProjectServer`, `capabilityReport` | `puppeteer-core`, `esbuild` |
| `@sdkwork/vhtml-media` | PCM mixing, captions, MP4/WebM/GIF/PNG/WAV/MP3 export | `exportProject`, `mixSoundtrack`, `writeCaptions`, `generateWebVtt` | core, ffmpeg, runtime |
| `@sdkwork/vhtml-project` | `vhtml.json`, directory layout, asset inventory/import/relink, Scene splitting, `.vhtmlpkg` | `resolveProjectInput`, `collectAssetInventory`, `importAssetFile`, `splitInlineScenes`, `packProject`, `unpackProject` | core, ffmpeg, `parse5`, `fflate` |
| `@sdkwork/vhtml-generation` | generation tasks, direction, dependency graph, providers, cache, provenance | `materializeGenerations`, `orderGenerationTasks`, `hydrateCachedAssets`, `providerCatalog`, `registerProvider` | core, ffmpeg, project |
| `@sdkwork/vhtml-sdk` | code-first authoring | `defineVideo`, `scene`, `asset`, `lane`, `clip`, `animate`, `caption`, `html`, `css` | core |
| `@sdkwork/vhtml-editor` | headless editing facade | `applyEditOperations`, `EditSession`, `makeClipBase`, `EditOperation` | core |
| `@sdkwork/vhtml-studio` | local/remote Studio server + HTML shell + storyboard editor | `startStudio`, `StudioOptions`, `StudioAuth`, `STUDIO_HTML` | core, runtime, media, generation, project, `parse5` |
| `@sdkwork/vhtml-cli` | command line and embeddable `main(argv)` | `main`, `vhtml` bin (`serve`, `split`, `import`) | all runtime packages |
| `@sdkwork/vhtml` | complete meta package and `vhtml` bin | re-exports core/SDK/runtime/media/project/generation/editor/schema | all packages |

## Dependency graph

```text
schema   ffmpeg
   \       /
    \     /
     core
      │
      ├── sdk
      ├── editor
      ├── runtime ── media
      │                │
      ├── project ─────┤
      │      │         │
      │      └── generation
      │
      └── studio ── cli ── vhtml (meta)
```

`runtime` never imports `media`, `project` or `generation`. `media` depends on
`runtime` for frame capture. `project` only depends on `core` + `ffmpeg`, so
asset/package tooling does not pull Chromium. This is what keeps
`@sdkwork/vhtml-project` and `@sdkwork/vhtml-schema` lightweight.

## Source layout

```text
packages/
  core/          @sdkwork/vhtml-core
  schema/        @sdkwork/vhtml-schema + schemas/
  ffmpeg/        @sdkwork/vhtml-ffmpeg
  runtime/       @sdkwork/vhtml-runtime + scripts/postbuild.mjs
  media/         @sdkwork/vhtml-media
  project/       @sdkwork/vhtml-project
  generation/    @sdkwork/vhtml-generation
  sdk/           @sdkwork/vhtml-sdk
  editor/        @sdkwork/vhtml-editor
  studio/        @sdkwork/vhtml-studio
  cli/           @sdkwork/vhtml-cli + bin/
  vhtml/         @sdkwork/vhtml meta + bin/
examples/        seven private workspace packages
specification/  normative standard + profiles + RFCs
conformance/    manifest-driven fixtures
tests/          unit + Chromium/FFmpeg integration
```

## Build model

- Every package is authored in TypeScript and compiled with `tsc` to
  `packages/<name>/dist/*.js` + `.d.ts`.
- Source imports use `.ts` extensions; `rewriteRelativeImportExtensions` turns
  them into `.js` in emitted JavaScript.
- `scripts/fix-declarations.mjs` normalizes `.d.ts` import specifiers to `.js`
  (TypeScript 5.8 leaves them as `.ts`).
- `@sdkwork/vhtml-runtime` copies `browser/bootstrap.js` and compiles
  `browser/entry.js` into `dist`; `buildStageRuntime()` bundles that entry with
  esbuild at runtime (or uses the TypeScript source during local development).
- `@sdkwork/vhtml-schema` ships JSON schemas beside `dist`, so `schemaDirectory`
  resolves in both the workspace and the installed package.
- Packages are **ESM only**, with `exports` conditions `types`/`import`/`default`,
  `main`, `module`, `types`, source maps and `sideEffects: false`.

## Versioning & publishing

All packages share the `1.1.x` version and use `workspace:^` dependencies.
`pnpm pack` rewrites `workspace:^` to the concrete version.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm check
pnpm examples

node scripts/check-packages.mjs   # export targets / README / LICENSE / bins
pnpm pack:all                     # dist-packages/*.tgz
pnpm publish:dry                  # pnpm recursive dry-run
```

Release order is topological (`schema`/`ffmpeg` → `core` → `runtime`/`media` →
`project` → `generation` → `sdk`/`editor` → `studio` → `cli` → meta). Publish
the leaf packages first so dependency versions exist when the meta package is
installed.

## Integration recipes

### SDK only

```bash
pnpm add @sdkwork/vhtml-sdk @sdkwork/vhtml-core
```

```ts
import { defineVideo, lane, clip } from '@sdkwork/vhtml-sdk';
import { serializeVideoDocument } from '@sdkwork/vhtml-core';

const project = defineVideo({ /* … */ });
const document = serializeVideoDocument(project);
```

### Validate/parse third-party documents

```bash
pnpm add @sdkwork/vhtml-core @sdkwork/vhtml-schema
```

```ts
import { parseVhtml, validateDocument } from '@sdkwork/vhtml-core';
import { loadSchema } from '@sdkwork/vhtml-schema';
```

### Render/export pipeline

```bash
pnpm add @sdkwork/vhtml-core @sdkwork/vhtml-runtime @sdkwork/vhtml-media
```

`VhtmlRenderer` samples deterministic PNG frames; `exportProject` muxes them
with the PCM soundtrack. Chrome and FFmpeg are external runtime prerequisites.

### Project/file tooling without Chromium

```bash
pnpm add @sdkwork/vhtml-project @sdkwork/vhtml-schema
```

`resolveProjectInput`, `collectAssetInventory`, `importAssetFile`, `packProject`
and `unpackProject` only require Node, `parse5`, `fflate` and optional FFprobe.

### Embed Studio

```bash
pnpm add @sdkwork/vhtml-studio
```

```ts
import { startStudio } from '@sdkwork/vhtml-studio';
await startStudio('./my-film', { port: 4173, open: true });
```

### Multi-channel delivery

```bash
pnpm add @sdkwork/vhtml-core
pnpm exec vhtml export ./my-film --delivery tiktok --out renders/tiktok.mp4
pnpm exec vhtml export ./my-film --delivery youtube-4k --out renders/master.mp4
pnpm exec vhtml export ./my-film --delivery podcast-audio --out renders/podcast.wav
```

`DELIVERY_PRESETS` and `outputForDelivery()` are available from
`@sdkwork/vhtml-core/presets` for custom tools. See
[delivery-profiles.md](../specification/delivery-profiles.md).

### CLI

```bash
pnpm add -D @sdkwork/vhtml-cli
pnpm exec vhtml doctor
```
