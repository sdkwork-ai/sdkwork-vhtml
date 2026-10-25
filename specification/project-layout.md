# VHTML 1.1 项目目录与外部文件规范

**状态**：规范性 Profile（VHTML 1.1 Project & External File Profile）  
**依赖**：[VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md)  
**实现**：`@sdkwork/vhtml` 1.1.1

本 Profile 定义 VHTML 项目作为**目录**（而不是单个 `.vhtml` 文件）时的标准布局、清单、路径解析、外部 Scene、资源清单、导入/重链与可移植打包规则。核心文档语法不受影响；一个只包含 `.vhtml` 文件的目录仍然是合法项目。

---

## 1. 目录布局

规范布局：

```text
my-film/
  vhtml.json              # 可选的项目清单（推荐）
  video.vhtml             # 规范入口（entry）
  video.ts                # 可选的代码优先源文件（source）
  scenes/                 # 外部 Scene HTML 片段
    intro.html
  assets/                 # 手工资源
    images/
    video/
    audio/
    fonts/
  generated/              # Provider 物化输出
  renders/                # 默认导出输出
  .vhtml/
    cache/
      generated.json      # 生成缓存（canonical）
  README.md
  .gitignore
```

### 1.1 必须/应当

- 项目根目录 MUST 是入口文件所在目录，或清单所在目录。
- 相对路径 MUST 相对项目根解析，而不是相对 `.vhtml` 入口所在子目录。
- `assets/`、`generated/`、`renders/`、`.vhtml/cache/` SHOULD 使用上述默认名。
- `vhtml.json` SHOULD 存在；缺失时工具 MUST 仍能通过 `*.vhtml` 入口或显式文件参数工作。
- 缓存 MUST NOT 作为项目源内容提交；`generated/` 是否提交由项目决定。
- 包/工具目录（`node_modules`、`.git`、`.vhtml`、`.vhtml-cache`）MUST 被可移植打包排除。

### 1.2 旧缓存兼容

实现 MUST 读取 `.vhtml-cache/generated.json`（1.1.0 早期布局）；新写入 SHOULD 使用 `.vhtml/cache/generated.json`。若两者都存在，canonical 优先。

---

## 2. `vhtml.json` 清单

```json
{
  "version": "1.1",
  "id": "my-film",
  "title": "My film",
  "entry": "video.vhtml",
  "source": "video.ts",
  "paths": {
    "assets": "assets",
    "images": "assets/images",
    "video": "assets/video",
    "audio": "assets/audio",
    "fonts": "assets/fonts",
    "scenes": "scenes",
    "generated": "generated",
    "renders": "renders",
    "cache": ".vhtml/cache"
  },
  "build": { "out": "video.vhtml" },
  "preview": { "port": 4173, "open": true },
  "export": { "outDir": "renders", "format": "mp4", "crf": 20 },
  "settings": {
    "allowRemoteAssets": false,
    "maxAssetSize": 536870912,
    "frameTimeoutMs": 30000
  },
  "requirements": ["deterministic"]
}
```

规则：

- `version` MUST 为 `"1.1"`。
- `entry` MUST 是项目根内、以 `.vhtml` 结尾的相对路径。
- `source` 为可选代码优先入口，通常是 `.ts`/`.js`。
- `paths.*` MUST 是项目根内相对路径，不得为绝对路径、不得包含 `..`。
- 未列出的 `paths` 使用默认值。
- 未知字段 MUST 被忽略（允许扩展）。
- `settings.allowRemoteAssets` 仅影响验证/警告，不改变运行时默认联网阻断。
- 清单 JSON 使用 UTF-8；允许 BOM，读取时必须剥离。

机器可读 Schema：[`packages/schema/schemas/vhtml-1.1/project.schema.json`](../packages/schema/schemas/vhtml-1.1/project.schema.json)。

---

## 3. 路径与 URL 解析

对 `asset/@src`、`scene/@src`、Scene HTML、CSS、`<link>`、`<script>` 中的所有本地 URL：

1. 去除首尾空白；空值忽略。
2. 以 `data:`、`blob:`、`about:`、`#`、`mailto:`、`tel:`、`javascript:` 开头的值不解析为文件。
3. 以 `http://`、`https://`、`//` 开头的值标记为 `external`；默认验证产生警告，渲染默认阻断。
4. 以 `/` 开头的值相对**项目根**解析（对应 stage 的 `<base href="/">`）。
5. 其他相对路径相对项目根解析；外部 Scene 内的路径先相对 Scene 文件解析，再 rebase 为根绝对 URL。
6. 禁止逃逸项目根。任何解析后位于根外的路径 MUST 报 `SECURITY_PATH_ESCAPE`。
7. 查询串和片段不参与文件存在性检查，但 MUST 保留在 URL 中。

### 3.1 路径编码、空格与 Unicode

VHTML 的项目根是文件加载的沙箱边界；根内文件名可以自由使用子目录、空格、Unicode、`#`、`?` 等字符，但必须遵守 URL 编码规则：

