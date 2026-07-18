# Subject Tracking for Auto-Reframe

**Date:** 2026-07-18
**Status:** Approved for implementation

## Architecture Overview

Subject tracking decouples into three layers:

1. **Analysis pass** (Web Worker, runs once per clip) → produces `SubjectTrack`
2. **Smoothing pass** (TypeScript, runs on track-ready event) → produces precomputed path
3. **Resolve pass** (TypeScript, runs every frame in render loop) → O(log n) crop lookup

Preview and export use the same `buildPath()`/`resolvePath()` code. Python does zero geometry math — it reads a precomputed `crops.f64` binary artifact.

```
onClipAdded(sourceAssetId)
  │
  ▼
analysis-worker.ts (Web Worker, OffscreenCanvas)
  fetch(mediaUrl) → mp4box.js demux → VideoDecoder → MediaPipe FaceDetector
  → Hungarian trackId assignment → SubjectTrack
  │
  ├──→ IndexedDB (local replay cache)
  └──→ POST /api/subject-track → R2 (durable cross-device)

render() loop every frame:
  trackCache.get(sourceAssetId + model + version)      ← ALWAYS cache-hit or null
  pathCache.get(sourceAssetId + targetRatio + cfgHash)  ← ALWAYS cache-hit or null
  resolvePath(path, localTime)                          ← O(log n), pure, order-independent

export (vibe-render.ts):
  GET /api/subject-track → SubjectTrack
  buildPath(track, ratio, cfg)                          ← the ONLY one-euro impl, ever
  for each output frame: resolvePath(path, t) → crop
  write crops.f64
  spawn Python with cropsTmp path as argv[3]
```

## Data Model

Extended in `packages/edl/src/analysis-types.ts`:

```typescript
// Existing SubjectTrackFrame gets extended:
interface SubjectTrackFrame {
  time: number;          // seconds (source-media PTS)
  frame: number;
  bbox: SubjectBBox;
  source: string;
  confidence: number;
  trackId: number;       // NEW — subject identity across frames
  label: "face" | "person" | "unknown";  // NEW
}

// New types:
interface SubjectTrack {
  clipId: string;
  sourceAssetId: string;      // content-based key, NOT timeline clipId
  model: "mediapipe" | "headless";
  mediapipeVersion?: string;
  createdAt: number;
  duration: number;
  fps: number;
  detections: SubjectTrackFrame[];
  gapPolicy: "hold-last" | "interpolate" | "decay-to-center";
}

interface CropRect {
  x: number; y: number;
  width: number; height: number;
}

interface SmoothCfg {
  minCutoff: number;   // Hz — default 0.4
  beta: number;        // speed-up factor — default 0.3
  dCutoff: number;     // derivative cutoff — default 1.0
  gapDecayMs: number;  // decay to center after N ms — default 2000
}
```

**Key design decisions:**
- `lockedTrackId` is NOT in the track — it's a per-clip editing decision on `clip.reframe.lockedTrackId`. Track carries all trackIds; buildPath applies the lock at smoothing time.
- `targetRatio` is NOT in the track — it's a crop-time decision. Cache key includes it, so different ratios produce different cached paths from the same track.
- Track cache key: `sourceAssetId:model:mediapipeVersion` — model bumps invalidate stale tracks.

## Seam A: crops.f64 Binary Artifact (TS→Python Boundary)

The one-euro filter runs **exactly once** in the system — in TypeScript in `vibe-render.ts`.

### Binary format

| Offset | Type | Description |
|--------|------|-------------|
| 0 | float64 | cropX (0-1 normalized) |
| 8 | float64 | cropY (0-1 normalized) |
| 16 | float64 | cropW (0-1 normalized) |
| 24 | float64 | cropH (0-1 normalized) |
| 32 | float64 | cropX (frame 2) |
| ... | ... | repeated per frame |

Total size: `frameCount × 4 × 8` bytes. 60s clip at 30fps = 57,600 bytes.

### Sidecar metadata

Written alongside the binary as JSON:
```json
{
  "schema": "crops.v1",
  "fps": 30,
  "frameCount": 1800,
  "sourceAssetId": "abc123",
  "targetRatio": "9:16",
  "lockSubject": "face",
  "lockedTrackId": null,
  "buildPathParams": { "minCutoff": 0.4, "beta": 0.3, "dCutoff": 1.0, "gapDecayMs": 2000 }
}
```

### Export flow in vibe-render.ts

