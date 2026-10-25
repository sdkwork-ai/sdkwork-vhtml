# VHTML 1.1 WYSIWYG 编辑规范

**状态**：规范性 Profile（VHTML 1.1 WYSIWYG Editing Profile）  
**依赖**：[VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md)、[editing.md](./editing.md)  
**实现**：`@sdkwork/vhtml` Studio

本 Profile 定义“所见即所得”编辑器的模型契约。它不是另一种文档格式：所见即所得的每一次操作 MUST 落到 Core Model 的编辑操作上，并通过正常的验证/序列化/渲染流水线生效。

---

## 1. 范围

所见即所得编辑包括：

- 在预览画面上选择视觉 Clip，直接拖动、缩放、旋转。
- 时间轴上拖动/裁剪/跨 Lane 移动 Clip。
- 磁性吸附到帧、Playhead、相邻 Clip 边界和项目边界。
- 从资源库拖放图片/视频/音频到兼容 Lane，放置模式可选 **add / insert（推入）/ overwrite（覆盖）**（NLE 三点编辑模式）。
- 在播放头添加字幕 Cue，并直接编辑文本。
- 在重叠 Clip 之间创建/删除转场。
- 属性面板编辑时间、透明度、变换、Fit、Blend、音量、声像、Z。
- 关键帧面板在播放头添加/编辑属性轨道：视觉属性（opacity/x/y/scale/rotate）
  与**音频属性（volume/pan，音频片段专用）**——手工音量曲线（包络自动化）
  在所见即所得模式直达，与导出混音器同语义。
- 轨道工具栏 **Mute (M) / Solo (S)**（音频轨道）：solo 生效时其他音频轨道
  在预览与导出中静音；Speed 区块提供**变速曲线预设（Ramp in / Ramp out /
  Smooth S）**，经 `clip.timeremap` 应用，随时清除回到恒速。
- **标记导航**（Shift+, / Shift+.）：在时间线标记间前后跳转。
- 适配线（Guides）含**多平台安全区叠加**（9:16 竖屏 UI 安全区、4:5、
  通用 5%），与交付预设的安全区文档一致。
- 音频片段时间线显示**波形与音量包络线**（/api/media/peaks 数据源），
  淡入淡出拖拽手柄。
- **Generate 按钮**触发 AI 生成物化（与 `vhtml generate` 同一 Provider/缓存
  路径）：成功后会话与 stage 即时刷新，生成资产立即可拖入时间线。
- **国际化**：界面支持 en / zh-CN 双语（跟随浏览器语言，`vhtml-lang` 持久化，
  顶栏语言按钮即时切换）；**响应式布局**：≤1100px / ≤880px 断点下 Inspector
  收为抽屉、轨道标签与工具栏自适应；适配线含多平台安全区叠加。
- 导出面板支持**批量交付**（Render all delivery presets）：一次提交按全部
  交付预设顺序渲染（逐预设进度），服务端文件名带预设 id；与 CLI
  `export --batch` 同语义。
- 点击 Scene 内任意 authored HTML 节点，在右侧属性面板编辑 ID/class、文本或 Inner HTML、属性和内联 CSS。
- 时间轴手势直达全部剪辑原语：Split、**Duplicate**、**Detach Audio**、Delete/Ripple Delete、
  **剪贴板（Ctrl+C / Ctrl+X / Ctrl+V，粘贴锚点为播放头，模式跟随放置选择器）**，
  以及经通用 `/api/edit` 端点的 rippleCut / nest/unnest / splitMulti / timeRemap /
  storyboard.apply / clip.link（模型优先契约：手势 → Core 编辑操作）。
- 撤销/重做、保存、外部文件重载。

不在范围内：

- 像素级绘图/合成节点图。
- 多人协同的冲突合并。

---

## 2. 核心不变量

1. **模型是唯一真源**：预览 DOM 的临时变换只能用于拖拽反馈；提交时 MUST 生成 `clip.set`（或其他编辑操作），不得只修改 DOM。
2. **原子提交**：一次指针手势 MUST 合并为一次编辑操作；不得为每个 pointermove 写入项目。
3. **可逆**：模型内提交 MUST 进入 Undo/Redo 历史；失败 MUST 回滚并恢复原模型。外部 Scene 文件编辑作为文件操作显式标记为不可撤销，不在此列。
4. **验证前置**：提交后 MUST 运行结构/引用/时间验证；失败 MUST 回滚，不得保存。
5. **时间精确**：所有吸附/量化 MUST 使用项目 frame rate 的有理时间；不得用浮点秒作为持久值。
6. **外部文件是文件真源**：外部 Scene 的元素编辑 MUST 先写回其 `src` 文件，再完整重新解析/重建 stage；不得只改预览 DOM 或只改内存模型。
7. **保存与预览一致**：保存后的 `.vhtml` 再解析、再渲染 MUST 产生同一模型时间/变换。