1. 先按字面值剥离 `?query` 与 `#fragment`，**再**做一次 `decodeURIComponent` 得到文件路径。
2. 文件名中的 `#` MUST 写成 `%23`，`?` MUST 写成 `%3F`；否则会被解释为 fragment/query。
3. 空格可以写成字面空格或 `%20`；Unicode 可以写成字面字符或 UTF-8 百分号编码。
4. 百分号编码只解码一次；`%2520` 表示字面文件名 `%20`，不是空格。
5. 畸形百分号序列保留字面值，不得抛异常或改变其他路径。
6. 解码后 MUST 重新做根目录逃逸检查；`%2e%2e%2f` 等编码穿越 MUST 被拒绝。
7. 外部 Scene rebase 后的 URL MUST 对每个路径段只编码一次；不得把 `%20` 二次编码为 `%2520`。
8. `scene.src` / `asset.src` 保留作者书写的编码形式；文件名解析、存在性检查、Studio URL 必须使用同一套解码/编码规则。
9. 符号链接/junction MUST 以 `realpath` 校验最终目标仍在项目根内；指向根外的链接按 `SECURITY_PATH_ESCAPE` 拒绝。
10. 外部 Scene MUST 是项目内本地文件；`http:`、`https:`、`//`、`data:`、`file:` 等 URL 不得作为 `<scene src>`。

### 3.2 外部 Scene URL rebase

`<scene src="scenes/intro.html">` 加载时：

- 外部片段中的 `src`、`href`、`poster`、`data`、`action`、`formaction`、`xlink:href`、`srcset`、内联 `style`、`<style>` 和 CSS `url()`/`@import` MUST 被 rebase 为 stage 可解析的根绝对 URL。
- 已经是绝对 URL、根绝对 URL、`data:`、`#` 的值保持不变。
- rebase 结果 MUST 保留 query/hash。
- rebase 后的 CSS 在 Scene 作用域内仍然被加 Scene 选择器前缀。
- `src` 属性本身保留原始相对值，以便清单/打包/迁移。
- 外部 Scene 的 `<style>` 和 JavaScript `<script>` 与内联 Scene 一样被提取、scoped 或提升；非 JavaScript script 保留。
- 外部 Scene MUST NOT 递归包含另一个 `<scene>`；外部文件是 HTML 片段，不是 VHTML 文档。
- 外部片段超过 16 MiB MUST 报错；文件缺失 MUST 报 `ASSET_NOT_FOUND`。

因为 rebase 在解析阶段完成，模型中的 `scene.html`/`scene.css` 已是根相对形式；`scene.src` 仍是作者书写的路径，序列化 MUST 继续输出 `src`，不得把外部内容内联回 `.vhtml`。

---

## 4. 资源清单（Inventory）

工具 MUST 能枚举以下来源：

| origin | 来源 |
|---|---|
| `asset` | `<asset src>` |
| `scene-file` | `<scene src>` |
| `scene-html` | Scene HTML 的 URL 属性、srcset、style 属性 |
| `scene-css` | Scene CSS 的 url() / @import |
| `project-css` | 项目级 `<style>` |
| `stylesheet` | `<link rel="stylesheet">` 及其本地 `@import` 链 |
| `project-script` | 项目级 `<script src>` |
| `generation-output` | `<gen-output>` 的 path |
| `output-captions` | `<output captions-path>` |

每个引用 MUST 记录：原始值、绝对路径（本地）、相对路径、origin、owner、是否存在、是否 external、是否在根内、类型（file/url/data）。

验证 MUST 报告：

- 本地引用不存在：`ASSET_NOT_FOUND`（error）。
- 路径逃逸：`SECURITY_PATH_ESCAPE`（error）。
- 外部 URL：`SECURITY_NETWORK_BLOCKED`（warning；`--allow-remote` 时 info）。
- 已声明但未被 Clip/Generation 引用：`ASSET_UNAVAILABLE`（info）。

`used` 的判定基于 Clip `ref`、Generation 输入和生成输出引用；HTML 中直接书写的路径单列为引用，不自动把某个 `<asset>` 标记为 used。

CSS 清单 MUST 递归读取本地 `@import`，并检测循环；同一文件只扫描一次。

---

## 5. 导入与重链

### 5.1 导入

`vhtml assets import` / Studio 上传 MUST：

1. 校验扩展名与目标目录；拒绝不支持的类型。
2. 按类型选择默认目录：图片/SVG → `assets/images`，视频 → `assets/video`，音频 → `assets/audio`，字体 → `assets/fonts`。
3. 计算 SHA-256；默认按内容去重（同 hash 且文件存在时复用已有 Asset）。
4. 目标文件名为净化后的 basename；冲突时追加 `-2`、`-3`。
5. 探测媒体元数据（时长、宽高、采样率、声道）；探测失败不得阻止导入，但后续验证会报告解码错误。
6. 生成稳定、全局唯一的 Asset ID；默认 `asset-<slug>`，可显式指定。
7. 将 Asset 写回 `.vhtml`（CLI）或通过 `asset.add` 编辑操作写回（Studio）。
8. 单文件大小上限默认 512 MiB；Studio HTTP 上传上限 256 MiB。

