# @sdkwork/vhtml-media

VHTML media pipeline: sample-accurate PCM mixer, WebVTT/SRT captions and MP4/WebM/GIF/PNG-sequence/WAV/MP3 export.

## Install

```bash
npm install @sdkwork/vhtml-media
```

## Exports

| Entry | Contents |
|---|---|
| `@sdkwork/vhtml-media` | audio, captions, export and FFmpeg helpers |
| `/audio` | `mixSoundtrack`, `writeWavFloat`, loudness helpers |
| `/captions` | WebVTT/SRT generation |
| `/export` | `exportProject` |
| `/ffmpeg` | re-export of `@sdkwork/vhtml-ffmpeg` |

## Usage

```ts
import { exportProject } from '@sdkwork/vhtml-media/export';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';

const { document } = parseVhtml(source, { file: 'video.vhtml', root: process.cwd() });
const output = document.project.outputs[0]!;

await exportProject({
  project: document.project,
  root: process.cwd(),
  output,
  outputPath: 'renders/video.mp4',
  generateCaptions: true,
});
```

The renderer is provided by `@sdkwork/vhtml-runtime`; Chrome and FFmpeg are runtime prerequisites.
