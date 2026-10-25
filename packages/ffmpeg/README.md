# @sdkwork/vhtml-ffmpeg

Small, dependency-free FFmpeg/ffprobe process helpers shared by VHTML media, project and generation packages.

## Install

```bash
npm install @sdkwork/vhtml-ffmpeg
```

FFmpeg and ffprobe must be available on `PATH`, or set `VHTML_FFMPEG` / `VHTML_FFPROBE`.

## Usage

```ts
import { probeMedia, ffmpegVersion, runTool, ffmpegPath } from '@sdkwork/vhtml-ffmpeg';

const info = await probeMedia('input.mp4');
console.log(info.video?.width, info.audio?.sampleRate);
console.log(await ffmpegVersion(), ffmpegPath());

const result = await runTool(ffmpegPath(), ['-version'], { timeoutMs: 10_000 });
```

Exports: `runTool`, `probeMedia`, `ffmpegPath`, `ffprobePath`, `ffmpegVersion`, `assertFfmpeg`, `MediaToolError`.
