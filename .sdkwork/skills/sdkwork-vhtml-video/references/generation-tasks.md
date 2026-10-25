# Generation Tasks Reference（生成任务参考）

Normative source: `specification/generation.md` (task model §1, direction §2,
inputs §3, providers §4, rights §5, cache §6, HTTP protocol §4.2, vendor
annex §12). Copy-ready recipes below are verified against the reference
implementation.

## Task anatomy (document form)

```xml
<generations>
  <generate id="shot-1" kind="video" provider="http" model="video-1">
    <prompt>slow push in on the product, golden hour</prompt>
    <negativePrompt>text, watermark, distorted hands</negativePrompt>
    <gen-input ref="gen:cover" role="first-frame"></gen-input>
    <gen-input ref="style-bible" role="style"></gen-input>
    <direction>{"shot":{"camera":"slow push in"},"video":{"loop":false}}</direction>
    <constraints duration="4s" width="1280" height="720" frame-rate="30" seed="11"></constraints>
    <params runway.watermark="false"></params>
    <rights license="CC-BY" commercialUse="true" aiDisclosure="true"></rights>
    <review status="pending"></review>
  </generate>
</generations>
```

Program/SDK form (`vhtml.addGeneration` / SDK `generations: [...]`):

```js
vhtml.addGeneration({
  id: 'shot-1', kind: 'video', provider: 'http', model: 'video-1',
  prompt: 'slow push in on the product, golden hour',
  negativePrompt: 'text, watermark',
  inputs: [{ ref: 'gen:cover', role: 'first-frame' }, { ref: 'style-bible', role: 'style' }],
  direction: { shot: { camera: 'slow push in' }, video: { loop: false } },
  constraints: { duration: '4s', width: 1280, height: 720, frameRate: '30/1', seed: 11 },
  params: { 'runway.watermark': false },
  rights: { commercialUse: true, aiDisclosure: true },
});
```

### The three intent buckets

| bucket | holds | rule |
|---|---|---|
| `constraints` | verifiable hard limits: `duration`, `width`, `height`, `aspectRatio`, `frameRate`, `resolution` (480p…4k; exact w/h wins when both), `sampleRate`, `channels`, `language`, `seed`, `steps`, `guidance` | vendor-neutral |
| `direction` | portable creative intent (below) | vendor-neutral; unknown namespaces preserved |
| `params` | provider-private knobs | MUST be namespaced `<vendor>.<param>` (stored lowercase; adapters strip the prefix case-insensitively) |

## Direction schema (portable creative intent)

| block | key fields | typical use |
|---|---|---|
| `shot` | `framing` (wide/medium/close-up), `camera`, `angle`, `lens`, `lighting`, `mood`, `setting`, `action`, `continuity` | storyboards, video, image |
| `image` | `style`, `composition`, `background`, `transparent`, `referenceStrength`, `mask`, `control` | image, storyboard, matte |
| `video` | `firstFrame`, `lastFrame`, `referenceVideo`, `camera`, `motion`, `motionStrength` (0..1), `cameraMove` (none/push-in/pull-out/zoom/pan/tilt/orbit/crane/handheld/follow), `withAudio`, `loop`, `lipSync` | video, avatar, lipsync |
| `speech` | `language` (required for speech), `voice`, `accent`, `emotion`, `pace`, `rate` (numeric), `pitch`, `style`, `speaker`, `pronunciation`, `consent` | speech, dub, avatar |
| `music` | `genre`, `mood`, `bpm`, `key`, `timeSignature`, `instruments[]`, `structure[]`, `vocals` (declare!), `lyrics`, `stems`, `loop` | music |
| `sfx` | `category`, `environment`, `intensity`, `loop` | sfx |
| `edit` | `operation`, `strength`, `preserve`, `mask` | edit, remix |

Cross-vendor normalization: `motionStrength` is 0..1 (Pika's 0–4 and Vidu's
amplitude scale map in the vendor catalog); `cameraMove` is the controlled
vocabulary above (Seedance `camerafixed=true` → `none`); `withAudio` covers
Sora/Veo/Wan/Kling/Pika native-audio flags.

