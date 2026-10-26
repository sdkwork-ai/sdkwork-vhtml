# VHTML 1.1 生成任务与 AI 创作协议

**状态**：规范性 Profile  
**实现**：`@sdkwork/vhtml-generation`、`@sdkwork/vhtml-sdk`、`@sdkwork/vhtml-cli`  
**依赖**：[VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md)、[project-layout.md](./project-layout.md)

生成任务是 Core Model 的一部分。提示词、输入引用、镜头/声音方向、权利、审核和输出都与时间线一样可 diff、可缓存、可审计。Provider 是外部能力适配层，不是项目真源。

---

## 1. 任务模型

```ts
interface GenerationTask {
  id: string;
  kind: GenerationKind;
  provider?: string;
  model?: string;
  prompt: string;
  negativePrompt?: string;
  inputs: Array<{ ref: string; role: string }>;
  constraints: {
    duration?: Rational;
    width?: number;
    height?: number;
    aspectRatio?: string;
    frameRate?: Rate;
    sampleRate?: number;
    channels?: number;
    language?: string;
    seed?: number;
    [key: string]: unknown;
  };
  params: Record<string, string | number | boolean>;
  direction?: GenerationDirection;
  outputs: Array<{ id?: string; path?: string; mimeType?: string; role?: string }>;
  status: 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  review?: GenerationReview;
  rights?: GenerationRights;
  safety?: GenerationSafety;
  providerJobId?: string;
}
```

### 1.1 输出类型

| kind | 典型输出 | 说明 |
|---|---|---|
| `image` | 图片 | 文生图、图生图、风格图、封面、道具 |
| `storyboard` | 图片序列/分镜图 | 镜头规划、构图确认 |
| `video` | 视频 | 文生视频、图生视频、首尾帧、参考视频 |
| `avatar` | 视频 | 数字人/口播（可带音频轨） |
| `lipsync` | 视频 | 已有视频 + 语音的口型同步 |
| `speech` | 音频 | TTS、旁白、对白 |
| `dub` | 音频/视频音轨 | 配音、翻译配音、声音替换 |
| `music` | 音频 | 配乐、歌曲、器乐、stems |
| `sfx` | 音频 | 环境声、拟音、UI/转场音效 |
| `audio` | 音频 | 通用音频生成 |
| `matte` | 图片/带 alpha 图片 | 抠像、遮罩、透明背景 |
| `edit` | 图片或视频 | 修复、扩图、上色、超分、风格化 |
| `translation` | 文本 | 字幕/脚本翻译 |
| `text` | 文本 | 脚本、标题、描述、结构化数据 |
| `transcribe` | 文本/cue 数据 | ASR 转写：音频/视频 → 带时间戳文本（自动字幕、文本化剪辑、口播对齐的入口）；输出 `gen-output role="cues"`，说话人分离映射到 `cue.speaker` |

`kind` 决定默认 Asset 类型：图片类 → `image`，视频类 → `video`，声音类 → `audio`，文本类 → `data`。

### 1.2 `params`、`constraints`、`direction` 的分工

