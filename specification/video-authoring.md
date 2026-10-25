# VHTML 代码创作扩展（Code Authoring Extension）

**状态**：候选扩展（Candidate Extension），参考实现已实现并通过一致性测试
**适用版本**：VHTML 1.1（additive，不改变 1.1 核心语义）
**实现**：`@sdkwork/vhtml-core/program`、`@sdkwork/vhtml-core/authoring`、`@sdkwork/vhtml-runtime`、`@sdkwork/vhtml-media`
**相关 RFC**：RFC-0007（创作程序）、RFC-0008（变速曲线）、RFC-0009（嵌套时间线）、RFC-0010（音频闪避）

> 本文中 MUST、MUST NOT、SHOULD、SHOULD NOT、MAY 按 RFC 2119 解释。
> 本扩展全部能力均为可选：不使用这些元素的 1.1 文档行为完全不变。

---

## 1. 目标与范围

VHTML 1.1 已经可以用两种方式"写代码做视频"：手写声明式 `.vhtml`，或者用
SDK 以 TypeScript 构建 Core Model 后编译为 `.vhtml`。本扩展补上第三种、也
是最直接的一种：**单文件代码文档**——在 `.vhtml` 文档内部直接书写程序，
由文档自身生成场景、轨道、片段、字幕、动画、生成任务与输出配置。

扩展由五部分组成：

1. **内嵌创作程序**（`<script type="application/vnd.vhtml.program+javascript">`
   + `<data>` 数据块）：以普通 JavaScript 循环、函数和数据驱动地构建项目。
2. **变速曲线 time remap**：片段的关键帧源时间映射（快慢混合、慢镜、倒放坡道）。
3. **嵌套时间线**（compound clip）：`timeline:` 引用的可复用子序列。
4. **音频闪避**（ducking）：基于旁链轨道电平的自动音量压缩。
5. **音画同步**（A/V sync）：帧计数时间码、片段级音频偏移、字幕/口播对齐
   （见 §6）。

设计原则与核心规范一致：

- 程序是**构建期**（authoring time）概念，不是渲染期概念。程序运行一次，
  产出的仍然是纯声明式 Core Model；渲染器、混音器、导出器不理解程序。
- 全部能力可声明、可验证、可降级；不支持时给出稳定错误码。
- HTML 完整能力不受影响：场景内容仍由浏览器引擎渲染。

---

## 2. 内嵌创作程序

### 2.1 文档形态

```html
<!doctype html>
<html>
<body>
<vhtml version="1.1">
  <project id="demo" version="1.1">
    <settings><composition width="1280" height="720" frame-rate="30/1" duration="8s" seed="11" /></settings>
    <timelines><timeline id="main" duration="8s"></timeline></timelines>
  </project>
  <script type="application/vnd.vhtml.program+javascript">
    // 普通同步 JavaScript；全局对象 vhtml 见 §2.3
    for (const item of vhtml.data.get('items')) {
      vhtml.addScene({ id: 'card-' + item.id, html: '<h1>' + item.title + '</h1>' });
      vhtml.addClip('visual', { ref: 'scene:card-' + item.id, start: item.at, duration: 1 });
    }
  </script>
  <script type="application/json" id="items">
    [{ "id": "a", "title": "Hello" }]
  </script>
</vhtml>
</body>
</html>
```

规则：

- 文档 MUST 至多包含一个创作程序。多个程序元素 MUST 产生
  `PARSE_DUPLICATE_ID` 错误。
- 程序元素为 `<script type="application/vnd.vhtml.program+javascript">`，
  别名 `<program>`、`type="application/vhtml+javascript"`、
  `type="text/vhtml+javascript"`。解析器 MUST 接受全部三种写法并按同一种
  语义处理；序列化器 MUST 输出规范形式 `application/vnd.vhtml.program+javascript`。
