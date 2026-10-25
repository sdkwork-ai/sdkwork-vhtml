# @sdkwork/vhtml-editor

Headless VHTML editing package: non-destructive timeline operations and undo sessions, backed by the Core Model.

## Install

```bash
npm install @sdkwork/vhtml-editor @sdkwork/vhtml-core
```

## Usage

```ts
import { applyEditOperations, EditSession, makeClipBase } from '@sdkwork/vhtml-editor';

const session = new EditSession(project);
session.apply([
  { op: 'clip.move', clipId: 'hero', start: '2s' },
  { op: 'clip.split', clipId: 'hero', at: '3s' },
  { op: 'clip.rippleDelete', clipId: 'hero-b' },
]);
session.undo();
const saved = session.project;
```

Supported operations include trim, split, ripple delete, move, slip, slide, roll, speed, freeze, transitions, effects, animations, markers, asset add/remove/set and project settings.
