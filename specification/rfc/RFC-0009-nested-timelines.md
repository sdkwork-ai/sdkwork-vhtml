# RFC-0009：嵌套时间线（Compound Clip）

- 状态：已采纳（VHTML 1.1 代码创作扩展）

## 背景

长视频需要可复用子序列（片头/片尾/章节）。1.1 的 `resolveReference` 已
保留 `timeline:` 命名空间但没有对应 Clip 类型，解析器显式拒绝。

## 决策

1. 新 Clip 类型 `timeline`：`ref="timeline:<id>"`；片段时长缺省取子时间线
   时长；支持前向引用（finalize 统一解析）。
2. 引用图必须为 DAG：验证器 DFS 检测环与自引用（`REFERENCE_CYCLE`）；
   运行时递归深度上限 8。
3. 求值为**扁平化**：子时间线按 `sourceIn/speed/reverse/loop/remap` 映射的
   时间求值，片段状态并入父帧；z 序 = 父底序 + 片段 z + 子 z。
4. 音频随扁平化混入；包装链的轨道/片段音量、声像、淡变沿链相乘；
   嵌套片段必须位于 video/overlay 轨道（内嵌音频不受承载轨道静音影响）。
5. Stage 为可达子时间线挂载图层/音频/CSS；clip id 全项目唯一，因此
   按 clipId 驱动的浏览器运行时无需改动。

## 限制（如实声明）

- 同一子时间线被多个片段同时引用时共享子图层（样式取最后实例）。
- 包装片段的 transform/opacity/effects 不应用于扁平化子层。
- 转场窗不跨嵌套边界。
组渲染（group compositing）列为后续版本方向。

## 结果

`standard-audit` 中 "Nested timelines / compound clips" 缺口关闭；
长视频/模板复用无需复制粘贴片段。

## 测试

- `tests/unit/authoring.test.ts`：时间映射扁平化、环检测。
- `examples/08-code-video`：程序创建子时间线并作为 compound clip 使用，
  端到端导出验证。
