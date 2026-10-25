# VHTML Delivery Profiles

**Status**: additive VHTML 1.1 profile  
**Implementation**: `@sdkwork/vhtml-core/presets`, `vhtml export --delivery`

A delivery profile maps one authored timeline to a channel-specific output. It
never changes the timeline, composition or scene HTML; it derives an
`OutputConfig` and encoding parameters.

## Profile contract

Every profile declares:

| Field | Meaning |
|---|---|
| `id` | Stable profile identifier |
| `format` | `mp4`, `webm`, `gif`, `png-sequence`, `wav`, `mp3` |
| `width` / `height` | Delivery pixel dimensions; even for yuv420p |
| `frameRate` | Exact rational delivery rate |
| `aspectRatio` | Informational ratio, e.g. `16:9`, `9:16`, `2.39:1` |
| `fit` | `cover` (crop), `contain` (letterbox/pillarbox) or `stretch` |
| `safeArea` | Platform-UI insets as percentages of width/height |
| `videoBitrate` / `audioBitrate` / `crf` | Suggested encoder targets |
| `maxDurationSeconds` | Optional channel limit |
| `platforms` | Stable channel tags |

The profile is written into `output.metadata`:

```json
{
  "deliveryPreset": "tiktok",
  "deliveryLabel": "TikTok",
  "aspectRatio": "9:16",
  "safeArea": "{\"top\":8,\"right\":12,\"bottom\":18,\"left\":6}",
  "platforms": "tiktok"
}
```

## Fit semantics

Changing delivery aspect ratio MUST NOT silently stretch the composition.

- `cover`: scale until the frame fills the output, then center-crop.
- `contain`: scale until the frame fits, then pad with `output.background`.
- `stretch`: explicit non-uniform scaling, retained for backward compatibility.

`<output fit="...">` is the document-level form. `outputForDelivery()` sets it
for generated profiles; `vhtml export --delivery` derives it per invocation.

## Built-in profiles

| ID | Size | Ratio | Fit |
|---|---|---|---|
| `web-1080p` | 1920×1080 | 16:9 | contain |
| `web-720p` | 1280×720 | 16:9 | contain |
| `youtube-4k` | 3840×2160 | 16:9 | contain |
| `vertical-1080p` | 1080×1920 | 9:16 | cover |
| `tiktok` | 1080×1920 | 9:16 | cover |
| `reels` | 1080×1920 | 9:16 | cover |
| `shorts` | 1080×1920 | 9:16 | cover |
| `square-1080p` | 1080×1080 | 1:1 | cover |
| `portrait-1080p` | 1080×1350 | 4:5 | cover |
| `cinema-4k` | 3840×1608 | 2.39:1 | contain |
| `gif-preview` | 640×360 | 16:9 | contain |
| `podcast-audio` | audio-only WAV | — | contain |

## Safe areas

Safe areas are metadata for composition guidance, not automatic cropping. A
template SHOULD keep titles inside the safe area; renderers MUST NOT move
authored HTML automatically. This keeps output deterministic and avoids
surprising reflow.

## CLI

```bash
vhtml export film.vhtml --delivery tiktok --out film-tiktok.mp4
vhtml export film.vhtml --delivery youtube-4k --out film-4k.mp4
vhtml export film.vhtml --delivery podcast-audio --out episode.wav
vhtml capabilities --json   # includes deliveryPresets
```

Explicit `--format`, `--width`, `--height`, `--fps`, `--crf` and bitrate flags
override the profile for that export.

## Versioning

Profile IDs are stable. Adding fields is backward compatible. Removing or
changing an existing profile's dimensions/fit requires a new profile ID; do not
silently redefine a published ID.

## Conformance

1. Every profile has a unique ID and even dimensions for yuv420p.
2. `outputForDelivery` preserves timeline, range, captions and background.
3. `cover`/`contain` filters produce the requested dimensions without stretching.
4. Unknown `fit` values are rejected by parser/validator.
5. `vhtml capabilities --json` lists every built-in profile.
