/**
 * Sandboxed read-only project server used by the Chromium renderer and studio.
 * Supports byte ranges so that composited <video> elements can seek reliably.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export interface ProjectServerOptions {
  root: string;
  /** Returns the stage HTML for /__vhtml/stage.html (may change between requests). */
  stage: () => string | Promise<string>;
  /** Optional extra JSON endpoints for studio. */
  api?: (request: http.IncomingMessage, response: http.ServerResponse) => boolean | Promise<boolean>;
  /** Protect stage/API/static files. Health stays public. */
  authorize?: (request: http.IncomingMessage) => boolean | Promise<boolean>;
  host?: string;
  port?: number;
}

export interface ProjectServer {
  url: string;
  origin: string;
  port: number;
  close: () => Promise<void>;
}

function safeJoin(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;
  const relative = decoded.replace(/^\/+/, '');
  const absolute = path.resolve(root, relative);
  const relation = path.relative(root, absolute);
  if (relation.startsWith('..') || path.isAbsolute(relation)) return undefined;
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(absolute);
    const realRelation = path.relative(realRoot, realFile);
    if (realRelation.startsWith('..') || path.isAbsolute(realRelation)) return undefined;
  } catch {
    /* missing files are handled by serveFile as 404 */
  }
  return absolute;
}

function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  response.end(text);
}

function serveFile(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  file: string,
): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    sendJson(response, 404, { error: 'not_found', file: path.basename(file) });
    return;
  }
  if (!stat.isFile()) {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }
  const type = contentType(file);
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { 'content-range': `bytes */${stat.size}` });
      response.end();
      return;
    }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!match[1] && match[2]) {
      start = Math.max(0, stat.size - Number(match[2]));
      end = stat.size - 1;
    }
    if (start >= stat.size || end < start) {
      response.writeHead(416, { 'content-range': `bytes */${stat.size}` });
      response.end();
      return;
    }
    end = Math.min(end, stat.size - 1);
    response.writeHead(206, {
      'content-type': type,
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(file, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(file).pipe(response);
}

export async function startProjectServer(options: ProjectServerOptions): Promise<ProjectServer> {
  const root = path.resolve(options.root);
  const host = options.host ?? '127.0.0.1';
  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/__vhtml/health') {
        sendJson(response, 200, { ok: true, service: 'vhtml-studio' });
        return;
      }
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }
      if (options.authorize && !(await options.authorize(request))) {
        response.writeHead(401, {
          'www-authenticate': 'Basic realm="VHTML Studio", charset="UTF-8"',
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (url.pathname === '/__vhtml/stage.html') {
        const html = await options.stage();
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(html),
        });
        if (method === 'HEAD') response.end();
        else response.end(html);
        return;
      }
      if (options.api && (await options.api(request, response))) return;
      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(response, 405, { error: 'method_not_allowed' });
        return;
      }
      const file = safeJoin(root, url.pathname);
      if (!file) {
        sendJson(response, 403, { error: 'forbidden_path' });
        return;
      }
      serveFile(request, response, file);
    } catch (error) {
      if (!response.headersSent) sendJson(response, 500, { error: (error as Error).message });
      else response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const originHost = host.includes(':') ? `[${host}]` : host;
  const origin = `http://${originHost}:${address.port}`;
  return {
    url: `${origin}/__vhtml/stage.html`,
    origin,
    port: address.port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
