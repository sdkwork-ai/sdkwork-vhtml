# RFC-0013：生成用量与配额记账

- 状态：已采纳（VHTML 1.1.2 生成扩展）

## 背景

生成任务是 Core 对象，但 1.1.1 对"一次生成花了多少钱/多少算力"没有任何
结构化表达。审计遗留缺口明确要求 **AI cost/quota fields**：智能体批量
出片与商业交付（commercial.md 的 C2/C3 级）都需要可审计的用量记录与
花费上限；导出报告的 provenance 也应汇总用量而不是让成本散落在日志里。

## 决策

1. **`GenerationUsage` 记录**（`<generate>` 的 `<usage>` 子元素，可选）：
   `cost` + `currency`、`tokens`、`credits`、`compute-seconds`、
   `output-bytes`、`recorded-at`；厂商私有单位以属性保留（往返稳定）。
   数字必须非负；`cost` 无 `currency` 时校验器给 warning（汇总会混单位）。
2. **运行时观测记账**：`materializeGenerations` 对每次真实 provider 调用
   记录 `computeSeconds`（实测墙钟）与 `outputBytes`（输出文件实测大小）；
   provider 可通过新的 `GenerationRun` 返回封套上报 `usage` /
   `providerJobId`（返回裸 `GeneratedFile[]` 依旧合法；上报字段覆盖观测
   值，观测值不被覆盖的则保留）。
3. **配额上限**：`GenerateOptions.quota`（`maxCost`/`maxCredits`/
   `maxTokens`/`maxComputeSeconds` + `currency`）。每次 provider 调用前
   检查累计用量，超限立即抛 `GENERATION_QUOTA_EXCEEDED`（新稳定错误码，
   属 `GENERATION_*` 家族），后续任务不再调用 provider。上限按
   "已花费累计 > 上限" 判定；跨过上限的那次调用可能造成少量溢出并在
   结果中如实记账。CLI 以 `--max-cost` / `--max-credits` /
   `--max-compute-seconds` / `--currency` 暴露。
4. **导出报告**：`vhtml.export-report/1` 的 provenance 中每个 generation
   携带 `usage`，并新增 `usageTotals`（cost/credits/tokens/
   computeSeconds/outputBytes 求和）；报告不含密钥与完整提示词，
   沿用既有隐私边界。
5. **用量是记录性数据**：不参与缓存键（缓存键 = 重新生成相同输出的
   决定因素），也不改变状态机；`recordedAt` 以 ISO-8601 记录。

## 备选方案

- 把用量塞进 `metadata` 自由表：无类型、无法汇总、无法约束，否决。
- provider 接口改为必须返回封套：破坏全部既有 provider，改为返回类型
  加宽（数组或封套皆可）。
- 配额在导出期一次性检查：无法阻止批生成中途超支，必须在每次调用前
  判定。

## 结果

- 智能体/CI 可用 `--max-cost` 控制预算，超支报稳定错误码。
- 导出报告可审计每次交付的 AI 成本；多租户计费有了核心模型锚点。
- 测试可注入 fake provider（`GenerateOptions.providers`），同时为宿主
  嵌入提供 provider 覆盖点。

## 测试

- `tests/unit/generation-usage.test.ts`：`<usage>` 解析/校验/序列化往返、
  cost 缺 currency 警告、封套与观测记账合并、运行汇总、配额触发
  `GENERATION_QUOTA_EXCEEDED`。
- 导出报告 schema 增补 `usage`/`usageTotals` 并通过 Ajv 校验。
