# SDKWork Skills — sdkwork-vhtml

Reusable agent skills for VHTML video production. Each skill is a directory
with a `SKILL.md` entrypoint plus optional `references/`, `workflows/`,
`scripts/`, and `assets/`. The directory shape follows
`../../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md` section 3.

## Skill index

| Skill | Use it for |
|---|---|
| [`sdkwork-vhtml-video`](./sdkwork-vhtml-video/SKILL.md) | The complete VHTML video-production skill: create projects and author scenes/timelines/captions/audio, edit existing timelines (cut/trim/retime/replace/restructure), add and materialise AI/procedural generation tasks, and export deliverables (MP4/WebM/GIF/WAV, delivery profiles, reports, QC). One entrypoint routes to per-phase workflows; a full brief-to-delivery job runs create → generate → edit → deliver inside it. |

The skill keeps its phase playbooks separate for progressive disclosure —
`SKILL.md` stays the router and loads only the workflow/reference the current
task needs:

- workflows: `create-video.md`, `cut-from-transcript.md`, `generate-assets.md`, `deliver-video.md`
- references: `authoring-guide.md`, `video-blueprints.md`, `edit-operations.md`, `generation-tasks.md`, `delivery-profiles.md`
- scripts: `new-video.mjs` (scaffold), `check-project.mjs` (validate/assets/render gate), `apply-edits.mjs` (safe edit applier), `verify-export.mjs` (delivery QC)
- assets: `video-brief.template.md`

## How to add a skill

1. Create `.sdkwork/skills/<skill-name>/` with a lowercase kebab-case name.
2. `SKILL.md` is the mandatory entrypoint. It MUST state when to use the
   skill, expected inputs, the files and commands it may touch, and the specs
   it follows. Keep `SKILL.md` a router: push detail into `workflows/` and
   `references/` so agents load only what the task needs.
3. Add `references/`, `workflows/`, `scripts/`, `assets/` only when the
   workflow needs them. Scripts must be deterministic, documented and safe to
   run from the repository root; no network, no secrets.
4. Cite canonical specs (this repository's `specification/*.md` and the global
   standards under `../sdkwork-specs/`) instead of copying their bodies.
5. Add the skill to the index table above.
6. Never store application/runtime source code, generated SDK output, runtime
   data, secrets, credentials, provider account IDs, or user-private files in
   a skill.

## Verification

After authoring or editing a skill, verify the artifacts it declares:
run its scripts with `--help` (or a dry-run) from the repository root, run
`vhtml validate` on any project the workflow touches, and re-check that every
CLI command cited in the docs exists (flags drift). See `../../AGENTS.md` for
the repository build and verification commands.