---

## 3. 画布坐标映射

预览 stage 以 composition 像素坐标渲染，外层用 CSS `transform: scale(s)` 适配窗口。

- 设 iframe 的 `getBoundingClientRect()` 为 `R`，composition 宽度为 `W`，则 `s = R.width / W`。
- Clip 图层在 iframe 内的 `getBoundingClientRect()` 为 `r`。
- 选择框在外层 overlay 的位置为：

```text
left   = R.left - shell.left + r.left * s
top    = R.top  - shell.top  + r.top  * s
width  = r.width  * s
height = r.height * s
```

- 拖拽位移 `(dx, dy)` 转换为模型位移 `(dx / s, dy / s)`。
- 旋转手柄使用选择框中心计算角度差；缩放使用初始框尺寸计算比例。
- 选择框 MUST 只在 Clip 当前可见（`display != none` 且矩形非空）且未播放时显示。
- 播放时 MUST 隐藏选择框，避免遮挡画面。

---

## 4. 直接操纵

### 4.1 移动

- Pointer down 记录起始指针、`clip.transform`、图层。
- Pointer move 更新图层 `transform` 作为即时反馈，并更新选择框。
- Pointer up 提交：

```json
{ "op": "clip.set", "clipId": "hero", "props": { "transform": { "x": 120, "y": -40 } } }
```

### 4.2 缩放

- 右下角手柄；X/Y 独立缩放。
- 最小缩放 0.02；结果保留 4 位小数。
- 提交 `transform.scaleX/scaleY`。

### 4.3 旋转

- 旋转手柄位于选择框内右上角，避免被 stage 容器裁剪。
- 结果归一化到合理角度范围；提交 `transform.rotate`。
- 变换原点 MUST 与运行时一致（默认 `50% 50%`）。

### 4.4 取消

- `Escape` SHOULD 取消当前手势并恢复手势前图层样式。
- 手势未移动超过 1px 时 MUST 不产生编辑操作。

### 4.5 元素级编辑

进入元素拾取模式（`E` 或工具栏按钮）后，预览中任意 authored HTML 元素 MUST 可被选中；由运行时生成的 `.vhtml-clip`、`.vhtml-caption`、`.vhtml-media`、`.vhtml-fx-slot` 和 `.vhtml-scene-root` 包装不属于 authored HTML，不可作为元素编辑目标。

元素路径 MUST 使用“content element index 链”：

```text
path = [i0, i1, i2, ...]
```

- `i0` 是 Scene 根下第 `i0` 个内容元素；`i1` 是其第 `i1` 个内容元素，依此类推。
- `style` 与 `script` 元素 MUST 从索引中排除，因为解析器会把它们提取为 Scene 的 `css`/`scripts`。
- 同一路径 MUST 同时适用于 stage DOM、内联 `scene.html` 和外部 Scene 文件。
- 路径失效（元素被删除）时 MUST 报告错误，不得修改任何其他元素。

属性面板编辑映射：

| 面板字段 | patch | 说明 |
|---|---|---|
| ID / class / attributes | `attributes` | 完整属性映射；`null` 删除该属性；`style` 单独处理 |
| 叶子文本 | `text` | 仅当目标没有元素子节点 |
| 容器内容 | `innerHTML` | 按 HTML 片段解析后替换子节点；与 `text` 互斥 |
| Inline CSS | `style` | 完整内联声明；空字符串删除 `style` 属性 |

- 一次 Apply MUST 产生一个补丁，并作为一个原子文件/模型提交。
- 内联 Scene MUST 提交 `scene.set { sceneId, props: { html } }`；成功后可 Undo/Redo。
- 外部 Scene MUST 将同一路径补丁写入其 `src` 文件，然后完整 Reload；外部文件编辑不得进入模型 Undo 栈。
- 补丁 MUST 先完成路径存在性、属性名、属性数量、文本长度和容器/叶子规则检查，再写文件。
- 补丁 MUST 通过 `parse5` 序列化保持未修改的兄弟节点、注释、`style` 和 `script`。
- 验证失败 MUST 恢复外部文件原文并返回诊断，不得留下半写文件。
- 选择框/描边只用于反馈；元素几何、computed style 和属性 MUST 从当前 stage DOM 读取，不得反推模型。

---

## 5. 时间轴编辑

