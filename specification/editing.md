# VHTML 1.1 编辑模型

本文是 `VHTML-1.1-Specification.md` 第 6 节的展开。所有编辑操作作用于 Core Model，不依赖 Studio 或任何 UI。

## 1. 操作对象

```ts
type EditOperation =
  | { op: 'clip.add'; trackId: string; clip: Clip }
  | { op: 'clip.remove'; clipId: string }
  | { op: 'clip.rippleDelete'; clipId: string }
  | { op: 'clip.move'; clipId: string; start?: Time; trackId?: string }
  | { op: 'clip.trim'; clipId: string; start?: Time; end?: Time; duration?: Time }
  | { op: 'clip.split'; clipId: string; at: Time; id?: string }
  | { op: 'clip.slip'; clipId: string; delta: Time }
  | { op: 'clip.slide'; clipId: string; delta: Time }
  | { op: 'clip.roll'; clipId: string; edge: 'start' | 'end'; delta: Time }
  | { op: 'clip.speed'; clipId: string; speed: number | string }
  | { op: 'clip.freeze'; clipId: string; at?: Time; sourceTime?: Time }
  | { op: 'clip.duplicate'; clipId: string; id?: string; start?: Time }
  | { op: 'clip.detachAudio'; clipId: string; laneId?: string }
  | { op: 'clip.replace'; clipId: string; ref: string; keepTiming?: 'in-out' | 'project' }
  | { op: 'timeline.nest'; clipIds: string[]; timelineId?: string; clipId?: string; removeSource?: boolean }
  | { op: 'timeline.unnest'; clipId: string }
  | { op: 'timeline.rippleCut'; trackIds: string[]; start: Time; end: Time }
  | { op: 'timeline.insert'; laneId: string; clip: Clip; at?: Time }
  | { op: 'timeline.overwrite'; laneId: string; clip: Clip; at?: Time }
  | { op: 'clip.link'; clipIds: string[] }
  | { op: 'clip.unlink'; clipId: string }
  | { op: 'track.set'; trackId: string; props: { solo?: boolean } }  // solo: 见 §3 音频轨道语义
  | { op: 'timeline.moveBatch'; clipIds: string[]; start: Time }
  | { op: 'timeline.copy'; clipIds: string[] }
  | { op: 'timeline.cut'; clipIds: string[] }
  | { op: 'timeline.paste'; at?: Time; laneId?: string; mode?: 'insert' | 'overwrite'; idPrefix?: string }
  | { op: 'storyboard.apply'; shotIds?: string[]; laneId?: string; at?: Time | 'append'; gap?: Time; clipIdPrefix?: string }
  | { op: 'clip.set'; clipId: string; props: ClipSetProps }
  | { op: 'transition.add'; trackId: string; transition: TransitionInput }
  | { op: 'transition.remove'; transitionId: string }
  | { op: 'animation.add' | 'animation.remove'; … }
  | { op: 'effect.add' | 'effect.remove'; … }
  | { op: 'track.add' | 'track.remove' | 'track.set'; … }
  | { op: 'timeline.set'; … }
  | { op: 'project.set'; … }
  | { op: 'scene.set'; sceneId: string; props: { html?: string; css?: string | null; scripts?: string[]; name?: string; background?: string; src?: string | null } }
  | { op: 'marker.add' | 'marker.remove'; … }
  | { op: 'storyboard.add'; shot: StoryboardShotInput; at?: number }
  | { op: 'storyboard.set'; shotId: string; props: StoryboardShotPatch }
  | { op: 'storyboard.remove'; shotId: string }
  | { op: 'storyboard.move'; shotId: string; to: number }
  | { op: 'storyboard.reorder'; shotIds: string[] }
  | { op: 'batch'; operations: EditOperation[] };
```

时间参数接受有理数或规范时间字符串（`1.5s`、`500ms`、`90f`、`00:00:01.500`）。

`scene.set` 只更新已有 Scene 的 authored `html`/`css`/`scripts`/`name`/`background`，不创建或删除 Scene。Studio 的元素级编辑使用该操作写回内联 Scene；外部 Scene 的文件补丁不经过模型 Undo 栈。

## 2. 失败语义

- 操作失败返回 `ok:false` 与结构化诊断，不得部分写入后静默成功。
- `strict:true` 时抛出 `VhtmlError`。
- 批量操作按顺序执行；默认遇错停止。
- 编辑后 MUST 重新验证模型；无效编辑不得写入文件。
- 修改后自动扩展 Timeline 与主 Composition 的 duration（可关闭）。

## 3. 视觉/时序属性

`clip.set` 只接受表现属性，**不接受**时序属性：

