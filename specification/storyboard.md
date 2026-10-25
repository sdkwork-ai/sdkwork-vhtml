# VHTML Storyboard Profile

**状态**：规范性 Profile（Core Model 扩展）  
**实现**：`@sdkwork/vhtml-core`（模型/解析/编辑）、`@sdkwork/vhtml-sdk`、`@sdkwork/vhtml-studio`  
**依赖**：[VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md)、[generation.md](./generation.md)

分镜是**规划层**，不是第二套时间线。它记录一个镜头要表达什么、如何拍、用哪条 Scene/生成任务，以及是否已经审核通过。最终播放仍由 Timeline 的 Clip 决定；分镜可以自由编辑、排序和实验，而不破坏渲染时间。

---

## 1. 模型

```ts
interface StoryboardShot {
  id: string;
  order: number;                         // 1-based，数组排序权威
  title?: string;
  description?: string;                  // 画面/动作/叙事
  prompt?: string;                       // 生成提示词或拍摄备注
  scene?: string;                        // Scene id
  generation?: string;                   // GenerationTask id
  asset?: string;                        // Asset id（缩略图/参考）
  duration?: Rational;                   // 计划时长，不改变 Timeline
  status: 'idea' | 'boarded' | 'generating' | 'ready' | 'approved';
  direction?: GenerationDirection;       // 镜头/画面/声音方向，见 generation.md
  tags?: string[];
  notes?: string;
  source?: SourceLocation;
}
```

`Project.storyboard?: StoryboardShot[]`。

### 1.1 引用规则

- `scene` MUST 指向存在的 Scene。
- `generation` MUST 指向存在的 GenerationTask。
- `asset` MUST 指向存在的 Asset。
- 三个引用都是可选的：允许只有标题/描述的纯文字分镜。
- 同一镜头可以同时链接 Scene、generation 和 asset（例如 Scene 用于预览，generation 用于最终生成，asset 用于缩略图）。
- 分镜引用 MUST NOT 被解释为时间线依赖；它不改变 Clip 的 `start/duration/ref`。

### 1.2 状态

| status | 含义 |
|---|---|
| `idea` | 只有想法 |
| `boarded` | 构图/镜头方向已定 |
| `generating` | 正在生成/拍摄 |
| `ready` | 素材可用 |
| `approved` | 已审核 |

状态是规划状态，不替代 GenerationTask 的 `status` 或 `review`。

### 1.3 顺序

- `order` 从 1 开始，MUST 唯一。
- 数组顺序 MUST 与 `order` 升序一致。
- 编辑操作负责重排后重新编号，禁止出现空洞。
- 序列化时以数组顺序写 `order`；解析时按 `order` 排序并重新编号。

---

## 2. 文档语法

分镜位于 `<project>` 下的 `<storyboard>`，每个镜头是一个 `<shot>`：

```html
<storyboard>
  <shot id="shot-cover" order="1" title="Cover frame"
        scene="intro" generation="cover" asset="cover-thumb"
        duration="0.8s" status="ready" tags="cover,product">
    <description>Teal stage, centered product, soft rim light.</description>
    <prompt>cinematic product cover, teal gradient, soft rim light</prompt>
    <direction>{"shot":{"framing":"wide","lighting":"soft rim light"},"image":{"style":"cinematic"}}</direction>
    <notes>Hold for the title.</notes>
  </shot>
  <shot id="shot-push" order="2" title="Push in"
        generation="shot" duration="3s" status="boarded" tags="hero,camera">
    <description>Slow push through floating light.</description>
    <direction>{"shot":{"camera":"slow push in","continuity":"same teal palette"},"video":{"loop":false}}</direction>
  </shot>
</storyboard>
```

字段：

| 位置 | 字段 |
|---|---|
| `<shot>` 属性 | `id`、`order`、`title`、`scene`、`generation`、`asset`、`duration`、`status`、`tags` |
| `<shot>` 子元素 | `<description>`、`<prompt>`、`<direction>`（JSON）、`<notes>` |

- `tags` 使用逗号分隔，解析为字符串数组。
- `direction` 与 GenerationTask 共用同一词汇（shot/image/video/speech/music/sfx/edit）。
- 未识别属性/子元素 MUST 被忽略或诊断，不得改变其他字段。

---

## 3. 自由编辑语义

分镜编辑是 Core 编辑操作，和 Clip/Scene 编辑拥有相同的事务语义：先应用模型，再验证，失败回滚。

### 3.1 操作

