/**
 * VHTML Studio project launcher.
 *
 * `vhtml studio` without a project argument serves this lightweight supervisor:
 * it scans a projects directory for VHTML projects, scaffolds new ones and
 * opens each editor as its own `startStudioServer` instance. The launcher
 * process stays alive as the parent of the opened editors.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ErrorCode, VhtmlError } from '@sdkwork/vhtml-core/errors';
import { ensureProjectLayout, defaultManifest, MANIFEST_FILENAME } from '@sdkwork/vhtml-project/manifest';
import { startStudioServer, type StudioHandle } from './server.ts';

export interface LauncherOptions {
  /** Directory scanned for projects (default: cwd). */
  projectsDir?: string;
  host?: string;
  port?: number;
  chrome?: string;
  appWindow?: boolean;
  /** Basic auth forwarded to every opened editor. */
  auth?: { username: string; password: string };
  open?: boolean;
  timeoutMs?: number;
}

export interface LauncherHandle {
  url: string;
  origin: string;
  port: number;
  /** Editors opened through this launcher (tracked for host cleanup). */
  opened: () => StudioHandle[];
  closeAll: () => Promise<void>;
  close: () => Promise<void>;
}

interface ProjectSummary {
  name: string;
  dir: string;
  entry: string;
  hasAutosave: boolean;
}

function isVhtmlProjectDir(dir: string): boolean {
  try {
    if (fs.existsSync(path.join(dir, MANIFEST_FILENAME))) return true;
  } catch {
    return false;
  }
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .some((entry) => entry.isFile() && entry.name.endsWith('.vhtml'));
  } catch {
    return false;
  }
}

