# VHTML Commercial Delivery Profile

**状态**：规范性 Profile（商业化交付）  
**依赖**：[VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md)、[generation.md](./generation.md)、[storyboard.md](./storyboard.md)、[delivery-profiles.md](./delivery-profiles.md)

本 Profile 定义“可交付、可审计、可追责”的商业视频生产要求。它不把 VHTML 变成计费系统，而是要求项目、生成任务、资产和导出报告携带足够信息，使商业团队能够做权利审核、AI 披露、质量控制和交付验收。

---

## 1. 商业化等级

| 等级 | 要求 | 适用 |
|---|---|---|
| `C0-internal` | 可渲染、可预览 | 内部草稿 |
| `C1-deliverable` | 固定交付规格、QC 通过、无缺失资产 | 客户审片 |
| `C2-auditable` | C1 + 导出 SHA-256 + provenance + rights/consent + review | 商业发布 |
| `C3-regulated` | C2 + C2PA/内容凭证 + 审批日志 + 保留策略 | 广告/广播/受监管行业 |

实现 MUST 在能力声明中给出支持的等级；不得声称 `C2` 而没有导出报告和权利字段。

---

## 2. 项目与资产权利

- Asset 的 `license` 记录名称/URL；生成 Asset 的 `provenance` 记录 provider/model/seed/hash。
- GenerationTask 的 `rights` 记录 license、consent、likeness、voiceCloning、commercialUse、aiDisclosure。
- 真人肖像 `likeness=consented`、声音克隆 `voiceCloning=consented` 时 MUST 提供 `consent`，否则验证 SHOULD 警告。
- 商业使用与许可证核验由项目方负责；工具 MUST NOT 伪造“已授权”状态。
- 外部素材 MUST 在资产清单中可定位；缺失/外部/越界文件在交付前必须处理。

---

## 3. 导出审计报告

`vhtml export --report <file>` MUST 生成 `vhtml.export-report/1`，至少包含：

```json
{
  "schema": "vhtml.export-report/1",
  "vhtml": "1.1",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "project": "film",
  "output": "mp4",
  "format": "mp4",
  "width": 1920,
  "height": 1080,
  "frameRate": "30/1",
  "frames": 300,
  "durationSeconds": 10,
  "sizeBytes": 1234567,
  "sha256": "…",
  "probe": { "videoCodec": "h264", "audioCodec": "aac" },
  "delivery": { "preset": "tiktok", "aspectRatio": "9:16", "platforms": ["tiktok"] },
  "provenance": {
    "aiGenerated": true,
    "assets": [{ "id": "gen:hero", "kind": "video", "src": "generated/hero.mp4", "hash": "…" }],
    "generatedAssets": [{ "id": "gen:hero", "provider": "vendor", "model": "video-1", "hash": "…" }],
    "generations": [{ "id": "hero", "kind": "video", "status": "succeeded", "review": "approved", "rights": { "aiDisclosure": true } }],
    "licenses": ["CC-BY"],
    "consents": ["consent-doc-123"],
    "aiDisclosure": true
  },
  "issues": []
}
```

- `sha256` MUST 对最终媒体文件计算；PNG 序列可省略或对 manifest 计算。
- 报告 JSON Schema：`export-report.schema.json`；通过 `loadSchema('export-report')` 加载。
- 报告 MUST NOT 包含 API 密钥、完整私有提示词或未脱敏个人信息。
- 报告 SHOULD 与成片一起归档；发布系统 SHOULD 校验 sha256。

---

## 4. 审核与发布

- GenerationTask 使用 `review`：`pending / approved / rejected / changes-requested`。
- 项目级发布审批由工具实现；C2 要求至少一个可追溯的审核状态。
- `changes-requested` MUST 阻止“已批准”发布流程。
- 审核人、时间、备注 SHOULD 进入审计日志。
- AI 生成内容 `aiDisclosure=true` 时，发布物料 SHOULD 带 AI 标识。

---

## 5. AI 内容凭证与披露

- C2PA/内容凭证是 `C3` 的推荐实现：把项目 ID、生成任务、输入资产哈希、输出 SHA-256、模型/Provider 写入 manifest。
- 不可伪造来源；没有签名能力时 MUST 明确声明“仅记录、未签名”。
- 隐形水印/指纹是可选扩展，不改变 Core Model。
- 发布侧可以增加平台 AI 标签；VHTML 不替代平台合规审核。

---

## 6. 成本、配额与 SLA

商业化实现 SHOULD 记录：

- Provider 返回的 `metadata.providerCost`、币种、usage；
- 项目/任务预算与超额策略；
- 重试次数、超时、并发上限；
- 生成 job 的 `providerJobId` 与状态轮询；
- 交付 SLA（渲染时长、失败率、最大分辨率）。

VHTML 1.1 不把计费字段强制进 Core Model；可放在 `metadata`/导出报告扩展中。未实现的字段不得伪造。

---

## 7. 安全与多租户

- 密钥只来自宿主环境/凭据存储，不得写入 `.vhtml`、日志或导出报告。
- 远程 Provider 的本地输入 MUST 由适配器上传/签名；不得假设远端可读本地路径。
- Studio 非 loopback 绑定 MUST 配置认证；TLS 在反向代理终止。
- 多租户 MUST 隔离项目根、缓存、生成文件和导出目录。
- 删除/保留策略 MUST 覆盖生成缓存、代理文件、导出报告。
- 远程素材下载 MUST 遵守 SSRF/域名/大小限制。

---

## 8. 交付 QC

C1 及以上 SHOULD 检查：

- 尺寸、帧率、时长、编码、像素格式、色彩空间；
- 音频采样率、声道、响度（EBU R128 / 平台标准）；
- 字幕/隐藏字幕、字体缺失、文字溢出；
- 画面安全区（9:16/1:1/4:5）；
- 黑帧/静音/闪白/裁剪；
- 文件 SHA-256 与报告一致。

`vhtml export --delivery` 负责尺寸/帧率/码率/安全区；响度与平台 QC 由媒体层/发布流水线补齐。

---

## 9. 协作与版本

商业化协作至少需要：

- 项目 revision / 内容哈希；
- 编辑锁或乐观并发（冲突检测）；
- 审核/评论/批准历史；
- 可回滚的发布版本。

VHTML 1.1 的 Core 提供确定性模型与编辑事务；多用户锁、评论和发布历史属于实现层，不在 Core 中强制。

---

## 10. 交付清单

商业交付包 SHOULD 包含：

1. 成片文件 + `sha256`；
2. `vhtml.export-report/1`；
3. `.vhtml` 项目与 `vhtml.json`；
4. 资产清单/许可证/同意书引用；
5. 字幕/字幕源文件；
6. 生成任务 provenance（如使用 AI）；
7. 审核记录；
8. 交付规格说明（profile id、安全区、响度）。

---

## 11. 一致性

声称支持本 Profile：

1. 导出报告包含 `schema/sha256/provenance`；
2. AI 生成资产/任务进入 provenance；
3. 权利/同意字段可解析、可校验、可导出；
4. C1 交付通过尺寸/编码/时长 QC；
5. C2 具备报告 + 审核 + 权利字段；
6. 不把密钥/私有提示词写入报告；
7. 明确声明未实现的 C2PA/水印/计费能力。
