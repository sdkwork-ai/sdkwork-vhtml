# Repository Guidelines

## SDKWORK Soul

Read `../sdkwork-specs/SOUL.md` before executing tasks in this root. Follow specs before memory, dictionary before context, stop on ambiguity, and evidence before completion.

## SDKWORK Standards

Canonical SDKWORK specs path from this root:

- `../sdkwork-specs/README.md`
- `../sdkwork-specs/SOUL.md`
- `../sdkwork-specs/AGENTS_SPEC.md`
- `../sdkwork-specs/CODE_STYLE_SPEC.md`
- `../sdkwork-specs/NAMING_SPEC.md`

Do not copy root standard text into this repository. If these relative paths do not resolve, stop and report the broken workspace layout.

## Application Identity

This is the repository root for **VHTML 1.1** — an HTML-compatible multimedia
format and reference runtime for deterministic video production (specification,
pnpm workspace packages, code-first SDK, deterministic Chromium frame sampler,
FFmpeg export pipeline, generation layer, WYSIWYG Studio, and CLI). It is a
standards-carrying product repository; it owns no `agent.app.config.json`
application root. Packages live in `packages/*`; the normative format
specification lives in `specification/`.

## Local Dictionary Structure

- `AGENTS.md`: local agent entrypoint and relative SDKWORK spec index.
- `CLAUDE.md`: Claude Code compatibility shim that points to `AGENTS.md` and must not duplicate rules.
- `GEMINI.md`: Gemini CLI compatibility shim that points to `AGENTS.md` and must not duplicate rules.
- `CODEX.md`: Codex compatibility shim that points to `AGENTS.md` and must not duplicate rules.
- `.sdkwork/`: local skills, plugins, manifests, and AI workspace metadata. The `skills/` directory carries the unified VHTML video-production agent skill (`sdkwork-vhtml-video`: create / edit / generate / export as routed workflows); start at `.sdkwork/skills/README.md`.
- `specification/`: normative VHTML 1.1 specification and profiles — the domain authority for every video task.
- `packages/`: independently published npm packages (`@sdkwork/vhtml-*`); generated `dist/` output must not be hand-edited.
- `examples/`: runnable reference projects (`01-hello` … `08-code-video`); the blueprints used by authoring skills.
- `conformance/`: manifest-driven specification fixtures.
- `tests/`: unit + integration tests (Chromium/FFmpeg required for integration).
- `docs/`: architecture, SDK reference, Studio guide, standard audit.
- `scripts/`: workspace development scripts (`check-packages.mjs`, `verify-videos.mjs`, …).
- `agent.app.config.json`: not present; this repository is not an application root.

## Spec Resolution Order

1. Read this `AGENTS.md` and any nearer component-level `AGENTS.md`.
2. Read `agent.app.config.json` when present (not present here).
3. Read local `specs/README.md` and `specs/component.spec.json` when the task touches an authored module contract.
4. Read local `.sdkwork/README.md`, `.sdkwork/skills/`, and `.sdkwork/plugins/` when the task is video production or workspace-metadata work; route video tasks through the skill index first.
5. Read `../sdkwork-specs/README.md` and the task-specific root specs.
6. Read `specification/` documents for the VHTML domain surface the task touches.
7. Inspect implementation files only after the relevant dictionary entries are clear.

## Required Specs By Task Type

