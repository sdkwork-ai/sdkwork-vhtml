# @sdkwork/vhtml-project

VHTML project layout and external-file management: `vhtml.json`, standard directories, asset inventory/import/relink and portable `.vhtmlpkg` packages.

## Install

```bash
npm install @sdkwork/vhtml-project
```

## Exports

- `resolveProjectInput` — directory, `vhtml.json` or `.vhtml` discovery
- `readManifest`, `writeManifest`, `ensureProjectLayout`, `defaultManifest`
- `collectAssetInventory`, `verifyAssetInventory`, `importAssetFile`, `relinkAsset`
- `splitInlineScenes` — extract inline Scenes into external files with URL rebasing
- `packProject`, `unpackProject`, `packageInfo`

## Usage

```ts
import { resolveProjectInput, collectAssetInventory } from '@sdkwork/vhtml-project';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';
import { readFileSync } from 'node:fs';

const project = resolveProjectInput('./my-film');
const parsed = parseVhtml(readFileSync(project.entry, 'utf8'), {
  file: project.entry,
  root: project.root,
});
const inventory = collectAssetInventory(parsed.document.project, project.root, project.layout);
console.log(inventory.summary);
```

```ts
import { packProject, unpackProject } from '@sdkwork/vhtml-project';

packProject({ root: project.root, entry: project.entry, out: 'film.vhtmlpkg' });
unpackProject('film.vhtmlpkg', { outDir: './restored' });
```

Packages are ZIP containers; extraction rejects absolute paths and Zip-Slip entries.

## Splitting inline Scenes

```ts
import { splitInlineScenes } from '@sdkwork/vhtml-project/split';
import { DEFAULT_LAYOUT } from '@sdkwork/vhtml-project/manifest';
import { parseVhtml } from '@sdkwork/vhtml-core/parser';

const entry = './my-film/video.vhtml';
const { document } = parseVhtml(readFileSync(entry, 'utf8'), {
  file: entry,
  root: './my-film',
});
splitInlineScenes({
  root: './my-film',
  entry,
  document,
  layout: { ...DEFAULT_LAYOUT },
  force: false,
  dryRun: false,
});
```

Relative HTML/CSS URLs are rebased for `scenes/`, scripts are preserved
verbatim, and the entry becomes `<scene src="scenes/<id>.html">`. Use
`dryRun: true` to plan without writing.

For SDK-generated projects, the CLI's `vhtml split --detach` removes the `source`
reference and sets `vhtml.json` `detached: true`, making the split `.vhtml`
canonical. `vhtml build` then refuses implicit regeneration from the directory.

