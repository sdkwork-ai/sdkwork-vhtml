# RFC-0015：效果/转场插件注册表

- 状态：已采纳（VHTML 1.1.2 编辑扩展）

## 背景

1.1 内置了 19 种视觉效果、9 种音频效果、7 种转场；未知类型按"warning +
忽略"降级。社区/厂商库（如 VHS 风格包、品牌转场包）无法以**可验证**的
方式贡献新类型名：校验器永远报警告，能力协商看不到它们，渲染行为没有
契约。审计遗留缺口：**effect/transition plugin registry**。

## 决策

1. **`<extension>` 升级为插件声明**（保持既有 name/version/required
   兼容）。插件声明增加：
   - `kind="effect | audio-effect | transition"`——声明的类型所属家族；
   - `base="<builtin>"`——渲染时降级到的同族内置基元（**必须**是内置
     类型，校验器报 `EXTENSION_INVALID` 否则）；缺 `base` 报
     `PARSE_MISSING_ATTRIBUTE`；
   - `<params …/>`——该类型的声明式默认参数（clip 自身参数覆盖默认）。
2. **校验语义**：clip 使用已声明类型 → 不再产生 unknown-effect 警告；
   使用未声明、未内置类型 → 维持 warning，消息指向声明方法。
   required 扩展协商行为不变。
3. **渲染语义（显式降级）**：渲染器/混音器把已声明类型解糖到 `base`
   基元求值（声明默认参数与 clip 参数合并，clip 优先）。转场在解析期
   接受已声明类型（未知类型仍报 `VALIDATION_INVALID_VALUE` 并按既有
   规则回退），求值期按 base 基元渲染。**没有声明 base 的类型不渲染**
   ——降级显式、可诊断，与规范"能力声明 + 显式降级"原则一致。
4. **共享词表**：内置效果/转场集合提升为 Core Model 常量
   （`VISUAL_EFFECT_TYPES`/`AUDIO_EFFECT_TYPES`/`TRANSITION_TYPES`），
   校验器、渲染器、混音器、Schema 同源。
5. **能力声明**：`vhtml capabilities --json` 的 features 增加
   `effect-registry`、`character-bibles`、`generation-usage`。
6. **代码优先路径**：SDK `extension()` 构建器 +
   `defineVideo({ extensions })`；创作程序 `vhtml.addExtension`。

## 备选方案

- 运行 JS 插件钩子（自定义渲染函数）：把任意代码带进渲染期，破坏
  确定性沙箱边界；1.1.2 只冻结"声明 + 内置基元降级"契约，真正的自定义
  渲染留给未来带沙箱的提案。
- `<effect type="css" params=…>` 手写等价：可用但无注册表语义（无校验
  豁免、无能力协商、无默认参数），插件声明是其标准化。

## 结果

- 效果/转场包可以发布"类型名 + base 映射 + 默认参数"的标准声明；
  项目引用包类型即可通过校验并在任何合规实现上确定性渲染。
- 未安装包时行为明确：声明存在 → 按 base 渲染；声明缺失 → warning +
  忽略，永不静默。

## 测试

- `tests/unit/extensions-registry.test.ts`：声明解析（含 `<extensions>`
  容器与裸元素）、校验豁免与 `EXTENSION_INVALID`、效果/转场解糖渲染、
  序列化往返、required 协商不回归。
