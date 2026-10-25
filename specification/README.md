# VHTML 1.1 规范索引

- [VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md) — 核心规范
- [editing.md](./editing.md) — 非破坏性编辑模型
- [rendering.md](./rendering.md) — Stage、确定性、帧就绪
- [wysiwyg.md](./wysiwyg.md) — 所见即所得编辑器模型
- [project-layout.md](./project-layout.md) — 项目目录、`vhtml.json`、外部文件
- [modularization-deployment.md](./modularization-deployment.md) — 文件拆分、资源导入、本地/远程部署
- [delivery-profiles.md](./delivery-profiles.md) — 多平台交付规格与安全区
- [commercial.md](./commercial.md) — 商业交付、权利、审计报告与 C2PA 边界
- [industry-alignment.md](./industry-alignment.md) — 与 HTML/媒体/AI/交付/权利行业标准对齐
- [storyboard.md](./storyboard.md) — 分镜模型、自由编辑、与生成/时间线的关系
- [generation.md](./generation.md) — AI 图片/视频/语音/音乐/音效生成与 Provider 协议；含 §12 主流 vendor 参数映射附录
- [video-authoring.md](./video-authoring.md) — 代码创作扩展：内嵌创作程序、变速曲线、嵌套时间线、音频闪避
- [conformance.md](./conformance.md) — 一致性等级与测试
- [versioning.md](./versioning.md) — 版本、能力协商、弃用与迁移
- [rfc/](./rfc/) — 关键设计决策记录
- [../packages/schema/schemas/vhtml-1.1/](../packages/schema/schemas/vhtml-1.1/) — 机器可读 Schema

## 设计原则

1. HTML 是内容引擎，VHTML 是时间/媒体语义层。
2. 时间必须精确；所有边界使用左闭右开。
3. Clip 是非破坏性使用实例；编辑只改 Project。
4. 确定性是可声明能力，不是对任意网页的承诺。
5. 生成任务是 Core 对象，输出是带 provenance 的 Asset。
6. 规范必须可由第二个实现独立实现。
7. 代码优先有三条等价路径：手写声明式文档、SDK 构建、文档内嵌创作程序
   （见 [video-authoring.md](./video-authoring.md)）。

## 为什么 1.1 修改了元素名

HTML5 中：

- `<track>` 是 **void element**，不能包含 Clip。
- `<caption>` 在 table 外会被 HTML 解析器忽略。
- `<input>` 是 void element。

如果继续用这些标签作容器，文档在不同 HTML 解析器下会得到不同树。1.1 因此使用：

| 1.0 草案 | 1.1 |
|---|---|
| `<track>` | `<lane>` |
| `<caption>` | `<cue>` |
| `<input>`（generate） | `<gen-input>` |
| `<output>`（generate） | `<gen-output>` |

这是 1.0 → 1.1 的唯一有意不兼容点之一，并由解析器给出明确诊断。

## 规范与实现

| 规范模块 | 参考实现包 |
|---|---|
| 解析/验证 | `@sdkwork/vhtml-core` (`parser`, `validate`) |
| 时间 | `@sdkwork/vhtml-core/time` |
| 模型 | `@sdkwork/vhtml-core/model` |
| 序列化 | `@sdkwork/vhtml-core/serialize` |
| 编辑 | `@sdkwork/vhtml-core/edits` / `@sdkwork/vhtml-editor` |
| 求值 | `@sdkwork/vhtml-runtime/evaluate` |
| Stage/确定性 | `@sdkwork/vhtml-runtime` (`stage`, `browser/`) |
| 采样 | `@sdkwork/vhtml-runtime/renderer` |
| 音频 | `@sdkwork/vhtml-media/audio` |
| 导出 | `@sdkwork/vhtml-media/export` |
| AI 生成 | `@sdkwork/vhtml-generation` |
| 项目/资源管理 | `@sdkwork/vhtml-project` (`manifest`, `assets`, `split`, `pack`) |
| SDK | `@sdkwork/vhtml-sdk` |
| Studio/部署 | `@sdkwork/vhtml-studio` |
| Schema | `@sdkwork/vhtml-schema` |