- `opacity`、`blend`、`transform`、`crop`、`fit`
- `effects`、`animations`、`audioEffects`
- `volume`、`pan`、`fadeIn`、`fadeOut`
- `enabled`、`z`、`name`、`className`
- `ref`（改变来源需重新验证类型）
- Caption：`text`、`speaker`、`style`
- Data：`value`
- Scene：`loop`
- Media：`muted`

时序通过 `clip.move` / `clip.trim` / `clip.speed` / `clip.freeze` 修改。

## 4. Source 窗口不变量

对视频/音频（非冻结）：

```text
out = in + duration * speed
```

- 设置 `in` 而不改变项目时间属于 Slip，不属于 Trim。
- 改变起点必须同时改变 `in`（正向）或 `out`（反向）。
- 任何操作不得使 `in < 0` 或 `out > asset.duration`。
- 素材时长未知时允许操作，但导出时必须由解码器验证。

## 5. Split 的动画拆分

设切点局部时间 `c`：

- 完全位于左侧：保留在左。
- 完全位于右侧：`start -= c`，保留在右。
- 跨越切点：
  - 在 `c` 处求值得到边界值；
  - 左：保留切点前的 keyframe，追加 `time=c` 的边界值，`fill=forwards`；
  - 右：keyframe 时间减去 `c`，在 `0` 前插边界值，`fill=both`；
  - `iterations` 设为 1；多迭代/反向动画按近似规则复制。

## 6. 转场协调

任一编辑后：

1. 删除引用已不存在 Clip 的 Transition。
2. 计算新的重叠窗口。
3. 重叠 ≤ 0 时删除并告警。
4. `duration > overlap` 时夹取到 overlap。

## 7. Storyboard 编辑

分镜是规划层，编辑操作不改变 Timeline：

- `storyboard.add`：`at` 为插入下标；`order` 由编辑器重新编号。
- `storyboard.set`：字段级 patch；`duration:null` 清空；`scene/generation/asset:null|''` 解链；`direction:null` 清空。
- `storyboard.remove`：删除后连续重排。
- `storyboard.move`：目标下标越界时夹取。
- `storyboard.reorder`：必须列出全部 shot id 且不重复。

编辑后 MUST 保证 shot id 唯一、order 连续、引用存在、duration > 0。详见 [storyboard.md](./storyboard.md)。

## 8. Studio 交互映射

- 拖动 Clip：`clip.move`。
- 拖动左右把手：`clip.trim`。
- Split 按钮 / `S`：在当前帧 `clip.split`。
- Delete：`clip.remove`；Shift+Delete：`clip.rippleDelete`。
- Inspector 修改属性：`clip.set` / `clip.speed`。
- Storyboard 添加/字段/拖拽/复制/删除：`storyboard.*`。
- Undo/Redo：快照历史栈。
- 每次成功编辑保存 `.vhtml` 并重建 Stage。

## 9. 代码示例

```ts
import { applyEditOperations } from '@sdkwork/vhtml-core/edits';

const result = applyEditOperations(project, [
  { op: 'clip.split', clipId: 'hero', at: '2.5s' },
  { op: 'clip.rippleDelete', clipId: 'intro' },
  {
    op: 'storyboard.add',
    shot: { id: 'shot-3', title: 'Insert', scene: 'hero', duration: '1.2s', status: 'idea' },
    at: 1,
  },
]);
if (!result.ok) console.error(result.diagnostics);
```

## 10. 撤销/重做

- 快照 MUST 是深拷贝的 Core Model。
- 失败的编辑不进入历史。
- 参考实现上限 100 条，可在 Studio 中撤销。
- 跨会话持久化不是 1.1 Core 要求；可由 `.vhtml` 与版本控制承担。

---

## 9. 灵活剪辑原语与 AI 时代工作流

### 9.1 新增原语（1.1.2）

