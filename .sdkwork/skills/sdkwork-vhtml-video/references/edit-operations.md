# Edit Operations Reference（编辑操作参考）

Normative source: `specification/editing.md`. This reference mirrors the
implemented union in `packages/core/src/edits.ts` (superset of the spec's §1
list). All time values accept rationals and the canonical strings `'1.5s'`,
`'500ms'`, `'90f'`, `'00:00:01.500'`, SMPTE `'00:00:12:15'`. Numbers in the
JSON ops are seconds.

> **Footgun**: the `vhtml edit` CLI reads `operations`/`ops` arrays. A **bare
> single-op object** in the ops file is silently treated as an EMPTY list —
> exit 0, "(0 object(s))", nothing written. Always write an array
> (`[{ "op": … }, …]`); `apply-edits.mjs` normalizes bare objects and warns
> on zero-change runs, so prefer it over calling `vhtml edit` directly.

## Operation catalog (implemented)

### Project / composition / timeline

| op | fields | notes |
|---|---|---|
| `project.set` | props | project-level metadata |
| `composition.set` | `composition` | width/height/fps/duration/background/seed patch |
| `timeline.set` | `timelineId`, `name?`, `duration?` | resize a timeline |
| `track.add` | `timelineId`, `track { id?, type, order?… }` | type: `video/overlay/audio/caption/data` |
| `track.remove` | `trackId` | |
| `track.set` | `trackId`, props | enable/mute/order/volume/pan… |

### Clips — placement

| op | fields | notes |
|---|---|---|
| `clip.add` | `trackId`, `clip` | full Clip object |
| `timeline.insert` | `laneId`, `clip`, `at?` | insert, pushes neighbours later |
| `timeline.overwrite` | `laneId`, `clip`, `at?` | drops overlapping material |
| `clip.move` | `clipId`, `start?`, `trackId?` | cross-lane moves allowed |
| `clip.remove` | `clipId` | leaves a gap |
| `clip.rippleDelete` | `clipId` | closes the gap |
| `clip.trim` | `clipId`, `start?`/`end?`/`duration?` | project-time trim |
| `clip.split` | `clipId`, `at`, `id?` | animations & remap curves split at the cut |
| `clip.splitMulti` | `clipId`, `times[]`, `ids?` | beat cutting: N cut times → N+1 clips |
| `clip.duplicate` | `clipId`, `id?`, `start?` | default start = after original |
| `timeline.moveBatch` | `clipIds[]`, `start` | move a selection together |
| `timeline.copy` / `timeline.cut` | `clipIds[]` | internal clipboard |
| `timeline.paste` | clipboard target | see edits.ts for target fields |
| `clip.link` / `clip.unlink` | `clipIds[]` / `clipId` | A/V grouping |

### Clips — source window and time

Invariant for media clips: `out = in + duration × speed`; never `in < 0` or
`out > asset.duration`. Setting `in` alone is a Slip, not a Trim.

| op | fields | notes |
|---|---|---|
| `clip.slip` | `clipId`, `delta` | shift source window, project time fixed |
| `clip.slide` | `clipId`, `delta` | move both, neighbours absorb |
| `clip.roll` | `clipId`, `edge: start\|end`, `delta` | move one edge, neighbours adjust |
| `clip.speed` | `clipId`, `speed` | clears time-remap (warning) |
| `clip.freeze` | `clipId`, `sourceTime?`, `at?` | still frame insert |
| `clip.timeremap` | `clipId`, `keyframes [{at, source, easing?}]`, `easing?` | speed ramps; mutually exclusive with freeze; explicit `duration` required for media |
| `clip.timeremap.clear` | `clipId` | |
| `clip.replace` | `clipId`, `ref`, `keepTiming?: 'in-out'\|'project'` | swap source, keep timing; incompatible kind → `REFERENCE_INCOMPATIBLE` |
| `clip.detachAudio` | `clipId`, `laneId?` | mutes video, audio copy on an audio lane (metadata `detachedFrom`/`audioDetachedTo`) |

### Presentation (clip.set)

`clip.set { clipId, props }` accepts **presentation props only**:
`opacity`, `blend`, `transform`, `crop`, `fit`, `effects`, `animations`,
`audioEffects`, `volume`, `pan`, `fadeIn`, `fadeOut`, `enabled`, `z`,
`name`, `className`, `ref` (re-validated), caption `text/speaker/style`,
data `value`, scene `loop`, media `muted`, `audioOffset` (null clears).
Timing props are rejected — use move/trim/speed/freeze above.

