# 嵌入与独立启动指南（Embedding & Standalone）

VHTML Studio 既可以作为**独立剪辑软件**一键启动，也可以作为**剪辑组件**嵌入
第三方应用（Electron、Tauri、Web 平台、IDE 插件）。两种模式共享同一套
Core Model 编辑管线：所有手势、编程调用和宿主命令都落到同一份 `.vhtml` 项目
模型，可 diff、可撤销、可被外部工具继续加工。

---

## 1. 独立启动

```bash
# 项目启动器：扫描当前目录、新建项目、逐个打开编辑器窗口
vhtml studio

# Chrome app 模式：无浏览器 chrome 的独立窗口（推荐桌面形态）
vhtml studio ./my-video

# 经典浏览器标签页
vhtml preview ./my-video --open

# 远程/局域网（必须认证）
vhtml serve ./my-video --host 0.0.0.0 --auth creator:change-me
```

`vhtml studio` 用已安装的 Chrome/Chromium 以 `--app` 模式打开编辑器，
表现为独立应用窗口（任务栏图标、无地址栏）。项目仍是目录真源：
保存写回 `.vhtml`，Git 可 diff。

### 项目启动器与自动保存

- **启动器**（`vhtml studio` 无参数）：扫描当前目录一层内的 VHTML 项目
  （`vhtml.json` 或 `.vhtml` 文件）、一键新建（脚手架 + 立即打开）、
  打开已有项目——每个编辑器是独立的 `startStudioServer` 实例，由启动器
  进程统一监管。编程形态：`startStudioLauncher`（`@sdkwork/vhtml-studio/launcher`，
  `opened()` / `closeAll()` / `close()`）。
- **自动保存检查点**：会话 revision 变化后周期写 `<entry>.autosave`
  （默认 15s，`VHTML_AUTOSAVE_MS` 或 `autosaveMs` 可调，0 关闭）。编辑器
  启动时发现检查点即显示恢复横幅（Restore / Discard）；
  `GET /api/autosave`、`POST /api/autosave/restore`、
  `POST /api/autosave/discard` 供宿主集成。

---

## 2. 编程式嵌入（Node 宿主）

`startStudioServer` 面向宿主进程：不打印、不自动开浏览器、不接管信号处理，
返回可操作的句柄。

```ts
import { startStudioServer } from '@sdkwork/vhtml-studio/server';

const studio = await startStudioServer('./my-video', { port: 0 });

// 编辑器地址（可直接载入 Electron BrowserWindow / Tauri webview / iframe）
console.log(studio.url);      // http://127.0.0.1:54321/studio
console.log(studio.embedUrl); // 同地址 + ?embed=1（隐藏宿主不需要的 chrome）

// 宿主可以直接操作模型（与 UI 手势同管线、同撤销栈）
await studio.apply([{ op: 'clip.set', clipId: 'hero', props: { opacity: 0.5 } }]);

// 快照 / 持久化 / 替换文档
const project = studio.project();   // Core Model 快照
studio.save();                      // 写回 .vhtml
studio.loadDocument(otherSource);   // 整体替换并重建 stage

// 宿主退出时关闭 HTTP 服务（宿主进程本身不受影响）
await studio.close();
```

适用场景：低代码平台内嵌剪辑页、智能体工作台的编辑面板、批量渲染服务里
的"人工复核"环节。认证与非回环绑定沿用 `serve` 的规则（`auth` /
`allowInsecure`）。

### Electron 集成（现成桌面壳）

仓库 `desktop/` 目录自带 Electron 桌面壳（`main.cjs` 用 `startStudioServer`
+ `embedUrl` 载入 BrowserWindow）：

```bash
cd desktop && npm install && npm start          # 当前目录项目
npm run start:example                            # 仓库内置示例
```

发布打包（electron-builder）注意事项：FFmpeg/FFprobe 二进制需随应用分发
（`VHTML_FFMPEG` / `VHTML_FFPROBE` 指向）；Chromium 由 Electron 自带。

### 自定义 Electron 集成

```ts
import { BrowserWindow } from 'electron';
import { startStudioServer } from '@sdkwork/vhtml-studio/server';

const studio = await startStudioServer(projectDir, { port: 0 });
const win = new BrowserWindow({ width: 1440, height: 900 });
await win.loadURL(studio.embedUrl);
app.on('before-quit', () => void studio.close());
```

### Tauri 集成

```rust
// Rust 侧用 tauri::api::process 启动 Node 宿主（或把 startStudioServer 打包为
// sidecar），前端 WebView 直接导航到 embedUrl。
```

### 纯 Web 集成

```html
<iframe id="editor" src="http://127.0.0.1:54321/studio?embed=1"
        style="width:100%;height:70vh;border:0"></iframe>
```

---

## 3. postMessage 桥（iframe 宿主协议）

