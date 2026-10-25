# Delivery Profiles Reference（交付配置参考）

Normative source: `specification/delivery-profiles.md` (contract, fit
semantics, versioning) and `specification/commercial.md` (reports, audits).
List live with `vhtml capabilities --json` → `deliveryPresets`.

## Built-in profiles

| ID | Size | Ratio | Fit | Typical use |
|---|---|---|---|---|
| `web-1080p` | 1920×1080 | 16:9 | contain | web/site master |
| `web-720p` | 1280×720 | 16:9 | contain | lightweight embeds |
| `youtube-4k` | 3840×2160 | 16:9 | contain | YouTube UHD |
| `vertical-1080p` | 1080×1920 | 9:16 | cover | generic vertical |
| `tiktok` | 1080×1920 | 9:16 | cover | TikTok |
| `reels` | 1080×1920 | 9:16 | cover | Instagram Reels |
| `shorts` | 1080×1920 | 9:16 | cover | YouTube Shorts |
| `square-1080p` | 1080×1080 | 1:1 | cover | feed squares |
| `portrait-1080p` | 1080×1350 | 4:5 | cover | Instagram feed portrait |
| `cinema-4k` | 3840×1608 | 2.39:1 | contain | cinematic master |
| `gif-preview` | 640×360 | 16:9 | contain | loop previews |
| `podcast-audio` | audio-only WAV | — | contain | podcast/loudness-normalized audio |

Each profile also carries suggested `videoBitrate`/`audioBitrate`/`crf`,
optional `maxDurationSeconds`, platform tags, and a 9:16/1:1/4:5 `safeArea`
(written into `output.metadata` as `deliveryPreset`, `deliveryLabel`,
`aspectRatio`, `safeArea`, `platforms`).

## Fit semantics

Changing delivery aspect ratio must never stretch the composition:

- `cover` — scale until the frame fills the output, then center-crop.
- `contain` — scale until it fits, pad with `output.background`
  (letterbox/pillarbox).
- `stretch` — explicit non-uniform scaling (legacy; avoid).

Safe areas are composition guidance metadata, not automatic cropping —
renderers never move authored HTML. 9:16 templates should keep titles inside
the insets (top 8% / right 12% / bottom 18% / left 6%).

## Command surface

```bash
# profile-driven
vhtml export <project> --delivery tiktok --out renders/tiktok.mp4

# master with report + sidecar + loudness target
vhtml export <project> --out renders/master.mp4 \
  --report renders/master.report.json --captions renders/master.vtt --loudness -14

# overrides (per invocation, timeline untouched)
vhtml export <project> --delivery web-1080p --fps 60/1 --crf 18 --out renders/master60.mp4
vhtml export <project> --out cut.mp4 --range 2s+3s --fps 60/1 --captions out/cut.vtt

# generation on the way (or materialise first with the generate skill)
vhtml export <project> --out renders/final.mp4 --generate --force

# audio-only
vhtml export <project> --delivery podcast-audio --out renders/episode.wav
vhtml audio <project> --out renders/mix.wav      # mix preview without encoding video
```

Exit codes: `0` success, `1` validation/runtime failure, `2` usage error.
`--json` output is stable for agents/CI.

## Range syntax

`--range <start>+<duration>` (e.g. `2s+3s`, `00:00:05:00+00:00:02:00`). Frame
rate override re-derives the frame budget exactly (`ceil(duration × fps)`).

## Export report (`vhtml.export-report/1`)

Emitted by `--report <file>.json`; contains: final file SHA-256, ffprobe
stream summary, issues, generation provenance (provider/model/seed/prompt
hash/output hash), licenses, consents and AI-disclosure flags — the audit
bundle for commercial delivery. Keep it next to the deliverable.

## Versioning rule

Profile IDs are stable; adding fields is backward compatible. Changing an
existing profile's dimensions/fit requires a NEW id — never redefine a
published id.