## Input roles

`reference-image`, `style`, `character`, `subject`, `portrait`, `first-frame`,
`last-frame`, `keyframe` (multi-keyframe sequences, order = declaration
order), `mask`, `reference-video`, `video`, `reference-audio`, `voice`,
`music`, `script`, `translation`, `control`.

Dependency rules: `ref="gen:<task-id>"` (or bare task id) creates a
dependency edge; materialisation is topological; cycles fail BEFORE any
provider call (`GENERATION_DEPENDENCY_CYCLE`); `--task <id>` auto-includes
dependencies; upstream output hashes join the downstream cache key.

## Kinds and outputs

`image, storyboard, video, avatar, lipsync, speech, dub, music, sfx, audio,
matte, edit, translation, text, transcribe`. Kind → default asset type:
image-kind → `image`, video-kind → `video`, audio-kind → `audio`,
text-kind → `data`. Outputs: `gen:<taskId>` (or `gen:<taskId>:<index>` for
multi-output like music stems with roles `music/drums/bass/vocals`).

## Providers

| id | behavior | use |
|---|---|---|
| `procedural` | offline, deterministic SVG images, gradient video, synthesized music/audio/sfx, text | iteration, tests, placeholder-quality stand-ins |
| `manifest` | task id → pre-generated files (`{ "score": [{ "file": "./external/score.wav", "role": "music" }, …] }`) | human/MCP/external-tool pregeneration; multi-file stems |
| `http` | vendor-neutral `POST <endpoint>/generate`, sync `{outputs[]}` or async `{jobId, statusUrl}` | real AI services; respects AbortSignal |

HTTP request/response JSON Schemas:
`packages/schema/schemas/vhtml-1.1/provider-request.schema.json` and
`provider-response.schema.json`. Providers must declare unsupported
kind/role as `GENERATION_CAPABILITY_MISSING` — no silent degradation.
Discover with `vhtml providers --json`, `vhtml capabilities --json`,
`vhtml providers --known` (vendor mapping catalog).

## Rights, review, safety (mandatory posture)

- `rights`: `license`, `consent` (document ref), `likeness`, `voiceCloning`,
  `commercialUse`, `aiDisclosure`. Real-person likeness or cloned voice
  without `consent` must be refused or flagged.
- `review`: `pending/approved/rejected/changes-requested` — gate delivery on
  approval; technical materialisation is not blocked by `pending`.
- `safety`: `{ rating, policy, moderated, notes }` — recorded, not enforced.
- Provenance (provider/model/promptHash/seed/outputHash) is recorded per
  generated asset and lands in the export report.

## Cache

`.vhtml/cache/generated.json`, keyed by task definition + provider/model +
constraints + params + direction + rights + input content hashes + runtime
version. Cache hits never call the provider; `--force` bypasses. Changing any
key component (including an upstream output hash) invalidates downstream
entries.

## Error codes

`GENERATION_TASK_NOT_FOUND`, `GENERATION_PROVIDER_NOT_FOUND`,
`GENERATION_PROVIDER_ERROR`, `GENERATION_CAPABILITY_MISSING`,
`GENERATION_DEPENDENCY_CYCLE`, `GENERATION_TIMEOUT`,
`GENERATION_CANCELLED`, `GENERATION_INVALID_OUTPUT`.

## Copy-ready recipes

### Text → video (single shot)

```xml
<generate id="hero" kind="video" provider="http" model="video-1">
  <prompt>cinematic product reveal, studio lighting, slow push in</prompt>
  <constraints duration="5s" width="1920" height="1080" frame-rate="30" seed="42"></constraints>
  <direction>{"shot":{"camera":"slow push in","lighting":"studio"},"video":{"withAudio":true}}</direction>
  <rights commercialUse="true" aiDisclosure="true"></rights>
</generate>
```

### Image → video (first-frame chain)

