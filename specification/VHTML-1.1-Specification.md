# VHTML 1.1 规范

**状态**：候选规范（Candidate Specification），参考实现已实现并通过一致性测试  
**规范版本**：1.1  
**文档版本**：1.1.3（帧缓存 / 降混策略 / 分镜审查）  
**替代**：VHTML 1.0 Draft / Draft 0.2  
**实现**：`@sdkwork/vhtml` 1.1.3

> 本文中的 MUST、MUST NOT、SHOULD、SHOULD NOT、MAY 按 RFC 2119 解释。
> 规范中的时间、模型字段和元素名称为规范性内容；SDK、CLI 和编辑器交互属于
> 参考实现，但其中的编辑语义同样具有规范性。

---

## 1. 范围与设计目标

VHTML 是一种 HTML 兼容的声明式多媒体创作格式，用文档描述：

- 标准 HTML/CSS/SVG/Canvas/JavaScript 内容；
- 可复用的 Scene；
- 精确的项目时间、Timeline、Lane、Clip；
- 动画、转场、效果、字幕和音频混合；
- 图像、视频、音频、音乐、语音、文本的生成任务；
- 确定性帧采样与最终导出；
- 可选的项目目录、`vhtml.json` 清单、外部 Scene 与外部文件管理；
- 可选的可视化编辑器（WYSIWYG）模型契约。

设计目标：

1. **HTML 完整能力**：内容子树由浏览器引擎解析和渲染，VHTML 不重定义
   `video`、`audio`、`canvas`、`svg`、`img` 等原生语义。
2. **统一项目模型**：文档与 DOM 解耦，任何工具都可读取、验证、编辑和迁移。
3. **精确时间**：所有时间使用有理数秒；帧率使用精确比率；帧/采样边界有唯一规则。
4. **非破坏性编辑**：Clip 是对 Asset/Scene 的一次使用；剪辑操作不修改原始素材。
5. **确定性可复现**：受控浏览器、虚拟时钟、媒体定位、帧就绪协议和能力声明。
6. **生成原生**：生成任务是 Core 对象，具有输入、约束、状态、缓存与来源信息。
7. **可替换实现**：解析器、浏览器、音频混音器和编码器均可替换。
8. **代码优先**：官方 SDK 允许用普通 TypeScript/JavaScript 构建同一 Core Model。

VHTML 1.1 不承诺：

- 任意网页脚本都能无损地、确定性地跳转到任意时间；
- 不同浏览器、操作系统、字体和 GPU 下像素完全一致；
- 替代所有专业非线性编辑器；
- 内置任何特定 AI 模型或厂商 API。

---

## 2. 相对 1.0 草案的关键修订（规范性）

1. **HTML 安全标签**：`<track>` 是 HTML 空元素，`<caption>` 在 HTML body
   中会被忽略，二者不能安全地充当容器。1.1 使用 `<lane>` 和 `<cue>`；
   `<generate>` 的输入使用 `<gen-input>`、输出使用 `<gen-output>`。
2. **自闭合容错**：HTML5 会忽略非空元素上的 `/>`。VHTML 解析器在项目
   语义层对已知 VHTML 自闭合标签执行展开；规范序列化 MUST 使用显式结束标签。
   Scene 内部 HTML 不会被改写。
3. **单一根文档形式**：`<vhtml version="1.1">` 包裹唯一 `<project>`；
   也接受 `<project>` 作为文档元素以兼容 1.0。
4. **全局唯一 ID 与命名空间引用**：`scene:`、`asset:`、`gen:`、`timeline:`；
   裸引用只允许在全局唯一时使用。
5. **转场以重叠为基础**：同 Lane 上的两个 Clip 必须重叠；转场窗口是
   重叠区间，不允许通过“无素材把手”的隐式延长伪造转场。
6. **编辑操作标准化**：trim/split/ripple/roll/slip/slide/speed/freeze/
   transition 具有明确的源时间映射规则，并被规范化为 Core Model 操作。
7. **生成任务与缓存**：生成结果通过内容寻址缓存与 `provenance` 登记为 Asset，
   源文档不必保存密钥或二进制。
8. **确定性等级与帧就绪协议**：不得用固定延时截图冒充确定性采样。
9. **能力声明与稳定错误码**：可选能力必须显式声明；错误必须有稳定代码。
10. **代码优先 SDK**：SDK 生成与解析器完全相同的 Project/IR。

---

## 3. 文档语法

### 3.1 规范形式

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>My film</title>
    <style>/* global CSS */</style>
  </head>
  <body>
    <vhtml version="1.1">
      <project id="my-film" version="1.1" title="My film">
        <settings>
          <composition width="1920" height="1080"
                       frame-rate="30/1" duration="12s"
                       sample-rate="48000" channels="2"
                       background="#000000" color-space="srgb" seed="1" />
        </settings>
        <!-- assets, scenes, generations, timelines, outputs -->
      </project>
    </vhtml>
  </body>
