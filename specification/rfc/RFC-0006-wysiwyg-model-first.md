# RFC-0006：模型优先的 WYSIWYG 编辑

- **状态**：Accepted
- **规范版本**：VHTML 1.1（WYSIWYG Editing Profile）
- **日期**：2026-10-23
- **相关**：[wysiwyg.md](../wysiwyg.md)

## 决策

1. 可视化编辑的源是 Core Model；画布上的拖动/缩放/旋转只做即时反馈，结束时提交 `clip.set`。
2. 选择框通过 iframe 图层的 `getBoundingClientRect()` 与外层 stage 缩放比映射，不引入第二套坐标模型。
3. 时间轴拖动、裁剪、跨 Lane 移动、Shift 禁用吸附、资源拖放、字幕与转场都映射到既有 `EditOperation`。
4. 每次手势原子提交，走撤销栈、验证、序列化和重新渲染；失败回滚且不写文件。
5. 资源拖放传 Asset ID，由服务端根据 Asset 类型和 Lane 类型构造完整 Clip。
6. 外部 Scene 的 HTML 内容不在实时 DOM 中直接编辑；修改文件后 Reload 重新解析。

## 理由

如果编辑器直接改 DOM，保存、撤销、导出、代码优先 SDK 会产生多套真源，无法保证所见即所得与最终渲染一致。把 WYSIWYG 限定为“模型对象的直接操纵 UI”，可以复用现有验证/时间/渲染语义，并保持 HTML 内容由代码/外部文件编辑的专业边界。

## 兼容性

- Studio 仍可查看任意 Scene HTML；只是不提供 DOM 文本编辑。
- 所有操作都是现有编辑操作的组合，不影响无编辑器的工作流。
- 坐标映射与运行时 transform-origin 一致（默认 50% 50%）。

## 未采用

- 在 iframe 内注入 contenteditable 直接改 HTML：无法可靠映射回 `.vhtml`，破坏外部 Scene 与代码源。
- 仅靠 DOM 保存：刷新/导出即丢失，无法撤销。
- 每次 pointermove 写盘：性能差且破坏撤销粒度。
