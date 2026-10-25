# Workflow: Create a Video from a Brief（创作工作流）

End-to-end agent workflow for `sdkwork-vhtml-video`. Skill scope:
build the project source of truth and get it validated + previewable.
Materialising AI assets, cutting the timeline and producing final files are
delegated to the sibling skills (generate / edit / export).

Paths below are repository-relative; run commands from the repository root
(`D:\…\sdkwork-vhtml`). `SKILL` denotes
`.sdkwork/skills/sdkwork-vhtml-video/`.

## Step 0 — Environment gate

```bash
pnpm vhtml doctor    # Node >= 22.18, Chrome, FFmpeg
```

If `pnpm` packages are not built: `pnpm install && pnpm build`. Stop and
report if Chrome or FFmpeg is missing — rendering/export cannot run.

## Step 1 — Brief（简报）

- If the user gave a complete brief, restate it in one paragraph and proceed.
- Otherwise draft one with `SKILL/assets/video-brief.template.md` and confirm
  the fill-ins (topic, audience, platform, duration, palette, CTA) before
  authoring. Do not invent brand claims, quotes or statistics.

Decide and record:

1. Blueprint: `hello | promo | vertical | ppt | data | storyboard`
   (SKILL/references/video-blueprints.md).
2. Duration, aspect ratio, fps (30 for social/web; `'30000/1001'` for
   broadcast-style masters).
3. Palette (one accent + ink + muted), typography, logo asset availability.
4. Caption/audio plan (captions? music? sfx? voiceover?).
5. Output target (which delivery profile — informs safe areas now).

Checkpoint: the user-visible plan is one short paragraph plus the five
decisions. Continue autonomously when the user pre-approved the brief.

## Step 2 — Scaffold（脚手架）

```bash
node SKILL/scripts/new-video.mjs --dir videos/my-video --blueprint promo --title "My Video"
node SKILL/scripts/check-project.mjs videos/my-video
```

- The scaffold is deterministic and refuses to overwrite without `--force`.
- Prefer a directory under the user's chosen location; never scaffold inside
  `packages/`, `specification/`, `.sdkwork/`.
- Validate passes out of the box; if it does not, the scaffold or the runtime
  is broken — fix that before authoring.

## Step 3 — Author（编写）

Work in this order (each layer is independently verifiable):

1. **Scenes first**: replace blueprint scene HTML/CSS with real content.
   Keep scenes self-contained (absolute positioning, scene-scoped `<style>`).
2. **Timeline structure**: adjust scene durations and clip windows; keep
   transition overlaps (0.4–0.6s) real — a transition between non-overlapping
   clips is dropped with a warning.
3. **Audio lanes**: place music/sfx/voice clips on `type="audio"` lanes with
   `volume`/`fade-in`/`fade-out`; ducking needs a named sidechain lane.
4. **Captions**: write cues into the caption lane; respect safe areas
   (`bottom` insets per blueprint).
5. **Generations**: blueprint tasks are `procedural` (offline, deterministic).
   Keep them until real assets exist; swap providers per the generate skill.
6. **Outputs**: set the default `<output>` path under `renders/`.

Authoring-mode notes:

- Declarative `.vhtml`: edit the file directly; re-validate after each pass.
- SDK `video.ts`: edit the TS source, then `pnpm exec vhtml build <dir>`;
  the `.vhtml` is build output — never hand-edit it.
- Program document: edit the program/data blocks; a freeze (`vhtml build`)
  strips the program, so keep the unfrozen source in version control.

Checkpoint: every scene renders the intended content at its start frame.

## Step 4 — Validate（校验）

```bash
node SKILL/scripts/check-project.mjs <dir>            # validate + assets verify
pnpm exec vhtml validate <dir> --json                 # machine-readable diagnostics
pnpm exec vhtml inspect <dir>                         # resolved model summary
```

Fix every error; review every warning (`TIME_OUT_OF_SOURCE`, dropped
transitions, unused/missing assets are the common ones). Warnings are not
optional to read — they predict export-time surprises.

## Step 5 — Spot-render and preview（预览）

```bash
pnpm exec vhtml render <dir> --frame 0  --out tmp/f0.png
pnpm exec vhtml render <dir> --time 2.5s --out tmp/f2.5s.png
pnpm exec vhtml render <dir> --time 4.9s --out tmp/last.png    # near-end frame (--frame takes an integer index only)
pnpm exec vhtml preview <dir> --open
```

- Check first frame, a middle frame of each scene, and the last frame:
  text cut off, missing fonts, wrong stacking (lane `order`), transitions
  colliding with keyframe entrances.
- In the Studio: `E` enters element editing; drag/scale commits `clip.set`;
  save writes the `.vhtml` back. Program documents are frozen on save.

Checkpoint: user-approvable preview; iterate Steps 3–5 on feedback.

## Step 6 — Hand off（移交）

- AI assets to produce/upsert → `sdkwork-vhtml-video`.
- Rearrangement/cutting/retiming from feedback → `sdkwork-vhtml-video`.
- Final renders, multi-platform delivery, reports → `sdkwork-vhtml-video`
  (it owns `vhtml export`, delivery profiles and verification).

Report: project path, blueprint used, duration/shape, validation status,
remaining warnings, and the exact next command (usually an export or a
generate run).