</html>
```

解析要求：

- 文件扩展名 `.vhtml`，UTF-8，接受 CRLF/LF/CR。
- 使用 HTML5 树构建算法解析。未知元素按 HTML 解析规则保留。
- 根识别：先找 `<vhtml>`，再找其中的 `<project>`；否则接受 `<project>` 作为文档元素。
- `version` MUST 为 `1.1`（接受 `1.0` 并给出迁移警告）。
- HTML 内容子树（`<scene>` 内部）MUST 原样保留，除直接/嵌套的 `<style>`、
  JavaScript `<script>` 被提升到受控位置外，不得重写标签或属性。
- 非 JavaScript 的 `<script type="application/ld+json">` 等内容保留在 HTML 中。
- SVG 内部的标签（包括 `<animate>`、`<text>`、`<image>`）遵循 SVG 语义，
  不得被解释为 VHTML 节点。

### 3.2 自闭合与结束标签

- 规范序列化 MUST 对非 void 元素写显式结束标签：
  `<composition …></composition>`、`<asset …></asset>`、`<clip …></clip>`。
- 解析器 SHOULD 接受 `<asset />`、`<clip />` 等项目级 VHTML 自闭合写法，
  并在 HTML 解析前展开；该容错不得改变 Scene 内 HTML。
- `<track>` 不得作为 Lane 容器；解析器 MUST 报 `PARSE_HTML_AMBIGUITY`。
- `<caption>` 不得作为字幕容器；使用 `<cue>`。

### 3.3 上下文边界

`<scene>` 内部是 HTML 内容子树。以下名称在 Scene 内遵循 HTML/SVG 语义，
即使它们与 VHTML 元素同名：

- `video`、`audio`、`canvas`、`img`、`picture`、`source`、`track`、`caption`
  （表格标题）、`output`（表单输出）、`input`、`template`、`svg` 及其子元素。

项目语义元素只在其父上下文被识别。例如：

- `<output>` 仅在 `<project>` / `<outputs>` 下是导出配置；
- `<asset>` 仅在 `<assets>` 或 `<project>` 下是资源声明；
- `<cue>` 仅在 caption Lane 下是字幕片段；
- `<effect>` 仅在 `<clip>` 下是效果。

### 3.4 核心元素

| 元素 | 上下文 | 职责 |
|---|---|---|
| `vhtml` | 文档 | 版本化 VHTML 根 |
| `project` | `vhtml` / 文档 | 项目根，全局 ID 作用域 |
| `settings` | `project` | 默认配置容器 |
| `composition` | `settings` / `project` | 画布、帧率、时长、音频、颜色、种子 |
| `assets` / `asset` | `project` | 原始媒体声明 |
| `scenes` / `scene` | `project` | 可复用 HTML 场景 |
| `generations` / `generate` | `project` | 生成任务 |
| `prompt` / `negative-prompt` | `generate` | 文本意图 |
| `gen-input` | `generate` | 生成输入引用 |
| `constraints` | `generate` | 时长、画幅、分辨率、帧率、采样率等 |
| `params` | `generate` | 标准/厂商参数命名空间 |
| `direction` | `generate` | 可移植的镜头/画面/语音/音乐/音效方向（JSON） |
| `review` / `rights` / `safety` | `generate` | 人工审核、权利/同意、安全声明 |
| `gen-output` | `generate` | 输出路径/类型提示 |
| `storyboard` / `shot` | `project` | 分镜规划层（不改变 Timeline） |
| `timelines` / `timeline` | `project` | 时间轴 |
| `lane` | `timeline` | 轨道（视频/叠加/音频/字幕/数据） |
| `clip` | `lane` | Scene/Asset/Generation 的时间轴使用实例 |
| `cue` | caption `lane` | 字幕片段 |
| `transition` | `lane` | 两个 Clip 之间的转场 |
| `effect` / `audio-effect` | `clip` | 视觉/音频效果 |
| `animate` | `clip` / `animations` / `project` | 关键帧动画 |
| `keyframe` | `animate` | 关键帧 |
| `transform` / `crop` | `clip` | 变换与裁剪 |
| `outputs` / `output` | `project` | 导出配置 |
| `markers` / `marker` | `timeline` | 标记与章节 |
| `animations` | `project` | 项目级动画容器 |
| `metadata` | `project` | 项目元数据（属性） |
| `metadata` / `meta` | `clip` / `cue` | 片段元数据：`<metadata><meta name="…" value="…"></metadata>`（camelCase 键如 `linkId` MUST 用 name/value 形式——HTML 解析把属性名转小写；`<metadata k="v">` 属性形式仅适用于全小写键） |
| `requirements` / `requires` | `project` | 能力要求 |
| `extension` | `project` | 扩展声明 |
| `style` / `script` | 文档 | 全局 CSS / JavaScript |

### 3.5 属性、标识与引用

- 属性名使用小写 kebab-case。HTML 解析器会把名称转小写。
- `id` MUST 在整个 Project 内唯一，匹配 `[A-Za-z_][A-Za-z0-9_.:-]*`。
- 引用语法：
  - `scene:<id>`、`asset:<id>`、`gen:<task-id>`、`timeline:<id>`；
  - 裸 `<id>` 仅在该 ID 在 Project 内唯一时合法。
- `ref` 指向的对象类型必须与 Clip 类型兼容。
- 布尔属性接受 `""`、`true/false`、`1/0`、`yes/no`；规范序列化使用 `true` 或省略。
- 未知必需扩展 MUST 报错；未知可选扩展 MUST 保留或告警，不得静默改变核心语义。
- 颜色接受 CSS 颜色；规范示例使用 `#rrggbb`。
- 尺寸默认为像素；`x`/`y` 支持 `%`（相对画布）。
- 文本内容必须作为数据处理，不得当作脚本执行。

### 3.6 Scene 样式与脚本

- `<scene>` 内 `<style>` MUST 被 Scope 到该 Scene 实例的根：
  `[data-vhtml-scene="<scene-id>"] <selector>`。
- `@media`/`@supports`/`@layer` 递归 Scope；`@font-face`、`@keyframes`、`@property`
  保持全局。Scene 应使用唯一 keyframe 名称。
- Scene 内的 JavaScript `<script>` 被提取并在 Stage DOM 建立后执行一次（按 Scene 类型去重）。
  多次实例化同一 Scene 时，脚本应通过 `vhtml.sceneRoots(sceneId)` 处理全部实例。
- 脚本中的 DOM 修改、计时器、随机数、网络访问受确定性配置约束（见第 8 节）。
- 全局 `<style>` 位于 `<head>` 或 `<project>` 直系，作用域为整个 Stage。
- `<scene src="scenes/hero.html">` MAY 从外部 HTML 片段加载；外部片段中的相对 URL MUST 相对该文件解析并 rebase 为项目根绝对 URL，`<style>` 与 JavaScript `<script>` 按上述规则提取。`scene.src` MUST 被保留，序列化不得内联外部内容。

### 3.7 HTML 语义保留

- 不得删除 ARIA 属性、`alt`、语义标签或表单语义。
- Scene 内的 `<video>`/`<audio>` 可以由浏览器播放，但**不自动**成为时间轴音频；
  时间轴音频 MUST 由 audio Lane 上的 Clip 显式引用 Asset。
- `<video>` 元素用于视觉素材时，渲染器负责定位其源时间；由 Clip 绑定决定语义。

