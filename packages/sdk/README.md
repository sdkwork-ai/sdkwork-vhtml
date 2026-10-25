# @sdkwork/vhtml-sdk

Code-first VHTML authoring SDK. Build the exact Core Model that the parser and runtime use.

## Install

```bash
npm install @sdkwork/vhtml-sdk @sdkwork/vhtml-core
```

## Usage

```ts
import { defineVideo, scene, clip, lane, animate } from '@sdkwork/vhtml-sdk';
import { serializeVideoDocument } from '@sdkwork/vhtml-sdk';

const project = defineVideo({
  id: 'hello',
  width: 1280,
  height: 720,
  fps: '30/1',
  duration: '4s',
  scenes: [{ id: 'hero', html: '<h1>Hello VHTML</h1>', css: 'h1{color:white}' }],
  lanes: [lane('video', 'visual', [
    clip('scene:hero', { start: 0, duration: '4s', animations: [animate({ property: 'opacity', from: 0, to: 1, duration: '0.6s' })] }),
  ])],
  storyboard: [
    { id: 'shot-1', title: 'Opening', scene: 'hero', duration: '2s', status: 'boarded',
      direction: { shot: { framing: 'wide', camera: 'slow push in' } } },
  ],
});

const document = serializeVideoDocument(project);
```

Also exports `asset`, `caption`, `transition`, `effect`, `html`, `css`, validation and editing helpers. `defineVideo({ storyboard })` emits ordered planning shots with the same fields as the Core Model.
