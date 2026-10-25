# RFC-0008：片段变速曲线（Time Remap）

- 状态：已采纳（VHTML 1.1 代码创作扩展）

## 背景

`clip.speed` 只能恒速。快慢混合（ramp）、慢镜、先加速后减速等需要把
片段时间映射为曲线。常见实现有两条路线：关键帧**速率**再积分（需数值
积分，误差累积），或关键帧**源位置**直接插值（After Effects Time Remap）。

## 决策

1. 采用源位置语义：`<remap at source easing/>` 把片段本地时间 `at` 直接
   映射到源偏移 `source`，帧间按缓动插值。无需积分，插值即精确。
2. 模型字段 `ClipBase.timeRemap = { keyframes[], easing }`，全部有理数；
   插值因子按微秒量化。
3. 约束：与 `freeze` 互斥；设置时 `speed` 忽略；video/audio 必须显式
   `duration`；`at` 严格递增；`source` 可为负（局部倒放）。
4. 音频：解码曲线触及的源区间，按曲线索引读取 + 线性插值；关键帧 >2 时
   显式声明分段恒速近似（info 诊断）。
5. 编辑：`clip.timeremap` / `clip.timeremap.clear`；split 分裂曲线（右半
   把边界源位置吸收进 `sourceIn`）；`clip.speed` 清除 remap；slip 拒绝。

## 备选方案

- 速率关键帧 + 积分：数值积分破坏精确时间模型；逐段 atempo 的拼接点
  有可闻裂缝。否决。
- 仅支持阶梯恒速：无法表达平滑 ramp。否决。

## 结果

- 视觉与音频共享同一条曲线；导出可验证（帧哈希、波形检查）。
- `standard-audit` 中 "Speed ramps / time remapping" 缺口关闭。

## 测试

- `tests/unit/authoring.test.ts`（曲线求值、片段求值）。
- `conformance/timing/timeremap.vhtml`；编辑分裂见
  `conformance/editing/timeremap-split.vhtml`。
