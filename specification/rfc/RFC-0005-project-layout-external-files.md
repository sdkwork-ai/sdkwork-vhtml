# RFC-0005：项目目录、清单与外部文件

- **状态**：Accepted
- **规范版本**：VHTML 1.1（Project & External File Profile）
- **日期**：2026-10-23
- **相关**：[project-layout.md](../project-layout.md)

## 决策

1. VHTML 项目以目录为一等对象，`vhtml.json` 为可选清单；入口为 `.vhtml`，源为可选 `.ts`/`.js`。
2. 所有路径相对项目根解析；禁止根外访问。外部 Scene 的相对 URL 在解析期 rebase 为根绝对 URL。
3. `<scene src>` 是外部 HTML 片段；序列化保留 `src`，不内联。
4. 工具提供统一资源清单，覆盖 HTML/CSS/`@import`/脚本/生成输出；分类 missing/external/outside/unused。
5. 资源导入复制到标准目录、按 hash 去重、探测元数据并写回模型；原文件不移动。
6. 可移植包为 ZIP `.vhtmlpkg`，包含清单、入口、源、assets、scenes、generated 与 `vhtml.package.json`；默认排除缓存/渲染/依赖。
7. 缓存 canonical 为 `.vhtml/cache/generated.json`，兼容旧 `.vhtml-cache/generated.json`。

## 理由

单文件项目无法表达真实视频项目的媒体目录、外部 HTML 模块、生成输出和渲染产物。把“项目根”定义为信任边界和路径基准，可以同时满足 HTML 自然相对路径、可移植性和安全性。保留 `src` 而非内联，让外部 HTML 可被代码编辑器/版本控制正常管理，避免双向漂移。

## 兼容性

- 单 `.vhtml` 文件仍可直接使用；无清单时通过目录扫描发现入口。
- 旧缓存路径可读。
- 新增清单/外部 Scene/包均为可选能力；核心文档语法不变。

## 未采用

- 把资源嵌入为 base64：破坏 HTML 语义、体积大、不可缓存。
- 允许 `..` 访问项目外：不可移植且难以保证安全。
- 在 `.vhtml` 中内联外部 Scene：失去外部文件管理意义。
