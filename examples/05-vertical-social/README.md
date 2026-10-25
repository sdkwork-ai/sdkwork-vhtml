# Vertical social teaser

A 1080×1920, 6-second social cut authored as code. It demonstrates:

- a native 9:16 composition;
- kinetic HTML/CSS typography;
- `slide` and `zoom` transitions;
- captions placed above platform UI safe areas;
- one project delivered to TikTok, Reels or Shorts with delivery profiles.

```bash
pnpm --filter @sdkwork/vhtml-example-05-vertical-social build
pnpm vhtml export examples/05-vertical-social --delivery tiktok --out examples/05-vertical-social/renders/tiktok.mp4
pnpm vhtml export examples/05-vertical-social --delivery reels --out examples/05-vertical-social/renders/reels.mp4
```
