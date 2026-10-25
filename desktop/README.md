# VHTML Studio — Electron 桌面壳

把 Studio 变成真正的**桌面应用**：无地址栏、独立任务栏图标、原生窗口。

## 首次运行

```bash
cd desktop
npm install        # 下载 Electron（约 100MB，一次性）
npm start          # 打开当前目录的项目
npm run start:example   # 打开仓库内置示例
```

`main.cjs` 通过 `@sdkwork/vhtml/studio/server` 的 `startStudioServer` 启动
编辑器服务（与 CLI/嵌入同一管线），再以 `embedUrl` 载入 Electron 窗口。

## 打包分发

任选一种 Electron 打包器（以 electron-builder 为例）：

```bash
npm install -D electron-builder
npx electron-builder --dir       # 本地试打包
npx electron-builder             # 出安装包（win/mac/linux）
```

打包时确保 `@sdkwork/vhtml` 及其运行时依赖（Chromium 由 Electron 自带，
**FFmpeg 需要随应用分发**：把 ffmpeg/ffprobe 二进制放进应用资源并在宿主
`PATH` 或 `VHTML_FFMPEG`/`VHTML_FFPROBE` 中指向它们——导出与生成依赖它）。

## 与嵌入模式的关系

- 桌面壳用 `embedUrl`（`?embed=1`）载入——Studio 顶栏隐藏，Electron 窗口
  提供标题栏；
- postMessage 桥（`docs/embedding.md` §3）在桌面壳内同样可用：Electron 的
  `webContents.executeJavaScript` 或 preload 皆可与宿主进程通信。

## 已知边界

- 首次 `npm install` 需要 Electron 二进制下载（可配置镜像）；
- FFmpeg 分发是发布者的责任（许可证为 LGPL/GPL 取决于构建选项）；
- 多窗口：再次 `npm start` 指向不同项目目录即可，每个窗口一个独立
  Studio 实例。
