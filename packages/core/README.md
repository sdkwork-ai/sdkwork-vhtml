# @sdkwork/vhtml-core

VHTML 1.1 core: exact rational time, the typed Core Model, HTML5 parser, semantic validator, canonical serializer, storyboard planning, animation sampling and non-destructive edit operations.

## Install

```bash
npm install @sdkwork/vhtml-core
# or
pnpm add @sdkwork/vhtml-core
```

Requires Node.js >= 22.18. The package ships compiled ESM and TypeScript declarations.

## Exports

| Entry | Contents |
|---|---|
| `@sdkwork/vhtml-core` | everything below |
| `/time` | rational time, frame rates, frame/sample math, timecode |
| `/model` | Core Model types, defaults, lookup helpers, storyboard shots |
| `/parser` | `parseVhtml`, parse options/diagnostics |
| `/validate` | `validateDocument`, capability/security checks |
| `/serialize` | canonical document/project serialization |
| `/animation` | easing, interpolation, keyframe sampling |
| `/presets` | delivery profiles (web, social, cinema, audio) |
| `/edits` | edit operations, `EditSession`, `makeClipBase` |
| `/errors` | stable `ErrorCode`, diagnostics, `VhtmlError` |

## Usage

```ts
import { parseVhtml, validateDocument, applyEditOperations } from '@sdkwork/vhtml-core';
import { parseTime, frameCount } from '@sdkwork/vhtml-core/time';

const parsed = parseVhtml(source, { file: 'video.vhtml', root: process.cwd() });
const validation = validateDocument(parsed.document, { root: process.cwd(), checkFiles: true });
if (!validation.ok) console.error(validation.errors);

const result = applyEditOperations(parsed.document.project, [
  { op: 'clip.split', clipId: 'hero', at: parseTime('2s') },
  { op: 'clip.rippleDelete', clipId: 'hero' },
  {
    op: 'scene.set',
    sceneId: 'intro',
    props: { html: '<h1 class="title">Edited in the Studio</h1>', css: '.title{color:#fff}' },
  },
]);
```

The model is the public contract: parser, SDK, editor and runtime all operate on the same types.