### 3.8 Composition

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `width` | integer 16..16384 | 必填 | 画布宽 |
| `height` | integer 16..16384 | 必填 | 画布高 |
| `frame-rate` | ratio | 必填 | 精确帧率，如 `30000/1001` |
| `duration` | time | 必填* | 项目主时长；缺失时可从主 Timeline 推导并告警 |
| `sample-rate` | integer 8000..192000 | 48000 | 音频采样率 |
| `channels` | 1..8 | 2 | 音频声道数；参考实现混合为 1/2 声道 |
| `background` | color | `#000000` | Stage 背景 |
| `color-space` | `srgb` \| `display-p3` \| `rec709` | `srgb` | 参考实现按 sRGB 输出 |
| `seed` | integer | 1 | 确定性随机种子 |
| `device-scale-factor` | number 1..4 | 1 | 采样 DPR；非 1 会降低可复现性 |

### 3.9 Clip 属性

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `ref` / `src` | ref | — | 引用 Scene/Asset/Generation；`src` 为隐式 Asset 简写 |
| `kind` | enum | 推导 | `scene/video/image/svg/audio/caption/data` |
| `start` | time | 0s | 项目时间起点，左闭 |
| `duration` | time | 见规则 | 项目时间长度；权威值 |
| `in` / `out` | time | 0 / 推导 | 源素材时间窗口 |
| `speed` | number >0 | 1 | 播放速度；有理数存储 |
| `reverse` | boolean | false | 反向播放 |
| `freeze` | time/bool | — | 固定源时间 |
| `enabled` | boolean | true | 是否参与输出 |
| `z-index` | integer | 0 | 同 Lane 内合成顺序 |
| `opacity` | 0..1 | 1 | 不透明度 |
| `blend` | CSS blend mode | normal | 混合模式 |
| `fit` | cover/contain/fill/none | cover | 媒体适配 |
| `volume` | number 或 dB/% | 1 | 音频增益 |
| `pan` | -1..1 | 0 | 声像 |
| `fade-in`/`fade-out` | time | — | 音频淡入/淡出 |
| `muted` | boolean | false | 音频 Clip 静音 |
| `loop` | boolean | false | Scene Clip 循环场景局部时间 |
| `class` | string | — | 加到生成 Clip 层的 CSS 类 |

`transform` 子元素：`x/y`（px 或 %）、`scale`/`scale-x`/`scale-y`、
`rotate`（deg/rad/turn）、`anchor-x`/`anchor-y`（0..1 或 %）、`perspective`。

`crop` 子元素：`left/right/top/bottom`，占画面比例，合计 <1。
裁剪为**区域揭示（inset）语义**：裁剪区域外的内容被隐藏，层框本身不缩放（需要回填时用 `transform.scale`）；当同一片段同时存在 mask 效果时，mask 拥有 clip-path 通道并优先，冲突以 issue 显式上报。

### 3.10 时间值语法

```text
0 | 12 | 1.5s | 250ms | 2m | 1h | 10f | 00:00:02.500 | 30000/1001s | 1/3s
```

- 裸数字仅接受 `0`；其他时间必须带单位或时间码。
- `f` 表示帧，需要 frame-rate 上下文。
- 时间码 `HH:MM:SS.mmm`，非丢帧。
- 有理数形式 `n/ds` 用于精确序列化。
- 帧率语法：`30`、`30/1`、`30000/1001`、`23.976`。

### 3.11 Lane 与 Transition

- `<lane type="video|overlay|audio|caption|data">`。
- `order` 越大越靠上；缺省按文档顺序。
- `volume`、`pan`、`opacity`、`blend`、`caption-style`、`muted`、`enabled`。
- `<transition from="…" to="…" type="crossfade|fade|wipe|slide|zoom|blur|dip"
  duration="…" direction="left|right|up|down" easing color>`。
- 转场窗口 MUST 是两个 Clip 的重叠区间；`duration` 不得大于重叠。
- 同 Lane 上允许重叠以获得叠加或转场；Validator 不做“禁止重叠”假设。
- Caption Lane 只能包含 `<cue>`。

### 3.12 Effect

视觉效果（作用于 Clip 层）：

| type | 参数 | 说明 |
|---|---|---|
| `blur` | `amount/radius` px | 高斯模糊 |
| `brightness` / `contrast` / `saturate` | `amount` | CSS filter 倍数 |
| `grayscale` / `sepia` / `invert` | `amount` 0..100 | CSS filter 百分比 |
| `hue-rotate` | `angle` deg | 色相旋转 |
| `drop-shadow` | `x/y/blur/color` | 投影 |
| `glow` | `blur/spread/color` | 光晕 |
| `grain` | `opacity/size` | 确定性噪点叠加 |
| `vignette` | `amount` | 暗角 |
| `tint` / `color-overlay` | `color/opacity/blend` | 颜色叠加 |
| `rounded` | `radius` | 圆角 |
| `mask` | `shape/inset/points/value` | `clip-path` 遮罩 |
| `chroma-key` | `color/tolerance/spill` | 媒体色键（参考实现用 Canvas） |
| `filter` | `value` | 原始 CSS filter 片段 |
| `css` | `style/value` | 受控自定义 CSS 片段 |

音频效果：`gain`、`highpass`、`lowpass`、`compressor`、`echo`、`pitch`。
未知效果产生 warning，渲染器应忽略并继续，除非被声明为必需扩展。

### 3.13 Animation

```html
<animate property="opacity" from="0" to="1"
         start="0s" duration="0.6s" easing="ease-out" />
<animate property="x" values="0;20;0" times="0s;0.5s;1s" />
<animate property="transform" target=".title"
         start="0s" duration="1s">
  <keyframe at="0%" value="translateY(40px)" />
  <keyframe at="100%" value="translateY(0)" />
</animate>
```

- `property` 规范属性：`opacity/x/y/scale/scaleX/scaleY/rotate/blur/brightness/
  contrast/saturate/grayscale/sepia/invert/hueRotate/volume/pan`。
- 带 `selector`（或项目级 `target`）时，动画作用于 Clip 内/Stage 内的 HTML 元素；
  否则作用于 Clip 层。
- 时间基准 `time-base="clip|project"`；嵌套 Clip 默认 `clip`，项目级默认 `project`。
- 关键帧时间相对于动画起点；`at="50%"` 相对动画 duration。
- 默认 `easing="linear"`、`iterations=1`、`direction=normal`、
  `fill=both`、`compose=replace`。