- 程序元素的属性：`seed`（非负整数，覆盖组合 seed 作为沙箱 PRNG 种子）、
  `params`（JSON 对象字符串，作为 `vhtml.ctx.params`）。`<program>` 别名
  还支持 `<param name value />` 子元素。由于 `<script>` 是 HTML raw text
  元素，程序代码 MUST 使用 `<script>` 形式书写含 `<`、`&` 的代码；
  `<program>` 形式中的代码须转义。字符串中的 `</script` MUST 写作
  `<\/script`。
- **数据块**：`<script type="application/json" id="…">`（HTML 原生 data
  block 语义）或 `<data id type="application/json">`。`application/json`
  及 `*+json` 在解析时 MUST 完成 JSON 解析，非法 JSON 产生
  `PARSE_INVALID_DOCUMENT`；其他 MIME 类型的数据块以原文文本作为值。
  数据块 id 在文档内 MUST 唯一。
- **外部数据块**：`<data>` 支持 `src` 属性（项目根相对路径），解析器按
  外部 Scene 相同的路径沙箱规则读取（拒绝 URL、根转义与链接逃逸，错误码
  `SECURITY_PATH_ESCAPE` / `IO_NOT_FOUND`）；`src` 存在时优先于内联内容，
  序列化保留引用形式。数据文件放在标准布局的 `assets/` 下即可随
  `.vhtmlpkg` 打包分发。
- 程序与数据块属于**文档层**，不属于 Project Core Model。它们随文档序列化
  往返保留（`VhtmlDocument.program` / `VhtmlDocument.dataBlocks`），但不出现在
  `<project>` 模型中，也不进入 JSON Schema 校验范围。
- 程序元素 MUST NOT 被当作 Stage 运行时脚本（`project.scripts`）执行。

### 2.2 物化（Materialisation）

- `materializeDocument(document, { params })` 在解析之后、验证/渲染/导出之前
  执行程序，返回物化后的文档与诊断。CLI 的所有加载路径、Studio 服务端
  MUST 在加载时物化。
- 物化 MUST NOT 修改输入文档；程序针对 `document.project` 的深拷贝运行。
- 程序 MUST 为同步代码。运行环境（`node:vm` 新上下文）不提供异步调度，
  微任务不会执行。
- 沙箱执行超时（默认 2000ms）产生 `SCRIPT_TIMEOUT`；程序抛错产生
  `SCRIPT_ERROR`。两种情况下已声明的模型保留，诊断标记错误，导出被阻止。
- 程序参数化：`vhtml validate|render|export|… --param key=value`（可重复）
  合并进 `vhtml.ctx.params`，外部值覆盖文档 `params` 属性——同一文档可
  以参数化批量产出不同成片（模板渲染）。
- 物化完成后的文档即纯声明式项目。`vhtml build <file.vhtml>` 将物化模型
  **冻结**为规范 `.vhtml`——程序与数据块无条件剥离：保留程序会使下次加载
  重跑并覆盖物化模型，原始程序交由版本控制保留。

### 2.3 程序 API（规范性）

程序在沙箱中可用全局 `vhtml` 对象。API 分为三类：

**上下文（只读）**

| 成员 | 说明 |
|---|---|
| `vhtml.version` | 规范版本 |
| `vhtml.ctx.fps` / `fpsNumber` / `fpsLabel` | 组合帧率（有理数/数值/文本） |
| `vhtml.ctx.width` / `height` / `duration` / `durationSeconds` | 画布与时长 |
| `vhtml.ctx.sampleRate` / `channels` / `seed` | 音频参数与确定性种子 |
| `vhtml.ctx.params` | 程序 `params` 属性与 CLI 重复 `--param k=v` 合并后的只读参数；外部值覆盖文档值 |
| `vhtml.data.get(id)` / `has(id)` / `keys()` | 数据块访问；`get` 不存在时抛错 |
| `vhtml.project` | 正在物化的 Project 模型（可自由读写，谨慎使用） |

