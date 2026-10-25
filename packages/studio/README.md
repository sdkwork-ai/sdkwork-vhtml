# @sdkwork/vhtml-studio

Local VHTML Studio server and HTML shell: preview, WYSIWYG stage manipulation, element-level DOM editing, timeline editing, storyboard planning, asset library, captions, transitions, undo and export.

## Storyboard editing

The **Storyboard** tab edits the planning layer without touching timeline
timing:

- add shots, inline-edit title, duration, status, tags, description, prompt,
  notes and direction JSON;
- link a Scene, generation task or asset;
- drag cards or use up/down to reorder; duplicate and delete;
- every change is a `storyboard.*` edit operation, validated and undoable;
- thumbnails use the linked asset or the generated output when available.

The timeline remains authoritative for playback; storyboard edits never move
clips implicitly.

## Element editing

Press **E** (or **⌖ Element**), hover the player and click any authored HTML
node. The **Element** inspector edits:

- ID, class names and arbitrary attributes;
- text for leaf nodes, or **Inner HTML** for containers;
- inline CSS and computed-style context.

Inline Scenes are written with an undoable `scene.set`; external
`<scene src>` files are patched in place and the project is reloaded. Element
paths ignore extracted `<style>`/`<script>` nodes, so the same patch works for
inline and external Scene HTML.

## Install

```bash
npm install @sdkwork/vhtml-studio
```

## Usage

```ts
import { startStudio } from '@sdkwork/vhtml-studio';

await startStudio('./my-film', {
  port: 4173,
  open: true,
});
```

`startStudio` accepts a project directory, a `vhtml.json` or a `.vhtml` entry. It binds to loopback only. The returned promise resolves when the server stops.

## Remote deployment

```ts
await startStudio('/srv/film', {
  host: '0.0.0.0',
  port: 4173,
  auth: { username: 'creator', password: process.env.VHTML_AUTH! },
});
```

A non-loopback bind without `auth` is refused. `VHTML_AUTH`, `VHTML_TOKEN`,
`VHTML_HOST` and `VHTML_PORT` are read as defaults. HTTP Basic auth protects the
Studio page, API, stage and static files; `/__vhtml/health` remains public for
container probes. Terminate TLS in a reverse proxy. See
[Local and cloud deployment](../../docs/deploy.md).

The Studio is also available through the `vhtml preview` / `vhtml serve` CLI.