```typescript
// In runEditlyRender(), BEFORE spawning Python:

// 1. Resolve the subject track
const track = await getSubjectTrack(clip.sourceAssetId);
if (track) {
  // 2. Build the path (the ONLY one-euro impl)
  const path = buildPath(track, parseRatio("9:16"), DEFAULT_SMOOTH_CFG);

  // 3. Resolve per frame → write binary
  const frameCount = Math.ceil(totalDuration * exportFps);
  const crops = new Float64Array(frameCount * 4);
  for (let i = 0; i < frameCount; i++) {
    const t = i / exportFps;
    const crop = resolvePath(path, t);
    crops[i * 4] = crop.x;
    crops[i * 4 + 1] = crop.y;
    crops[i * 4 + 2] = crop.width;
    crops[i * 4 + 3] = crop.height;
  }
  fs.writeFileSync(cropsTmp, Buffer.from(crops.buffer));
  fs.writeFileSync(cropsMetaTmp, JSON.stringify(meta, null, 2));
}

// 4. Pass cropsTmp path to Python as argv[3]
```

### Python consumption

```python
# Python renderer reads the binary and metadata
import numpy as np
import json

with open(crops_meta_path) as f:
    meta = json.load(f)
assert meta["schema"] == "crops.v1", f"Unknown schema: {meta['schema']}"

crops = np.fromfile(crops_path, dtype=np.float64).reshape(-1, 4)
# crops[i] = [cropX, cropY, cropW, cropH] for frame i

# Apply via FFmpeg drawbox
for frame_idx, (x, y, w, h) in enumerate(crops):
    # crop = ffmpeg equivalent or OpenCV crop
    # NO math. NO filter. NO interpolation. Just pixel ops.
```

If no subject track exists (no analysis was done), Python gets `null` for `cropsTmp` and renders center-crop as today. Graceful degradation.

## Seam B: mp4box.js Demux → VideoDecoder

The analysis worker cannot feed an mp4 directly into `VideoDecoder` — it must demux the container first.

### Demux architecture

```
fetch(mediaUrl) → ReadableStream
  │
  ▼
mp4box.appendBuffer(data, offset)   ← streaming, called per chunk
  │
  ├── onReady: configure VideoDecoder with codec + description
  └── onSamples: emit EncodedVideoChunk[] → decoder.decode(chunk)
       │
       ▼
  VideoDecoder.output(VideoFrame)
       │
       ▼
  OffscreenCanvas.drawImage(frame)
       │
       ▼
  MediaPipe FaceDetector.detect(image)
       │
       ▼
  normalize → SubjectTrackFrame[]
```

### File: demuxer.ts

```typescript
import MP4Box from "mp4box";

export interface DemuxerEvents {
  onReady: (config: VideoDecoderConfig, duration: number) => void;
  onSample: (chunk: EncodedVideoChunk) => void;
  onError: (error: Error) => void;
}

export function createDemuxer(events: DemuxerEvents) {
  const mp4box = MP4Box.createFile();
  let codecDescription: ArrayBuffer | null = null;

  mp4box.onReady = (info: MP4Info) => {
    const track = info.videoTracks[0];
    if (!track) { events.onError(new Error("No video track")); return; }
    const trak = mp4box.getTrackById(track.track.id);
    codecDescription = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.avcC ?? null;
    events.onReady(
      { codec: track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description: codecDescription },
      info.duration / info.timescale
    );
    mp4box.setExtractionOptions(track.track.id, null, { nbSamplesPerChunk: 30 });
  };

  mp4box.onSamples = (trackId, ref, samples) => {
    for (const s of samples) {
      events.onSample(new EncodedVideoChunk({
        type: s.is_sync ? "key" : "delta",
        timestamp: s.cts / s.timescale * 1e6,  // microseconds
        duration: s.duration / s.timescale * 1e6,
        data: s.data,
      }));
    }
  };

  return {
    appendBuffer: (data: ArrayBuffer, offset: number) => mp4box.appendBuffer(data, offset),
    flush: () => mp4box.flush(),
  };
}
```

### File: analysis-worker.ts (flow)

```typescript
// 1. Fetch media
const response = await fetch(mediaUrl, { headers: { Range: "bytes=0-" } });
if (!response.ok || !response.body) return postMessage({ type: "error", reason: "fetch failed" });

// 2. Set up demuxer + decoder
let videoDecoder: VideoDecoder;
const demuxer = createDemuxer({
  onReady: (config, duration) => {
    videoDecoder = new VideoDecoder({
      output: (frame) => processDecodedFrame(frame),
      error: (e) => postMessage({ type: "error", reason: e.message }),
    });
    videoDecoder.configure(config);
    postMessage({ type: "progress", percent: 5 });
  },
  onSample: (chunk) => videoDecoder.decode(chunk),
  onError: (e) => postMessage({ type: "error", reason: e.message }),
});

// 3. Stream-feed the response
const reader = response.body.getReader();
let offset = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  demuxer.appendBuffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength), offset);
  offset += value.byteLength;
}
demuxer.flush();
await videoDecoder.flush();

// 4. Process decoded frames: sample every Nth, run MediaPipe
function processDecodedFrame(frame: VideoFrame) {
  frameCount++;
  if ((frameCount - 1) % sampleInterval !== 0) { frame.close(); return; }

  const bitmap = await frame.createImageBitmap({ resizeWidth: 640, resizeHeight: 360 });
  const detections = await faceDetector.detect(bitmap);
  bitmap.close();
  frame.close();

  for (const face of detections.detections) {
    detectionsBuffer.push(normalizeDetection(face, frameCount, frame.timestamp / 1e6));
  }
}
```