**纯构建器**（返回模型对象，不修改项目）：`clip(ref|spec, options?)`、
`scene(spec)`、`asset(spec)`、`animate(spec)`、`effect(type, params)`、
`timeRemap(spec)`、`caption(text, start, options?)`、`lane(type, id, clips, options?)`、
`marker(spec)`、`generation(spec)`、`storyboardShot(spec)`、`output(spec)`、
`html`（模板标签，插值转义）、`css`（模板标签）、`easing.sample(name, u)`、
`rat(x, den?)`、`time(value)`、`frames(n)`。

**变更器**（修改物化中的项目）：

| 成员 | 说明 |
|---|---|
| `addScene(spec)` / `addAsset(spec)` | 场景与资源；id 重复抛错 |
| `addTimeline({ id, duration? })` | 新建子时间线（嵌套时间线素材） |
| `addLane(spec, timelineId?)` | 轨道；clips 内的 spec 立即解析 |
| `addClip(laneId, spec)` / `addCue(spec)` | 片段与字幕；自动生成确定性 id |
| `addTransition(trackId, transition)` / `addMarker(timelineId?, spec)` | 转场与标记 |
| `addGeneration(spec)` / `addStoryboardShot(spec)` / `addOutput(spec)` | 生成任务/分镜/输出 |
| `addAnimation(animation, clipId?)` / `addEffect(clipId, effect, audio?)` | 动画与效果 |
| `setComposition(patch)` / `setDuration(value)` / `addStyle(css)` / `addScript(js)` / `setMetadata(key, value)` | 项目级设置 |
| `edit(operations)` | 应用 Core 编辑操作（与 `vhtml edit`、Studio 同一语义），返回 `{ ok, diagnostics }` |
| `warn(message)` / `info(message)` | 产生 warning / info 诊断 |

构建器与变更器与 `@sdkwork/vhtml-sdk` 共享同一实现
（`@sdkwork/vhtml-core/authoring`），因此 **SDK 项目与程序文档产出同一模型**。

### 2.4 确定性契约

相同文档 + 相同参数 + 相同运行时版本 MUST 产生逐字段相等的项目模型：

- 沙箱内无 `require`/`import`/`process`/网络/文件系统访问。
- `Date.now()` 恒为 `0`，`new Date()` 为 Unix 纪元。
- `Math.random` 为以 `program.seed ?? composition.seed` 为种子的 mulberry32
  PRNG；每次物化重置。
- 自动生成的 id（`lane-clip-1`、`fx-…-n` 等）计数器在每次物化前重置。
- 沙箱 console 输出被捕获为 warning / info 诊断。

限制（文档 MUST NOT 依赖）：跨运行时版本（引擎、依赖库）的逐字节一致；
`vhtml.project` 的任意深度变更绕过构建器校验时的行为。

### 2.5 编辑器冻结语义

程序文档被任何编辑器（Studio、`vhtml edit`）保存时，MUST 冻结为物化后的
声明式模型并剥离程序与数据块。理由：程序在下次加载时会重新执行并覆盖
手工编辑。原始程序由版本控制保留；需要重新生成时用 `vhtml build` 从源
文档重新冻结。

---

## 3. 变速曲线（Time Remap）

`speed` 只能表达恒速。变速曲线用关键帧把**片段本地时间**直接映射到**源
偏移**（After Effects "Time Remap" 语义）：

```html
<clip id="hero" ref="gen:shot" start="3s" duration="3s">
  <timeremap easing="linear">
    <remap at="0s" source="0s" />
    <remap at="1s" source="1.5s" easing="ease-in-out" />
    <remap at="3s" source="2.25s" />
  </timeremap>
</clip>
```

- 属性等价形式：`time-remap="at:source;at:source"`（分号分隔），
  `time-remap-easing` 指定默认缓动。
- `at` 为片段本地时间；首关键帧 SHOULD 为 `at=0`（否则之前的本地时间保持
  首帧源位置，产生 warning）。`at` MUST 严格递增。`source` 为源偏移
  （叠加在 `sourceIn` 之上），MAY 为负（曲线下降段即局部倒放），产生
  越源 warning。