/** Scan one level of `projectsDir` for VHTML projects. */
export function scanProjects(projectsDir: string): ProjectSummary[] {
  const results: ProjectSummary[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const dir = path.join(projectsDir, entry.name);
    if (!isVhtmlProjectDir(dir)) continue;
    const manifestPath = path.join(dir, MANIFEST_FILENAME);
    let entryFile = '';
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { entry?: string };
        const candidate = manifest.entry ? path.join(dir, manifest.entry) : '';
        if (candidate && fs.existsSync(candidate)) entryFile = candidate;
      } catch {
        /* fall through to scan */
      }
    }
    if (!entryFile) {
      try {
        const vhtml = fs
          .readdirSync(dir)
          .filter((name) => name.endsWith('.vhtml'))
          .sort();
        if (vhtml.length) entryFile = path.join(dir, vhtml[0]!);
      } catch {
        continue;
      }
    }
    if (!entryFile) continue;
    results.push({
      name: entry.name,
      dir,
      entry: entryFile,
      hasAutosave: fs.existsSync(`${entryFile}.autosave`),
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

const LAUNCHER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>VHTML Studio — Projects</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a1020; color: #e8f0ff; font: 15px/1.5 "Segoe UI", system-ui, sans-serif; }
  .card { width: min(720px, 92vw); background: #101a2e; border: 1px solid #22355a; border-radius: 16px; padding: 28px 30px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .brand span { color: #55c2e8; }
  .sub { color: #7f96b8; margin: 0 0 20px; font-size: 13px; }
  .project { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #22355a; border-radius: 10px; margin-bottom: 10px; }
  .project b { flex: 1; }
  .project small { color: #7f96b8; display: block; font-weight: 400; }
  .badge { font-size: 11px; color: #ffc46b; border: 1px solid #6b5426; border-radius: 20px; padding: 1px 8px; }
  button { background: #1b8fae; border: 0; color: #fff; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; }
  button.ghost { background: transparent; border: 1px solid #33507f; font-weight: 400; }
  form { display: flex; gap: 10px; margin-top: 18px; }
  input { flex: 1; background: #0b1220; border: 1px solid #33507f; border-radius: 8px; color: inherit; padding: 9px 12px; }
  .empty { color: #7f96b8; text-align: center; padding: 26px 0; }
  .msg { color: #7fdc9b; min-height: 20px; font-size: 13px; }
</style>
</head>
<body>
<div class="card">
  <h1 class="brand">VHTML<span>STUDIO</span> — Projects</h1>
  <p class="sub">Projects found in <code>__DIR__</code></p>
  <div id="list"></div>
  <form id="new">
    <input id="name" placeholder="new project name (folder)" required />
    <button type="submit">Create &amp; open</button>
  </form>
  <p class="msg" id="msg"></p>
</div>
<script>
  const ZH = (navigator.language || '').toLowerCase().indexOf('zh') === 0;
  const T = {
    title: ZH ? ['VHTML', '工作室 — 项目'] : ['VHTML', 'STUDIO — Projects'],
    sub: ZH ? '扫描目录' : 'Projects found in',
    empty: ZH ? '这里还没有 VHTML 项目——在下方创建一个。' : 'No VHTML projects here yet — create one below.',
    open: ZH ? '打开' : 'Open',
    starting: ZH ? '正在启动编辑器…' : 'Starting editor…',
    running: ZH ? '编辑器运行于' : 'Editor running at',
    openFailed: ZH ? '打开失败：' : 'Open failed: ',
    namePlaceholder: ZH ? '新项目名称（文件夹名）' : 'new project name (folder)',
    create: ZH ? '创建并打开' : 'Create & open',
    created: ZH ? '已创建 ' : 'Created ',
    createFailed: ZH ? '创建失败：' : 'Create failed: ',
    autosave: ZH ? '自动保存' : 'autosave',
  };
  document.querySelector('.brand').innerHTML = T.title[0] + '<span>' + T.title[1] + '</span>';
  async function refresh(){
    const data = await fetch('/api/launcher/projects').then(r => r.json());
    const list = document.getElementById('list');
    list.innerHTML = '';
    if (!data.projects.length){
      list.innerHTML = '<div class="empty">' + T.empty + '</div>';
      return;
    }
    for (const project of data.projects){
      const row = document.createElement('div');
      row.className = 'project';
      row.innerHTML = '<b>' + project.name + (project.hasAutosave ? ' <span class="badge">' + T.autosave + '</span>' : '') + '</b><small>' + project.entry + '</small>';
      const open = document.createElement('button');
      open.textContent = T.open;
      open.onclick = async () => {
        document.getElementById('msg').textContent = T.starting;
        const result = await fetch('/api/launcher/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dir: project.dir }) }).then(r => r.json());
        document.getElementById('msg').textContent = result.url ? (T.running + ' ' + result.url) : (T.openFailed + (result.error || 'unknown'));
        if (result.url) window.open(result.url, '_blank');
      };
      row.appendChild(open);
      list.appendChild(row);
    }
  }
  document.getElementById('new').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    if (!name) return;
    const result = await fetch('/api/launcher/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json());
    document.getElementById('msg').textContent = result.url ? (T.created + name) : (T.createFailed + (result.error || 'unknown'));
    await refresh();
  });
  document.getElementById('name').placeholder = T.namePlaceholder;
  document.querySelector('#new button[type="submit"]').textContent = T.create;
  refresh();
</script>
</body>
</html>`;

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}

function safeName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new VhtmlError(ErrorCode.VALIDATION_INVALID_VALUE, `invalid project name "${name}"`);
  }
  return cleaned;
}

/**
 * Start the project launcher supervisor. Opened editors are tracked and closed
 * with `closeAll()`; the launcher HTTP server itself closes with `close()`.
 */
export async function startStudioLauncher(options: LauncherOptions = {}): Promise<LauncherHandle> {
  const projectsDir = path.resolve(options.projectsDir ?? process.cwd());
  const host = options.host ?? '127.0.0.1';
  const opened = new Set<StudioHandle>();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/launcher')) {
        const html = LAUNCHER_HTML.replace('__DIR__', projectsDir.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(html) });
        response.end(html);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/launcher/projects') {
        sendJson(response, 200, { ok: true, projectsDir, projects: scanProjects(projectsDir) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/launcher/new') {
        const body = JSON.parse((await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          request.on('data', (chunk: Buffer) => chunks.push(chunk));
          request.on('end', () => resolve(Buffer.concat(chunks)));
          request.on('error', reject);
        })).toString('utf8') || '{}') as { name?: string };
        try {
          const name = safeName(String(body.name ?? ''));
          const dir = path.join(projectsDir, name);
          if (fs.existsSync(dir)) throw new VhtmlError(ErrorCode.EDIT_CONFLICT, `project directory already exists: ${name}`);
          ensureProjectLayout(dir, { ...defaultManifest(), id: name });
          // A minimal starter document so the editor can open immediately.
          fs.writeFileSync(
            path.join(dir, 'video.vhtml'),
            `<!doctype html>
<html><body><vhtml version="1.1">
<project id="${name}" version="1.1" title="${name}">
  <settings><composition width="1920" height="1080" frame-rate="30/1" duration="5s" /></settings>
  <scenes><scene id="intro" duration="5s"><div style="position:absolute;inset:0;display:grid;place-items:center;background:#0a1020;color:#e8f0ff;font:700 96px system-ui">${name}</div></scene></scenes>
  <timelines><timeline id="main" duration="5s"><lane id="v" type="video"><clip id="intro-clip" ref="scene:intro" start="0s" duration="5s" /></lane></timeline></timelines>
</project>
</vhtml></body></html>
`,
            'utf8',
          );
          const handle = await startStudioServer(dir, {
            port: 0,
            open: false,
            chrome: options.chrome,
            appWindow: options.appWindow,
            auth: options.auth,
            timeoutMs: options.timeoutMs ?? 20_000,
          });
          opened.add(handle);
          sendJson(response, 200, { ok: true, url: handle.url });
        } catch (error) {
          sendJson(response, 422, { ok: false, error: (error as Error).message });
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/launcher/open') {
        const body = JSON.parse((await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          request.on('data', (chunk: Buffer) => chunks.push(chunk));
          request.on('end', () => resolve(Buffer.concat(chunks)));
          request.on('error', reject);
        })).toString('utf8') || '{}') as { dir?: string };
        const dir = body.dir ? path.resolve(body.dir) : '';
        if (!dir || !isVhtmlProjectDir(dir)) {
          sendJson(response, 404, { ok: false, error: `not a VHTML project: ${body.dir ?? ''}` });
          return;
        }
        try {
          const handle = await startStudioServer(dir, {
            port: 0,
            open: false,
            chrome: options.chrome,
            appWindow: options.appWindow,
            auth: options.auth,
            timeoutMs: options.timeoutMs ?? 20_000,
          });
          opened.add(handle);
          sendJson(response, 200, { ok: true, url: handle.url });
        } catch (error) {
          sendJson(response, 500, { ok: false, error: (error as Error).message });
        }
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
    } catch (error) {
      sendJson(response, 500, { error: (error as Error).message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port ?? 0;

  const origin = `http://${host === '127.0.0.1' ? '127.0.0.1' : host}:${port}`;
  return {
    url: `${origin}/launcher`,
    origin,
    port,
    opened: () => [...opened],
    closeAll: async () => {
      for (const handle of [...opened]) {
        opened.delete(handle);
        await handle.close().catch(() => undefined);
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
