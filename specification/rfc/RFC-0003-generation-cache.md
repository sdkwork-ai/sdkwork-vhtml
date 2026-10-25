# RFC-0003：生成任务、缓存与 provenance

- 状态：已采纳（VHTML 1.1）

## 背景

1.0 草案把 `generate` 定义为对象，但未规定：

- 输出如何成为 Asset；
- Clip 如何引用生成结果；
- 重复运行如何复用；
- 厂商模型变化如何审计；
- 密钥与失败如何处理。

## 决策

1. 任务输出 Asset ID 为 `gen:<taskId>`。
2. Clip 使用 `ref="gen:<taskId>"`。
3. 缓存位于 `.vhtml-cache/generated.json`，键包含任务/Provider/模型/约束/参数/输入。
4. 每次输出记录 `provenance`（provider/model/promptHash/seed/hash/时间）。
5. 生成文件默认进入 `generated/`，不得逃逸项目根。
6. 源文档不得包含密钥；HTTP Provider 从环境变量读取凭据。
7. 导出前自动物化或明确失败；不静默替换缺失素材。
8. 生成失败不写入部分结果；取消必须传播 AbortSignal。

## 结果

- `vhtml generate`、`export --generate`、Studio 导出共享同一机制。
- 生成模型升级可审计；缓存可删除/强制刷新。
- 生成与时间轴解耦：任务是依赖，Clip 是使用。

## 测试

- procedural 图像/视频/音频。
- 第二次运行命中缓存（skipped）。
- 缓存删除后重新生成。
- 无密钥文件扫描。