- 关键帧之间按 `easing`（默认 `linear`，可逐帧覆盖）插值源位置；派生量：
  瞬时速率 = d(source)/d(at)。模型与序列化使用精确有理数；插值因子按
  微秒量化，与其他采样值一致。
- 约束：与 `freeze` 互斥（同设为 `VALIDATION_INVALID_VALUE`）；设置 remap
  时 `speed` 被忽略（warning）；video/audio 片段设置 remap 后 MUST 显式给
  出 `duration`（无法从源长推导）。
- **视觉**：渲染器逐帧用曲线求值媒体时间，浏览器视频仍走 seek 就绪协议。
- **音频**：混音器解码曲线触及的源区间（无 atempo），按曲线索引源 PCM 并
  线性插值。曲线段即分段恒速近似，关键帧 >2 时产生 info 诊断。
- 编辑操作：`clip.timeremap`（设置曲线）、`clip.timeremap.clear`；
  `clip.split` 自动按切点分裂曲线（右半吸收边界源位置到 `sourceIn`）；
  `clip.speed` 清除 remap（warning）；`clip.slip` 拒绝 remap 片段。

---

## 4. 嵌套时间线（Nested Timeline / Compound Clip）

```html
<clip id="outro" kind="timeline" ref="timeline:outro" start="6s" duration="2s" />
```

- `kind="timeline"` 或 `ref="timeline:…"` 前缀自动识别。片段时长缺省取被
  引时间线时长；前向引用合法（finalize 阶段解析）。
- 引用图 MUST 为 DAG；环与自引用产生 `REFERENCE_CYCLE`。运行时递归深度
  上限为 8，超出产生 issue 并停止下钻。
- 求值语义：项目时间 → 片段本地时间 →（`sourceIn`/`speed`/`reverse`/
  `loop`/remap 映射）→ 子时间线时间；子时间线的片段状态**扁平化**进父帧，
  z 序 = 父轨道底序 + 片段 z + 子 z（caption 子层保持高位）。
- 音频：子时间线内音频轨道随扁平化混入，包装链的轨道/片段音量、声像、
  淡入淡出沿链相乘。根时间线音频轨道上的转场窗不跨越嵌套边界。
- 放置约束：嵌套时间线片段 MUST 位于 video/overlay 轨道；其内部音频仍然
  混音（承载轨道的静音不影响内嵌音频，与 Premiere 嵌套序列一致）。
- v1 限制（MUST 在实现中如实声明）：同一子时间线被多个片段**同时**引用
  时，共享同一组子片段图层，样式取最后实例；包装片段自身的
  transform/opacity/effects 不应用于扁平化后的子层（仅时间映射与音序生效）。
- Stage 构建 MUST 为可达子时间线的视觉片段挂载图层、为其音频轨道挂载
  `<audio>` 元素、并纳入其场景 CSS。

---

## 5. 音频闪避（Ducking）

```html
<audio-effect type="ducking"
  sidechain-track="sfx" threshold="-24" reduction="0.2"
  attack="0.05" release="0.4" hold="0.2"></audio-effect>
```

- 参数：`sidechain-track`（必填，触发源轨道 id）、`threshold`（dBFS，默认
  -24）、`reduction`（0..1 残留增益，默认 0.25）、`attack`/`release`（秒，
  一阶包络）、`hold`（秒，低于阈值后维持衰减的时长）。
- 混音器实现为两遍：先混出旁链轨道的后置推子电平缓冲，再混合带 ducking
  的单元并按平滑包络衰减增益。包络为确定性逐样本计算。
- 校验：`sidechain-track` 必须存在；参数范围出界产生
  `VALIDATION_OUT_OF_RANGE` / `REFERENCE_NOT_FOUND`。
- 浏览器实时预览 MAY 近似或忽略 ducking；参考实现当前在预览中忽略并在
  能力报告中声明，导出路径为权威语义。

---