### Scenes, assets, transitions, animations, effects, markers

| op | fields |
|---|---|
| `scene.set` | `sceneId`, `{ html?, css?, scripts?, name?, background?, src? }` — authored content only; does not create/delete scenes |
| `asset.add` / `asset.set` / `asset.remove` | `asset` / `assetId` + props |
| `transition.add` | `trackId`, `transition { fromClipId, toClipId, type, duration, direction?, easing? }` — clips must overlap ≥ duration |
| `transition.remove` | `transitionId` |
| `animation.add` / `animation.remove` | `animation`, `clipId?` |
| `effect.add` / `effect.remove` | `clipId`, `effect`, `audio?` (audio effects: `ducking`, `sidechain-track`…) |
| `marker.add` / `marker.remove` | `timelineId`, `marker { time, name, type? }` |

### Structure

| op | fields | notes |
|---|---|---|
| `timeline.nest` | `clipIds[]`, `timelineId?`, `clipId?`, `removeSource?` | selection → compound clip; cycles fail up front |
| `timeline.unnest` | `clipId` | requires 1× forward, no freeze/remap/loop |
| `timeline.rippleCut` | `trackIds[]`, `start`, `end` | removes `[start,end)` on the lanes and closes gaps — the core text-based-edit primitive |
| `storyboard.apply` | `shotIds?`, `laneId?`, `at?: Time\|'append'`, `gap?`, `clipIdPrefix?` | shots → clips; overlaps warn-and-skip |
| `storyboard.add/set/remove/move/reorder` | see `specification/storyboard.md` | planning layer; never touches timeline timing |
| `batch` | `operations[]` | ordered sub-list |

## Failure semantics (must-know)

- An op either fully applies or returns `ok:false` with structured
  diagnostics — no partial writes. `strict:true` throws `VhtmlError`.
- Operations run in order; the default batch stops at the first error.
- Re-validate after editing; invalid edits must not reach the file (the CLI
  enforces this).
- Timeline and composition duration auto-extend on edits that run past the
  end.
- Transition reconciliation after every edit: dangling transitions are
  removed, `duration` clamps to the new overlap, zero overlap deletes with a
  warning.

## Split-time animation rules (why cut frames look right)

At local cut time `c`: fully-left/fully-right keyframes stay put; a keyframe
spanning `c` is evaluated at `c`, the left half gets a boundary keyframe with
`fill=forwards`, the right half gets one at local 0 with `fill=both`,
`iterations=1`. Multi-iteration/reverse animations copy approximately.

## Worked examples

Remove a mistake between 12.4s and 13.8s everywhere visual:

```json
[{ "op": "timeline.rippleCut", "trackIds": ["story", "overlay"], "start": "12.4s", "end": "13.8s" }]
```

Beat-cut one clip into three and keep the middle:

```json
[
  { "op": "clip.splitMulti", "clipId": "take-1", "times": ["2s", "5s"], "ids": ["take-1a", "take-1b", "take-1c"] },
  { "op": "clip.rippleDelete", "clipId": "take-1b" }
]
```

Slow-motion the hero shot, then swap its source keeping timing:

```json
[
  { "op": "clip.speed", "clipId": "hero", "speed": 0.5 },
  { "op": "clip.replace", "clipId": "hero", "ref": "asset:take2", "keepTiming": "in-out" }
]
```

Speed ramp via remap (fast first second, slow drift after), then detach the
original voice for a dub workflow:

```json
[
  { "op": "clip.timeremap", "clipId": "shot-1", "keyframes": [
      { "at": "0s", "source": "0s" },
      { "at": "1s", "source": "1.5s", "easing": "ease-in-out" },
      { "at": "3s", "source": "2.25s" } ] },
  { "op": "clip.detachAudio", "clipId": "shot-1", "laneId": "vo" }
]
```

Caption a clip and style it:

```json
[
  { "op": "clip.set", "clipId": "cue-1", "props": { "text": "Corrected line.", "speaker": "host" } }
]
```

Storyboard to timeline (append all approved shots, 0.2s gaps):

```json
[{ "op": "storyboard.apply", "laneId": "story", "at": "append", "gap": "0.2s" }]
```