- Agent/workflow/workspace-metadata changes: `../sdkwork-specs/SOUL.md`, `../sdkwork-specs/AGENTS_SPEC.md`, `../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`, `../sdkwork-specs/DOCUMENTATION_SPEC.md`.
- Video creation/authoring: `.sdkwork/skills/sdkwork-vhtml-video/SKILL.md` + `workflows/create-video.md`, `specification/VHTML-1.1-Specification.md`, `specification/project-layout.md`, `specification/video-authoring.md`, `docs/sdk.md`.
- Video editing: `.sdkwork/skills/sdkwork-vhtml-video/SKILL.md` + `workflows/cut-from-transcript.md` and `references/edit-operations.md`, `specification/editing.md`, plus `../sdkwork-specs/DESTRUCTIVE_OPERATION_SPEC.md` for deletions.
- Generation tasks/AI assets: `.sdkwork/skills/sdkwork-vhtml-video/SKILL.md` + `workflows/generate-assets.md`, `specification/generation.md`, `../sdkwork-specs/PRIVACY_SPEC.md` when prompts may contain sensitive content.
- Export/delivery: `.sdkwork/skills/sdkwork-vhtml-video/SKILL.md` + `workflows/deliver-video.md`, `specification/delivery-profiles.md`, `specification/commercial.md`.
- Specification changes (`specification/`, `conformance/`): `specification/README.md`, `specification/versioning.md`, and the audit trail in `docs/standard-audit.md`; breaking changes need an RFC under `specification/rfc/`.
- Package/CLI code changes: `../sdkwork-specs/CODE_STYLE_SPEC.md`, `../sdkwork-specs/NAMING_SPEC.md`, `../sdkwork-specs/TYPESCRIPT_CODE_SPEC.md`, `../sdkwork-specs/PNPM_SCRIPT_SPEC.md`, `../sdkwork-specs/PNPM_WORKSPACE_DEPENDENCY_SPEC.md`, `../sdkwork-specs/PACKAGING_SPEC.md`.
- Studio/frontend code: add `../sdkwork-specs/FRONTEND_CODE_SPEC.md` and the UI specs named by the root task matrix.

Language-specific specs are on-demand; do not load unrelated language, UI, deployment, or SDK specs for video-production tasks.

## Code Style Rules

Read `../sdkwork-specs/CODE_STYLE_SPEC.md` and `../sdkwork-specs/NAMING_SPEC.md` before code changes. TypeScript/Node code follows `../sdkwork-specs/TYPESCRIPT_CODE_SPEC.md`. Authored video code (`video.ts`, program documents, scene HTML/CSS) follows the deterministic-authoring rules in `specification/rendering.md` and `specification/video-authoring.md` — no wall-clock logic, no unseeded randomness, no render-time network access.

## Build, Test, and Verification

```bash
pnpm install && pnpm build      # workspace packages
pnpm typecheck && pnpm test     # unit + integration (Chromium/FFmpeg)
pnpm vhtml doctor               # environment check
pnpm examples && pnpm verify:videos   # examples compile + one-second export QC
node scripts/check-packages.mjs       # packaging gate
```

Video-production verification (no rebuild needed): use the skill scripts —
`.sdkwork/skills/sdkwork-vhtml-video/scripts/check-project.mjs <project>`
(validate + assets + render smoke test) and
`.sdkwork/skills/sdkwork-vhtml-video/scripts/verify-export.mjs <file>`
(ffprobe + frame-hash QC). CLI exit codes: `0` success, `1` validation/runtime
failure, `2` usage error; `--json` output is stable for agents.

## Agent Execution Rules

Use the convention dictionary instead of broad context loading. Route video-production tasks through `.sdkwork/skills/README.md` first; keep `.sdkwork/` skills citing `specification/` documents instead of copying them. Never hand-edit `packages/*/dist`, `generated/`, or `.vhtml/cache/` output. Do not store secrets, provider credentials, or user-private media in `.sdkwork/`. Keep changes scoped to the owning project directory or package; record the exact verification commands and important outputs before reporting completion.

## Human Review Rules

A human must review: specification changes and new conformance requirements, breaking package API changes, new published packages, rights/consent declarations for generated media (`review.status` gates delivery), and any deletion of user media or timeline content. `procedural` generation output is placeholder-quality and must be labeled as such when presented as a result.

<!-- SDKWORK-DESTRUCTIVE-OPERATION-STANDARD: v1 -->
## Destructive Operation Safety

Authority: `../sdkwork-specs/DESTRUCTIVE_OPERATION_SPEC.md`.

Deletion must be explicit, enumerated, and reviewable. Deleting by pattern instead of by named
path is forbidden. Wildcards are for read-only commands only.

- `git rm -r`, `git rm` over a directory or pattern, and `git clean -f`/`-fd`/`-fdx` are
  FORBIDDEN. A recursive `git rm` stages many deletions in one index transaction; if the process
  is interrupted (SIGTERM, timeout, sandbox kill, crash) entries are already gone from disk while
  the index is only half-written, which is silent non-atomic mass data loss.
