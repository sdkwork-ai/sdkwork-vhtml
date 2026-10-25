# VHTML 1.1 — 渲染与确定性

## 1. Stage

渲染器构建一个独立 HTML Stage：

```html
<div id="vhtml-stage" style="width:1920px;height:1080px">
  <div class="vhtml-clip" data-clip-id="…" data-clip-kind="scene">
    <div class="vhtml-scene-root" data-vhtml-scene="hero">…HTML…</div>
    <div class="vhtml-fx-slot"></div>…
  </div>
  …
</div>
```

- 视口等于 Composition 尺寸。
- 每个视觉 Clip 是一个绝对定位图层；Scene HTML 原样嵌入。
- 媒体 Clip 使用 `<img>`/`<video>`；音频 Clip 使用隐藏 `<audio>`（仅供预览）。
- Caption 层 z-index 高于视觉层。
- 转场覆盖层位于视觉与字幕之间。
- 外部资源通过项目根 HTTP server 提供；`<base href="/">` 使相对路径正确。

## 2. 确定性模式

### 2.1 启动顺序

1. Head 中注入模式、seed 与 bootstrap。
2. Bootstrap 在项目脚本前安装虚拟时钟、PRNG、计时器、rAF。
3. Stage DOM 建立。
4. 注入 Runtime（求值器 + DOM 应用器）。
5. 执行项目/Scene 脚本。
6. `load` 后等待字体、图片、媒体 metadata。
7. 初始 seek 到 0，建立第一帧。

### 2.2 时钟

```ts
vhtml.time = { current, frame, fps, duration, playing, mode };
```

- `Date.now()` 返回固定 epoch + 项目毫秒。
- `performance.now()` 返回项目毫秒。
- `setTimeout/setInterval/rAF` 在 seek 时按虚拟时间触发；单次 seek 有预算上限。
- `Math.random`/`crypto.getRandomValues` 使用 seed PRNG。
- 向前 seek 正常推进计时器；随机访问向后 seek 会清空未来计时器状态。
- 导出 MUST 单调向前采样。

### 2.3 CSS/WAAPI

- 暂停全部 `document.getAnimations()`。
- 对位于 Scene 内的动画，`currentTime = sceneLocalTime`；对其他动画使用项目时间。
- `transition:none !important` 防止过渡插值。
- `animation-play-state: paused !important` 防止首帧前漂移。
- 用户脚本新增动画在下次 seek 时同样被暂停/定位。

### 2.4 媒体

- `<video>` 暂停并定位到 `sourceTime`。
- 等待 `seeked`，若可用再等待 `requestVideoFrameCallback`。
- 超时记录 `RENDER_MEDIA_SEEK_FAILED`，不无限阻塞。
- 音频导出不使用浏览器媒体，使用 PCM 混音器。

### 2.5 网络

- 默认阻止所有非本地 origin 请求。
- 本地项目 server：只读、loopback、Range、无目录列表、路径穿越保护。
- 被阻止的请求进入诊断；不会静默替换为空白。

### 2.6 帧就绪

```ts
await host.__vhtml.seek(seconds, frameIndex, rate);
```

在 Promise resolve 前：

- 虚拟时钟/计时器/rAF 推进；
- Clip/Transition/Animation 状态应用；
- 媒体 seek 完成；
- `vhtml.onSeek` 钩子完成；
- 字体/图片就绪；
- 强制布局。

只有此后才允许截图。禁止用 `setTimeout(100)` 后截图作为通用协议。

## 3. 求值算法

对每个视觉 Lane（按 order）：

1. 跳过禁用 Lane。
2. 对每个 Clip 判断 `start <= t < end`。
3. 计算 `local`、`source`、`sceneTime`。
4. 求值 Clip 层动画（layer properties）与元素动画（selector）。
5. 应用 effects 得到 filter/clip-path/overlay/chroma。
6. 应用转场（透明度/裁切/位移/缩放/模糊/覆盖色）。
7. 输出 `FrameState`；Runtime 应用 DOM。

音频 Lane 输出 `AudioFrameState`：gain、pan、sourceTime、rate、reverse、muted。
音频混音器使用相同 Core Model 独立计算，不依赖浏览器解码顺序。

## 4. 确定性等级

| 等级 | 要求 |
|---|---|
| 结构确定性 | 相同输入 → 等价 Project |
| 时间确定性 | 相同 t → 等价时间轴/动画/媒体状态 |
| 视觉一致性 | 同一受控环境重复截图哈希一致 |
| 像素确定性 | 固定浏览器/字体/OS/GPU/解码器 |

参考实现记录 Chrome 版本、Node 版本、平台、DPR、色彩配置。导出报告可附录环境。

## 5. 已知限制

- 任意依赖网络、用户输入或系统墙钟的脚本不可重放。
- WebGL/WebGPU 跨驱动不一致。
- Scene CSS keyframes 不自动重命名。
- SMIL 不定位。
- 跨域媒体默认阻止。
- `document.write`、Service Worker、WebSocket 等不在确定性 Profile 内。
- 未检测到的动态字体/远程字体可能导致布局差异。

## 6. 性能建议

- 复用同一个 Stage 与页面逐帧 seek，避免每帧重建浏览器。
- 截图 PNG 直接流式送入 FFmpeg，避免磁盘中转。
- 音频先混音为 WAV，再与视频流 mux。
- 大项目应分批导出或使用多实例；1.1 参考实现默认单实例顺序渲染。
