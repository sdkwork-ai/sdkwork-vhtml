# RFC-0007：内嵌创作程序（单文件代码文档）

- 状态：已采纳（VHTML 1.1 代码创作扩展）

## 背景

1.1 的代码优先路径要求外部 TS 源文件 + 编译步骤（`vhtml build video.ts`）。
对于 AI 智能体、模板分发、教学与最小示例，"一个文件既是文档又是程序"
更直接：无需工程脚手架、可直接 diff、可直接预览。

## 决策

1. `<script type="application/vnd.vhtml.program+javascript">` 作为程序载体
   （HTML raw text，代码免转义）；`<program>`/`application/vhtml+javascript`
   为别名，序列化器只输出规范形式。
2. `<script type="application/json" id>` 与 `<data>` 数据块在解析期完成
   JSON 解析，经 `vhtml.data.get(id)` 供程序消费。
3. 程序在 `node:vm` 新上下文中同步执行一次，针对项目模型深拷贝；
   产出仍是纯声明式 Core Model，渲染/导出不感知程序。
4. 确定性契约：固定时钟（`Date.now()==0`）、seed 化 `Math.random`、
   每次物化重置 id 计数器；无 I/O 与网络能力。
5. 程序 API 与 SDK 共享 `core/authoring` 实现，两条路径产出同一模型；
   程序还可 `vhtml.edit(ops)` 复用 Core 编辑操作。
6. 编辑器保存程序文档时冻结为物化模型并剥离程序，避免重跑覆盖手工编辑；
   `vhtml build <file.vhtml>` 同样无条件冻结。

## 备选方案

- 渲染期钩子（每帧回调）：被否决——把任意 JS 变成渲染依赖会破坏确定性
  分级，与 RFC-0004 的帧就绪协议冲突。
- 仅扩 SDK：被否决——文档不再是自包含的，模板/智能体分发成本高。

## 结果

- 单文件可写、可预览、可导出的数据驱动视频；确定性可测试。
- 新错误码复用 `SCRIPT_ERROR`/`SCRIPT_TIMEOUT`；无新核心概念进入渲染层。

## 测试

- `tests/unit/authoring.test.ts`：物化、确定性、沙箱时钟/随机、错误诊断、
  序列化往返。
- `conformance/parsing/program.vhtml` + `tests/integration/code-video.test.ts`
  端到端导出。