- 缓动：`linear`、`ease`、`ease-in`、`ease-out`、`ease-in-out`、
  `cubic-bezier(a,b,c,d)`、`steps(n, …)`。
- 同一属性多个动画时按文档顺序应用；`compose=add/accumulate` 累加，
  `replace` 覆盖。冲突不得依赖 DOM 更新顺序。
- 属性插值支持数字+单位、颜色（hex/rgb[a]/命名色）与离散值。
- 动画不得改变时间轴结构。

### 3.14 Project 级动画

```html
<animations>
  <animate target=".watermark" property="opacity" from="0.4" to="1" duration="2s" />
  <animate clip="hero-clip" property="scale" from="1" to="1.05" duration="4s" />
</animations>
```

项目级 `animate` 若无 `clip`，`target` 必须是 Stage 内 CSS 选择器。
项目级动画在确定性模式下以项目时间求值。

### 3.15 Generation Task

```html
<generate id="hero-video" kind="video" provider="procedural" model="…">
  <prompt>Cinematic product reveal…</prompt>
  <negative-prompt>text artifacts, flicker</negative-prompt>
  <gen-input ref="logo" role="reference-image"></gen-input>
  <constraints duration="5s" aspect-ratio="16:9" resolution="1920x1080"
               frame-rate="30/1" seed="42"></constraints>
  <params style="cinematic" seed="42"></params>
  <direction>{"shot":{"camera":"slow push in","lighting":"neon"},"video":{"loop":false}}</direction>
  <review status="pending"></review>
  <rights license="CC-BY" commercial-use="true" ai-disclosure="true"></rights>
  <safety rating="general" moderated="true"></safety>
  <gen-output path="generated/hero.mp4" mime-type="video/mp4"></gen-output>
</generate>
```

- `kind`：`image/storyboard/video/avatar/lipsync/speech/dub/music/sfx/audio/matte/edit/translation/text`。
- `direction`：可移植的镜头、画面、视频、语音、音乐、音效、编辑方向；JSON 对象。详细字段见 [generation.md](./generation.md)。
- `review`：`pending/approved/rejected/changes-requested`，可带 reviewer/notes。
- `rights`：license、consent、likeness、voice-cloning、commercial-use、ai-disclosure。
- `safety`：rating、policy、moderated、notes。
- `gen-input` 可引用 Asset、Scene 或另一个生成任务；`gen:<task>` 依赖会拓扑排序，成环 MUST 失败。
- 生成任务输出 Asset ID：`gen:<task-id>`（多输出追加 `:<index>`）。
- Clip 可直接 `ref="gen:<task-id>"`，导出前必须物化。
- 源文档 MUST NOT 包含 API 密钥、令牌或密码。

### 3.16 Storyboard

分镜是可选规划层，位于 `<project>` 下；它不参与播放，也不改变 Timeline：

```html
<storyboard>
  <shot id="shot-1" order="1" title="Cover" scene="intro"
        generation="cover" asset="cover-thumb" duration="1s"
        status="boarded" tags="cover,hero">
    <description>Opening frame</description>
    <prompt>cinematic product cover</prompt>
    <direction>{"shot":{"framing":"wide","camera":"slow push in"}}</direction>
    <notes>Hold for the title.</notes>
  </shot>
</storyboard>
```

- `order` 从 1 连续递增；数组顺序 MUST 与 `order` 一致。
- `scene` / `generation` / `asset` 可选，存在时 MUST 解析到对应对象。
- `status`：`idea / boarded / generating / ready / approved`。
- `direction` 与 GenerationTask 共用同一方向词汇。
- 分镜删除/修改 MUST NOT 删除或移动 Scene、GenerationTask、Asset、Clip。
- 自由编辑操作（`storyboard.add/set/remove/move/reorder`）是该 Profile 的一部分，详见 [storyboard.md](./storyboard.md)。

### 3.17 Output

```html
<output id="mp4" format="mp4" timeline="main"
        width="1920" height="1080" frame-rate="30/1"
        video-codec="libx264" audio-codec="aac"
        crf="18" preset="medium" audio-bitrate="192k"
        sample-rate="48000" channels="2" pixel-format="yuv420p"
        start="0s" duration="10s" fit="contain" path="out/film.mp4"
        burn-captions captions-path="out/film.vtt" />
```

格式：`mp4`、`webm`、`gif`、`png-sequence`、`wav`、`mp3`。
`start`/`duration` 是相对 Timeline 的导出区间；缺失时导出整条 Timeline。
`width/height` 与 Composition 不同的时候，`fit` 决定缩放方式：
`stretch`（旧默认，拉伸）、`contain`（加边）、`cover`（居中裁切）。缺少 `fit` 时保持向后兼容的 `stretch`。
`burn-captions` 仅控制附加行为；字幕片段作为视觉 Clip 始终参与 Stage 渲染。
`captions-path` 生成 WebVTT sidecar。

### 3.18 Data Lane 与 Markers

- `data` Clip 承载任意元数据（`value`），不参与视觉/音频输出。
- `<marker at="…" name="…" type="marker|chapter|comment" color="…">` 用于章节、审阅和工具。

---

## 4. 精确时间模型

### 4.1 有理时间

所有内部时间 MUST 使用精确有理数秒 `num/den`（约分、den>0）。
解析器、编辑器和导出器不得使用浮点累计值决定帧边界。
JSON/IR 使用 `{ "num": n, "den": d }`。

### 4.2 帧、采样与边界

- 帧索引从 0 开始，采样时间 `t(n) = n / fps`。
- 帧数 `frameCount(duration, fps) = ceil(duration * fps)`。
- 帧 `n` 的活动区间为 `[n/fps, (n+1)/fps)`。
- 所有 Clip、Cue、Transition、动画区间使用左闭右开 `[start, end)`。
- 音频采样数 `round(duration * sampleRate)`；采样索引 `floor(t * sampleRate)`。

### 4.3 源时间映射

对 Clip 的局部时间 `local = t - start`：

