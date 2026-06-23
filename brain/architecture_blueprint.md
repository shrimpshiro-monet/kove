# Monet Commercial-Clean Video Pipeline Blueprint

## 1. Principle

Monet uses a split-path architecture:

1. Interactive editor path:
   - low latency
   - browser-safe preview proxies
   - Canvas2D/WebAudio/WebCodecs where available
   - deterministic timeline updates
   - no GPU-heavy blocking inference on the main thread

2. Server-grade export path:
   - authoritative media analysis
   - Python GPU workers
   - FFmpeg final render
   - artifact caching
   - strict license manifest gate

The core rule is:

> AI suggests. Deterministic engines decide. FFmpeg renders.

## 2. Compliance Gate

All binaries, libraries, packages, model weights, and checkpoints must pass `brain/license_manifest.json`.

Allowed licenses:

- MIT
- Apache-2.0
- LGPL-2.1-or-later
- LGPL-3.0-or-later

Blocked by default:

- GPL
- AGPL
- SSPL
- CC-BY-NC
- proprietary
- unknown
- unpinned model weights
- unvetted dynamic downloads

ISC is currently blocked because the Monet policy is strictly MIT, Apache-2.0, and LGPL only. If the policy later allows ISC, `policy.allowIsc` and validator logic must be updated deliberately.

## 3. Render and Ingest

### FFmpeg

FFmpeg must be an LGPL-only build.

Required constraints:

- no `--enable-gpl`
- no `--enable-nonfree`
- no `libx264` in core build
- no `libx265` in core build
- no nonfree binary combinations

Preview output should prioritize browser-safe proxies.

Recommended preview profile:

- container: MP4 or WebM
- video: browser-decodable H.264 baseline/main if allowed by deployment policy, or VP9
- audio: AAC or Opus
- resolution: 720p or 1080p preview proxy
- fast start enabled for MP4

Commercial-clean export profile:

- container: WebM or MKV
- video: VP9 or AV1
- audio: Opus

Patent-encumbered codecs must be treated separately from OSS license compliance.

## 4. Timeline Authority

The canonical project model remains Monet/OpenReel EDL.

Adapters may target:

- Canvas2D preview
- Revideo scene generation
- FFmpeg filtergraphs
- Remotion preview/export if retained

No adapter may become the canonical timeline source.

## 5. Job Orchestration

BullMQ coordinates all long-running work.

Recommended queues:

- media.ingest
- media.proxy
- audio.analyze
- audio.transcribe
- audio.separate
- vision.track
- vision.segment
- vision.depth
- motion.interpolate
- edl.generate
- render.preview
- render.final

Every job must be:

- idempotent
- retry-safe
- artifact-producing
- license-gated before execution
- traceable by projectId, mediaId, clipId, and analysisId where applicable

## 6. Artifact Model

Server workers produce artifacts, not direct UI mutations.

Common artifacts:

- preview proxy
- waveform peaks
- beat grid
- onset envelope
- transcription words
- separated stems
- motion tracks
- segmentation masks
- depth maps
- interpolated frame windows
- final renders

All artifacts should be content-addressed where possible.

## 7. Python Worker Boundary

FastAPI workers are stateless.

Each worker must expose:

- `/health`
- `/manifest`
- one or more typed job endpoints

Workers must not dynamically download unapproved models.

Workers may only load model weights that pass the license manifest gate.

## 8. Interactive Editor Path

Input:

- preview proxy
- lightweight audio features
- cached artifacts

Used for:

- scrubbing
- timeline editing
- rough beat visualization
- low-latency caption preview
- rough crop preview
- placeholder rendering when media decode fails

The editor path must never depend on SAM2, RIFE, Demucs, or Depth Anything being available synchronously.

## 9. Server Export Path

Input:

- original or mezzanine source
- canonical EDL
- cached analysis artifacts

Used for:

- final render
- high-quality compositing
- segmentation-based layering
- depth effects
- slow-motion interpolation
- subtitle burn-in
- professional export

## 10. Model Constraints

### Faster-Whisper

Allowed under MIT.

Used for:

- word-level timestamps
- caption alignment
- staccato typography
- karaoke text

### Demucs

Allowed under MIT.

Used for:

- stems
- bass envelope
- drum transients
- vocal-aware captions

Must remain a swappable batch worker.

### Meyda

Allowed under MIT.

Used for:

- browser-side quick audio features
- preview-only energy visualization

### Librosa

Currently blocked because the strict policy excludes ISC.

If ISC is later approved, Librosa can become the authoritative Python beat-grid engine.

### MediaPipe

Allowed under Apache-2.0.

Used for:

- face centroid
- pose center
- hand markers
- auto-crop anchors
- tracked typography anchors

### SAM2

Blocked until exact source commit and checkpoint hashes are pinned.

Used for:

- rotoscoping
- subject masks
- text-behind-subject compositing

### Depth Anything V2

Only Small is eligible.

Base, Large, and Giant are blocked as non-commercial variants.

Used for:

- 2.5D parallax
- artificial dolly
- depth-aware blur
- depth-aware text placement

### RIFE

Blocked until exact source commit and model weight hashes are pinned.

Invocation must be gated by EDL events:

- slow motion
- velocity drop
- speed ramp
- anime impact moment

RIFE must never run on full source videos by default.

## 11. Immediate Build Sequence

1. License manifest gate
2. LGPL FFmpeg proxy service
3. Browser preview proxy integration
4. Beat grid and waveform artifacts
5. MediaPipe motion tracks
6. Demucs stems
7. SAM2 masks
8. Depth Anything V2 Small depth maps
9. RIFE interpolation windows

## 12. Non-Negotiable Failure Behavior

If a component fails the manifest gate:

- do not load it
- do not execute it
- log the blocked component id
- return a structured error
- keep editor path functional with deterministic fallback

If AI generation fails:

- deterministic EDL still returns
- UI does not surface a 500
- response metadata marks fallback usage
