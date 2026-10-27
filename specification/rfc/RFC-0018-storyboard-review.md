# RFC-0018：分镜审查记录与审批历史

- 状态：已采纳（VHTML 1.1.3 规划层扩展）

## 背景

生成任务已有 `review`/`rights`/`safety` 治理记录（`review.status` 门禁
交付），但分镜（StoryboardShot）只有单个 `status` 枚举：谁审的、何时审
的、为什么打回，没有结构化归宿。审计遗留缺口 **Storyboard versioning**
（per-shot revisions, comments and approval history）的治理部分。完整的
逐字段修订快照（每次 description 编辑存 diff）属于协作/历史系统，与本
RFC 分离。

## 决策

1. **`StoryboardShot.review: GenerationReview`**（复用生成任务的审查
   结构：status/reviewer/notes/reviewedAt）——当前审查记录。
2. **`StoryboardShot.reviewHistory: GenerationReview[]`**——既往记录，
   时间升序，只追加。`storyboard.review` 编辑操作在设置新记录时把旧
   `review` 追加进历史，审批链条不丢失。
3. **文档语法**：`<shot>` 的 `<review status reviewer reviewed-at>` 子
   元素（与 `<generate>` 的 review 同形）。序列化约定：**最后一个
   `<review>` 是当前记录**，其前的都是历史；解析按同一约定还原。
4. **编辑操作**：`{ op: 'storyboard.review', shotId, review }`：
   - 旧 review 入历史（存在时）；
   - 决策与镜头状态联动保持诚实：`approved` 将非 ready 镜头推进为
     `approved`；`changes-requested`/`rejected` 把已推进镜头退回
     `boarded`（idea 保持 idea）；
   - 非法 status 报 `EDIT_INVALID_OPERATION`，缺失镜头报
     `EDIT_TARGET_NOT_FOUND`。
5. **一致性**：review status 集合提升为 Core 常量
   `GENERATION_REVIEW_STATUSES`，生成任务、分镜、编辑器同源。
6. **范围声明**：评论文（与审查记录分离的自由讨论）、逐字段修订快照、
   多人并发审查冲突处理，留给协作/历史 Profile。

## 备选方案

- 只加 `approvedBy`/`approvedAt` 两个属性：一次打回-返修循环就丢历史，
  无法满足 approval history。
- 把审查记进 `notes` 自由文本：不可查询、不可校验、不可在能力协商中
  声明。
- 复用 `status` 枚举承载审查结果：`status` 是制作阶段（idea → … →
  approved），与审查决策正交；混用会让"生成中但被拒绝"无法表达。

## 结果

- 人工审查门禁从生成任务扩展到分镜层：Agent 提交分镜 → 人审
  `storyboard.review` → approved 后才 `storyboard.apply` 落时间线。
- 审批链在文档内可序列化、可 diff、可编辑器回放（undo/redo 覆盖）。

## 测试

- `tests/unit/round12.test.ts`：解析（最后一条为当前、其余为历史）、
  序列化往返、`storyboard.review` 追加历史/目标缺失/非法 status、
  校验通过。