- 正向：`source = in + local * speed`
- 反向：`source = out - local * speed`，其中 `out = in + duration * speed`
- 冻结：`source = freeze`
- Scene 局部时间：与视频相同，但作用于 Scene 的 HTML 动画时间；
  `loop=true` 时对 Scene 名义时长取模。
- 图片/Caption/Data：无源时间。

默认值：

- `in = 0`。
- 给定 `duration` 与 `speed` 时，`out = in + duration * speed`。
- 给定 `in/out/speed` 但未给 `duration` 时，`duration = (out-in)/speed`。
- `duration` 是权威值；若 `duration` 与 `in/out` 不一致，Validator SHOULD
  告警并由 `duration` 重算 `out`。

### 4.4 转场窗口

同 Lane 上 `from` 与 `to` 有重叠时：

```text
window_start = max(from.start, to.start)
window_end   = min(from.end, to.end)
duration     = min(transition.duration, window_end - window_start)
progress     = ease((t - window_start) / duration)
```

`from.start < to.start`。重叠不足时 Validator MUST 报
`TIME_TRANSITION_INVALID`。

### 4.5 Scene 时长

`scene.duration` 是名义时长，仅用于：

- Clip 未给 `duration` 时的默认值；
- `loop` 取模；
- 诊断提示。

Clip 超出 Scene 名义时长不会自动截断 Scene 的 HTML/动画时间。

### 4.6 输出区间

Output 的 `start` 与 `duration` 定义相对于 Timeline 的采样区间。
导出帧在 `[start, start+duration)` 内按 `frameCount` 采样。
超出 Timeline 的区间 MUST 被拒绝或夹取并告警。

---

## 5. Core Model

### 5.1 对象

```text
Project
├── Composition
├── Asset[]
├── Scene[]
├── GenerationTask[]
├── Timeline[]
│   ├── Lane[]
│   │   ├── Clip[]
│   │   ├── Transition[]
│   │   └── Effect[]? (效果挂在 Clip)
│   └── Marker[]
├── Animation[] (项目级)
└── OutputConfig[]
```

### 5.2 关系分离

MUST 区分：

1. 结构关系：Scene/Asset 与 Clip 的引用。
2. 时间关系：start/duration/in/out/speed/reverse/loop。
3. 合成关系：Lane order、Clip z、opacity、blend、transform、crop、effects。
4. 执行依赖：Asset 加载、Generation Task、导出。

不得仅根据 DOM 嵌套推导时间轴，也不得仅根据时间重叠推导资源依赖。

### 5.3 合成规则

- 视觉 Lane 按 `order` 升序合成（大者在上）；同 Lane 内按 Clip `z` 升序，
  相同时按文档顺序。
- Caption 始终位于视觉内容之上（参考实现 z=900000+）。
- 转场覆盖层位于所有视觉 Lane 之上、字幕之下（参考实现 z=850000）。
- 每个视觉 Clip 的最终不透明度 = Clip opacity × Lane opacity × 转场系数。
- `blend` 默认为 CSS mix-blend-mode；Clip 非 normal 时覆盖 Lane blend。
- 音频 Lane 按时间叠加；同一时刻多个 Clip 求和。
- 音频转场使用等功率交叉淡化（cos/sin 曲线）。

### 5.4 模型不变量

- 所有 ID 全局唯一。
- Clip `start >= 0`，`duration > 0`，`speed > 0`。
- Timeline 时长 ≥ 最后一个 Clip 结束时间（编辑自动扩展）。
- Scene/Asset 引用必须存在且类型兼容。
- Transition 两端 Clip 必须同 Lane 且重叠。
- Animation keyframe 时间有序且位于 `[0, duration]`。
- Output 尺寸必须为正；yuv420p 需偶数尺寸。
- 生成任务输入引用必须存在。

---

## 6. 编辑模型（规范性）

### 6.1 操作

| 操作 | 语义 |
|---|---|
| `clip.trim` | 调整项目 start/end/duration，保持源窗口一致 |
| `clip.split` | 在项目时间点将 Clip 切成左右两段，并拆分动画 |
| `clip.rippleDelete` | 删除 Clip，并将同 Lane 后续 Clip 左移其原 duration |
| `clip.move` | 移动项目 start（可跨同 Timeline Lane） |
| `clip.slip` | 源窗口平移，项目时间不变 |
| `clip.slide` | 保持左右邻接外边界，移动 Clip 并调整邻接 Clip |
| `clip.roll` | 移动相邻剪辑点，改变两侧源窗口 |
| `clip.speed` | 改变 speed，保持源窗口，重新计算 duration |
| `clip.freeze` | 固定源时间；可用 `at` 先分割再冻结右侧 |
| `clip.set` | 修改表现属性（不修改时序） |
| `transition.add/remove` | 增加/删除转场并夹取到重叠 |
| `animation.add/remove` | 增加/删除动画 |
| `effect.add/remove` | 增加/删除效果 |
| `marker.add/remove` | 标记/章节 |
| `track.add/remove/set` | Lane 管理 |
| `timeline.set` | Timeline 名称/时长 |
| `project.set` | 项目/Composition 设置 |
| `scene.set` | 更新内联 Scene 的 authored HTML/CSS/scripts |
| `batch` | 顺序执行操作 |

### 6.2 Trim 公式

调整项目起点 `Δ = newStart - oldStart`，新时长 `D' = newEnd - newStart`：

- 正向：`in' = in + Δ*speed`，`out' = in' + D'*speed`
- 反向：`out' = out - Δ*speed`，`in' = out' - D'*speed`
- Scene：`sourceIn' = sourceIn + Δ`
- 图片/Caption/Data：仅改变项目时间。
- 冻结/音频：同正向规则，但不得越过素材边界。
- 越界 MUST 拒绝并返回 `EDIT_OUT_OF_BOUNDS`。

### 6.3 Split

切割点 `c`，`leftDuration = c - start`：

- 正向：`splitSource = in + leftDuration*speed`；左半 `[in, splitSource]`，
  右半 `[splitSource, out]`。
- 反向：`splitSource = out - leftDuration*speed`；左半 `[splitSource, out]`，
  右半 `[in, splitSource]`。
- 左右继承 effects、transform、opacity、volume 等表现属性。
- 动画：位于切点前的归左，切点后的右移；跨切点的动画在切点求值后拆分，
  左半 fill=forwards，右半从边界值开始 fill=both。
