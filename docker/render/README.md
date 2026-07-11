# Docker Render Container

Renders MonetEDL to MP4 with gl-transitions support via headless GL (mesa).

## Why Docker?

The `gl` native module (required for Editly's gl-transitions) fails to compile on macOS due to ANGLE build issues. This container provides a Linux environment where gl-transitions work correctly.

## Build

```bash
cd /Users/hamza/Desktop/reserves/monet-ai-story
docker build -t monet-render docker/render/
```

First build takes ~2-5 minutes. Subsequent builds use cache.

## Usage

### Quick (recommended)
```bash
./scripts/render_in_container.sh output/my-edl.json ./testfiles output/my-edit.mp4
```

### Manual Docker
```bash
docker run --rm \
    -v "$(pwd)/output/my-edl.json:/data/edl.json:ro" \
    -v "$(pwd)/testfiles:/data/footage:ro" \
    -v "$(pwd)/output/my-edit.mp4:/data/output.mp4" \
    -e EDL_PATH=/data/edl.json \
    -e OUTPUT_PATH=/data/output.mp4 \
    -e FOOTAGE_DIR=/data/footage \
    monet-render
```

## How It Works

1. Container starts with Node.js 20 + Editly + gl-transitions + mesa (headless GL)
2. Loads EDL JSON from mounted volume
3. Converts EDL to Editly spec with transition mappings
4. Renders with gl-transitions (fade, glitch, wipe, etc.)
5. Outputs MP4 to mounted volume

## Supported Transitions

| Transition | Editly Name | Status |
|-----------|-------------|--------|
| fade | fade | ✅ Works |
| crossfade | fade | ✅ Works |
| glitch | GlitchMemories | ✅ Works |
| wipe | Directional | ✅ Works |
| zoom-blur | CrossZoom | ✅ Works |
| flash | fadeBlack | ✅ Works |
| whip-pan | Directional | ✅ Works |

## Performance

| Metric | Value |
|--------|-------|
| Container build time | 2-5 min (first time) |
| Container start time | ~2s |
| Render time (20s video) | 30-60s |
| Container image size | ~800MB |

## Troubleshooting

### "gl-transitions not found"
Rebuild the container:
```bash
docker build --no-cache -t monet-render docker/render/
```

### "Permission denied" on output
Ensure the output directory exists and is writable:
```bash
mkdir -p output
chmod 777 output
```

### Container uses too much memory
Editly with gl-transitions can be memory-intensive. For large videos:
```bash
docker run --rm --memory=4g ...
```

### macOS-specific: Docker Desktop required
Install Docker Desktop for Mac: https://docs.docker.com/desktop/install/mac-install/

## Architecture

```
┌─────────────────────────────────────────┐
│  Docker Container (Linux/Debian)        │
│                                         │
│  ┌─────────┐  ┌─────────────────────┐  │
│  │  Editly  │  │  gl-transitions     │  │
│  │  0.14.2  │  │  (via mesa GL)      │  │
│  └────┬─────┘  └──────────┬──────────┘  │
│       │                   │              │
│       └─────────┬─────────┘              │
│                 │                        │
│        ┌────────▼────────┐               │
│        │  FFmpeg + x264  │               │
│        └────────┬────────┘               │
│                 │                        │
│        ┌────────▼────────┐               │
│        │  Output MP4     │               │
│        └─────────────────┘               │
│                                         │
│  Mounted Volumes:                       │
│  - /data/edl.json (input)               │
│  - /data/footage/ (source clips)        │
│  - /data/output.mp4 (output)            │
└─────────────────────────────────────────┘
```
