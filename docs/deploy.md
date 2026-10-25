# Local and Cloud Deployment

VHTML is designed for the same project to be authored locally or on a remote
server. The Studio writes to the mounted project directory; `vhtml serve` exposes
it over HTTP.

## Local

```bash
pnpm install
pnpm build
pnpm vhtml serve ./my-film --open
```

`preview` and `serve` are equivalent; `serve` is the deployment-oriented name.
By default the Studio binds `127.0.0.1` and has no authentication.

### LAN

```bash
pnpm vhtml serve ./my-film \
  --host 0.0.0.0 \
  --port 4173 \
  --auth creator:change-me
```

The server refuses a non-loopback bind without authentication. `--insecure`
exists only for a reverse proxy that already enforces access control. Basic auth
over plain HTTP is visible on the network; use TLS for anything beyond a trusted
LAN.

### Environment variables

| Variable | Purpose |
|---|---|
| `VHTML_PROJECT` | Project directory/entry when no positional argument is given |
| `VHTML_HOST` | Bind address (`0.0.0.0` for containers) |
| `VHTML_PORT` | HTTP port |
| `VHTML_AUTH` | `username:password` HTTP Basic auth |
| `VHTML_TOKEN` | Shortcut for Basic auth with username `vhtml` |
| `VHTML_CHROME_PATH` | Chromium/Chrome executable |
| `VHTML_FFMPEG` / `VHTML_FFPROBE` | FFmpeg binaries |

Precedence: CLI flags, then environment, then `vhtml.json` `preview`, then
defaults. Authentication applies to the Studio page, API and stage; only
`/__vhtml/health` stays public for container health checks.

## Docker

The image contains Node, Chromium and FFmpeg, so remote preview, rendering and
export work without host tooling.

```bash
docker compose up --build
# -> http://localhost:4173/studio
```

`docker-compose.yml` mounts `VHTML_PROJECT` at `/project` and requires
`VHTML_AUTH`:

```yaml
environment:
  VHTML_AUTH: creator:change-me
volumes:
  - /srv/vhtml/my-film:/project
```

Or directly:

```bash
docker build -t vhtml-studio:1.1.1 .
docker run --rm -p 4173:4173 \
  -e VHTML_AUTH=creator:change-me \
  -v /srv/vhtml/my-film:/project \
  vhtml-studio:1.1.1
```

The mounted directory must be writable by the container user. Back it up like a
normal source repository; `.vhtmlpkg` is a portable snapshot format.

## Cloud VM behind TLS

Run VHTML on loopback and terminate TLS in Caddy/nginx. The Studio itself should
not be exposed over plain HTTP.

```bash
VHTML_AUTH=creator:change-me \
VHTML_CHROME_PATH=/usr/bin/chromium \
node bin/vhtml.mjs serve /srv/vhtml/my-film --host 127.0.0.1 --port 4173
```

Caddy:

```caddyfile
film.example.com {
  reverse_proxy 127.0.0.1:4173
}
```

Caddy forwards the browser's `Authorization` header and the original `Host`, so
Studio Basic auth keeps working. If access control is handled by the proxy
instead, run Studio with `--insecure` only when it is unreachable except through
that proxy.

nginx must preserve the original host (or send `X-Forwarded-Host`); Studio
rejects state-changing requests whose `Origin` does not match the request host:

```nginx
location / {
  proxy_pass http://127.0.0.1:4173;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Authorization $http_authorization;
}
```

Health probe:

```bash
curl -fsS https://film.example.com/__vhtml/health
```

## Remote authoring workflow

1. Put the project on a persistent volume (or clone a Git repository).
2. Start `vhtml serve` with auth and TLS.
3. Open `/studio`; browse, edit, drag in assets and export exactly as locally.
4. Save is atomic to the mounted `.vhtml`; external Scene files are patched in
   place. Use **Reload** after external edits.
5. Download outputs from `renders/`, or snapshot the project with
   `vhtml pack` and copy the `.vhtmlpkg`.

### Concurrency

The Studio is a single-writer editor. Do not run two Studio instances over the
same project directory and edit simultaneously; the last save wins. For teams,
one writer per project/branch, or separate project directories.

### What needs Chromium/FFmpeg

| Operation | Needs |
|---|---|
| Studio preview / WYSIWYG | Chromium |
| `render`, `export` | Chromium + FFmpeg |
| `validate`, `split`, `assets`, `pack` | Node only |

The Docker image includes both. A small control-plane-only deployment can use
the granular `@sdkwork/vhtml-project` package without Chromium.

## Splitting and importing files

```bash
# Move inline Scenes into scenes/*.html and rewrite the entry
vhtml split ./my-film --dry-run
vhtml split ./my-film

# Import one or many files, deduplicating by content hash
vhtml import ./my-film ./brand/logo.svg --to assets/images
vhtml assets import ./my-film ./footage --to assets/video
```

`split` rebases relative HTML/CSS URLs for the Scene directory, writes the
external fragment atomically, and replaces the inline Scene with
`<scene src="scenes/id.html">`. If the project has a generated `source` entry,
use `--detach`: the split entry becomes canonical, `vhtml.json` gets
`"detached": true`, and `vhtml build` refuses to regenerate it unless you pass the
source file explicitly. Without `--detach`, `--force` only splits the generated
entry and the next build can overwrite it.

`import` is an alias for `assets import`; it probes media metadata, copies into
the standard layout, deduplicates by SHA-256 and registers an Asset.

## Batch delivery（多平台一次导出）

```bash
# 一条命令渲染多平台版本（共享生成 pass，报告逐预设落盘）
vhtml export ./my-video --batch web-1080p,tiktok,reels,square-1080p \
  --out-dir renders --report-dir reports --chapters
```

- 每个预设一个文件：`<project>-<preset>.<ext>`，画幅/帧率/码率由交付预设决定；
- 任一渲染失败整体退出码非零，`--json` 输出逐预设结果供流水线消费；
- 容器化批量渲染见上文 Docker 章节。