- `constraints`：可验证的硬约束（时长、尺寸、**分辨率档位 `resolution`（`480p`…`4k`，与 `width`/`height` 并存时以精确尺寸为准）**、帧率、采样率、语言、seed、扩散采样的 `steps`/`guidance`）。
- `params`：Provider/模型私有参数（无跨厂商语义）。多厂商文档中参数 MUST 使用
  `<vendorId>.<param>` 点分命名空间（如 `runway.watermark`、`veo.personGeneration`、
  `kling.mode`），避免不同厂商的同名参数冲突；适配器 MUST 剥离命名空间前缀后再映射
  到厂商 API，未知键 MUST 原样保留。HTML 属性名大小写不敏感：文档中的命名空间键
  以小写形式存储，数值属性解析为数字——适配器映射厂商参数名时 MUST 忽略大小写差异
  （或使用 snake/hyphen 形式）。已知厂商的参数映射见 [§12](#12-vendor-适配对照vendor-annex)。
- `direction`：可移植的创作意图（镜头、画面、声音、音乐、音效、编辑）。同一份 direction
  可交给不同 Provider；未知命名空间 MUST 保留。

跨厂商通用字段（2026-10 对 Runway、Luma、Kling、Pika、海螺/MiniMax、Veo、Sora、
Wan、Vidu、PixVerse、Seedance、ElevenLabs 的参数集审计后新增）：

| 字段 | 语义 | 典型 vendor 映射 |
|---|---|---|
| `constraints.resolution` | 分辨率档位 | PixVerse `quality`、Hailuo `resolution`、Veo `resolution`、Seedance `resolution`、Luma `resolution` |
| `direction.video.motionStrength` | 归一化运动强度 0..1 | Pika `motionStrength`(0-4)、Vidu `movement_amplitude`、Runway motion bucket |
| `direction.video.cameraMove` | 受控运镜词表（none/push-in/pull-out/zoom/pan/tilt/orbit/crane/handheld/follow） | Kling `camera_control`、Luma camera concept、海螺/PixVerse camera、Seedance `camerafixed=true` → `none` |
| `direction.video.withAudio` | 是否生成原生音轨 | Sora、Veo `generateAudio`、Wan `audio`、Kling omni、Pika `with_sound` |
| `direction.music.lyrics` | 歌词 | Suno 式厂商 |
| `direction.speech.rate` | 数值语速倍率 | ElevenLabs `speed`、OpenAI TTS `speed` |
| `constraints.steps` / `guidance` | 扩散采样步数/引导强度 | SDXL/Flux 系图片模型 |

---

## 2. 创作方向（Direction）

```ts
interface GenerationDirection {
  shot?: {
    framing?: string;     // wide, medium, close-up
    camera?: string;      // slow push in, handheld, orbit
    angle?: string;
    lens?: string;
    lighting?: string;
    mood?: string;
    setting?: string;
    action?: string;
    continuity?: string;  // 角色/服装/道具连续性备注
  };
  image?: {
    style?: string;
    composition?: string;
    background?: string;
    transparent?: boolean;
    referenceStrength?: number;
    mask?: string;
    control?: string;
  };
  video?: {
    firstFrame?: string;  // asset/gen ref
    lastFrame?: string;
    referenceVideo?: string;
    camera?: string;
    motion?: string;
    loop?: boolean;
    lipSync?: boolean;
  };
  speech?: {
    language?: string;
    voice?: string;
    accent?: string;
    emotion?: string;
    pace?: string;
    pitch?: string;
    style?: string;
    speaker?: string;
    pronunciation?: string;
    consent?: string;
  };
  music?: {
    genre?: string;
    mood?: string;
    bpm?: number;
    key?: string;
    timeSignature?: string;
    instruments?: string[];
    structure?: string[];
    vocals?: string;
    stems?: boolean;
    loop?: boolean;
  };
  sfx?: {
    category?: string;
    environment?: string;
    intensity?: string;
    loop?: boolean;
  };
  edit?: {
    operation?: string;
    strength?: number;
    preserve?: string;
    mask?: string;
  };
  [key: string]: unknown;
}
```

### 2.1 图片与分镜

```json
{
  "image": { "style": "editorial, soft rim light", "composition": "centered", "transparent": true },
  "shot": { "framing": "medium", "lighting": "neon night", "mood": "hopeful" }
}
```

图生图使用 `gen-input role="reference-image"`；局部重绘使用 `role="mask"`；风格一致性使用 `role="style"` 或 `role="character"`。

### 2.2 视频、首尾帧与数字人

```json
{
  "shot": { "camera": "slow push in", "action": "turns toward camera", "continuity": "same jacket" },
  "video": { "firstFrame": "gen:cover", "lastFrame": "gen:cover-end", "loop": false },
  "speech": { "emotion": "warm", "language": "en" }
}
```

- 首帧/尾帧 MUST 通过 `gen-input` 引用并声明 `role="first-frame"` / `"last-frame"`。
- 数字人/口播：`kind="avatar"`，输入角色 `portrait` + `voice`，输出视频。
- 口型同步：`kind="lipsync"`，输入 `video` + `voice`，输出视频。
- 翻译配音：`kind="dub"`，输入原音频/视频 + 目标语言，输出音轨。

### 2.3 语音

语音任务 MUST 明确语言；音色/情绪/语速/口音/发音词典为可选 direction。

```json
{
  "speech": {
    "language": "zh-CN",
    "voice": "warm-female-01",
    "emotion": "calm",
    "pace": "measured",
    "pronunciation": "VHTML=vee-aitch-tee-em-el"
  }
}
```

声音克隆/真人声音 MUST 在 `rights` 中提供 `voiceCloning: "consented"` 与 `consent` 引用；否则实现 SHOULD 拒绝或发出警告。

### 2.4 音乐与音效

```json
{
  "music": {
    "genre": "cinematic electronic",
    "mood": "uplifting",
    "bpm": 112,
    "key": "D minor",
    "timeSignature": "4/4",
    "instruments": ["analog synth", "strings", "taiko"],
    "structure": ["intro", "build", "drop", "outro"],
    "vocals": "none",
    "stems": true,
    "loop": false
  }
}
```

```json
{ "sfx": { "category": "whoosh", "environment": "studio", "intensity": "medium", "loop": false } }
```

音乐 MUST 声明是否含人声；音效 MUST 声明类别/环境/强度。`stems` 输出使用多个 `gen-output`，role 分别为 `music`、`drums`、`bass`、`vocals` 等。

---

## 3. 输入与生成图

### 3.1 输入角色

推荐角色名：

`reference-image`、`style`、`character`、`subject`、`portrait`、`first-frame`、`last-frame`、
`keyframe`、`mask`、`reference-video`、`video`、`reference-audio`、`voice`、`music`、`script`、
`translation`、`control`。

- `subject`：主体/人物参考（Kling elements、Vidu reference2video、海螺 subject_reference、
  Wan reference-to-video、Sora input_reference）。
- `keyframe`：多关键帧序列（Luma Ray multi-keyframe 最多 16 帧、Pikaframes）；顺序即
  `gen-input` 声明顺序，首/尾关键帧 SHOULD 同时声明 `first-frame`/`last-frame`。

角色是语义标签，Provider 可忽略不支持的角色，但 MUST 在 capability 中声明。

### 3.2 依赖与循环

- 输入 `ref="gen:<taskId>"` 表示依赖另一个生成任务。
- 也可以直接写任务 id（无命名空间）表示依赖。
- 物化 MUST 先完成依赖任务，再运行下游任务。
- 循环依赖 MUST 在调用 Provider 前失败，错误码 `GENERATION_DEPENDENCY_CYCLE`。
- 选择某个任务 `--task` 时 MUST 自动包含其依赖。
- 依赖任务的输出资产 `gen:<taskId>` 在缓存键中 MUST 以内容哈希参与，保证输入变化会使下游缓存失效。

### 3.3 一致性

多镜头一致性通过以下组合实现：

1. `character` / `style` 资产 + `reference-image` 输入；
2. `direction.shot.continuity` 描述服装、道具、时间；
3. 固定 `seed`；
4. 相同 `provider` + `model` 版本；
5. 人物/风格圣经作为项目资产，而不是复制提示词。

规范不承诺跨 Provider 像素一致；只承诺 VHTML 侧的时间线、引用和缓存行为一致。

---

## 4. Provider 能力

```ts
interface GenerationProviderCapabilities {
  kinds: GenerationKind[];
  models?: string[];
  inputRoles?: string[];
  outputs?: AssetKind[];
  supportsSeed?: boolean;
  supportsAsync?: boolean;
  maxDurationSeconds?: number;
  notes?: string;
}

interface GenerationProvider {
  id: string;
  kinds: GenerationKind[];
  capabilities?: GenerationProviderCapabilities;
  generate(request: GenerationRequest): Promise<GeneratedFile[]>;
}
```

- Provider MUST 尊重 `AbortSignal`。
- 失败 MUST 抛出可分类错误。
- 输出 MUST 是项目内可解析文件。
- 不得在日志中写入密钥或完整私有提示词。
- 不支持某 kind/role 时 MUST 返回 `GENERATION_CAPABILITY_MISSING`，不得静默降级。
- `vhtml providers --json` 和 `vhtml capabilities --json` MUST 可发现能力。

### 4.1 内置 Provider

| id | 能力 |
|---|---|
| `procedural` | 离线确定性 image/video/audio/music/sfx/text |
| `manifest` | 所有 kind；任务 id → 预生成文件 |
| `http` | 所有 kind；Vendor-neutral HTTP/异步 job |

`manifest` 适合人工/MCP/外部工具预生成；`http` 适合真实 AI 服务。Manifest 的单个任务可以返回多个文件，用于音乐 stems、多语言配音或多分辨率输出：

```json
{
  "score": [
    { "file": "./external/score.wav", "role": "music" },
    { "file": "./external/drums.wav", "role": "drums" },
    { "file": "./external/vocals.wav", "role": "vocals" }
  ]
}
```

### 4.2 HTTP 协议

`POST <endpoint>/generate`：

```json
{
  "schema": "vhtml.generation/1.1",
  "taskId": "hero",
  "kind": "video",
  "prompt": "…",
  "negativePrompt": "…",
  "model": "…",
  "constraints": { "duration": { "num": 5, "den": 1 } },
  "params": {},
  "direction": { "shot": { "camera": "slow push in" } },
  "inputs": [{ "ref": "logo", "role": "reference-image", "kind": "asset", "assetId": "logo", "src": "assets/images/logo.png", "mimeType": "image/png", "hash": "sha256:…" }],
  "rights": { "commercialUse": true, "aiDisclosure": true },
  "safety": { "rating": "general" },
  "seed": 42
}
```

同步响应：

```json
{
  "outputs": [
    {
      "url": "https://…/hero.mp4",
      "mimeType": "video/mp4",
      "kind": "video",
      "width": 1920,
      "height": 1080,
      "durationSeconds": 5,
      "role": "video",
      "metadata": { "providerCost": "0.42", "modelVersion": "1.3" }
    }
  ],
  "provider": "vendor",
  "model": "vendor-video-1",
  "seed": 42
}
```

异步响应：`{ "jobId": "abc", "statusUrl": "https://…/jobs/abc" }`。轮询状态为 `queued|running|succeeded|failed|cancelled`，失败可带 `error`；输出支持 `url`、`base64` 或项目内 `path`。

Provider 特有参数放 `params`；核心不得绑定厂商 schema。未知响应字段 MUST 忽略，不得使整个任务失败。

输入在发送前由实现解析为 `kind/id/assetId/src/mimeType/hash` 等描述；`src` 是项目相对路径。远程 Provider 适配器负责上传文件并把 `src` 替换为签名 URL；不得假设远端能访问本地路径。

---

## 5. 审核、权利与安全

### 5.1 人工审核

```json
{ "review": { "status": "approved", "reviewer": "editor", "notes": "approved", "reviewedAt": "2026-01-01T00:00:00Z" } }
```

状态：`pending`、`approved`、`rejected`、`changes-requested`。  
`needs-review` 工作流由工具实现；未审核状态不应阻止技术物化，但发布流程 SHOULD 检查。

### 5.2 权利

```json
{
  "rights": {
    "license": "CC-BY",
    "consent": "consent-doc-123",
    "likeness": "consented",
    "voiceCloning": "consented",
    "commercialUse": true,
    "aiDisclosure": true
  }
}
```

- 真人肖像：`likeness=consented` 时必须提供 `consent` 引用。
- 声音克隆：`voiceCloning=consented` 时必须提供 `consent`。
- `aiDisclosure=true` 表示发布时 SHOULD 标注 AI 生成。
- 商业使用/许可证由项目方负责核验，工具只记录声明。

### 5.3 安全

```json
{ "safety": { "rating": "general", "policy": "internal-v3", "moderated": true, "notes": "passed" } }
```

Provider 可返回内容审核结果；VHTML 只记录，不替代 Provider 的合规责任。

### 5.4 AI 披露与指纹

生成 Asset 的 `provenance` MUST 记录 provider/model/promptHash/seed/createdAt/outputHash/generatorVersion。  
实现 SHOULD 支持 C2PA/内容凭证、隐形水印或发布侧 AI 标签；这些是可选扩展，不改变 Core Model。

---

## 6. 物化、缓存与导出

- 输出资产 ID：`gen:<taskId>`；多输出：`gen:<taskId>:<index>`。
- Clip 通过 `ref="gen:<taskId>"` 使用；也可使用 `asset:`。
- 必须记录 `kind/src/mimeType/duration/width/height/hash/size/generatedBy/provenance`。
- 缓存位于 `.vhtml/cache/generated.json`；旧 `.vhtml-cache/generated.json` 只读兼容。
- 缓存键 MUST 包含：任务定义、provider/model、constraints、params、direction、rights、输入引用及其内容哈希、实现版本。
- 命中缓存不得调用 Provider；`--force` 绕过缓存。
- 生成文件默认位于 `generated/`，不得逃逸项目根。
- 导出/渲染发现 `gen:` 引用但未物化时，应自动物化或明确失败。
- 失败 MUST 保留可诊断错误，不得把部分文件登记为成功资产。

---

## 7. 典型工作流

### 7.1 文生视频

```bash
vhtml generate . --task hero
vhtml export . --generate --out renders/final.mp4
```

Studio（所见即所得模式）工具栏的 **Generate** 按钮触发同一物化路径
（`POST /api/generate`）：任务全部成功时会话替换为新模型并重建 stage；
任何任务失败返回 422 与逐任务错误，项目保持原状。

### 7.2 图片 → 视频（首帧）

```xml
<generate id="shot" kind="video" provider="http" model="video-1">
  <prompt>slow push in on the product</prompt>
  <gen-input ref="gen:cover" role="first-frame"></gen-input>
  <direction>{"shot":{"camera":"slow push in"},"video":{"loop":false}}</direction>
</generate>
```

### 7.3 旁白 + 音乐 + 音效

三个任务分别 `speech`、`music`、`sfx`；时间线通过 `gen:` 引用到 audio lane。混音、淡入淡出、响度归一化由媒体层完成，生成层不负责最终混音。

### 7.4 数字人口播 / 口型同步

- `avatar`：`portrait` + `voice` → video；
- `lipsync`：`video` + `voice` → video；
- `dub`：`video` + 目标语言 → 新音轨；
- 三者都必须声明 `rights.likeness` / `voiceCloning`。

### 7.5 多语言版本

同一视频用 `translation` 生成脚本，再为每种语言生成 `speech` / `dub`；字幕、音频和口型分别引用不同 `gen:` 任务。VHTML 时间线保持一份，输出按语言派生。

---

## 8. 可复现性与限制

- 相同任务 + Provider 版本 + 输入 + seed 应可复用缓存。
- 厂商模型升级可能改变输出；`provenance.model` 和 `generatorVersion` MUST 记录，导出报告 SHOULD 包含。
- 规范不要求跨厂商生成相同像素；只要求 VHTML 侧时间、引用、缓存和资产登记一致。
- 真实 AI 生成通常不可离线复现；`procedural`/`manifest` 是可重复的本地路径。
- 生成服务不可用时，渲染 MAY 失败；不得用占位图静默替代。

---

## 9. Provider 错误码

| 错误码 | 含义 |
|---|---|
| `GENERATION_TASK_NOT_FOUND` | 任务/依赖不存在 |
| `GENERATION_PROVIDER_NOT_FOUND` | Provider 未安装 |
| `GENERATION_PROVIDER_ERROR` | Provider 调用失败 |
| `GENERATION_CAPABILITY_MISSING` | 不支持 kind/model/role |
| `GENERATION_DEPENDENCY_CYCLE` | 生成依赖成环 |
| `GENERATION_TIMEOUT` | 超时 |
| `GENERATION_CANCELLED` | 取消 |
| `GENERATION_INVALID_OUTPUT` | 输出缺失/不可解析 |

---

## 10. 一致性

实现声称支持本 Profile 时，至少通过：

1. 图片、视频、语音、音乐、音效任务可解析/序列化/校验。
2. `direction`、`review`、`rights`、`safety` round-trip。
3. 生成依赖拓扑排序；成环在调用 Provider 前失败。
4. 选中下游任务会先运行依赖。
5. 缓存键包含 direction/rights/输入哈希；输入变化使下游缓存失效。
6. 权利声明缺失 consent 时产生明确警告。
7. HTTP 协议携带 direction/rights/safety，支持同步与异步 job。
8. `vhtml providers` 能列出能力。

## 11. 机器可读 Schema

- [provider-request.schema.json](../packages/schema/schemas/vhtml-1.1/provider-request.schema.json)
- [provider-response.schema.json](../packages/schema/schemas/vhtml-1.1/provider-response.schema.json)
- [model.schema.json](../packages/schema/schemas/vhtml-1.1/model.schema.json)
- 通过 `@sdkwork/vhtml-schema` 的 `loadSchema('provider-request' | 'provider-response')` 加载。

---

## 12. Vendor 适配对照（Vendor Annex）

厂商能力变化很快；本节记录 2026-10 各厂商公开 API 的参数到 VHTML 的映射，
覆盖 26 家厂商（视频 14、图片 7、音乐 3、语音/音频 4，跨 kind 计）。
机器可读目录：`@sdkwork/vhtml-generation/vendors` 的 `VENDOR_CATALOG`（含逐参数映射表、
`vendorParams` 命名空间提取与 `buildVendorPayload` 信封构建器），
`vhtml providers --known` 可列出。新增厂商 = 新增目录条目 + （可选）适配器，不改 Core。

映射规则（规范性）：

1. 语义等价的参数 MUST 映射到核心字段（prompt/negativePrompt/constraints/direction/输入角色）。
2. 仅厂商存在的参数 MUST 放 `params["<vendorId>.<param>"]` 命名空间。
3. 归一化字段（`motionStrength` 0..1）的换算系数 MUST 写进目录条目的 mapping note。
4. 厂商新增参数在目录更新前可放入命名空间 `params`，不会失败。

| vendor | 视频生成方式 | 关键映射（vendor → VHTML） | 纯厂商参数（namespace 示例） |
|---|---|---|---|
| **Runway** Gen-3/Gen-4 | t2v、i2v、v2v(restore/act)、upscale | `ratio`→aspectRatio；`duration`(5/10s)→duration；`promptImage`→first-frame；seed→seed | `runway.watermark` |
| **Luma** Ray | t2v、i2v、多关键帧(≤16)、extend、loop | `frame0/frame1`→first/last-frame；keyframes→keyframe 角色；`loop`→video.loop；camera→cameraMove | `luma.camera.intensity` |
| **Kling** | t2v、i2v、elements(r2v)、image_tail 首尾帧、motion control、lipsync | `mode`→档位参数；`duration`(3–15s)→duration；`camera_control`→cameraMove；`image_tail`→last-frame；elements→subject | `kling.mode`、`kling.cfgScale` |
| **Pika** | t2v、i2v、Pikaframes、effects、modify region | `motionStrength`(0-4)→motionStrength；`with_sound`→withAudio；`keyframe`→keyframe 角色；seed+同提示词→一致性 | `pika.modifyRegion`、`pika.effect` |
| **海螺/MiniMax** | t2v、i2v、首尾帧、subject reference、lipsync、extend | `first/last_frame_image`→first/last-frame；`subject_reference`→subject；`resolution`(512p/768p/1080p)→resolution | `hailuo.promptOptimizer` |
| **Google Veo** | t2v、i2v、interpolation、reference images、extend、原生音频 | `resolution`(720p/1080p)→resolution；`generateAudio`→withAudio；interpolation→first/last-frame；extend→edit.operation | `veo.personGeneration` |
| **OpenAI Sora** | t2v、i2v(reference_image)、remix、原生音频 | `seconds`(4/8/12)→duration；`size`→width/height；`input_reference`→reference-image | `sora remix` → `edit.operation="remix"` |
| **Wan (阿里)** | t2v、i2v、r2v、首尾帧、speak/lipsync、extend、原生音频 | `resolution`→resolution；`audio`→withAudio；speak→lipsync+voice；prompt 重写 | `wan.promptExtend` |
| **Vidu** | t2v、i2v、start-end、reference2video、extend | `movement_amplitude`→motionStrength；`resolution`(540p/720p/1080p)→resolution；subject→subject | `vidu.bg` |
| **PixVerse** | t2v、i2v、首尾帧、effects、transition、lipsync | `quality`(360p…1080p)→resolution；`motion_mode`→video.motion；transition→edit.operation | `pixverse.ci`、`pixverse.effect` |
| **Seedance (字节)** | t2v、i2v、r2v、adaptive 编辑、原生音频 | `resolution`(480p/720p/1080p)→resolution；`camerafixed`→cameraMove="none"；`aspect_ratio="adaptive"`（编辑时） | — |
| **ElevenLabs** | TTS、克隆、dubbing、sfx、music | `voice_id`→speech.voice；`speed`→speech.rate；`language`→constraints.language | `elevenlabs.stability`、`similarityBoost`、`style` |
| **Stability AI (SVD)** | i2v、图片模型、Stable Audio | `fps_id`→frameRate；`motion_bucket_id`→motionStrength；`cfg_scale`→guidance；`steps`→steps | `stability-svd.noiseAugStrength` |
| **混元 Hunyuan (腾讯)** | t2v、i2v、t2i、speech | `Resolution`→resolution；`Duration`→duration；`ImageUrl`→first-frame | — |
| **Adobe Firefly** | t2i、i2i、t2v、i2v、generative fill | `aspectRatio`/`duration`/`seed`→constraints；mask→edit+mask 角色 | `firefly.style` |
| **Flux (BFL)** | t2i、i2i(参考图≤10) | `steps`/`guidance`→constraints；`seed`→seed | `flux.promptUpsampling`、`safetyTolerance`、`outputFormat` |
| **Stability 图片 (SDXL/SD3)** | t2i、i2i、inpaint、upscale | `cfg_scale`→guidance；`steps`→steps；`style_preset`→image.style | — |
| **OpenAI 图片 (gpt-image-1)** | t2i、i2i、mask 编辑 | `size`→width/height；多输出→gen-output | `openai-image.quality`、`background`、`outputFormat` |
| **Midjourney (代理 API)** | imagine、blend、vary region | `--ar`→aspectRatio；`--seed`→seed；image prompts→reference-image | `midjourney.stylize`、`chaos`、`weird` |
| **Ideogram** | t2i、i2i、文字渲染 | `resolution`→resolution；`style_type`→image.style | `ideogram.magicPrompt` |
| **通义万相 Qwen 图片** | t2i、i2i、文字渲染 | `size`→width/height；`seed`→seed | `qwen-image.promptExtend`、`watermark` |
| **Suno** | 歌曲生成、歌词驱动 | `lyrics`→music.lyrics；`style`→genre+mood；`instrumental`→music.instrumental | — |
| **Stable Audio** | t2a、audio-to-audio | `duration`→duration；a2a→reference-audio | `stable-audio.format` |
| **MusicGen (Meta)** | t2m、melody 条件 | `melody`→reference-audio；`cfg_coef`→guidance | `musicgen.temperature` |
| **OpenAI TTS** | tts、instructions | `voice`→speech.voice；`speed`→speech.rate；`instructions`→speech.style | `openai-tts.format` |
| **Azure Speech** | tts、SSML、style/role | `voice`→speech.voice；`style/role`→speech.style/emotion；`rate/pitch`→speech.rate/pitch | — |
| **Whisper (OpenAI)** | transcribe、translate、词级时间戳 | `file`→voice/video 输入；`language`→constraints.language；时间戳→cues 输出 | `whisper.prompt` |
| **Deepgram** | transcribe、diarization | diarize→cue.speaker；`language`→constraints.language | `deepgram.punctuate` |
| **Azure STT** | 批量转写、词级时间戳、diarization | 同上 | `azure-stt.profanity` |
| **ElevenLabs Scribe** | transcribe、词级时间戳、diarization | `language_code`→constraints.language | — |
| **Whisper→剪辑 / Deepgram→剪辑 工作流** | transcribe 输出 cues → `timeline.rippleCut` 删口误区间、`addCue` 生成字幕、`storyboard.apply` 物化分镜 | 见 [editing.md §9](./editing.md) | — |

命名空间键的存储形式：HTML 属性名大小写不敏感，`<params kling.cfgScale="0.7">`
以 `kling.cfgscale`（数值 0.7）存储；`vendorParams(task, vendorId)` 与
`buildVendorPayload(task, project)` 帮助适配器完成前缀剥离与信封构建。

同一项目混用多厂商：每个任务声明自己的 `provider` + 命名空间 `params`；`direction` 与
`constraints` 保持厂商中立，切换 Provider 时无需改写。缓存键包含完整 params，命名空间
参数变化会正确失效缓存。

来源：Runway [API Reference](https://docs.dev.runwayml.com/api)、Kling [API](https://kling.ai/document-api/apiReference/model/textToVideo)、
Luma [Video Generation](https://docs.lumalabs.ai/docs/video-generation)、Pika [dev.pika.art](https://dev.pika.art)、
MiniMax [Video Generation](https://platform.minimax.io/docs/guides/video-generation)、Veo [ prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)、
Sora [Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)、Wan [API Reference](https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference)、
Vidu [docs](https://platform.vidu.com/docs/text-to-video)、PixVerse [ComfyUI node docs](https://docs.comfy.org/built-in-nodes/partner-node/video/pixverse/pixverse-text-to-video)、
Seedance [BytePlus](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-0)、ElevenLabs [voice settings](https://elevenlabs.io/docs/api-reference/voices/settings/update)。

---

## 13. 用量与配额记账（RFC-0013，1.1.2）

生成任务是 Core 对象，其消耗必须可记录、可汇总、可设限（商业交付
C2/C3 级与智能体批生产的审计需求）。

### 13.1 `<usage>` 记录

`<generate>` 可选子元素 `<usage>`（模型字段 `GenerationTask.usage`）：

| 属性 | 含义 |
|---|---|
| `cost` / `currency` | provider 报告的成本与币种；`cost` 无 `currency` 时校验器 warning |
| `tokens` | 文本/模型 token 消耗 |
| `credits` | 厂商积分/计费单位 |
| `compute-seconds` | 该任务 provider 实测墙钟（秒） |
| `output-bytes` | 输出文件实测总字节数 |
| `recorded-at` | ISO-8601 记录时间 |

所有数值非负；其他属性按属性名保留（往返稳定）。用量是**记录性数据**：
不参与缓存键，不改变任务状态机。

### 13.2 运行时记账与配额

`materializeGenerations` 对每次真实 provider 调用记录观测值
（computeSeconds/outputBytes）；provider 可通过 `GenerationRun` 封套上报
`usage` 与 `providerJobId`（裸 `GeneratedFile[]` 返回依旧合法；上报字段
优先，未上报维度保留观测值）。

`GenerateOptions.quota` / CLI `--max-cost`、`--max-credits`、
`--max-compute-seconds`、`--currency`：每次 provider 调用前检查累计用量，
超限抛稳定错误码 `GENERATION_QUOTA_EXCEEDED`，后续任务不再调用 provider。
跨过上限的那次调用可能造成少量溢出，在结果 `usage` 汇总中如实呈现。

### 13.3 导出报告

`vhtml.export-report/1` 的 `provenance.generations[]` 每项携带 `usage`；
`provenance.usageTotals` 为全项目求和（cost/credits/tokens/computeSeconds/
outputBytes）。报告不含密钥与完整提示词（§5 隐私边界不变）。

---

## 14. 角色与风格圣经（RFC-0014，1.1.2）

跨镜头一致性（同一角色、同一品牌风格贯穿全片）的权威描述住在项目级
`<characters>` 库中；规范模型 `BibleProfile`，`kind` 为 `character` 或
`style`。

```html
<characters>
  <character id="mika" version="3" name="Mika">
    <description>A silver-haired courier in a teal flight jacket.</description>
    <negative>no glasses, no hat</negative>
    <reference ref="asset:mika-sheet" role="reference-image" />
  </character>
  <style-guide id="noir" version="1">
    <description>High-contrast noir, rain-slick streets.</description>
    <reference ref="asset:style-board" role="style" />
  </style-guide>
</characters>
```

- **引用**：`<gen-input ref="character:mika" role="character"/>`、
  `ref="style:noir" role="style"`。`character:`/`style:` 命名空间解析到
  同一 bible 库；引用不存在的 bible 在 provider 调用**之前**报
  `REFERENCE_NOT_FOUND`。
- **缓存**：bible 完整 profile（含 version 与 reference 文件哈希）参与
  生成缓存键——**bump version 即失效**该任务缓存，未引用 bible 的任务
  键不变。
- **厂商载荷**：`buildVendorPayload` 的 `bibles` 段承载解析后的描述与
  参考 src/mime；prompt 不被静默改写，由 adapter 决定组合方式。
- **代码优先**：SDK `character()/styleGuide()/bible()`、
  `defineVideo({ characters, styleGuides })`；创作程序
  `vhtml.addCharacter/addStyleGuide`。
- **审查/权利**：人物形象 bible 与 `review`/`rights`（likeness/consent）
  组合使用；§5 治理规则不变。