| 操作 | 语义 |
|---|---|
| `clip.duplicate` | 复制片段（含动画/效果，id 派生唯一化）；`start` 缺省紧跟原片段结束 |
| `clip.detachAudio` | 音视频分离：视频片段静音，音频副本（`kind=audio`，metadata `detachedFrom`/`audioDetachedTo` 关联）放入音频轨道 |
| `clip.replace` | 换源保时序：`keepTiming="in-out"`（默认）保持源窗口（新源不足时 clamp 并警告），`"project"` 保持项目时长重置源窗口；类型不兼容返回 `REFERENCE_INCOMPATIBLE` |
| `timeline.nest` | 选区 → 复合片段：按所选片段范围创建子时间线（各轨道克隆、时间平移），原位置放 `timeline:` 复合片段；环引用在创建前失败 |
| `timeline.unnest` | nest 的逆操作：把复合片段的内嵌片段摊平回父轨道（要求 1x 正向、无 freeze/remap/loop），子时间线删除 |
| `timeline.rippleCut` | 跨轨道波纹剪切：在指定 lanes 上删除 `[start,end)` 区间并闭合空隙（每条 lane 的 `rippleDelete` 自动波纹；时间映射/变速曲线随 split 正确切分）。文本化剪辑的核心原语——删除转写里的口误/静音区间即此一步 |
| `storyboard.apply` | 分镜 → 时间线物化：按 order 把 shot 的 scene/generation/asset 引用生成为 clip（顺序追加或从 `at` 起，`gap` 控制间隔），clip.metadata 记录 `fromShot`；重叠冲突警告跳过，不中断批次 |
| `timeline.insert` | **插入模式（三点编辑）**：在 `at` 处放入新 clip，跨越插入点的片段自动切分、后续内容整体右推新片段时长，保持相邻无空隙 |
| `timeline.overwrite` | **覆盖模式**：在 `at` 处放入新 clip 并替换目标区间（跨越片段保留两端、删除中间；其余内容原地不动） |
| `clip.link` / `clip.unlink` | 片段链接：metadata `linkId` 关联（音视频对、字模对）；`clip.move` 时链接片段自动跟随同一时间位移，`unlink` 解除 |
| `timeline.moveBatch` | **多选群组拖动**：最早选中的片段精确落到 `start`，其余片段保持相对偏移随动；零位移警告、缺失/跨时间线明确拒绝。批量原子性由操作数组语义保证（一次 apply + 验证失败整体回滚） |
| `timeline.copy` / `timeline.cut` / `timeline.paste` | **剪贴板三操作**：copy/cut 把片段（含动画/效果，动画与效果 id 派生唯一化，linkId 剥离）放入会话剪贴板（记录 lane 类型与相对偏移）；cut 先 ripple-delete；paste 按 lane 类型分轨落位（相对偏移保持），模式 `insert`（推入）或 `overwrite`（覆盖目标区间），`at` 缺省为时间线起点（宿主可传播放头）。Studio 的 Ctrl+C/X/V 中剪贴板随链接片段一起取 |

### 9.2 AI 剪辑工作流（生成 → 结构化剪辑）

这些原语与 `transcribe` 生成类型（见 [generation.md §1.1](./generation.md)）组合，
构成智能体可执行的文本化剪辑闭环：

1. **转写**：`kind="transcribe"`（Whisper / Deepgram / Azure STT / ElevenLabs
   Scribe）把口播音频转成带时间戳的 cue 数据（`gen-output role="cues"`）；
2. **文本化剪辑**：智能体从 cue 时间戳推导 `clip.split` / `clip.rippleDelete`
   序列（删除口误 = 删 cue 区间 + ripple）；字幕轨由 cue 数据 + `addCue`
   直接生成（见 [video-authoring.md §6.3](./video-authoring.md)）；
3. **口播对齐**：`clip.detachAudio` 分离原声，配音 `dub` 片段对齐后用
   `audio-offset` 微调（RFC-0011）；音量/声像手工曲线（音频自动化）经
   `animation.add`（property `volume`/`pan`）表达，Studio 关键帧面板直达，
   导出混音器逐样本求值；
4. **结构重组**：`timeline.nest` 把段落打包成复合片段以便整体移动/调色，
   `timeline.unnest` 摊平还原，`clip.duplicate` 复制模板段落，`clip.replace`
   换素材保持节奏；`timeline.rippleCut` 一步删除转写标注的口误/静音区间；
   `timeline.insert` / `timeline.overwrite` 提供行业标准的插入/覆盖放置模式，
   `clip.link` 让音视频对同步移动（Studio 拖放可切换 add/insert/overwrite 模式）；
5. **命令级闭环**：`vhtml captions --from-gen <transcribe-task>` 一条命令把
   转写 cue 落成字幕轨（`cuesToClips` 支持 cue JSON / SRT / WebVTT 三种输入，
   `--lane` 选择字幕轨）；`clip.splitMulti` 支持多点分割（beat 剪切：一次操作
   按 marker/节拍时间数组切出 N+1 段，段 id 可由调用者指定）；智能体可用
   `vhtml edit --ops -` 从 stdin 直读操作 JSON，无需临时文件；
6. **交付派生**：同一时间线按 delivery preset 导出多平台版本（横/竖/方）。

所有步骤都是 Core Model 操作：可 diff、可 undo、可由智能体通过
`vhtml edit --ops` 或程序 API（`vhtml.edit`）执行，与 Studio 手工编辑同语义。
