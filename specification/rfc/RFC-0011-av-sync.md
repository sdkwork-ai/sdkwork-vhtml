# RFC-0011：音画同步（时间码、音频偏移、字幕对齐）

- 状态：已采纳（VHTML 1.1 代码创作扩展）

## 背景

1.1 的音画同步依赖统一有理时间与逐帧 seek 协议，但缺三类日常能力：

1. 编辑工作流以 SMPTE 帧计数时间码寻址（`HH:MM:SS:FF`）；1.1 只接受
   小数形式 `HH:MM:SS.fraction`，与外部分镜/工程文件交换时必须手工换算。
2. 唇同步修正（录制延迟、转码偏移）无法声明，只能整体挪 `start`，
   会连带改变视频时间。
3. 配音/口播稿（SRT/VTT）进入时间线需要手工解析；生成式字幕与音轨
   对齐是智能体工作流的高频路径。

## 决策

1. **帧时间码解析**：`parseTime` 新增 `HH:MM:SS:FF`（非掉帧）与
   `HH:MM:SS;FF`（掉帧记法，数学相同），需要帧率上下文，`FF` 越界报
   `TIME_INVALID`；新增 `formatFrameTimecode` 反向格式化（非整数帧率
   如实降级为小数 + 帧索引标注，不做掉帧计数修正）。
2. **`audio-offset`**：`ClipBase.audioOffset` 有理数秒。语义为
   "音频听到 source(t) + offset"，视频路径不变。混音器扩展解码窗口并
   按偏移索引；预览对音频轨道片段同步；越界 warning + 静音填充；
   `clip.set { audioOffset }` 可编辑。
3. **`parseSubtitleBlocks`**：core 内纯字符串 SRT/WebVTT 解析器（浏览器
   安全），程序沙箱暴露为 `vhtml.parseCaptions`，SDK 重导出；输出精确
   有理数 cue，接受长/短两种 WebVTT 时间格式。

## 备选方案

- 轨道级/输出级全局偏移：可用 clip 偏移组合表达，v1 不引入新对象。
- 掉帧时间码计数修正（DF skip）：解析为连续帧索引即可满足寻址；完整
  SMPTE DF 计数列为后续能力（对创作无损）。
- 字幕解析放 media 包（Node 侧）：程序沙箱在 core、需要浏览器安全，
  且解析是纯字符串处理，放 core 无依赖负担。

## 结果

- 分镜/工程文件时间码可直接粘贴；唇同步一行声明；SRT 数据块 +
  `parseCaptions` + `addCue` 三行完成对齐字幕轨。
- `standard-audit` "音画同步"缺口关闭；能力报告新增 `av-sync`、
  `caption-import`。

## 测试

- `tests/unit/authoring.test.ts`：时间码解析/越界/格式化、audio-offset
  求值与越界警告、SRT/VTT 解析、程序生成对齐字幕。
- `conformance/timing/av-sync.vhtml`：NTSC 帧率下时间码起点 + 偏移的
  端到端求值一致性。
- `tests/unit/av-sync.test.ts`：组合语义回归——包装偏移累加、
  场景/嵌套时间线 remap、时间码+偏移同片段组合。

## 补遗（第四轮回归）

复合片段（嵌套时间线）的音频即其内嵌音频，因此 `audio-offset` 对
`kind="timeline"` 片段同样适用：偏移使其全部内嵌音频相对该片段的视觉
映射整体平移，多级嵌套逐级累加；验证器的"无音频"警告排除 timeline
片段。场景与嵌套时间线片段的 `timeRemap` 纳入与媒体片段相同的求值路径
（此前仅混音器侧生效，求值侧被忽略——已修复并测试）。
