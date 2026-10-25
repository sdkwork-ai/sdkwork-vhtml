# @sdkwork/vhtml-runtime

Deterministic Chromium frame runtime for VHTML: stage builder, browser clock/seek runtime, renderer, project HTTP server and capability report.

## Install

```bash
npm install @sdkwork/vhtml-runtime
```

Chrome/Chromium is required; set `VHTML_CHROME_PATH` when it is not auto-detected.

## Exports

| Entry | Contents |
|---|---|
| `@sdkwork/vhtml-runtime` | renderer, stage, evaluator, server, capabilities |
| `/evaluate` | pure frame evaluator (browser-safe) |
| `/stage` | `buildStageHtml` |
| `/renderer` | `VhtmlRenderer`, deterministic frame sampler |
| `/server` | project/Range server with optional `authorize` and remote bind |
| `/chrome` | Chrome discovery/launch |
| `/capabilities` | capability matrix |
| `/build` | browser runtime bundler |

## Usage

```ts
import { VhtmlRenderer } from '@sdkwork/vhtml-runtime/renderer';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { writeFile } from 'node:fs/promises';

const { document } = parseVhtml(source, { file: 'video.vhtml', root: process.cwd() });
const renderer = new VhtmlRenderer({ project: document.project, root: process.cwd() });
await renderer.open();
const frame = await renderer.sampleFrame(60);
await writeFile('frame.png', frame.png);
await renderer.close();
```

`startProjectServer({ root, stage, authorize, host, port })` serves a project
over HTTP with Range support. `authorize` protects stage, API and static files;
`/__vhtml/health` stays public for probes. Bind to `0.0.0.0` only together with
authentication and a TLS-terminating proxy.