- Delete tracked files with `rm <exact/path>` on each named path, let `git status --short`
  record the `D` entries, then stage only the enumerated paths. Commit the deletion separately
  from functional changes.
- Shell and script deletion by wildcard is FORBIDDEN: `rm -rf`/`rm -r`/`rm -f` with
  `*`/`**`/`?`/`[...]`/brace expansion, `find ... -delete`, `find ... -exec rm`,
  `find ... | xargs rm`, `for f in *; do rm ...`, `del /S /Q`, `rd /S /Q`,
  `Remove-Item -Recurse -Force` on a glob, `shutil.rmtree`, `fs.rm(dir, { recursive: true })`,
  and `rimraf` over a glob.
- A deletion MUST NOT be combined in one shell invocation with a build, install, network, or
  publish step, and MUST NOT derive its targets from an unvalidated argument, environment
  variable, or configuration value.
- Permitted narrow deletion: `rm <exact/path>`; a short literal path list owned by the tool that
  declares it; the module's own generated artifacts through its owning tool
  (`pnpm clean`, `cargo clean`) per `CODE_STYLE_SPEC.md` §7; and
  `git restore --worktree --source=HEAD -- <exact paths>`.
- Required sequence before any deletion: enumerate exact paths; confirm every path resolves inside
  the active repository or module root; classify tracked/generated/cached/unknown; prefer `rm`
  plus tracked `git status`; delete in batches of 20 or fewer with a status check between
  batches; report the removed paths and the authorizing decision.
- Request explicit human confirmation before deleting any git-tracked path, any directory tree,
  any path resolving outside the active repository root, or more than 20 paths.
- Recovery after an accidental mass deletion: clear a stale `.git/index.lock`, write the path
  list to a file INSIDE the repository (never `/tmp` on Windows, where the Git Bash path space
  and the native tool path space disagree), and run a single
  `git restore --worktree --pathspec-from-file=<repo-relative-list>`. Never loop one
  version-control call per path; the same termination cause interrupts the loop part-way.

Verification (from the repository root):

```bash
node ../sdkwork-specs/tools/sync-agent-destructive-operation-standard.mjs --root . --check
```
<!-- /SDKWORK-DESTRUCTIVE-OPERATION-STANDARD: v1 -->

<!-- SDKWORK-ROLLBACK-RESTRICTION-STANDARD: v1 -->
## Rollback Restriction And Fix-Forward Discipline

Authority: `../sdkwork-specs/ROLLBACK_RESTRICTION_SPEC.md`.

Errors are fixed forward. Version-control history is never rewound to make an error disappear.

- A rollback is any operation that moves a ref, resets the index or the working tree to an earlier
  state, discards uncommitted or committed work, or rewrites published history. It is FORBIDDEN as
  the remedy for a defect — a build failure, a type error, a lint failure, a failing test, a merge
  conflict, a runtime regression, a bad refactor, or an unclear diff. Repair forward instead, by
  adding, editing, or restoring content through a new commit.
- FORBIDDEN by an agent or a human-issued command: `git reset --hard` in any form;
  `git reset --merge`/`--keep`; `git reset <ref>` that discards staged or working-tree content;
  `git checkout -f`, `git switch -f`, `git restore --source=<ref> --worktree .`;
  `git revert` as a reflex error remedy; `git stash drop`/`clear` and `git stash pop` over a
  conflict; `git branch -D` on a branch with unmerged work; `git update-ref -d` and direct
  `.git/refs/` edits; `git reflog expire`, `git gc --prune=now`, `git prune`;
  `git commit --amend` over a pushed commit; `git rebase`, `git rebase -i`, `git rebase --onto`;
  `git filter-branch`; `git push --force`, `git push --force-with-lease`, and
  `git push --delete`.
- A rollback is never inferred from context or tone. "Fix it", "it's broken", "this is a mess",
  "start over", "just revert it", and "退回" are not rollback instructions. If the intent is
  ambiguous, STOP and ask — including whether the instruction means to discard work or to restore
  lost work, because that distinction decides the permissible operation.