```ts
{ op: 'storyboard.add'; shot: StoryboardShotInput; at?: number }
{ op: 'storyboard.set'; shotId: string; props: StoryboardShotPatch }
{ op: 'storyboard.remove'; shotId: string }
{ op: 'storyboard.move'; shotId: string; to: number }
{ op: 'storyboard.reorder'; shotIds: string[] }
```

- `add`：`at` 为插入下标；缺省追加。`order` 由编辑器重新编号。
- `set`：字段级 patch；`duration: null` 删除时长为空；`scene/generation/asset: ''` 或 `null` 解除链接；`order` 可直接移动。
- `remove`：删除镜头并重新编号。
- `move`：移动到目标下标；越界自动夹取。
- `reorder`：必须列出全部 shot id 且不重复，否则失败。

### 3.2 不变量

编辑完成后 MUST：

1. 每个 `id` 唯一；
2. `order` 从 1 连续递增；
3. 所有引用存在；
4. `duration > 0`（若存在）；
5. 数组顺序与 `order` 一致。

### 3.3 事务

- 单个 API 请求中的多个操作是一个 batch。
- 任一操作失败：整个 batch MUST 回滚。
- 保存前 MUST 重新验证完整项目。
- 失败时 MUST NOT 写入 `.vhtml`。

---

## 4. Studio 自由编辑

Studio 的 **Storyboard** 面板是分镜的参考实现：

- **添加**：`＋ Shot` 在末尾创建 `idea` 镜头；
- **编辑**：标题、时长、状态、Scene、Generation、Asset、Tags、Description、Prompt、Notes、Direction JSON；
- **排序**：拖拽卡片、↑/↓ 按钮；
- **复制**：复制镜头并插入到当前镜头之后；
- **删除**：立即删除并重排；
- **缩略图**：优先使用 `asset`，否则使用链接 generation 的物化输出；无素材时显示 Scene/Generation 标识；
- **保存**：每次编辑通过 `/api/edit` 提交 `storyboard.*` 操作；成功后重新渲染，失败回滚并显示诊断；
- **撤销/重做**：与时间线编辑共用 EditSession 栈。

![Studio Storyboard 面板](../docs/screenshots/storyboard.png)

分镜编辑 MUST NOT 隐式修改 Timeline。需要把分镜落到时间线时，由显式操作（例如添加 Clip）完成。

---

## 5. 与生成/时间线的关系

```text
StoryboardShot ──> GenerationTask ──> gen:<id> Asset ──> Clip ──> Timeline
       │                  │
       └──> Scene ────────┘
       └──> Asset（缩略图/参考）
```

- 分镜可以先生成图片/视频，再引用其 Asset；也可以先链接生成任务，等物化后显示缩略图。
- 分镜的 `duration` 只是计划值；最终时长由 Clip 决定。
- 多镜头一致性通过 `direction.shot.continuity`、reference asset 和固定 seed 维护。
- 分镜不是渲染输入；删除分镜不会删除 Scene、GenerationTask 或 Asset。

---

## 6. 校验与错误

| 条件 | 错误 |
|---|---|
| 重复 shot id | `VALIDATION_DUPLICATE_ID` |
| 重复/非法 order | `VALIDATION_DUPLICATE_ID` / `VALIDATION_OUT_OF_RANGE` |
| Scene 不存在 | `REFERENCE_NOT_FOUND` |
| Generation 不存在 | `REFERENCE_NOT_FOUND` |
| Asset 不存在 | `REFERENCE_NOT_FOUND` |
| duration <= 0 | `VALIDATION_OUT_OF_RANGE` |
| 编辑目标不存在 | `EDIT_TARGET_NOT_FOUND` |
| reorder 列表不完整 | `EDIT_OUT_OF_BOUNDS` |

---

## 7. 一致性

实现声称支持本 Profile 时，至少通过：

1. `<storyboard>/<shot>` 解析、排序、序列化 round-trip；
2. `description/prompt/direction/tags/notes` 不丢失；
3. `add/set/remove/move/reorder` 后 order 连续；
4. 缺失引用、重复 order 校验失败；
5. Studio 可添加、编辑字段、拖拽/上下移动、复制、删除并保存；
6. 失败编辑回滚，磁盘文件不变；
7. 分镜编辑不修改 Timeline。

## 8. 机器可读 Schema

- `model.schema.json#/$defs/storyboardShot`
- `model.schema.json` 的 `project.storyboard`
- 编辑操作类型由 `@sdkwork/vhtml-core/edits` 导出。