## 6. 音画同步模型（A/V Sync）

VHTML 的音画同步建立在**统一有理时间基准**上：视频帧与音频采样共用
Project Time，帧边界左闭右开，帧率是精确比率。在此之上，扩展提供四层
同步能力，覆盖从创作寻址到逐帧微调的不同需求。

### 6.1 时间码寻址（SMPTE frame timecode）

任何时间属性都可用帧计数时间码书写，解析时以组合帧率为上下文：

- `HH:MM:SS:FF` — 非掉帧记法：`t = seconds + FF / fps`。
- `HH:MM:SS;FF` — 掉帧记法（仅文档语义；数学与 `:` 相同，编号已排除跳帧）。
- `FF` MUST 小于向上取整的帧率，否则 `TIME_INVALID`；无帧率上下文时
  MUST 报 `TIME_INVALID`。
- 帧率上下文由所在文档的组合帧率提供；独立求值时 MUST 显式传入。
- 小数形式 `HH:MM:SS.fraction` 保持 1.1 语义不变。
- 序列化辅助：`formatFrameTimecode(t, fps)`（整数帧率输出 `HH:MM:SS:FF`，
  非整数帧率输出小数形式 + 帧索引标注）。

```html
<clip id="lip" ref="asset:take1" start="00:00:12:15" duration="2s"
      audio-offset="80ms" />
```

### 6.2 片段级音频偏移（audio-offset）

`audio-offset` 把片段的**音频读取点**相对其源映射整体平移，视频时间
不变——这是唇同步修正、录制延迟补偿的声明式旋钮：

- 语义：音频在片段本地时间 `t` 听到源位置 `source(t) + audioOffset`；
  `source(t)` 是常规映射（speed/reverse/freeze/loop/timeRemap）的结果。
- 正值 = 音频滞后（听到更早的源内容）；负值 = 音频提前。
- 适用片段：audio/video 片段（音频轨道上），以及**嵌套时间线片段**
  （compound clip 的音频即其内嵌音频）。其他片段类型上声明产生 warning
  且被忽略。
- **包装偏移语义**：嵌套时间线片段上的 `audio-offset` 使其全部内嵌音频
  相对该片段自身的视觉映射整体平移；嵌套链上多级偏移逐级累加（包装级
  偏移作用于包装后的时间，叶级偏移作用于叶源时间），与视觉
  `sceneTime`/`mediaTime` 无关。场景与嵌套时间线片段的 timeRemap 同样
  约束其内部时间映射，与媒体片段共享同一求值语义。
- 源越界：偏移使读取区间越过源起点/终点时产生 `TIME_OUT_OF_SOURCE`
  warning；混音器对越界区间输出静音（不裁剪片段）。
- 管道一致性：**导出混音**扩展解码窗口并按偏移索引 PCM；**预览**对
  音频轨道片段同步偏移 `sourceTime`；视频元素内嵌音频的实时预览 MAY
  不应用偏移（预览近似；导出为权威语义，MUST 在能力报告声明）。
- 编辑：`clip.set { audioOffset }`（`null` 清除）。
- SDK/程序：`clip(spec)` 与 `vhtml.addClip` 均接受 `audioOffset`（时间值）。

### 6.3 字幕/口播对齐（caption alignment）

程序化字幕是音画同步的高频需求（配音、口播稿、歌词）。扩展提供
`parseSubtitleBlocks`（程序沙箱内为 `vhtml.parseCaptions`）：

- 输入 SRT 或 WebVTT 文本（数据块、智能体输出、文件内容均可）；
  输出精确有理数的 `{ id?, start, end, text }` 队列。
- 接受 `HH:MM:SS,mmm`（SRT）与 `HH:MM:SS.mmm` / `MM:SS.mmm`（WebVTT）；
  cue 设置（`align:start` 等）、`NOTE`/`STYLE`/`REGION` 块被忽略；
  HTML 实体解码；多行文本保留为 `
`。
- 与 `vhtml.addCue` 组合即可生成与音轨对齐的字幕轨；cue 的 `start/end`
  与音频使用同一 Project Time，无需二次换算。

