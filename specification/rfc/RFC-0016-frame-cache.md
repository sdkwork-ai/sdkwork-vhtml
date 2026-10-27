# RFC-0016：确定性帧缓存（增量渲染）

- 状态：已采纳（VHTML 1.1.3 交付扩展）

## 背景

导出管线每次都要重开 Chromium 逐帧采样：多预设批量交付（`--batch`）对同一
时间线采样 N 遍，重复导出同一项目从零开始。审计遗留缺口
**Incremental render and proxies** 的"frame cache keyed by model hash"部分
（proxy media 已在前一轮完成）。

## 决策

1. **内容寻址缓存**：`<root>/.vhtml/cache/frames/<key>/frame-%06d.png`
   （沿用项目布局 Profile 的 `.vhtml/cache/` 约定）。key = SHA-256 over：
   - 规范化 `serializeProject(project)` 全文；
   - 采样范围（timeline id、fps、rangeStart、rangeDuration）；
   - 资产文件指纹（id + src + size + mtimeMs——改媒体即失效，且不为
     指纹哈希大文件）；
   - 渲染器指纹（executablePath、headless、sandbox、allowNetwork）；
   - key 版本常量 `v1`。
2. **读取语义**：帧存在且非空即命中。key 已包含决定像素的全部输入，
   同环境下命中帧与重采样帧一致；环境变化（Chromium 更新）由渲染器指纹
   兜底（puppeteer 解析版本化路径），其余情况用 `--frame-cache-refresh`
   写通刷新。
3. **集成点**：`exportProject` 的 PNG 序列与视频编码两条路径均为
   读取缓存 → 未命中才采样并写回；**全部命中时整个 Chromium 不再启动**。
   `ExportResult.frameCache` 报告 `{ dir, key, hits, misses }`。
4. **批量共享**：`--batch` 默认启用缓存（`--no-frame-cache` 关闭），全部
   预设共享一次采样——预设只在 FFmpeg 编码参数（尺寸/fit/码率）上有差异，
   采样帧都是构图尺寸，天然可复用。
5. **单次导出**：`--frame-cache` 显式开启（目录
   `.vhtml/cache/frames`），`--frame-cache-refresh` 写通刷新。
6. **清理**：写回新帧后按 key 目录 mtime 保留最新 N=8 个
   （`VHTML_FRAME_CACHE_KEEP` 可调）。缓存是导出器自有生成产物：清理时
   通过单次 readdir 枚举精确目录名、逐个路径校验在缓存根内后删除，不做
   通配删除。

## 备选方案

- 帧级状态哈希（对每帧求值结果做 key）：可实现局部失效（只重采样受编辑
  影响的帧），但需要把求值器变成纯内容寻址，涉及渲染协议扩展；v1 采用
  整项目 key，编辑后全量失效是**安全方向**（多命中、零陈旧）。
- 把帧缓存放进 `generated/`（随 `.vhtmlpkg` 打包）：帧是机器相关产物，
  不应进入可分发包；留在 `.vhtml/cache/`。

## 结果

- `--batch web-1080p,tiktok,reels`：一次 Chromium 采样服务全部预设。
- 编辑-预览-导出循环：未改动的项目秒级重导出。
- 与 RFC-0015 的确定性语义一致：缓存键覆盖所有像素决定因素，降级显式。

## 测试

- `tests/unit/round12.test.ts`：key 稳定性（同项目同键；编辑/范围/渲染器
  指纹变化换键）、读写往返、refresh 语义、prune 保留最新 N 且路径全部
  在缓存根内。
- `tests/integration/export.test.ts`：第二次导出 `hits == frames &&
  misses == 0` 且不慢于首导出。
