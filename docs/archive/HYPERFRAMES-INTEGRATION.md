# HyperFrames Integration (Monet)

This repository now uses a single app-local HyperFrames clone and a bridge script that converts a Monet EDL to a HyperFrames composition.

## 1) Local clone

Cloned at:

- `hyperframes`

Upstream:

- https://github.com/heygen-com/hyperframes

## 2) Monet -> HyperFrames bridge

Script:

- `scripts/monet-hyperframes-bridge.mjs`

What it does:

1. Reads a Monet EDL JSON file.
2. Reads an optional media-id -> source map JSON.
3. Generates a HyperFrames-compatible `index.html` composition.
4. Writes `meta.json` for traceability.

## 3) Usage

Prepare files:

- `edl.json` (MonetEDL)
- `media-map.json` (optional):

```json
{
  "clip-1": "./assets/clip1.mp4",
  "clip-2": "./assets/clip2.mp4",
  "music-1": "./assets/music.mp3"
}
```

Generate composition:

```bash
node scripts/monet-hyperframes-bridge.mjs \
  --edl ./edl.json \
  --media-map ./media-map.json \
  --out ./hyperframes-out
```

Preview and render with HyperFrames CLI (from the local clone):

```bash
cd hyperframes
npx hyperframes preview ../hyperframes-out/index.html
npx hyperframes render ../hyperframes-out/index.html -o ../hyperframes-out/render.mp4
```

Bootstrap/check helpers:

```bash
bun run hf:clone
bun run hf:check
```

## 4) Current scope

Integrated now:

- Shot timing -> `data-start`, `data-duration`
- Clip source mapping by `shot.source.clipId`
- Basic crossfade animation pass
- Optional music track mapping
- Basic text overlays -> caption clips

Planned next:

1. Beat-lock alignment pass against `music.beatGrid`
2. Effects mapping (`glow`, `shake`, `zoom_pulse`) to reusable HyperFrames components
3. Full transition mapping and easing parity
4. Studio route export button: `Open in HyperFrames`
