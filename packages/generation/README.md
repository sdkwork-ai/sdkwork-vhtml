# @sdkwork/vhtml-generation

VHTML generation task pipeline: image/video/voice/music/SFX/avatar/dub tasks, structured direction, dependency graph, procedural/manifest/HTTP providers, content-addressed cache and provenance.

## Install

```bash
npm install @sdkwork/vhtml-generation
```

## Task coverage

`image`, `storyboard`, `video`, `avatar`, `lipsync`, `speech`, `dub`, `music`,
`sfx`, `audio`, `matte`, `edit`, `translation`, `text`.

`direction` carries portable creative intent:

```ts
generation: [{
  id: 'hero',
  kind: 'video',
  prompt: 'slow push in on the product',
  inputs: [
    { ref: 'gen:cover', role: 'first-frame' },
    { ref: 'brand-style', role: 'style' },
  ],
  direction: {
    shot: { framing: 'medium', camera: 'slow push in', lighting: 'neon' },
    video: { firstFrame: 'gen:cover', loop: false },
  },
  rights: { commercialUse: true, aiDisclosure: true },
}]
```

## Usage

```ts
import { materializeGenerations, hydrateCachedAssets, providerCatalog } from '@sdkwork/vhtml-generation';

const result = await materializeGenerations({
  project,
  root: './my-film',
  taskIds: ['hero'],
  generatedDir: 'generated',
});

console.log(result.ran, result.skipped, result.failed);
console.log(providerCatalog());

// After parsing a project, attach cached assets:
hydrateCachedAssets(project, './my-film');
```

Tasks that reference `gen:<id>` are topologically ordered; selecting a downstream
task automatically runs its dependencies and cycles fail before any provider is
called.

Built-in providers: `procedural` (offline image/video/audio/music/SFX/text),
`manifest` (pre-generated files), `http` (vendor-neutral sync/polling contract).
Register custom providers with `registerProvider`; declare capabilities with
`capabilities`. See [generation protocol](../../specification/generation.md).