导入 MUST NOT 删除或移动源文件。

### 5.2 重链

`vhtml assets relink <assetId> <path>` MUST：

- 要求目标位于项目根内且存在。
- 只修改 Asset 的 `src`，不修改引用该 Asset 的 Clip。
- 通过编辑操作/原子保存写回，失败时不得留下半写文件。

### 5.3 未使用资源

`unused` 是提示，不是错误；工具 MUST NOT 自动删除未使用资源，除非用户显式执行清理命令。清理命令默认 dry-run，`--yes` 才删除。

---

## 6. 缓存、生成与导出目录

- 生成缓存：`paths.cache/generated.json`。
- 生成输出：`paths.generated`（默认 `generated/`）。
- 导出默认目录：`paths.renders`（默认 `renders/`）。
- 显式 `--out` 优先于清单/输出配置。
- 项目内 `<output path>` 相对项目根解析；CLI `--out` 相对当前工作目录解析。
- 缓存条目 MUST 记录 task key、provider、asset(s)、hash、createdAt；多输出任务 MUST 记录全部 assets。

---

## 7. 可移植包 `.vhtmlpkg`

`.vhtmlpkg` MUST 是 ZIP 容器，至少包含：

```text
vhtml.json
<entry>.vhtml
vhtml.package.json
assets/**
scenes/**
generated/**          # 默认包含，可用 --no-generated 排除
vhtml.generated.json   # 生成任务 → Asset 的可移植登记（若存在缓存）
<source files>
```

`vhtml.generated.json` 是生成缓存的可移植副本。解包时工具 MUST 将其恢复到清单 `paths.cache/generated.json`，使生成资产无需重新调用 Provider 即可被 hydrate；它不包含凭据。

机器可读 Schema：[`packages/schema/schemas/vhtml-1.1/package.schema.json`](../packages/schema/schemas/vhtml-1.1/package.schema.json)。

`vhtml.package.json`：

```json
{
  "schema": "vhtml.package/1.1",
  "name": "my-film",
  "entry": "video.vhtml",
  "id": "my-film",
  "packedAt": "2026-01-01T00:00:00.000Z",
  "files": [{ "path": "video.vhtml", "size": 1234, "sha256": "…" }]
}
```

规则：

- 默认排除：`node_modules`、`.git`、`.vhtml`、`.vhtml-cache`、`.cache`、`renders/`、`out/`、`dist/`、`*.vhtmlpkg`、`.env*`、私钥文件（`*.key`/`*.pem`/`*.p12`/`*.pfx`）。
- `--include-renders` 可包含 `renders/`；`--no-generated` 排除 `generated/`。
- 打包前若缺少清单，MUST 生成一个最小清单，并把 `entry` 写为实际入口。
- 解包 MUST 拒绝绝对路径、`..`、盘符路径和根外写入。
- 解包后 MUST 能由 `resolveProjectInput(outDir)` 直接发现清单和入口。

---

## 8. CLI 契约

```bash
vhtml init <dir>                       # 生成完整布局 + vhtml.json + scenes/intro.html
vhtml build [source|project]           # 清单 source → 清单 entry
vhtml validate [project]               # 目录 / .vhtml / 清单均可
vhtml assets list [project] [--json] [--missing] [--unused]
vhtml assets verify [project] [--allow-remote]
vhtml assets import [project] <files...> [--to assets/images] [--id id]
vhtml assets relink [project] <assetId> <path>
vhtml pack [project] --out film.vhtmlpkg [--include-renders] [--no-generated]
vhtml unpack film.vhtmlpkg --out dir [--force]
```

所有 `[project]` 参数省略时使用当前目录；目录输入 MUST 通过 `vhtml.json` 或唯一 `*.vhtml` 解析入口。

---

## 9. 安全

- 项目根是唯一的本地文件信任边界。
- 外部 Scene、CSS `@import`、HTML URL 均不得逃逸根目录。
- 导入/重链/解包必须防止 Zip-Slip 和路径穿越。
- Studio 仅绑定 loopback；上传文件名必须净化；上传大小受限。
- 打包不得包含 `.vhtml` 缓存、凭据、`node_modules`。

---

## 10. 一致性

实现声称支持本 Profile 时，至少通过：

1. 目录 + `vhtml.json` 发现入口。
2. 外部 Scene 的 HTML/CSS/图片/`@import` rebase 与渲染。
3. `assets list/verify/import/relink` 的缺失/未使用/外部/逃逸分类。
4. 导入去重、元数据探测和原子写回。
5. `pack` → `unpack` → `validate` 往返。
6. 旧 `.vhtml-cache` 读取兼容。
