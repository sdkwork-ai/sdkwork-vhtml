/**
 * VHTML Studio — Electron desktop shell.
 *
 * Launches the Studio server for a project directory and presents it in a
 * chrome-less desktop window. The editor itself is the standard Studio web
 * app (embed mode hides nothing extra here; Electron provides the chrome).
 *
 * Usage:
 *   npm run desktop [projectDir]
 *
 * First run: npm install (downloads Electron).
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

async function main() {
  const projectDir = path.resolve(process.argv[2] || '.');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startStudioServer } = require('@sdkwork/vhtml-studio/server');
  const studio = await startStudioServer(projectDir, {
    port: 0,
    open: false,
    appWindow: false,
    timeoutMs: 30_000,
  });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: `VHTML Studio — ${path.basename(projectDir)}`,
    backgroundColor: '#0a1020',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // External links (docs, downloads) open in the system browser instead of
  // hijacking the editor window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(studio.embedUrl);
  win.setTitle(`VHTML Studio — ${path.basename(projectDir)}`);

  win.on('closed', () => {
    void studio.close();
  });
}

app.whenReady().then(main).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});
