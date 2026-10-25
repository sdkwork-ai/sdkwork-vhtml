# RFC-0004：确定性帧协议与虚拟时钟

- 状态：已采纳（VHTML 1.1）

## 背景

“用浏览器截图做视频”常见失败模式：

- 用固定延时等待动画；
- CSS 动画按墙钟运行；
- 视频没有 seek 完成就截图；
- 字体/图片尚未加载；
- 脚本使用 `Date.now`/随机数；
- 外部网络请求导致不可复现。

## 决策

1. 引入 virtual clock：Date/performance/timers/rAF 由项目时间推进。
2. 所有 CSS/WAAPI 动画暂停并按 Scene 局部时间定位。
3. 媒体 seek 使用 `seeked` + `requestVideoFrameCallback`，有超时。
4. 字体的 `fonts.ready`、图片 `decode()`、媒体 metadata 都是帧就绪条件。
5. 用户脚本通过 `vhtml.onSeek` 注册异步准备逻辑。
6. 外部网络默认阻止；本地 server 支持 Range。
7. 帧采样的 Promise resolve 才表示可截图；禁止固定延时。
8. 随机数使用项目 seed 的 PRNG。

## 结果

- 相同环境重复采样 PNG 哈希一致。
- 跨环境仍只承诺时间确定性，不承诺像素；记录环境与容差。
- 任意网络/输入依赖被明确列为限制。

## 测试

- 同一帧连续采样哈希一致。
- 不同时间帧哈希不同。
- 新浏览器会话同帧哈希一致。
- 无固定延时截图路径。
