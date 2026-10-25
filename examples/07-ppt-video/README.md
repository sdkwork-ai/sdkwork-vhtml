# PPT-style presentation video

A 1920×1080, 30fps, 13.8s slide deck authored as HTML/CSS:

1. Title
2. Why VHTML
3. Pipeline
4. Multimodal creation
5. Roadmap

It demonstrates:

- slide-style layouts, data cards, architecture flow and roadmap;
- deterministic 30fps export;
- `fade` / `slide` / `wipe` transitions;
- storyboard shots linked to the five slides;
- a delivery-report script.

```bash
pnpm --filter @sdkwork/vhtml-example-07-ppt-video build
pnpm --filter @sdkwork/vhtml-example-07-ppt-video export
# or commercial delivery + audit report:
pnpm --filter @sdkwork/vhtml-example-07-ppt-video slides
```

Open in Studio to edit slide content, timing and storyboard cards:

```bash
pnpm vhtml serve examples/07-ppt-video --open
```
