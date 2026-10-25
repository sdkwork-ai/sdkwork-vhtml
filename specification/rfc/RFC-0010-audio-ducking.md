# RFC-0010：音频闪避（Sidechain Ducking）

- 状态：已采纳（VHTML 1.1 代码创作扩展）

## 背景

播客/访谈/解说混音需要"音乐在说话时自动压低"。1.1 音频效果只有增益类
滤镜，没有跨轨道的电平依赖；`standard-audit` 列为缺口。

## 决策

1. 作为音频效果表达：`<audio-effect type="ducking" sidechain-track="…"
   threshold reduction attack release hold/>`，不引入新的模型对象。
2. 语义：旁链轨道的后置推子绝对电平超过阈值时，把本片段增益压向
   `reduction`；attack/release 为一阶包络，hold 保持完全衰减。
3. 混音器两遍实现：先混旁链缓冲，再混合带 ducking 的单元；逐样本确定。
4. 校验：旁链轨道必须存在；`reduction` ∈ 0..1，attack/release/hold ≥ 0。
5. 浏览器预览 MAY 忽略（能力声明）；导出为权威语义。

## 备选方案

- FFmpeg `sidechaincompress` 单滤镜：与 Node 端确定性混音模型冲突，
  且无法与淡变/音量自动化共用一套语义。否决。

## 结果

`standard-audit` 中 "Audio ducking / sidechain" 缺口关闭（>2ch 声道布局
与显式下混策略仍为独立缺口）。

## 测试

- 单元：包络数学与参数校验（`tests/unit/authoring.test.ts`、validator）。
- 端到端：`examples/08-code-video` 音乐在 whoosh 处被压低，导出校验。
