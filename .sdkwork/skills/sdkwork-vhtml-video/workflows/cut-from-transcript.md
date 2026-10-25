# Workflow: Text-Based Editing from a Transcript（文本化剪辑工作流）

The flagship agent editing loop: turn "remove the filler words and long
pauses" into a set of exact cut operations, then auto-caption the result.

Two entry points:

- **External transcript with timestamps** (user-supplied or an STT tool):
  drive everything from the transcript data and author the cue lane directly
  (see Step 2). This is the primary path today.
- **A materialised `transcribe` generation task**: `vhtml captions
  --from-gen` reads its cue asset directly. Caveat (verified): the CLI's
  built-in providers (procedural/manifest/http) do NOT list kind `transcribe`
  yet — materialising one requires a custom provider registered through the
  SDK (`@sdkwork/vhtml-generation`); otherwise generation fails with
  `GENERATION_CAPABILITY_MISSING`. The contract itself is normative
  (generation.md §1.1, vendor annex) — check `vhtml providers --json` before
  relying on it.

## Step 1 — Read the timeline

```bash
vhtml validate <project> --json
vhtml inspect <project> --json
```

Note: the audio/video clip ids that carry speech, their lanes, and the
timeline duration. If speech lives on several clips, decide per-clip cuts
(the ripple ops take lane lists, so group lanes accordingly).

## Step 2 — Get cues

With a materialised transcribe task (custom provider, see above):

```bash
vhtml captions <project> --from-gen transcribe-vo --lane captions   # cue lane in one step
```

Its cue file (asset `src`, usually under `generated/`) is JSON cue rows,
SRT or WebVTT — all parse the same way downstream. Word-level timestamps and
diarization (speaker) become cue boundaries and `cue.speaker`.

With an external transcript (the common path): normalise it to rows
`[{ start, end, text, speaker? }]` (seconds) and write the caption lane into
the document — hand-authored `<cue>` elements for small scripts, or a
program document using `vhtml.parseCaptions(vhtml.data.get('script'))` for
SRT/WebVTT text, or SDK `parseSubtitleBlocks` + `addCue`. Validate with
`vhtml validate` after writing.

## Step 3 — Decide cuts

From the cues, select the regions to delete:

- Filler words ("um", "uh"), retakes, long silences (gap > ~0.6s),
  off-script asides the user marked.
- Keep ranges = complement of deleted ranges within the spoken clip(s).
- Pad each deletion by ~40–80ms on both sides to avoid clipped phonemes;
  never let padding overlap a keep range.
- Frame-align if requested: quantise boundaries to 1/fps
  (`00:00:12:15` timecodes).

Present the plan (deleted ranges with their text) when the removal is
substantial or ambiguous — this is a destructive operation and the ranges are
the user's call. Proceed unattended only when the request enumerated the
ranges explicitly.

## Step 4 — Emit operations

For one spoken clip, `clip.splitMulti` + `rippleDelete` the bad children:

```json
[
  { "op": "clip.splitMulti", "clipId": "vo", "times": ["12.34s", "13.02s", "41.1s", "44.9s"] },
  { "op": "clip.rippleDelete", "clipId": "vo-3" },
  { "op": "clip.rippleDelete", "clipId": "vo-5" }
]
```

For cuts spanning several lanes at once:

```json
[{ "op": "timeline.rippleCut", "trackIds": ["story", "overlay", "music"], "start": "12.34s", "end": "13.02s" }]
```

Notes:

- `timeline.rippleCut` closes gaps on each listed lane; a music bed usually
  should NOT be cut (omit its lane) — let it ride under the speech.
- Captions: regenerate the cue lane after cutting
  (`vhtml captions --from-gen … --lane captions` overwrites/creates cues from
  the same transcript), or shift cues yourself with `clip.move` ops. Do not
  leave cues pointing at deleted ranges.
- Split ids default to derived unique ids; pass `ids` when you want stable
  names for the follow-up ripple deletes.

## Step 5 — Apply with the guardrail script

```bash
node .sdkwork/skills/sdkwork-vhtml-video/scripts/apply-edits.mjs <project> --ops cuts.json --dry-run
node .sdkwork/skills/sdkwork-vhtml-video/scripts/apply-edits.mjs <project> --ops cuts.json
```

The script lints the ops, backs up the entry `.vhtml`, applies via
`vhtml edit`, and re-validates. Failures report diagnostics without writing.

## Step 6 — Verify sound and picture

```bash
vhtml validate <project> --json
vhtml render <project> --time 12.2s --out tmp/before-cut.png    # boundary checks
vhtml export <project> --range <kept-sample> --out tmp/check.mp4  # audio audition
vhtml audio <project> --out tmp/mix.wav                          # full mix check
```

Listen/check the first words at each joint (clipped phonemes → widen the pad).
Then hand off to the export skill for delivery.

## Multi-language variant

1. `translation` task: script → target language.
2. `speech`/`dub` task per language (declare `rights.voiceCloning` consent).
3. New audio lane per language; align with `audio-offset`
   (`clip.set { props: { audioOffset: '80ms' } }`).
4. Per-language caption lanes from the translated cues.
5. Export language variants with the export skill (`--delivery`, `--range`).
