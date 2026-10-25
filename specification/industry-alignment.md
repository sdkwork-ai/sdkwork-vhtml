# VHTML and Industry Standards

**目的**：把 VHTML 的边界与行业既有标准对齐，避免“自造一套但无法交付”的格式。本文不是替代规范；冲突时以 VHTML 规范为准，并通过 adapter 映射。

---

## 1. Web / 时间 / 媒体

| 行业标准/实现 | VHTML 映射 | 状态 |
|---|---|---|
| HTML5 / DOM / CSS | Scene HTML、CSS、外部 Scene、WYSIWYG 元素编辑 | 原生 |
| SVG / Canvas / WebGL | Scene 内渲染；WebGL 由 Chromium 截图 | 原生/受环境限制 |
| CSS Animations / WAAPI | 确定性 seek + 虚拟时钟 | 原生 |
| WebCodecs | 可选帧编码后端 | 规划 |
| FFmpeg / libav | 导出、音频混音、探测 | 原生 |
| WebVTT / SRT | caption lane、sidecar、burn-in | 原生 |
| EBU R128 / loudnorm | 母版归一化 | 原生（FFmpeg） |
| BT.709 / Display-P3 | sRGB/BT.709 基线；P3 记录但不保证正确编码 | 部分 |
| HDR / HDR10 / Dolby Vision | 无完整管线 | 缺口 |
| HLS / DASH | 无打包/切片 | 缺口 |
| OpenTimelineIO (OTIO) | 可映射 Timeline/Lane/Clip/Transition | adapter 规划 |
| EDL / FCPXML / AAF | 可映射剪辑结构 | adapter 规划 |
| SMPTE timecode | 有理数时间 + drop-frame timecode | 原生 |

---

## 2. AI / 多模态

| 行业能力 | VHTML 表达 | 状态 |
|---|---|---|
| 文生图 / 图生图 / inpaint | `image` + reference/mask inputs + direction | 支持 |
| 文生视频 / 图生视频 / 首尾帧 | `video` + first/last-frame inputs | 支持 |
| 视频参考/风格迁移 | `video` + `reference-video` role | 支持 |
| 数字人 / 口播 | `avatar` | 支持（Provider） |
| 口型同步 | `lipsync` + video/voice inputs | 支持（Provider） |
| TTS / 旁白 / 对白 | `speech` + language/voice/emotion | 支持 |
| 声音克隆 | `speech` + rights.voiceCloning/consent | 支持（Provider + 声明） |
| 翻译配音 | `dub` / `translation` | 支持 |
| 音乐 / 歌曲 / 器乐 | `music` + BPM/key/structure/vocals | 支持 |
| 音乐 stems | 多输出 `gen:<task>:<index>` | 支持 |
| 音效 / 环境声 | `sfx` + category/environment | 支持 |
| 抠像 / 遮罩 | `matte` | 支持（Provider） |
| 修复 / 扩图 / 超分 / 风格化 | `edit` + operation/strength | 支持（Provider） |
| 分镜 | `StoryboardShot` + `storyboard` kind | 支持 |
| 多镜头一致性 | character/style reference + continuity + seed | 支持 |
| 3D / Gaussian splat / NeRF | 无原生 3D 场景 | 缺口 |
| 动作捕捉/表演驱动 | 可作为 video/avatar 输入 | 部分 |

供应商协议不绑定 OpenAI/Replicate/Fal/ComfyUI 的私有 JSON；通过 `http` Provider adapter 映射到 `vhtml.generation/1.1`。这保证模型可替换，同时保留厂商参数。

---

## 3. 交付 / 发布平台

| 平台/规格 | VHTML |
|---|---|
| YouTube 16:9 / 4K | `youtube-4k` |
| TikTok / Reels / Shorts 9:16 | `tiktok` / `reels` / `shorts` / `vertical-1080p` |
| Instagram 4:5 | `portrait-1080p` |
| Square feed | `square-1080p` |
| Cinema 2.39:1 | `cinema-4k` |
| Web 1080p/720p | `web-1080p` / `web-720p` |
| GIF preview | `gif-preview` |
| Podcast audio | `podcast-audio` |

安全区、码率、fps、fit 由 [delivery-profiles.md](./delivery-profiles.md) 定义。

---

## 4. 权利 / 可信 / 元数据

| 标准 | VHTML |
|---|---|
| Creative Commons / SPDX | `Asset.license`、`GenerationRights.license` |
| C2PA / Content Credentials | 导出报告 + provenance；签名 manifest 为 C3 缺口 |
| IPTC / schema.org | 可映射 metadata；未强制映射 |
| AI 披露 | `rights.aiDisclosure`，发布侧标签 |
| 同意书 | `rights.consent`，真人/声音克隆校验 |
| 内容审核 | `safety` + review，Provider 侧执行 |

---

## 5. 协议 / 工程

| 标准 | VHTML |
|---|---|
| JSON Schema 2020-12 | Core/project/package/provider schemas |
| OpenAPI | Provider HTTP 契约尚未发布 OpenAPI 文档 |
| AsyncAPI | 异步 job 有 `statusUrl`，未发布 AsyncAPI |
| OAuth2/OIDC | 远程 Studio 目前 Basic auth；企业 SSO 缺口 |
| S3/HTTP CDN | 资产 URL/相对路径；签名 URL 由适配器 |
| Docker/OCI | Dockerfile/compose 提供 |
| OpenTelemetry | 无原生 tracing/metrics | 缺口 |

---

## 6. 与商业交付的差距

以下差距必须公开，不得用“完美”掩盖：

1. HDR/广色域/alpha 视频编码；
2. HLS/DASH 打包与广告/DRM；
3. C2PA 签名、水印、发布平台回执；
4. 多用户锁、评论、审批历史；
5. OTIO/FCPXML/AAF 互操作 adapter；
6. 商业 Provider 的成本/配额/计费；
7. 大规模渲染队列、增量渲染、代理媒体；
8. 真实模型的黄金评测集；
9. 企业 SSO/RBAC/审计导出；
10. 3D/空间视频。

这些在 [standard-audit.md](../docs/standard-audit.md) 中维护为路线图。
