# VHTML 1.1 模块化与部署 Profile（规范性）

**状态**：VHTML 1.1 扩展 Profile  
**依赖**：[project-layout.md](./project-layout.md)、[VHTML-1.1-Specification.md](./VHTML-1.1-Specification.md)  
**实现**：`@sdkwork/vhtml-project`、`@sdkwork/vhtml-studio`、`@sdkwork/vhtml-cli`

本 Profile 定义项目的文件拆分、资源导入，以及本地/远程创作部署契约。

---

## 1. 文件拆分

`vhtml split` MUST：

- 将每个内联 Scene 的 `html`/`css`/`scripts` 写入 `paths.scenes/<id>.html`。
- 将 `<scene>` 改写为 `<scene id="…" src="scenes/<id>.html">`，并保留时长、尺寸、背景等属性。
- 在写入外部文件前，把内联 HTML/CSS 中的相对 URL rebase 到新 Scene 文件所在目录，确保重新解析后仍指向项目根资源。
- 保留 `<script>` 原文；不得把已有 `<script>` 再次包裹。
- 默认拒绝覆盖已存在的 Scene 文件；`--force` 才可覆盖。
- 若项目存在生成型 `source`，默认拒绝拆分，避免下一次 `build` 覆盖；`--detach` MUST 写入 `vhtml.json` 的 `detached: true`、移除 `source` 引用，使 `.vhtml` 成为规范源；`--force` 只允许一次性拆分并保留覆盖风险。
- `detached` 项目执行 `build <directory>` 时 MUST 拒绝隐式重建；显式传入 `video.ts` 等源文件时 MAY 重新生成。
- 支持 `--dry-run`：只计算计划，不写任何文件。

写入顺序 MUST 为：先写外部 Scene 文件，再原子写入口 `.vhtml`。拆分完成后 MUST 重新解析入口并验证。

## 2. 资源导入

- `vhtml import` MUST 等价于 `vhtml assets import`。
- 导入 MUST 复制到标准布局（默认 `assets/images`、`assets/video`、`assets/audio`、`assets/fonts`），使用 SHA-256 去重，探测媒体元数据并登记 Asset。
- 导入目标 MUST 位于项目根内；不得通过 `..`、绝对路径或符号链接逃逸。
- 目录导入 MUST 递归展开，并跳过 `node_modules`、`.git`、`.vhtml`、`.vhtml-cache`。

## 3. 部署模式

Studio MUST 支持：

| 模式 | 绑定 | 认证 |
|---|---|---|
| 本地 | `127.0.0.1` | 可选 |
| 局域网 | `0.0.0.0` / 指定网卡 | MUST 认证，除非显式 `--insecure` |
| 云端 | 容器/服务绑定 | MUST 认证 + TLS 反向代理 |

- 默认绑定 `127.0.0.1`。
- 非 loopback 绑定且未配置认证时 MUST 拒绝启动，除非显式 insecure 模式。
- HTTP Basic 认证 MUST 保护 Studio 页面、API、stage 与静态项目文件。
- `/__vhtml/health` MAY 保持匿名，且 MUST NOT 暴露项目路径。
- `VHTML_HOST`、`VHTML_PORT`、`VHTML_AUTH`、`VHTML_TOKEN`、`VHTML_PROJECT` MUST 作为环境变量默认值。
- 远端保存 MUST 继续使用原子写回；外部 Scene 编辑 MUST 写文件后重新解析。
- 同一项目目录 MUST 只允许一个 Studio 写入者；多实例并发编辑不在保证范围内。

## 4. 一致性

1. `split` 后重新解析的模型 MUST 与拆分前渲染等价。
2. 拆分后外部 Scene 的相对图片/CSS URL MUST 可解析。
3. `split --dry-run` MUST 不产生文件。
4. `import` 重复导入同一文件 MUST 去重。
5. 未认证访问 `/studio`、`/api/*`、`/__vhtml/stage.html` MUST 返回 401。
6. `/__vhtml/health` MUST 返回 200 且不包含绝对项目路径。
7. Docker/容器启动时若绑定 `0.0.0.0` 且无认证 MUST 失败。