- 引用原 Clip 的过渡：出边改为右半，入边保留左半。

### 6.4 Ripple / Roll / Slip / Slide

- Ripple Delete：仅移动 `start >= removedEnd` 的同 Lane Clip；时间轴长度不回缩。
- Roll：调整相邻剪辑点；对两侧执行 trim。
- Slip：`in' = in + Δ`，`out' = out + Δ`，项目时间不变；素材边界夹取。
- Slide：要求左右邻接；调整左右邻接 Clip 的边界，保持外部边界固定。

### 6.5 撤销/重做

编辑器 SHOULD 使用快照或等价日志实现撤销；失败/无效操作不得进入历史。
参考实现 `EditSession` 保留最近 100 个快照。

---

## 7. 音频

- 参考实现将每个音频 Clip 解码为 48kHz（或 Output sampleRate）双声道 float PCM，
  在 Node 中按时间轴逐采样混合。
- 速度使用 FFmpeg `atempo`（保持音高）；反向在 PCM 层反转。
- 音频效果在解码链应用；增益、淡入淡出、音量自动化、声像在混音层应用。
- 声像采用线性平衡律：中心两声道均为 1；硬左/右只保留一侧。
- 淡入/淡出线性；音量自动化每 128 采样块求值。
- 转场为等功率：out `cos(pπ/2)`，in `sin(pπ/2)`。
- 混音后可选峰值归一化/EBU R128 (`loudnorm I=…:TP=-1.5:LRA=11`)。
- 视频 Clip 只有在 audio Lane 上时才参与混音；视觉 Lane 的 `<video>` 音频默认静音。

---

## 8. 渲染与确定性

### 8.1 模式

- `interactive`：编辑器预览，允许实时播放和用户交互。
- `record`：录制运行结果，不保证任意跳转。
- `deterministic`：项目时间驱动受控动画、媒体与帧采样。

参考实现只承诺 `deterministic` 下的时间与视觉一致性；Studio 使用 `preview` 模式。

### 8.2 确定性运行时

- 使用固定 Chrome 版本、固定视口、DPR=1、sRGB、软件光栅化。
- 注入虚拟时钟：`Date`、`performance.now`、`setTimeout`、`setInterval`、
  `requestAnimationFrame` 由项目时间推进。
- `Math.random` 与 `crypto.getRandomValues` 使用项目 seed 的 PRNG。
- 暂停所有 CSS/WAAPI 动画，并按 Clip 的 Scene 局部时间设置 `currentTime`；
  禁用 CSS transition。
- `<video>` 暂停、设置 `currentTime`、等待 `seeked` + `requestVideoFrameCallback`；
  超时记录诊断。
- 字体 `document.fonts.ready`、图片 `decode()`、媒体 metadata 必须就绪。
- 外部网络默认阻止并记录；本地项目通过受限 HTTP server 提供，支持 Range 请求。
- 帧就绪 MUST 可观测、可超时；禁止固定延时截图冒充帧同步。

### 8.3 帧就绪协议

一次采样：

1. 校验请求（帧索引、帧率、视口、模式）。
2. 推进虚拟时钟/计时器/rAF。
3. 求值 Timeline/Clip/Transition/Animation。
4. 应用 DOM 样式、媒体源时间、CSS 动画时间。
5. 等待用户 `vhtml.onSeek` 钩子、媒体 seek、字体/图片。
6. 强制布局并截图。
7. 返回帧、时间戳、诊断。

`vhtml` 客户端 API：

```ts
vhtml.version;
vhtml.mode;
vhtml.time;                 // { current, frame, fps, duration, playing }
vhtml.onSeek(callback);     // 可返回 Promise，渲染器会 await
vhtml.sceneRoots(sceneId?); // 当前 Scene 实例的根元素
vhtml.ready;                // Promise
vhtml.seek(seconds, frame?);
```

### 8.4 确定性分级

- **结构确定性**：相同输入产生等价 Core Model。
- **时间确定性**：相同项目时间得到等价时间轴/动画/媒体状态。
- **视觉一致性**：同一受控环境重复渲染满足容差（参考实现要求 PNG 哈希相等）。
- **像素确定性**：仅在固定浏览器/字体/OS/GPU/解码器时承诺。

### 8.5 能力限制

- 任意网络依赖、`Date` 之外的系统时钟、用户输入、WebSocket、Service Worker
  不保证可重放。
- WebGL/WebGPU 通过 Chromium 截图，但跨驱动不保证像素一致。
- CSS `@keyframes` 名称在 Scene 间不自动重命名。
- SMIL/SVG 声明式动画不在确定性 Profile 中定位。
- 外部媒体默认阻止；需下载到项目内或显式允许网络。

---

## 9. 生成

### 9.1 状态机

`draft → queued → running → succeeded | failed | cancelled`

重试、超时、取消、幂等键由运行时定义；同一 Task 的输出 MUST 可缓存并复现。

### 9.2 Provider Adapter

- `procedural`：确定性 SVG/视频/音频/音效/文本。
- `manifest`：从 JSON 清单映射预生成文件，支持单任务多输出（stems/多语言）。
- `http`：通用 HTTP 契约（见 [generation.md](./generation.md)），支持同步和异步 job。
- Provider MUST 声明支持的 `kind`、模型、输入角色与输出类型。
- 输出 MUST 登记为 Asset，包含 `provenance`（task/provider/model/prompt hash/seed/hash/时间）。
- 缓存键包含任务、provider、model、约束、参数、direction、rights 与输入引用/内容哈希；文件变化应使缓存失效。
- `gen:<id>` 输入 MUST 先于下游任务物化；循环依赖 MUST 在调用 Provider 前失败。

### 9.3 物化

- 导出/渲染前，`gen:<id>` 引用的任务必须物化。
- 缓存位于项目根 `.vhtml/cache/generated.json`；兼容读取 `.vhtml-cache/generated.json`。生成文件默认在 `generated/`。
- 生成 Asset ID 为 `gen:<task-id>`；引用解析优先使用物化 Asset。
- 权利声明 `likeness=consented` 或 `voiceCloning=consented` 但缺少 `consent` 时 SHOULD 警告。
- 缺失生成输出时，报告 `ASSET_UNAVAILABLE` / `GENERATION_*`。