### Headless fallback

If `VideoDecoder` is unavailable or the codec isn't supported:
```typescript
// analysis-worker.ts
if (typeof VideoDecoder === "undefined") {
  postMessage({ type: "fallback", reason: "VideoDecoder not available" });
  return; // Server-side analysis will be triggered
}
```

## Sampling Strategy

Adaptive sampling based on detection confidence (fixes gap-policy timing):

```
confidence > 0.7  → sample every 15 frames (sparse)
confidence 0.3-0.7 → sample every 5 frames (medium)
confidence < 0.3  → sample every frame (dense, around occlusion edges)
no detection      → double sample rate until boundaries pinned
```

This ensures gap boundaries are known to within a few frames, not ±15.

## Track ID Assignment

Hungarian algorithm (Munkres) over IoU cost matrix between consecutive frames:

```
// For each new frame with N detections and M existing tracks:
cost[i][j] = 1 - iou(detection[i].bbox, track[j].lastBbox)
// Hungarian assignment minimizes total cost
// IoU > 0.2 threshold; below that = new track
// tracks with no match for 30+ frames = removed
// when lockedTrackId is set and track disappears for 30+ frames,
// re-acquire: assign nearest track within distance threshold
```

## Cache Layers

```
Layer 1: IndexedDB (local, ~2ms read)
  Key: subject_tracks:{sourceAssetId}:{model}:{mediapipeVersion}
  Written: by worker on complete
  Read: by render() on every frame (always hit after first analysis)

Layer 2: API → R2 (durable, cross-device)
  POST /api/subject-track — body: SubjectTrack JSON
  GET /api/subject-track/:sourceAssetId — returns track
  Written: by worker on complete (calls API)
  Read: by export renderer + other devices on first load

Layer 3: Path cache (runtime Map, per-session)
  Key: sourceAssetId:targetRatio:cfgHash:lockedTrackId
  Written: on track-ready event, NOT in render loop
  Read: resolvePath() every frame — O(log n)
```

## File Manifest

| File | Action | Lines | Package |
|------|--------|-------|---------|
| `packages/edl/src/analysis-types.ts` | Extend | +80 | `@monet/edl` |
| `packages/edl/src/reframe/build-path.ts` | Create | +250 | `@monet/edl` |
| `packages/edl/src/reframe/types.ts` | Create | +40 | `@monet/edl` |
| `packages/edl/src/reframe/normalize.ts` | Create | +60 | `@monet/edl` |
| `packages/edl/src/index.ts` | Modify | +2 | `@monet/edl` |
| `apps/web/src/engine/reframe/analysis-worker.ts` | Create | +450 | `@monet/web` |
| `apps/web/src/engine/reframe/demuxer.ts` | Create | +120 | `@monet/web` |
| `apps/web/src/engine/reframe/reframe-applier.ts` | Create | +130 | `@monet/web` |
| `apps/web/src/engine/reframe/track-cache.ts` | Create | +150 | `@monet/web` |
| `apps/web/src/engine/web-player.ts` | Modify | +20 | `@monet/web` |
| `apps/api/src/api/subject-track.ts` | Create | +100 | `@monet/api` |
| `apps/api/src/api/vibe-render.ts` | Modify | +50 | `@monet/api` |
| `apps/api/package.json` | Modify | +2 | `@monet/api` |
| `apps/web/package.json` | Modify | +2 | `@monet/web` |
| `packages/edl/package.json` | Modify | +1 | `@monet/edl` |

**Total: ~1,460 lines new, ~75 lines modified**

## Implementation Order

1. `packages/edl` types + normalize adapter + buildPath/resolvePath (testable in isolation)
2. `apps/web` demuxer + analysis-worker (browser-only, hardest part)
3. `apps/web` reframe-applier + track-cache → wire into web-player.ts
4. `apps/api` subject-track routes + vibe-render.ts modifications
5. Integration test: seed clip → worker analyzes → reframe renders → export produces crops.f64
