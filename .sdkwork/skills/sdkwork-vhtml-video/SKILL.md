---
name: sdkwork-vhtml-video
description: >
  Use for anything VHTML video: creating projects and authoring scenes,
  timelines, captions or audio; editing existing timelines (cut, trim,
  retime, replace, restructure); adding or materialising AI/procedural
  generation tasks (image, video, speech, music, sfx, avatar, lipsync, dub,
  translation); and exporting deliverables to MP4/WebM/GIF/WAV with delivery
  profiles, caption sidecars, reports and QC. Trigger on "做个视频", "剪掉这
  段", "导出", "加字幕", "文生视频", "AI 配乐", "make a video", "edit this
  promo", "export tiktok version", "transcribe and cut", "delivery", or any
  request that must produce, change or ship a .vhtml video project.
---

# VHTML Video（视频创作 · 剪辑 · 生成 · 交付 一体化技能）

> 一个技能覆盖 VHTML 视频全流程。SKILL.md 是路由与总纲；每个阶段的工作细
> 节在 `workflows/`，语法与操作参考在 `references/`，确定性脚本在
> `scripts/`。项目真源是 `.vhtml` 文档 + 项目目录；所有阶段共用同一 Core
> Model，同一套校验与 QC 门禁。

## When to use / capability router

| 你要做什么 | 进入的工作流 | 关键参考 |
|---|---|---|
| 从简报/创意新建项目、编写场景/时间线/动画/字幕/音频（宣传片、竖屏、PPT、数据驱动、AI 分镜） | [workflows/create-video.md](workflows/create-video.md) | [references/video-blueprints.md](references/video-blueprints.md)、[references/authoring-guide.md](references/authoring-guide.md) |
| 对既有时间线做剪辑：切/剪/变速/换源/嵌套/转场/效果，或按转写稿删口误 | [workflows/cut-from-transcript.md](workflows/cut-from-transcript.md)（文本化剪辑）+ 直接使用编辑操作 | [references/edit-operations.md](references/edit-operations.md) |
| 添加并物化 AI/程序化素材：图、视频、语音、音乐、音效、数字人、翻译 | [workflows/generate-assets.md](workflows/generate-assets.md) | [references/generation-tasks.md](references/generation-tasks.md) |
| 导出成片：多平台交付（tiktok/reels/shorts/cinema/podcast…）、字幕边车、审计报告、QC | [workflows/deliver-video.md](workflows/deliver-video.md) | [references/delivery-profiles.md](references/delivery-profiles.md) |

一个完整的“简报 → 成片”任务按 create → generate → edit → deliver 顺序穿
行上述工作流；阶段间以 `vhtml validate` 通过为交接门禁。工作流之间没有硬
边界：剪辑中发现缺素材就回到 generate，交付前发现内容问题就回到 create。

## Inputs

- **项目语境**：目标项目（含 `vhtml.json` 的目录或裸 `.vhtml` 文件）；新
  建时是一个存放位置与一份创意简报（缺简报先用
  [assets/video-brief.template.md](assets/video-brief.template.md) 起草并确
  认，不得虚构品牌事实/数据/引言）。
- **环境**：Node.js >= 22.18、pnpm >= 10；本仓库已 `pnpm install && pnpm
  build`；Chrome/Chromium 与 FFmpeg 6+（`pnpm vhtml doctor` 检查）。生成任
  务的厂商凭据走环境变量，绝不写入项目文件。

## Files and commands this skill may touch

- **创建/修改**：仅目标项目目录内的 `video.vhtml`（真源）、`video.ts`
  （SDK 源，`.vhtml` 是其构建产物）、`scenes/*.html`、`assets/`、
  `vhtml.json`、`renders/` 输出、剪辑备份 `*.vhtml.bak`；以及
  `generated/`、`.vhtml/cache/`（机器所有，只由 `vhtml generate/export`
  写入，禁止手改）。