### 9.4 安全

- 密钥只来自宿主环境变量/凭据存储，不得写入 `.vhtml`。
- HTTP Provider 默认只允许显式配置的 endpoint；下载大小、超时、路径必须受限。
- 生成输出合法性（MIME、时长、尺寸、可解码性）必须校验。

---

## 10. 导出

### 10.1 流水线

```text
Chromium deterministic frames → PNG stream ┐
Core Model audio mix → WAV ────────────────┼→ FFmpeg encode/mux → MP4/WebM/GIF/WAV/MP3
Captions → WebVTT sidecar ─────────────────┘
```

### 10.2 格式

| format | 视频 | 音频 | 说明 |
|---|---|---|---|
| mp4 | libx264 / yuv420p | aac | 交付默认 |
| webm | libvpx-vp9 | libopus | Web 交付 |
| gif | palettegen/paletteuse | — | 无声 |
| png-sequence | PNG 序列 | WAV（可选） | 目录输出 |
| wav | — | pcm_f32le/pcm_s16le | 混音 |
| mp3 | — | libmp3lame | 混音 |

- 输出尺寸与 Composition 不同时使用 Lanczos 缩放。
- 帧率使用精确比率；帧数按输出区间计算。
- 音视频共用同一项目时间；音频混音区间与导出区间一致。
- 取消 MUST 终止编码并清理临时目录。
- 导出报告包含路径、格式、尺寸、帧率、帧数、时长、文件大小、耗时、探测结果、
  诊断与能力/环境信息。

### 10.3 字幕

- `<cue>` 渲染进 Stage（burn-in）。
- `captions-path` 输出 WebVTT；支持 `<v Speaker>`。
- 字幕时间区间同样左闭右开，并裁剪到导出范围。

---

## 11. 安全与隐私

- VHTML 文档是不可信输入；运行时必须沙箱化文件/网络/脚本/模型调用。
- 项目根服务器只读、仅 loopback、拒绝路径穿越、支持 Range、无目录列表。
- 外部网络默认阻断；`allow-network` 必须显式开启并记录。
- 脚本虚拟化不等于完整安全沙箱；生产环境应使用进程隔离、权限最小化、超时与资源限制。
- 密钥不得进入文档、日志、导出报告或缓存。
- 生成结果的许可、来源、保存期限与删除策略由产品配置声明。

---

## 12. 错误、能力与一致性

### 12.1 错误码类别

`PARSE_*`、`VALIDATION_*`、`REFERENCE_*`、`TIME_*`、`ASSET_*`、`RENDER_*`、
`SCRIPT_*`、`GENERATION_*`、`EXPORT_*`、`EDIT_*`、`SECURITY_*`、`EXTENSION_*`、`IO_*`。

每个错误包含稳定代码、消息、对象 ID、可选源位置、是否可恢复与建议。

### 12.2 能力等级

- **VHTML Parser**：解析与验证核心语法。
- **VHTML Web Renderer**：HTML/CSS/SVG/Canvas 渲染与 Stage 协议。
- **VHTML Media Renderer**：Timeline、帧采样、音频混音、导出。
- **VHTML Full Runtime**：生成、字幕、编辑、能力报告与完整测试集。

实现必须公布版本、能力矩阵、测试结果与限制，不得把未实现选项伪装成核心能力。

### 12.3 一致性测试

`vhtml-conformance` 覆盖：解析、模型、时间、HTML/CSS、动画、媒体、采样重复性、
音视频同步、导出、生成、安全、版本迁移、互操作。

视觉测试分级：语义测试、容差图像测试、像素精确测试。参考实现要求同一环境
重复采样 PNG 哈希一致。

---

## 13. 版本与兼容

- 1.1：冻结核心语法、对象、时间、渲染与导出契约。
- 1.x：向后兼容的可选能力/扩展。
- 不兼容变更进入新主版本；规范、Schema、参考实现和测试集版本必须匹配。
- RFC 记录动机、替代方案、兼容性、迁移与测试。

文档修订：

- 1.1.0：核心 VHTML 1.1（文档语法、时间、编辑、渲染、生成、导出）。
- 1.1.1：增加附录 E 项目目录/外部文件 Profile、附录 F WYSIWYG Profile；
  增加 `vhtml.json`、`.vhtmlpkg`、外部 `<scene src>`、资源清单/导入/重链与
  Studio 直接操纵规范。
- 1.1.2（全部为增量可选能力，见 RFC-0013/0014/0015）：
  生成任务 `<usage>` 用量记录、配额上限与 `GENERATION_QUOTA_EXCEEDED`
  （[generation.md §13](./generation.md)）；`<characters>` 角色/风格圣经库
  与 `character:`/`style:` 引用命名空间（[generation.md §14](./generation.md)）；
  `<extension kind/base>` 效果/转场插件注册表与确定性降级求值
  （[rfc/RFC-0015](./rfc/RFC-0015-extension-plugin-registry.md)）；
  PNG 序列导出遵循交付 fit/尺寸。
- 1.1.3（全部为增量可选能力，见 RFC-0016/0017/0018）：确定性帧缓存与
  批量采样共享（[rfc/RFC-0016](./rfc/RFC-0016-frame-cache.md)）；
  `<output downmix>` 显式音频降混策略
  （[rfc/RFC-0017](./rfc/RFC-0017-audio-downmix-policy.md)）；分镜
  `<review>` 审查记录与审批历史及 `storyboard.review` 编辑操作
  （[rfc/RFC-0018](./rfc/RFC-0018-storyboard-review.md)）。

---

## 附录 A：完整示例

