# @sdkwork/vhtml

VHTML 1.1 complete toolkit: core model, code-first SDK, deterministic Chromium renderer, media export, project management, generation, editor and Studio.

## Install

```bash
npm install @sdkwork/vhtml
```

The package includes the `vhtml` CLI:

```bash
npx vhtml doctor
npx vhtml init my-film
cd my-film && npx vhtml build && npx vhtml preview
# remote/LAN: npx vhtml serve --host 0.0.0.0 --auth user:pass
```

## API entry points

| Import | Purpose |
|---|---|
| `@sdkwork/vhtml` | core + SDK + runtime + media + generation + project + schema |
| `@sdkwork/vhtml/sdk` | code-first authoring |
| `@sdkwork/vhtml/core` | model, time, parser, validator, storyboard, edits |
| `@sdkwork/vhtml/runtime` | renderer/stage/evaluator |
| `@sdkwork/vhtml/media` | audio, captions, export |
| `@sdkwork/vhtml/project` | layout, assets, split, packages |
| `@sdkwork/vhtml/generation` | AI image/video/voice/music/SFX tasks and providers |
| `@sdkwork/vhtml/editor` | headless editing |
| `@sdkwork/vhtml/studio` | local/remote Studio |
| `@sdkwork/vhtml/schema` | JSON Schemas |

```ts
import { defineVideo, clip, lane } from '@sdkwork/vhtml/sdk';
import { serializeVideoDocument } from '@sdkwork/vhtml/sdk';
```

For smaller installs, depend directly on the individual `@sdkwork/vhtml-*` packages.