```xml
<generate id="cover" kind="image" provider="procedural">
  <prompt>cover art</prompt>
  <constraints width="1280" height="720"></constraints>
</generate>
<generate id="shot" kind="video" provider="http" model="video-1">
  <prompt>bring the cover to life</prompt>
  <gen-input ref="gen:cover" role="first-frame"></gen-input>
  <constraints duration="4s" width="1280" height="720"></constraints>
</generate>
```

### Narration + music + sfx mix

```xml
<generate id="vo" kind="speech" provider="http" model="tts-1">
  <prompt>Read the script warmly, measured pace.</prompt>
  <direction>{"speech":{"language":"zh-CN","voice":"warm-female-01","emotion":"calm","rate":1.0}}</direction>
  <constraints language="zh-CN" sample-rate="48000"></constraints>
</generate>
<generate id="score" kind="music" provider="procedural">
  <prompt>minimal uplifting underscore</prompt>
  <direction>{"music":{"bpm":96,"mood":"uplifting","vocals":"none","stems":true}}</direction>
  <constraints duration="8s" sample-rate="48000"></constraints>
</generate>
<generate id="whoosh" kind="sfx" provider="procedural">
  <prompt>soft transition whoosh</prompt>
  <direction>{"sfx":{"category":"whoosh","environment":"studio","intensity":"medium","loop":false}}</direction>
  <constraints duration="0.6s" sample-rate="48000"></constraints>
</generate>
```

Wire: `gen:vo` + `gen:score` + `gen:whoosh` onto audio lanes; duck the music
under the voice with an `audio-effect type="ducking" sidechain-track="vo"`.
Mixing/fades/loudness belong to the media layer (export skill), not the
tasks.

### Avatar / lipsync / dub (consent required)

```xml
<generate id="presenter" kind="avatar" provider="http">
  <prompt>friendly product host</prompt>
  <gen-input ref="host-portrait" role="portrait"></gen-input>
  <gen-input ref="gen:vo" role="voice"></gen-input>
  <rights likeness="consented" consent="consent-doc-123" voiceCloning="consented" commercialUse="true" aiDisclosure="true"></rights>
</generate>
<generate id="aligned" kind="lipsync" provider="http">
  <prompt>align mouth to narration</prompt>
  <gen-input ref="gen:presenter" role="video"></gen-input>
  <gen-input ref="gen:vo" role="voice"></gen-input>
</generate>
<generate id="dub-en" kind="dub" provider="http">
  <prompt>English dub of the narration</prompt>
  <gen-input ref="gen:vo" role="voice"></gen-input>
  <constraints language="en-US"></constraints>
</generate>
```

### Transcribe → captions / text-based editing

```xml
<generate id="transcribe-vo" kind="transcribe" provider="manifest">
  <prompt>word-level timestamps, diarize speakers</prompt>
  <gen-input ref="gen:vo" role="voice"></gen-input>
  <constraints language="zh-CN"></constraints>
</generate>
```

Materialise, then `vhtml captions <project> --from-gen transcribe-vo --lane
captions` writes the cue lane; the cue file feeds the edit skill's
cut-from-transcript workflow (`timeline.rippleCut`).

### Multi-language variant

`translation` (script → target) → `speech`/`dub` per language → caption lane
per language; one timeline, per-language exports.

### Vendor parameter namespaces (examples)

`runway.watermark`, `kling.mode`, `kling.cfgScale`, `luma.camera.intensity`,
`pika.modifyRegion`, `hailuo.promptOptimizer`, `veo.personGeneration`,
`sora remix`→`edit.operation="remix"`, `wan.promptExtend`, `vidu.bg`,
`pixverse.ci`, `elevenlabs.stability`, `flux.promptUpsampling`,
`openai-image.quality`, `midjourney.stylize`, `qwen-image.watermark`,
`musicgen.temperature`, `stable-audio.format`, `whisper.prompt`,
`deepgram.punctuate`, `azure-stt.profanity`. Full per-vendor mapping tables:
`specification/generation.md` §12.