嵌入页通过 `window.postMessage` 与宿主双向通信，协议稳定可审计：

**宿主 → 编辑器**（`source: 'vhtml-host'`）：

| command | payload | 行为 |
|---|---|---|
| `applyOps` | `{ operations: EditOperation[] }` | 经 UI 同管线应用 Core 编辑操作 |
| `save` | — | 持久化当前会话到 `.vhtml` |
| `export` | — | 打开导出面板 |
| `play` / `pause` | — | 播放控制 |
| `setTime` | `{ time: number }` | 定位播放头 |
| `getState` | — | 请求状态快照 |

**编辑器 → 宿主**（`source: 'vhtml-studio'`，`type: 'vhtml:event'`）：

| event | payload | 时机 |
|---|---|---|
| `ready` | `{ id, duration, lanes, revision }` | 模型首次载入 |
| `stateChanged` | `{ revision?, time?, duration? }` | 每次模型/播放头变化 |
| `saved` | `{ changed: string[] }` | 保存成功 |
| `state` | 完整快照 | 响应 `getState` |
| `error` | `{ message }` | 桥内异常 |

```js
const editor = document.getElementById('editor');
editor.addEventListener('load', () => {
  editor.contentWindow.postMessage(
    { source: 'vhtml-host', command: 'applyOps', payload: { operations: [...] } },
    '*',
  );
});
window.addEventListener('message', (event) => {
  if (event.data?.source === 'vhtml-studio' && event.data.type === 'vhtml:event') {
    if (event.data.event === 'saved') syncToBackend();
  }
});
```

`?embed=1` 隐藏编辑器顶栏（宿主自带 chrome），页面其余能力不变。

---

## 3.1 Studio HTTP API 面（宿主集成参考）

Studio 服务器的 REST 端点（Basic auth 保护，`/health` 公开）。完整行为以
`packages/studio/src/server.ts` 为准；此处为宿主集成的导航目录：

| 方法/路径 | 用途 |
|---|---|
| `GET /api/project` | 当前模型快照（model 投影 + 原始 Core Model + revision + 诊断） |
| `POST /api/edit` | 应用 Core 编辑操作（与 UI/CLI/程序 API 同语义，验证失败 422 回滚） |
| `POST /api/undo` / `POST /api/redo` | 撤销 / 重做 |
| `POST /api/generate` | 物化 AI 生成任务（逐任务失败报告，成功后会话重建） |
| `POST /api/export` | 服务端导出（返回 job id，轮询 `GET /api/job/:id`） |
| `POST /api/proxy-mode` | 开关预览代理（360p H.264），stage 即时重建 |
| `GET /api/media/poster?asset&t` | 片段/素材海报帧（缓存） |
| `GET /api/media/peaks?asset` | 音频波形峰值（缓存，无声源返回静音） |
| `GET /api/media/proxy?asset` | **代理媒体**：360p H.264 快速编码副本（内容寻址缓存），长素材流畅拖拽 |
| `GET /api/assets` / `POST /api/assets/upload` / `POST /api/assets/relink` | 资源库管理 |
| `POST /api/clip-from-asset` | 素材入时间线（`mode: add/insert/overwrite`） |
| `POST /api/caption` / `POST /api/clipboard` | 字幕与剪贴板 |
| `GET /api/autosave` / `POST /api/autosave/restore` / `POST /api/autosave/discard` | 自动保存检查点 |
| `GET /api/presets` / `POST /api/job/:id` | 交付预设 / 异步任务轮询 |

代理媒体的意义：时间线预览对 4K 长素材实时 seek 的压力全在浏览器解码上；
`Proxy` 开关（或宿主 `POST /api/proxy-mode {enabled:true}` + 重建 stage）
把本地视频源替换为 360p H.264 副本（`/api/media/proxy`，内容寻址缓存），
原始素材在最终导出时仍然全分辨率使用。远程/`data:` 源不做代理。

---

## 4. 商业化部署要点

- **项目即目录**：`.vhtml` + `assets/` + `generated/` + `renders/` + 缓存，
  可整体打包（`.vhtmlpkg`）、可上对象存储、可进用户网盘。
- **认证**：非回环绑定必须 `--auth user:password` 或 `VHTML_TOKEN`；
  云端部署在 TLS 反代之后（Caddy/nginx），见 [deploy.md](./deploy.md)。
- **AI Provider**：`procedural`/`manifest` 离线可用；真实厂商经 `http`
  Provider 或自定义适配器接入，密钥由宿主环境托管（不进文档）。
- **导出**：本地 FFmpeg；容器镜像（见仓库 `Dockerfile`）自带
  Chromium + FFmpeg，可横向扩为渲染服务。
- **一致性**：宿主、CLI、智能体共用同一 Core Model 操作集，任何一侧的
  编辑结果对其他侧透明（同验证、同撤销语义）。