- 拖动 Clip：提交 `clip.move`；跨 Lane 时带 `trackId`。
- 左/右裁剪：提交 `clip.trim`。
- Split/Ripple Delete：提交 `clip.split` / `clip.rippleDelete`。
- 所有拖动结果 MUST 先经过 frame 量化与磁性吸附，再提交。
- 磁性吸附候选：`0`、时间轴结束、Playhead、其他 Clip 的 start/end。
- 吸附阈值默认 10 屏幕像素；按住 Shift MUST 临时禁用吸附。
- 吸附预览线只用于反馈，不写入模型。
- 图片/SVG Clip SHOULD 显示资源缩略图；缩略图只用于显示，不改变时间或模型。
- 属性面板 SHOULD 提供常用效果的添加/删除（vignette/grain/blur/glow/tint），每次操作仍映射到 `effect.add` / `effect.remove`。

---

## 6. 资源拖放

- 资源库条目 MUST 携带稳定 `assetId`，不得只传 URL。
- Drop 到 Lane 时提交服务端构造的 `clip.add`；客户端不得伪造不完整的 Clip。
- 兼容规则：
  - 音频 Lane：音频 Asset，或视频 Asset 的音频轨。
  - 视频/Overlay Lane：图片、SVG、视频、Scene。
  - Caption/Data Lane：拒绝媒体。
- 默认时长：图片/SVG 3s；视频/音频使用探测时长；可显式指定。
- 目标位置 MUST 以 drop 的 x 坐标换算为时间并吸附。
- 资源文件 MUST 已存在于项目根内；上传/导入由资产 API 完成。
- 缺失资源的卡片 MUST 明确标记，并允许通过“重链”选择项目根内的新路径；重链 MUST 校验文件存在且路径未逃逸。

---

## 7. 字幕

- “Add cue” 在 Playhead 创建 Caption Clip，默认 2s。
- Cue 文本编辑提交 `clip.set { text }`。
- Caption Lane 属于普通 Lane；导出时必须能生成 WebVTT/SRT 并可选烧录。
- Cue ID MUST 全局唯一。

---

## 8. 转场

- 转场只能存在于同 Lane、时间上重叠的两个 Clip 之间。
- “Add transition” MUST 选择与当前选中 Clip 重叠的相邻 Clip；无重叠时拒绝并提示。
- 默认类型 `crossfade`，默认时长 `min(overlap, 0.4s)`，不得小于 1 帧。
- 提交 `transition.add`；已存在的 Clip 对不得重复添加。
- 删除使用 `transition.remove`。

---

## 9. 保存、重载与并发

- 每次成功编辑 MUST 立即原子写回入口 `.vhtml`；写回前运行 `validate`。
- Studio 内存中的 `EditSession` 是当前编辑快照；Undo/Redo 只影响本会话。
- “Reload” MUST 重新读取入口、重新解析外部 Scene、重新 hydrate 生成缓存、重建 stage；失败时保留旧模型并报告诊断。
- 外部进程同时修改文件时，最后写入者获胜；实现 SHOULD 在保存前比较 mtime 并提示冲突。

---

## 10. 可访问性与快捷键

建议快捷键：

| 键 | 行为 |
|---|---|
| Space | 播放/暂停 |
| S | Split |
| Delete / Backspace | 删除 |
| Shift+Delete | Ripple 删除 |
| T | 添加转场 |
| C | 添加字幕 |
| E | 切换元素拾取模式 |
| ← / → | 上一帧/下一帧 |
| Ctrl/Cmd+Z | 撤销 |
| Ctrl/Cmd+Shift+Z / Ctrl+Y | 重做 |
| Shift（拖动时） | 临时关闭吸附 |
| Escape | 取消当前手势 |

选择框/手柄 MUST 有可见焦点和 `title` 提示；仅靠颜色不得成为唯一状态表达。

---

## 11. 一致性

实现声称支持本 Profile 时，至少通过：

1. 选中可见 Clip 后选择框与图层矩形一致。
2. 拖动/缩放/旋转各产生一次 `clip.set`，保存后重新加载保持数值。
3. 时间轴拖动吸附到相邻边界，Shift 可禁用。
4. 资源拖放到兼容 Lane 生成完整 Clip；不兼容 Lane 返回错误。
5. 字幕创建/编辑可导出 WebVTT。
6. 重叠 Clip 可创建 crossfade；无重叠被拒绝。
7. 失败操作不改变项目、不写文件。
8. 外部 Scene 修改后 Reload 能反映新 HTML。
9. 点击 Scene 内嵌套元素后，属性面板显示对应标签/路径；修改文本、属性和 inline CSS 后保存并重新加载仍保持。
10. 删除元素后旧路径补丁被拒绝，其他节点不被修改。
