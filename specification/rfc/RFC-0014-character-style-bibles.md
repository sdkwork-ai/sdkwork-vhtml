# RFC-0014：角色与风格圣经（版本化一致性库）

- 状态：已采纳（VHTML 1.1.2 生成扩展）

## 背景

多镜头 AI 生产（分镜 → 生成 → 时间线）里最难的问题是**跨镜头一致性**：
同一角色在 20 个 shot 中必须长得一样，同一品牌风格必须贯穿全片。1.1 的
answer 是 `direction` 词表 + `character`/`style` 输入 role + 固定 seed，
但"角色到底长什么样"的权威描述没有归宿——散落在每个 prompt 里既不可
维护也无法参与缓存失效。审计遗留缺口：**AI character memory
(versioned character/style bibles)**。

## 决策

1. **`<characters>` 库**：项目级容器，承载 `<character>` 与
   `<style-guide>` 两类 `BibleProfile`（统一模型，`kind` 区分）：
   - `id`（全局唯一）、`version`（正整数，建议性修订号）、`name`；
   - `<description>` 正向权威描述；`<negative>` 反向约束（禁出现元素）；
   - `<reference ref="asset:…" role="reference-image|style|…"/>` 锚定
     参考图/生成输出；引用必须可解析（`REFERENCE_NOT_FOUND`）。
2. **引用语法**：`<gen-input ref="character:mika" role="character"/>`、
   `ref="style:noir" role="style"`。`character:`/`style:` 成为引用命名
   空间（与 `asset:`/`scene:`/`gen:`/`timeline:` 并列，均解析到同一
   bible 库）。引用了不存在 bible 的任务在 provider 调用**之前**报
   `REFERENCE_NOT_FOUND`（不得静默丢弃上下文）。
3. **缓存参与**：bible 的完整 profile（kind/id/version/description/
   negative/reference 文件哈希）进入生成缓存键——**bump version 即失效
   缓存**，下一次运行自动重生成。缓存键版本常量不变，未引用 bible 的
   任务键不受影响（不产生全局缓存失效）。
4. **厂商载荷**：`buildVendorPayload` 新增 `bibles` 段（含解析后的参考
   src/mime），并把 `task.usage` 随载荷带给 adapter。**prompt 不被静默
   改写**——adapter 决定如何把 bible 组合进厂商一致性特性（角色引用、
   风格 LoRA、多图参考等）。
5. **代码优先路径**：SDK `character()/styleGuide()/bible()` 构建器、
   `defineVideo({ characters, styleGuides })`；创作程序
   `vhtml.addCharacter/addStyleGuide`；序列化 `<characters>` 段往返。

## 备选方案

- 只在 `direction` 里加 `characterBible` 字符串：无引用、无版本、无缓存
  失效语义，否决。
- 把描述拼进 prompt：实现简单但破坏"prompt 是作者意图"的边界，厂商载荷
  应显式承载一致性上下文，由 adapter 决定组合方式。
- `<style>` 作元素名：与全局 CSS `<style>` 冲突（会被提升为项目样式），
  采用 HTML 安全的 `<style-guide>`。

## 结果

- 一次声明，全片一致：分镜/多语言/多平台衍生共享同一 bible。
- 角色设定更新 = bump version = 下次生成自动刷新，缓存语义清晰。
- 与 RFC-0013 组合：每个任务的用量记录挂在引用了哪些 bible 的任务上。

## 测试

- `tests/unit/bibles.test.ts`：解析/引用解析/校验失败/序列化往返/
  缓存键与厂商载荷/SDK 构建器/缺失 bible 的生成前置失败。
- `conformance/`（后续批次）补 bible 夹具。