- Discarding work requires a separate, explicit, human-issued instruction that names the operation,
  the target ref, the discarded span, and the reason, and that acknowledges the loss. The
  authorization must be quoted in the commit message. A standing authorization is not accepted.
- Recovery is ADDITIVE: `git restore --worktree --source=<ref> -- <exact paths>`, or
  `git checkout <good-ref> --pathspec-from-file=<repo-relative-list>` with the list written inside
  the repository. The pathspec must be an explicit enumerated list — never a directory, glob, brace
  expansion, or the repository root — and a restore is never combined with a build, install,
  publish, or commit step in the same shell invocation.
- Before a bulk restore: commit any local modification as a checkpoint; create a backup branch AND a
  tag AND a patch file and verify they point at the pre-restore state; produce a written
  three-snapshot blob comparison (damaged revision vs its parent vs the candidate older snapshot)
  that separates REPLACED files from files the damaged revision legitimately AUTHORED; restore the
  relative complement, not the whole tree; and keep the files the damaged revision added.
- Never treat a local tracking ref as evidence about a remote. Confirm with
  `git ls-remote <remote> <branch>` and record the returned object id.
- After a restore, verify by content hash rather than by reading files, re-run the gates that cover
  the restored surface, and classify each remaining failure as caused-by-the-restore or
  pre-existing. A pre-existing claim must be proven by showing the same failure at the prior
  revision with `git show <ref>:<path>`, not reasoned about. Fix forward. Never un-restore.
- Never bypass a hook, signature, or gate with `--force`, `--no-verify`, or `--no-gpg-sign` to
  land a repair.

Verification (from the repository root):

```bash
node ../sdkwork-specs/tools/sync-agent-rollback-restriction-standard.mjs --root . --check
```
<!-- /SDKWORK-ROLLBACK-RESTRICTION-STANDARD: v1 -->

<!-- SDKWORK-MAIN-BRANCH-STANDARD: v1 -->
## Main-Branch Development

Authority: `../sdkwork-specs/REPOSITORY_BASELINE_SPEC.md` section 1.

Development happens on `main`. Everything authored in this repository is committed onto `main`.

- A working tree that receives authored content MUST have `main` checked out as its current branch
  for the whole time that work is in progress. Commit onto `main` directly; do not commit onto a
  branch a later merge is expected to bring in.
- A detached HEAD MUST NOT be used as a development venue. A commit created while HEAD is detached
  from every branch is reachable only through the reflog — absent from every branch history, from a
  fresh `git clone` of this repository, and from every other working tree — so the work it carries
  is one `git gc` away from being unrecoverable. Do not check out a bare commit, a tag, or an older
  ref in order to "get a clean starting point" and commit there.
- A side branch MUST NOT be used as a development venue either. There is no long-lived feature,
  release, maintenance, or personal branch, and this repository MUST NOT accumulate local commits
  that `main` cannot reach: making them findable would then depend on a merge that may never happen.
- A checkout off `main` is legitimate only while it stays read-only — a dependency or SDK pinned to
  an explicit commit, a release artifact checkout, or a bisect. No authored change is committed there.
- A working tree found detached, or on a branch other than `main`, with work in it is a STOP, not a
  cleanup. Do not move refs, do not rewrite history, and do not discard the commits. Report the
  branch, the commits, and the state, and let a human decide: moving commits onto `main` and
  discarding work are both governed by `../sdkwork-specs/DESTRUCTIVE_OPERATION_SPEC.md` and
  `../sdkwork-specs/ROLLBACK_RESTRICTION_SPEC.md`.

Verification (from the repository root):

```bash
node ../sdkwork-specs/tools/audit-repository-baseline.mjs --root . --only branch-main
node ../sdkwork-specs/tools/sync-agent-main-branch-standard.mjs --root . --check
```

The first fails when the current branch is anything other than `main`, and reports a detached HEAD
as `detached`. The second fails when this block is out of date.
<!-- /SDKWORK-MAIN-BRANCH-STANDARD: v1 -->
