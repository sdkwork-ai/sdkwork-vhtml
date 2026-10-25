# RFC-0002：转场以 Clip 重叠为基础

- 状态：已采纳（VHTML 1.1）
- 影响：转场不再允许无重叠的“隐式延长”

## 背景

非线性编辑器中，转场通常需要两侧素材有“把手”（handle）。若 VHTML 允许
相邻 Clip 直接声明转场并自动延长源素材，模型必须规定：

- 超出 Clip 名义区间的视觉内容如何求值；
- 源素材不足时冻结、黑帧还是失败；
- 转场是否改变 Clip 的 start/duration。

这些语义容易在不同实现间分歧。

## 决策

1. 同 Lane 的 from/to Clip MUST 重叠。
2. 转场窗口 = Clip 重叠区间；`duration ≤ overlap`。
3. 相邻 Clip 想转场时，先通过 `clip.trim`/`clip.move`/编辑 API 制造重叠。
4. 编辑后重叠不足时自动夹取 duration；无重叠时删除并告警。
5. 音频转场使用等功率交叉淡化。

## 结果

- 求值简单、可逆、与 Core Model 一致。
- 源素材把手由作者显式控制。
- Studio 的“添加转场”可先扩展一个 Clip 再创建 Transition。

## 测试

- 相邻 Clip 的 Transition 被拒绝。
- 重叠 0.4s、duration 0.5s 被夹取到 0.4s。
- 删除一侧 Clip 后 Transition 被清理。