- **运行**（全部经 `bin/vhtml.mjs` 或 `pnpm exec vhtml`）：
  `init/build/validate/inspect/render/preview/split/generate/providers/
  capabilities/edit/captions/audio/assets list|verify|import|relink/pack/
  unpack/export`；以及本技能脚本：
  - `scripts/new-video.mjs` — 从蓝本脚手架项目（`--list` 查看蓝本）。
  - `scripts/check-project.mjs <project>` — validate + assets + 渲染冒烟
    一站式门禁（所有阶段写前/写后都可用）。
  - `scripts/apply-edits.mjs <project> --ops <file|->` — 编辑操作的安全应
    用器（lint + 备份 + 复验；`--dry-run` 预演）。
  - `scripts/verify-export.mjs <file>` — 导出 QC（ffprobe + 帧哈希防冻结）。
- **不触碰**：`packages/`、`specification/`、`conformance/`、`tests/`、
  `.sdkwork/` 元数据；程序文档被编辑器保存时会冻结程序——保持未冻结源在
  版本控制中，用 `vhtml build` 重新物化而非手改冻结产物。
- **禁止**：写入任何密钥/凭据；提交大体量生成媒体到仓库需用户明确同意。

## Specs followed

全局标准（`../sdkwork-specs/`，相对仓库根）：`SDKWORK_WORKSPACE_SPEC.md`、
`AGENTS_SPEC.md`、`SOUL.md`、`CODE_STYLE_SPEC.md`、`NAMING_SPEC.md`；
`DESTRUCTIVE_OPERATION_SPEC.md`（删除类剪辑与缓存重置）；`PRIVACY_SPEC.md`
（提示词与素材隐私）。

VHTML 领域规范（本仓库，规范性）：`specification/VHTML-1.1-Specification.md`
（核心模型）、`specification/project-layout.md`（项目布局）、
`specification/video-authoring.md`（程序文档/变速/嵌套/闪避/音画同步）、
`specification/editing.md`（编辑操作）、`specification/generation.md`
（生成协议）、`specification/delivery-profiles.md`（交付配置）、
`specification/commercial.md`（商业交付）、`specification/rendering.md`
（确定性）、`docs/sdk.md`（SDK）。引用之，不复制之。

## Workflow (any phase)

1. **定位阶段**：用上方路由表选定工作流；跨阶段任务按
   create → generate → edit → deliver 穿行，每阶段结束 `vhtml validate`
   通过再进入下一阶段。
2. **写前检查**：`node scripts/check-project.mjs <project>`（新项目跳过）。
3. **按工作流执行**，在关键点渲染抽查
   （`vhtml render <project> --time <t> --out frame.png`）。
4. **写后复验**：`check-project.mjs`；交付阶段逐文件跑
   `scripts/verify-export.mjs`。
5. **报告**：改动清单、校验/QC 结论、备份与报告文件路径、剩余警告、下一
   步命令。`procedural` 生成的素材是占位级，须如实说明。

## Guardrails（全阶段）

- 时间是有理数：`'1.5s'`/`'500ms'`/`'90f'`/`'00:00:12:15'`；帧界半开区间；
  媒体片段保持 `out = in + duration × speed` 且不越源。
- 音频只从 `type="audio"` 轨道混出；转场需要真实重叠；`clip.set` 只收表现
  属性，时序走 move/trim/speed/freeze。
- 确定性红线：场景代码禁止真实时钟、未播种随机、渲染期网络。
- 删除类操作（rippleDelete/rippleCut/缓存重置）是破坏性操作：范围不确定
  时先确认；执行必留备份；报告必须列明删除内容。
- 权利优先：真人肖像/声音克隆必须 `consent`；商业交付 `aiDisclosure`；
  `--report` 是审计凭证，商业件必留。
- 程序沙箱 `Math` 仅有 `random`；`vhtml edit` 的 ops 文件必须是数组（裸对
  象会被静默忽略——`apply-edits.mjs` 已防护）。
- 常见故障速查表：[references/authoring-guide.md](references/authoring-guide.md) §6。

## Detailed references

- 创作模式与文档语法：[references/authoring-guide.md](references/authoring-guide.md)
- 六大蓝本与选型：[references/video-blueprints.md](references/video-blueprints.md)
- 编辑操作全集与失败语义：[references/edit-operations.md](references/edit-operations.md)
- 生成任务/方向/输入角色/Provider/权利：[references/generation-tasks.md](references/generation-tasks.md)
- 交付配置与报告：[references/delivery-profiles.md](references/delivery-profiles.md)
