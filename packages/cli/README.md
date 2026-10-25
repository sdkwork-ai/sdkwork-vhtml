# @sdkwork/vhtml-cli

VHTML command line for project scaffolding, building, validation, deterministic rendering, export, generation, asset management, packaging and Studio.

## Install

```bash
npm install -D @sdkwork/vhtml-cli
npx vhtml doctor
```

## Commands

```text
vhtml init [dir]
vhtml build [source|project]
vhtml validate [project]
vhtml inspect [project]
vhtml render [project] --frame 60 --out frame.png
vhtml export [project] --out video.mp4
vhtml export [project] --delivery tiktok --out vertical.mp4
vhtml export [project] --delivery podcast-audio --out episode.wav
vhtml preview [project] --open
vhtml serve [project] --host 0.0.0.0 --auth user:pass
vhtml split [project] --dry-run
vhtml import [project] ./assets/logo.svg --to assets/images
vhtml generate [project] --all
vhtml providers --json
vhtml edit [project] --ops edits.json
vhtml audio [project]
vhtml captions [project]
vhtml assets list|verify|import|relink
vhtml pack [project] --out film.vhtmlpkg
vhtml unpack film.vhtmlpkg --out restored
vhtml capabilities
vhtml doctor
```

`[project]` may be a directory containing `vhtml.json`, a `.vhtml` entry, or omitted to use the current directory.

`serve` is the deployment form of `preview`. It refuses a non-loopback bind
without Basic auth; use `VHTML_HOST`, `VHTML_PORT`, `VHTML_AUTH` or
`VHTML_TOKEN` in containers. `/__vhtml/health` stays public for probes.

`split` extracts inline Scenes into `scenes/*.html`, rewrites relative HTML/CSS
URLs and preserves scripts. `import` is an alias for `assets import`.

The package also exports `main(argv)` for embedding:
```ts
import { main } from '@sdkwork/vhtml-cli';
process.exitCode = await main(['validate', './my-film', '--json']);
```
