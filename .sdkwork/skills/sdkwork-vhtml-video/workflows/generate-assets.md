# Workflow: Generate and Materialise Assets（生成工作流）

Skill scope: from asset intent to verified, cached `gen:` assets wired into
the timeline. Assumes a validating project (create skill) and ends before
final delivery (export skill).

## Step 0 — Decide the generation plan

For each missing asset, write one line: **kind · provider · why**. Default
to `procedural` while authoring (offline, deterministic, cached); upgrade
individual tasks to `http`/real providers when the creative is approved.
Never burn paid provider calls on drafts.

Check available providers and vendor mappings:

```bash
vhtml providers --json        # installed providers + capabilities
vhtml providers --known       # 26-vendor parameter mapping catalog
vhtml capabilities --json     # includes deliveryPresets
```

Checkpoint: the plan is a table (id, kind, provider, duration/size, deps).
Confirm with the user when provider calls cost money or involve
likeness/voice.

## Step 1 — Author tasks into the project

Add `<generations>` to the project entry (recipes in
[../references/generation-tasks.md](../references/generation-tasks.md)):
one task per asset; declare `constraints` (hard limits), `direction`
(portable intent), `params` only with `<vendor>.<param>` namespaces;
`rights`/`review` for anything shippable; seeds for reproducibility.

Reference material first: import files so tasks can cite them:

```bash
vhtml import <project> ./reference/host.jpg --to assets/images
vhtml assets list <project>
```

Dependency chains via `gen-input ref="gen:<upstream>" role="first-frame"` —
image → video chains give shot-to-shot continuity; combine with fixed `seed`
+ same provider/model + `direction.shot.continuity` notes (see
generation.md §3.3).

## Step 2 — Wire the timeline

Clips reference outputs: `ref="gen:<task-id>"` on the correct lanes (visual
kinds on `video`/`overlay` lanes; audio kinds on `type="audio"` lanes only —
audio on visual lanes is preview-only). Keys/covers as overlays with
`blend`/`opacity`. Verify with `vhtml validate` — unresolved `gen:` refs
surface as `ASSET_UNAVAILABLE` info until materialised (export/render will
auto-materialise or fail loudly).

## Step 3 — Materialise

```bash
vhtml generate <project> --all --json          # everything (deps auto-ordered)
vhtml generate <project> --task shot-1 --json  # one task + its dependencies
vhtml generate <project> --task shot-1 --provider http   # provider override
vhtml generate <project> --task shot-1 --force --write  # bypass cache; persist asset list
```

Behavior to rely on: topological order, cycles fail before any provider
call, cache hits never call the provider, failures keep diagnostics and
never register partial files as assets, outputs land under `generated/`.

`--write` serialises the materialised asset list into the project document;
without it the assets live in the cache until the next export/render. Prefer
`--write` for stable previews, plain runs inside export (`--generate`).

## Step 4 — Verify and review

```bash
vhtml validate <project> --json
node .sdkwork/skills/sdkwork-vhtml-video/scripts/check-project.mjs <project>
```

Then the human gate: check each task's `review.status`; set `approved` (with
reviewer/notes/reviewedAt) only after a human looked at the output. For
`procedural` stand-ins, state clearly in the report that the visual is a
placeholder. Spot-render key frames (`vhtml render --time …`) to confirm
the generated asset reads correctly in composition (scale/fit/overlay
blends).

## Step 5 — Cache management

- Reproducibility: same task + provider/model version + inputs + seed →
  cache reuse; record `provenance.model` for audits.
- Upstream edits invalidate downstream entries automatically (input hashes
  are in the key).
- `--force` per task after changing `params`/prompts experimentally; remove
  stale entries by deleting `.vhtml/cache/generated.json` (they rebuild on
  the next run) — mention it in the report, it is a destructive cache reset.

## Step 6 — Report

Table of tasks: id, kind, provider, cache hit/ran, output path, review
status, rights flags. Call out: failed tasks with error codes
(`GENERATION_*`), consent references for likeness/voice, disclosure flags
that must ride into delivery (export report includes them).
