# Workflow: Deliver a Video（交付工作流）

From validated project to verified files on every target channel.

## Step 1 — Pre-flight

```bash
vhtml validate <project> --json
node .sdkwork/skills/sdkwork-vhtml-video/scripts/check-project.mjs <project>
```

- Any validation error: stop, hand back to the create/edit skill.
- Unmaterialised `gen:` tasks: run the generate skill (preferred — you keep
  review control) or add `--generate` to the export commands below.

## Step 2 — Decide the delivery matrix

| If the project is… | Master | Variants |
|---|---|---|
| Landscape 16:9 authored | `web-1080p` | `youtube-4k` (premium), `square-1080p`/`portrait-1080p` (feed crops), `gif-preview` (loop), `podcast-audio` (audio) |
| Native 9:16 authored | `vertical-1080p` | `tiktok`, `reels`, `shorts` (identical geometry; export per platform for metadata tags) |
| Cinema 2.39:1 intent | `cinema-4k` | `web-1080p` (contain letterbox) |
| Deck/PPT 1920×1080 | `web-1080p` | `web-720p` (light embeds) |

Confirm the matrix with the user when paid encodes or publishing is implied.
Loudness: `-14` LUFS for social/streaming, `-23` for broadcast-style masters.

## Step 3 — Export master + variants

```bash
vhtml export <project> --delivery web-1080p --out renders/master.mp4 \
  --report renders/master.report.json --captions renders/master.vtt --loudness -14

vhtml export <project> --delivery tiktok --out renders/tiktok.mp4 --report renders/tiktok.report.json
vhtml export <project> --delivery reels --out renders/reels.mp4
vhtml export <project> --delivery square-1080p --out renders/square.mp4
```

Long renders: run in the background and poll; keep `--quiet` off only when a
human watches progress. One command per variant — the timeline is never
mutated.

## Step 4 — QC every file

```bash
node .sdkwork/skills/sdkwork-vhtml-video/scripts/verify-export.mjs renders/master.mp4
node .sdkwork/skills/sdkwork-vhtml-video/scripts/verify-export.mjs renders/tiktok.mp4 --expect 1080x1920
```

Checks: container/stream present, expected dimensions (when given), frame
count > 0, and frame hashes prove motion (not a frozen/black still). For
audio deliverables, listen to a sample or probe with ffprobe; `vhtml audio`
gives the raw mix for audition.

Spot-check content at boundaries: render reference frames from the project
(`vhtml render <project> --time <t> --out tmp/t.png`) and compare against a
frame grab of the export (`ffmpeg -i out.mp4 -ss <t> -frames:v 1 grab.png`)
when fidelity matters.

## Step 5 — Package and archive (optional)

```bash
vhtml pack <project> --out <project>.vhtmlpkg     # portable ZIP + manifests + hashes
vhtml unpack <project>.vhtmlpkg --out restored --force
```

## Step 6 — Report

Report per file: path, size, duration, profile id, QC verdict. Include:

- report JSON paths (audit bundle: SHA-256, probe, provenance, consents,
  AI disclosure) — required for commercial delivery;
- caption sidecar paths;
- anything skipped (e.g. a variant the user declined) and why;
- known placeholder status if `procedural` generation stands in for real AI
  media.

Failure handling: `vhtml export` exit 1 → read diagnostics
(`--json` for machine format); do NOT report success from a partial run.
Disk/time estimates come from the first variant — report them before running
the rest.
