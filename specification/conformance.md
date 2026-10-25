# VHTML 1.1 一致性、测试与能力

## 1. 实现等级

| 等级 | 必须通过 |
|---|---|
| VHTML Parser | 语法、模型、引用、时间、错误码 |
| VHTML Web Renderer | Parser + HTML/CSS/SVG/Stage 协议 |
| VHTML Media Renderer | Web Renderer + 时间线、帧采样、音频、导出 |
| VHTML Full Runtime | Media Renderer + 编辑、生成、字幕、能力矩阵 |

实现必须发布：

- 规范版本、实现版本；
- 能力矩阵（支持/限制）；
- 浏览器、Node、FFmpeg、平台版本；
- 一致性测试结果；
- 已知限制。

## 2. 测试分类

1. 文档语法与 HTML 解析；
2. Core Model 类型、ID、引用；
3. 精确时间、帧数、边界、源时间映射；
4. Timeline/Lane/Clip/Transition；
5. HTML/CSS/SVG/Canvas 渲染；
6. CSS/WAAPI 动画定位；
7. 媒体解码、seek 与帧就绪；
8. 帧采样重复性；
9. 音频混音、采样率、声道、同步；
10. 导出格式、时长、取消、清理；
11. 字体/图片/资源失败；
12. 生成任务、Provider、缓存、provenance；
13. 分镜解析、排序、引用、自由编辑与 Studio 保存；
14. 外部文件加载：空格/Unicode/百分号编码、`%23`/`%3F` 文件名、query/hash、根内嵌套、符号链接逃逸、远程 Scene 拒绝；
15. 编辑操作、撤销、冲突；
16. 安全、网络、路径、密钥；
17. 版本迁移与互操作。

## 3. 测试类型

- **语义测试**：解析出的模型字段/关系。
- **行为测试**：时间状态、DOM 状态、诊断码。
- **视觉容差测试**：重复渲染哈希或 SSIM ≥ 0.995。
- **像素精确测试**：固定环境、固定种子、固定字体。
- **负向测试**：非法时间、缺失引用、越权路径、错误扩展。
- **编辑事务测试**：批量失败回滚、磁盘不写入。

## 4. 参考实现的退出标准

参考实现 `@sdkwork/vhtml` 1.1.1 达到：

- 单元测试：时间、解析、序列化、验证、动画、编辑、项目布局、外部
  Scene、资源清单/导入、交付规格、AI 生成、分镜、`.vhtmlpkg` 往返全部通过。
- 集成测试：Chromium 重复采样 PNG 哈希一致。
- 导出测试：MP4 + AAC + WebVTT，ffprobe 校验时长/编解码器。
- 生成测试：procedural/manifest/http 可运行并缓存，依赖图与多输出可用。
- 分镜测试：解析/序列化 round-trip、add/set/remove/move/reorder、引用校验。
- Studio：预览、WYSIWYG 移动/缩放/旋转、吸附、资源拖放、字幕、转场、
  分镜拖拽/字段编辑/复制/删除、撤销/重做、保存、外部文件 Reload、导出。
- CLI：init/build/validate/inspect/render/export/preview/generate/providers/
  edit/audio/captions/assets/pack/unpack/capabilities/doctor。

## 5. 能力声明示例

```json
{
  "implementation": "@sdkwork/vhtml",
  "version": "1.1.1",
  "specVersion": "1.1",
  "features": {
    "html": true,
    "javascript": "virtual clock",
    "webgl": "captured, driver-dependent",
    "transitions": true,
    "generation": true,
    "storyboard": true
  },
  "limitations": [
    "pixel identity requires a pinned environment",
    "SMIL is not seeked"
  ]
}
```

## 6. 一致性测试目录

```text
conformance/
├── manifest.json
├── parsing/
├── model/
├── timing/
├── render/
├── editing/
├── storyboard/
├── generation/
├── export/
└── security/
```

每个 fixture 的 `manifest.json` 记录：输入文件、期望诊断码、期望模型摘要、
可选的视觉容差和参考环境。

## 7. 版本治理

- 规范、Schema、参考实现、conformance 版本一致。
- 不兼容语义/语义变更进入主版本。
- 1.x 仅增加向后兼容能力；必须保留旧文档解析。
- 每个 RFC 必须包含动机、替代方案、兼容性、迁移与测试。