```html
<!doctype html>
<vhtml version="1.1">
  <project id="demo" version="1.1" title="Demo">
    <settings>
      <composition width="1280" height="720" frame-rate="30/1"
                   duration="6s" sample-rate="48000" channels="2"
                   background="#05070d" />
    </settings>
    <assets>
      <asset id="bg" type="video" src="./assets/bg.mp4" duration="6s" />
      <asset id="music" type="audio" src="./assets/music.wav" duration="6s" />
    </assets>
    <scenes>
      <scene id="hero" duration="4s">
        <div class="hero">
          <h1>Write code. Render film.</h1>
          <p>HTML on a real timeline.</p>
        </div>
        <style>
          .hero { position:absolute; inset:0; display:grid; place-items:center;
                  color:#fff; font-family:system-ui,sans-serif; }
        </style>
      </scene>
    </scenes>
    <timelines>
      <timeline id="main" duration="6s">
        <lane id="visual" type="video" order="0">
          <clip id="bg-clip" ref="bg" start="0s" duration="6s" />
          <clip id="hero-clip" ref="hero" start="0.5s" duration="4s">
            <animate property="opacity" from="0" to="1" duration="0.6s" />
          </clip>
        </lane>
        <lane id="captions" type="caption" order="1">
          <cue id="c1" start="1s" duration="3s" text="One file. Every frame." />
        </lane>
        <lane id="audio" type="audio" order="2">
          <clip id="music-clip" ref="music" start="0s" duration="6s" volume="-6dB" />
        </lane>
      </timeline>
    </timelines>
    <outputs>
      <output id="mp4" format="mp4" width="1280" height="720"
              frame-rate="30/1" path="out/demo.mp4" />
    </outputs>
  </project>
</vhtml>
```

## 附录 B：默认值

| 字段 | 默认 |
|---|---|
| clip.speed | 1 |
| clip.fit | cover |
| clip.opacity | 1 |
| clip.blend | normal |
| clip.z | 0 |
| clip.enabled | true |
| lane.order | 文档顺序 |
| lane.volume | 1 |
| lane.pan | 0 |
| transition.type | crossfade |
| transition.direction | left |
| animation.easing | linear |
| animation.iterations | 1 |
| animation.fill | both |
| animation.compose | replace |
| composition.sample-rate | 48000 |
| composition.channels | 2 |
| composition.background | #000000 |
| composition.color-space | srgb |
| composition.seed | 1 |
| output.format | mp4 |

## 附录 C：HTML 兼容矩阵（参考实现）

| 能力 | 支持 | 限制 |
|---|---|---|
| HTML5 解析/渲染 | 是 | Chromium 版本固定 |
| CSS Flex/Grid/定位/自定义属性 | 是 | — |
| CSS Animations | 是 | 暂停并按时间定位 |
| Web Animations | 是 | 同上 |
| SVG | 是 | SMIL 不定位 |
| Canvas 2D | 是 | 用户脚本需可重放 |
| WebGL | 截图支持 | 像素依赖 GPU/SwiftShader |
| 图片/字体 | 是 | 系统字体需固定 |
| 视频解码 | 是 | 依赖 FFmpeg/Chrome 解码器 |
| 外部网络 | 默认阻止 | 可显式允许 |
| 任意 JS | 部分 | 时钟/随机/计时器虚拟化，网络/输入不保证 |
| 多 Scene 实例 | 是 | Scene 脚本按类型执行一次 |
| 像素精确 | 记录环境内 | 跨环境不承诺 |

## 附录 D：与 1.0 的不兼容点

- `<track>` → `<lane>`；`<caption>` → `<cue>`。
- `<input>`（生成任务）→ `<gen-input>`；`<output>`（生成任务）→ `<gen-output>`。
- 转场要求 Clip 重叠。
- 生成输出使用 `gen:` 引用和缓存登记。
- 规范序列化使用显式结束标签。
- 编辑操作成为 Core Model 的一部分。

## 附录 E：项目目录与外部文件 Profile（规范性）

VHTML 项目 MAY 是一个目录而不是单个 `.vhtml` 文件。目录项目：

- 使用可选 `vhtml.json` 清单声明 `entry`、`source`、`paths`、`build`、`preview`、`export` 和 `settings`；
- 默认布局为 `scenes/`、`assets/{images,video,audio,fonts}/`、`generated/`、`renders/`、`.vhtml/cache/`；
- 所有相对路径 MUST 相对项目根解析；不得逃逸根目录；
- `<scene src="...">` MAY 从外部 HTML 片段加载 Scene；外部相对 URL MUST rebase 为根绝对 URL，外部 `<style>`/`<script>` 按 Scene 规则提取；
- 工具 MUST 能枚举 `<asset>`、Scene HTML/CSS、项目 CSS、`<link>`、`<script>`、`@import` 和生成输出中的文件引用，并分类 missing/external/outsideRoot/unused；
- `vhtml assets import|relink|verify` 与 `.vhtmlpkg` ZIP 打包/解包 MUST 遵守 [project-layout.md](./project-layout.md)；
- 缓存 canonical 路径为 `.vhtml/cache/generated.json`，MUST 兼容读取旧 `.vhtml-cache/generated.json`。

外部 Scene 序列化 MUST 保留 `src`，不得把外部内容内联回核心文档。

## 附录 F：WYSIWYG 编辑 Profile（规范性）

所见即所得编辑器：

- MUST 以 Core Model 为唯一真源；画布拖拽的即时 DOM 变换只用于反馈，提交时 MUST 生成 `clip.set` 等编辑操作；
- MUST 使用 composition 像素坐标到 stage 缩放坐标的映射，选择框与图层矩形一致；
- MUST 支持移动/缩放/旋转、时间轴拖动/裁剪/跨 Lane 移动、磁性吸附、资源拖放、字幕创建、转场创建/删除；
- MUST 支持点击 Scene 内任意 authored HTML 元素，并在属性面板编辑文本/Inner HTML、属性与内联 CSS；
- 内联 Scene 的元素编辑 MUST 通过 `scene.set` 原子提交并可撤销；外部 Scene 的元素编辑 MUST 先将同一 content path 补丁写入 `src` 文件，再完整 Reload，且不得进入模型 Undo 栈；
- SHOULD 支持图片/SVG 时间轴缩略图、常用效果添加/删除和缺失资源重链；
- 每次手势 MUST 原子提交、进入 Undo/Redo、通过验证；失败 MUST 回滚且不写文件；外部文件补丁为显式例外；
- 时间 MUST 量化到项目 frame rate 的有理时间；
- 外部 Scene 内容 MUST 以文件为真源；元素编辑后 MUST 重新解析，不得只改实时 DOM；
- 资源拖放 MUST 携带 Asset ID，并由服务端构造完整 Clip。

完整契约见 [wysiwyg.md](./wysiwyg.md)。
