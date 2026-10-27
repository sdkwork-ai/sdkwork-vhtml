# RFC-0017：音频显式降混策略

- 状态：已采纳（VHTML 1.1.3 交付扩展）

## 背景

`composition.channels` 允许 1..8，但混音器/编码器只实现 1/2 声道：超过
立体声的请求被静默折到立体声，仅有一条导出 issue。审计遗留缺口
**Audio ducking / sidechain / >2ch** 的"explicit downmix policy"部分——
播客/访谈工作流需要确定性的单声道输出，商业交付需要降混是**声明**而非
副作用。

## 决策

1. **`OutputConfig.downmix: 'mono' | 'stereo'`**（文档属性
   `<output downmix="mono">`，默认 `stereo`）：
   - `mono`：混音器以 1 声道工作，L/R 以 0.5 折叠（声像先应用后折叠，
     折叠规则与既有 mono 路径一致）。
   - `stereo`（默认）：现行为；请求声道 > 2 时仍折到立体声并报 issue
     （消息改为指向显式策略）。
2. **SDK/CLI**：`OutputSpec.downmix`、`ExportOptions.downmix` 覆盖、
   `vhtml export --downmix mono|stereo`（非法值报用法错误）。
3. **显式即无提示**：`downmix="mono"` 明确声明时导出不再产生
   "downmixed" issue；只有**隐式**折叠（>2 声道请求且未声明策略）保留
   issue——降级显式原则。
4. **范围声明**：多声道布局（5.1/7.1 声像放置、通道直通、显式下混矩阵）
   仍为开放缺口；本 RFC 只冻结**策略语义**（1/2 声道之间的选择是显式的、
   可序列化、可协商的）。

## 备选方案

- 让混音器直接支持 N 声道输出：涉及每剪edriver声道放置模型与 AAC/Opus
  通道映射，属独立大特性，不与策略语义捆绑。
- 用 `channels="1"` 表达 mono：`composition/output channels` 语义是
  **请求的声道数**（协商输入），不是混音策略；策略与请求分离后
  `channels=4 + downmix=mono` 这类组合才有清晰含义（请求 4 声道、
  按策略折单）。

## 结果

- 播客/多语言音频版本：`--downmix mono` 一次声明，输出确定性单声道。
- 商业交付报告可审计：策略进序列化文档与导出报告上下文，不再是日志里的
  副作用。

## 测试

- `tests/unit/round12.test.ts`：解析/往返/非法值拒绝/校验通过。
- `tests/integration/export.test.ts`：`downmix="mono"` WAV 导出经
  ffprobe 验证 `channels == 1` 且无隐式降混 issue。
