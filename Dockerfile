# syntax=docker/dockerfile:1

# VHTML Studio: local or cloud authoring, rendering and export.
# The project is mounted at /project; the image contains Chromium and FFmpeg.
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY examples ./examples
COPY scripts ./scripts
COPY bin ./bin
RUN pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production
ENV VHTML_HOST=0.0.0.0
ENV VHTML_PORT=4173
ENV VHTML_CHROME_PATH=/usr/bin/chromium
EXPOSE 4173
VOLUME ["/project"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/__vhtml/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "/app/bin/vhtml.mjs", "serve", "/project"]