```js
for (const cue of vhtml.parseCaptions(vhtml.data.get('script'))) {
  vhtml.addCue({ text: cue.text, start: cue.start, end: cue.end });
}
```

### 6.4 混音规则与同步限制

- **音频只从音频轨道混出**：audio/video 片段 MUST 位于 `type="audio"`
  轨道才进入导出混音（带内嵌音频的视频片段放在音频轨道即可出声，
  `muted` 可静音其音频）；视觉轨道上的视频片段仅在实时预览中发声。
- `audio-offset`、timeRemap 音频、嵌套时间线音频、闪避均作用于上述
  混音单元；浏览器预览对视频元素内嵌音频偏移与 ducking 为近似
  （导出为权威语义，MUST 在能力报告中声明）。
- 非整数帧率的掉帧时间码按连续帧索引解析，不执行 SMPTE 跳帧计数修正。

### 6.5 同步能力矩阵

| 能力 | 机制 | 层级 | 状态 |
|---|---|---|---|
| 统一时间基准 | 有理数 Project Time + 半开区间 | Core | 1.1 |
| 帧采样同步 | 虚拟时钟 + 媒体 seek 就绪协议 | Core | 1.1 |
| 恒速变速音频 | `atempo` 解码链 | Core | 1.1 |
| 曲线变速音频 | timeRemap 索引读取 + 线性插值 | 扩展 | RFC-0008 |
| 音频微调 | `audio-offset` | 扩展 | RFC-0011 |
| 时间码寻址 | `HH:MM:SS:FF` / `;FF` | 扩展 | RFC-0011 |
| 字幕对齐 | `parseSubtitleBlocks` | 扩展 | RFC-0011 |
| 闪避/混音 | ducking + 两遍包络 | 扩展 | RFC-0010 |
| 输出对齐 | 输出 range + 音频范围映射 | Core | 1.1 |

限制（如实声明）：长内容 + 非整数帧率的掉帧编号不执行计数修正（解析为
连续帧索引）；浏览器实时预览对视频内嵌音频偏移与 ducking 为近似；
音频曲线变速在关键帧 >2 时为分段恒速近似并产生 info 诊断。

## 7. 错误码与能力声明

| 场景 | 错误码 |
|---|---|
| 多个创作程序 | `PARSE_DUPLICATE_ID` |
| 数据块非法 JSON | `PARSE_INVALID_DOCUMENT` |
| 程序抛错 / 超时 | `SCRIPT_ERROR` / `SCRIPT_TIMEOUT` |
| remap 关键帧时间不递增 | `TIME_INVALID` |
| 嵌套时间线环 | `REFERENCE_CYCLE` |
| ducking 旁链轨道缺失 | `REFERENCE_NOT_FOUND` |
| 帧时间码无帧率上下文 / FF 越界 | `TIME_INVALID` |
| audio-offset 越出源范围 | `TIME_OUT_OF_SOURCE`（warning） |

`vhtml capabilities` SHOULD 报告扩展能力项：`authoring-programs`、
`authoring-params`、`time-remap`、`nested-timelines`、`audio-ducking`、
`av-sync`、`caption-import`。

---

## 8. 一致性

一致性测试集（`conformance/`）新增：

- `parsing/program.vhtml` — 程序物化、数据块、确定性。
- `timing/timeremap.vhtml` — 曲线求值与 Schema 校验。
- `editing/timeremap-split.vhtml` — remap 片段分裂。
- `timing/av-sync.vhtml` — 帧时间码起点 + audio-offset 的求值一致性。

单元与集成测试见 `tests/unit/authoring.test.ts`、
`tests/unit/conformance.test.ts`、`tests/integration/code-video.test.ts`；
端到端示例见 `examples/08-code-video`（数据驱动 + 生成任务 + 变速 +
嵌套 + 闪避的单文件项目）。
