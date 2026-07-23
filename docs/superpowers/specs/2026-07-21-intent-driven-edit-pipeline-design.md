# Intent-Driven Edit Pipeline — Design Spec

> **Status:** Approved (v2 — incorporates user corrections)
> **Date:** 2026-07-21
> **Supersedes:** V3 pipeline, legacy pipeline, Kove v2 pipeline (all rejected)

## Post-Mortems — Why Each Prior Pipeline Failed

### Legacy Pipeline (Gemini → EDL → Editly)

The legacy pipeline fed video metadata (ffprobe stats, segment labels from scene detection) to Gemini, which hallucinated an EDL based on heuristics it couldn't verify. The analysis was metadata-only: brightness averages, motion scores, scene boundaries. Gemini never saw a single frame — it received numbers and guessed. Effects were mapped through an `effectMapper` that converted abstract intents ("high energy") to FFmpeg filter chains, but the intent was never grounded in what was actually in the footage. Result: edits that looked like random clips stitched together with generic speed ramps. No understanding of content, no visual continuity, no human-like decisions.

### Kove v2 Pipeline (Python)

Kove v2 had the right idea — Python workers with OpenCV, optical flow, face detection, YOLO objects — but the intelligence was fragmented across 10+ separate analysis modules that never talked to each other. `super_analysis.py` ran beat detection, shot detection, optical flow, CLIP semantics, face detection, YOLO objects, text detection, and depth estimation as independent passes. The results were aggregated into a JSON blob that nobody downstream knew how to consume coherently. The AI Director (`python-director/`) tried to synthesize these signals into creative decisions, but it was making choices from a firehose of disconnected metrics. Result: technically rich analysis that produced generic, unfeeling edits — the system knew everything about the pixels but understood nothing about the video.

### V3 Pipeline (Engine Contracts + EDL v3)

V3 was the most architecturally ambitious — 25 engine contract domains, a shots-based EDL format, Zod validation, 10 business rules. But it still relied on the same metadata-first analysis: segment-labeler + CV metrics cached in D1, with Cloudflare Workers AI vision as an on-demand layer. The vision calls happened on full video uploads, not on extracted frames — meaning the model received a compressed, downsampled video blob and tried to understand editing patterns from that. The engine contracts were well-engineered but the AI was generating against contracts it couldn't visually verify. The refinement chat (`/api/v3/tweak`) was text-based, asking clarifying questions but never showing the AI what the output actually looked like. Result: structurally valid edits that still felt wrong — correct beats, correct shot count, correct effects, but the pacing and visual flow were off because the AI never truly saw what it was editing.

### Common Root Cause

All three pipelines share the same fundamental flaw: **the AI never sees actual frames**. It receives metadata, labels, scores, and numbers — then hallucinates creative decisions from statistical summaries. A human editor watches the footage, feels the rhythm, notices the color temperature shift at 0:07, sees the subject's expression change at 0:12. Our pipelines saw none of that. This pipeline fixes it by extracting real frames and giving them to vision models.

---

## Architecture

```
reference video ──┐
                   ├──> [1] Analysis Engine ──> [2] Edit DNA (JSON)
your footage +     │                                      │
your prompt ───────┴──────────────────────────────────────┤
                                                            v
                                              [3] Intent Compiler (LLM)
                                                            │
                                              timeline operation plan
                                                            v
                                              [4] Headless engine bridge
                                                            │
                                                       rendered output
                                                            │
                                          (diff vs reference DNA, loop back — v2)
```

## Component 1 — Analysis Engine

**Input:** video file (reference or footage)
**Output:** Edit DNA JSON

### Frame Extraction

**Use FFmpeg.** The earlier draft's claim that FFmpeg is "underpowering" for this is wrong — it's what most production pipelines use, has no GPU/CUDA dependency, and is proven. Adding decord as primary means standing up a GPU worker to solve a problem that doesn't exist. Keep FFmpeg for extraction AND final export.

- Endpoint: `POST /extract-frames` on python-ai worker (port 8102)
- Params: `filePath`, `fps` (default 3), `maxFrames` (optional), `outputDir` (where to save frames)
- Command: `ffmpeg -i {filePath} -vf "fps={fps}" -q:v 2 {outputDir}/frame_%04d.jpg`
- Output: JPEG files saved to `outputDir` + metadata JSON with timestamps, dimensions, file paths
- Frame naming: `frame_{number:04d}.jpg` — sequential, timestamped
- Also extract at scene-change detection rate: `ffmpeg -i {filePath} -vf "select='gt(scene,0.3)'" -vsync vfr {outputDir}/scene_%04d.jpg`

**Client-side (browser preview):** WebCodecs `VideoDecoder` via MediaBunny (already in kove-advanced). Used when user is in browser preview mode.

- Import from `apps/kove-advanced/packages/core/src/media/mediabunny-engine.ts`
- Decodes frames as ImageBitmap/Canvas
- Sends to vision API as base64

### Field Ownership — Each Field Has One Owner

**Critical design rule:** Each Edit DNA field is written by exactly one analysis module. If two modules both claim the same field, they will silently disagree and nobody will know which to trust.

| Edit DNA field | Owner module | Method | Why this owner |
|---|---|---|---|
| Cut points, shot boundaries | `cut-detector` | Histogram/frame diff (classical CV) | Deterministic, cheap, testable against ground truth |
| Camera motion (pan/zoom/shake/static) | `motion-analyzer` | Optical flow (classical CV) | Vision LLMs mislabel static tripod shots as handheld |
| Color profile (temperature, saturation, brightness) | `color-analyzer` | Pixel/histogram stats (classical CV) | Deterministic |
| Audio (beats, energy, speech) | Existing audio worker | librosa/Whisper | Already works, don't touch |
| Scene description, subjects, action, mood | `vision-captioner` | Vision model (Cloudflare Workers AI) | Only layer that genuinely needs semantic understanding |
| Text events (on-screen text detection) | `text-detector` | OCR (Tesseract or vision model) | Requires reading pixels |

### Order of Operations

1. **Frame extraction** — FFmpeg extracts frames at 3fps + scene-change frames
2. **Cut detection** — Classical CV on extracted frames → shot segments with start/end times
3. **Motion analysis** — Optical flow per shot → camera motion classification
4. **Color analysis** — Per-shot histogram stats → color profile
5. **Vision captioning** — 1-2 representative frames per detected shot → scene description, subjects, action, mood
6. **Audio analysis** — Existing worker → beats, energy, speech
7. **Assembly** — Combine all signals into Edit DNA JSON

### Vision Calls: Per Shot, Not Per Frame

Caption 1-2 representative frames per detected shot, AFTER cut detection runs — not every frame at 3fps. A 14s reference video is ~5 shots, not ~40 frames. This is a 5-8x cost/latency cut for zero quality loss, since you only need one description per shot anyway.

### Cut Detection

Frame-pair analysis for scene boundaries:
- Histogram diff between consecutive frames (threshold-based)
- Significant visual change = cut point
- Output: shot segments with start/end times

### Motion Analysis

Per-shot optical flow:
- Dense optical flow between first and last frame of each shot
- Classify: static / pan_left / pan_right / zoom_in / zoom_out / shake / tracking / handheld
- Calculate intensity (0-1) and direction (degrees for pan/tracking)

### Color Analysis

Per-shot color profiling:
- Average color per frame (histogram)
- Shadows/mids/highlights distribution
- Dominant palette extraction
- Relative to neutral reference (for LUT approximation)

### Audio Analysis

Reuse existing Python audio worker (port 8101):
- Beat detection (librosa)
- Onset detection
- Energy analysis
- Speech detection (Whisper)

## Component 2 — Edit DNA Schema

**The single most important artifact.** Everything downstream depends on it.

```typescript
interface EditDNA {
  version: "1.0";
  source: {
    type: "reference" | "footage";
    duration_s: number;
    fps: number;
    resolution: { width: number; height: number };
    aspect_ratio: string; // "9:16", "16:9", "1:1"
  };
  shots: Shot[];
  color: ColorProfile;
  audio: AudioProfile;
  text_events: TextEvent[];
  pacing: PacingProfile;
  metadata: {
    analyzed_at: string;
    frame_count: number;
    analysis_fps: number;
    confidence: number;
    field_owners: Record<string, string>; // which module wrote each field
  };
}

interface Shot {
  id: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  content: {
    description: string;
    subjects: string[];
    action: string;
    mood: string;
  };
  camera: {
    motion: "static" | "pan_left" | "pan_right" | "zoom_in" | "zoom_out" | "shake" | "tracking" | "handheld";
    intensity: number; // 0-1
    direction_degrees?: number; // for pan/tracking
  };
  color: {
    dominant_hue: string;
    temperature: "warm" | "cool" | "neutral";
    saturation: number; // 0-1
    brightness: number; // 0-1
  };
  crop?: "tight" | "medium" | "wide" | "ultra-wide";
  cut_in_type?: "hard" | "dissolve" | "fade_from_black";
  cut_out_type?: "hard" | "dissolve" | "fade_to_black";
}

interface ColorProfile {
  contrast: number; // multiplier, 1.0 = neutral
  saturation: number; // multiplier
  temperature_shift: "warm" | "cool" | "neutral";
  shadows_tint: string; // hex or named
  highlights_tint: string;
  lut_approximation?: {
    shadows: [number, number, number]; // RGB
    mids: [number, number, number];
    highlights: [number, number, number];
  };
}

interface AudioProfile {
  bpm: number;
  beat_grid_s: number[];
  downbeats_s: number[];
  energy_curve: { time_s: number; energy: number }[];
  speech_segments: { start_s: number; end_s: number }[];
  sync_points_s: number[]; // optimal cut points (on beats/downbeats)
}

interface TextEvent {
  start_s: number;
  end_s: number;
  content: string;
  position: "center" | "top" | "bottom" | "lower-third";
  style: "bold" | "italic" | "outline" | "shadow" | "glow";
  animation: "pop" | "fade" | "slide" | "typewriter" | "none";
}

interface PacingProfile {
  avg_shot_length_s: number;
  variance: "low" | "medium" | "high";
  energy_curve: "rising" | "falling" | "peak" | "valley" | "steady";
  climax_position_s?: number;
}
```

### Schema Validation

Zod schema for runtime validation:
```typescript
import { z } from "zod";
// Full Zod schema in packages/edit-dna/src/schema.ts
```

## Component 3 — Intent Compiler

**Input:** Edit DNA + clip manifest + user prompt
**Output:** Jalebi Advanced operation plan (timeline operations)

### Clip Manifest

```typescript
interface ClipManifest {
  clips: {
    id: string;
    filePath: string;
    duration_s: number;
    resolution: { width: number; height: number };
    thumbnail_base64?: string;
    content_tags?: string[]; // AI-generated from frame analysis
  }[];
}
```

### Operation Plan

The compiler emits structured operations against Jalebi Advanced's engine API:

```typescript
interface OperationPlan {
  version: "1.0";
  target_duration_s: number;
  aspect_ratio: string;
  operations: Operation[];
  global_effects: GlobalEffect[];
  text_overlays: TextOverlay[];
  audio_mix: AudioMix;
}

type Operation =
  | { type: "place_clip"; clip_id: string; track: number; start_s: number; duration_s: number; in_point_s: number; out_point_s: number }
  | { type: "apply_speed"; target: "clip" | "segment"; clip_id?: string; segment_index?: number; curve: SpeedCurve }
  | { type: "apply_transition"; between: [number, number]; type: "crossfade" | "wipe" | "dissolve" | "hard"; duration_s: number }
  | { type: "apply_effect"; target: "clip" | "segment"; effect: EffectParams }
  | { type: "apply_color"; target: "global" | "clip"; clip_id?: string; params: ColorParams };

interface SpeedCurve {
  keyframes: { time_s: number; speed: number }[]; // speed multiplier
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

interface GlobalEffect {
  type: "color_grade" | "vignette" | "grain" | "glow";
  params: Record<string, number>;
}

interface TextOverlay {
  text: string;
  start_s: number;
  end_s: number;
  position: { x: number; y: number };
  style: Record<string, unknown>;
  animation: string;
}

interface AudioMix {
  tracks: { clip_id: string; volume: number; fade_in_s: number; fade_out_s: number }[];
  ducking?: { enabled: boolean; threshold: number };
}
```

### LLM Prompt

System prompt receives:
1. Edit DNA JSON (reference video analysis)
2. Clip manifest (user's uploaded footage)
3. User's text prompt
4. Jalebi Advanced operation types (exhaustive list)

LLM returns: OperationPlan JSON (Zod-validated)

**Critical rule:** LLM never emits pixels, raw effect code, or render decisions. Only structured operations against the known engine API.

### Validation Failure Handling

Zod validation failure → feed the validation error message back into a second LLM call:

```
"Your output failed validation: `{error}`. Fix it and return the corrected OperationPlan."
```

- Max 2 retries
- Still failing after 2 retries → fail the request loudly with the last error
- Do NOT silently drop the edit or return a partial plan

## Component 4 — Headless Engine Bridge

**Current state:** `apps/kove-advanced/` (to be renamed `apps/jalebi-advanced/`) has working engines:
- `VideoEngine` — timeline composition
- `ExportEngine` — MP4/WebM/ProRes export
- `TransitionEngine` — crossfade, wipe, dissolve
- `SpeedEngine` — speed ramps, curves
- `VideoEffectsEngine` — color, blur, distortion
- `MediaBunnyEngine` — WebCodecs decode/encode

**What's needed:** A programmatic entry point that takes OperationPlan JSON and calls the same internal functions the UI calls.

### Headless Bridge

New file: `apps/jalebi-advanced/packages/core/src/headless/operation-executor.ts`

```typescript
interface HeadlessProject {
  id: string;
  name: string;
  settings: { width: number; height: number; frameRate: number; sampleRate: number };
  mediaLibrary: { items: MediaItem[] };
  timeline: { tracks: Track[] };
}

function executePlan(plan: OperationPlan, media: MediaItem[]): HeadlessProject
function renderProject(project: HeadlessProject, settings: RenderSettings): Promise<Blob>
```

### Proof of Concept

Before any AI integration, prove headless execution works:
1. Manually create an OperationPlan JSON
2. Call `executePlan()` to build a HeadlessProject
3. Call `renderProject()` to produce MP4
4. Verify output matches expectations

This is the load-bearing wall. If headless execution doesn't work, nothing else matters.

## Integration Points

### New Packages

```
packages/
  edit-dna/           # Edit DNA schema + Zod validation
  intent-compiler/    # LLM prompt + operation plan types
```

### New API Endpoints (Fastify, port 3000)

```
POST /api/extract-frames     → FFmpeg frame extraction
POST /api/analyze-dna        → CV modules + vision AI → Edit DNA JSON
POST /api/compile-intent     → LLM → OperationPlan JSON
POST /api/execute-plan       → jalebi-advanced headless → rendered MP4
POST /api/pipeline           → full pipeline (upload → extract → analyze → compile → execute)
```

### Existing Endpoints (unchanged)

```
POST /api/upload             → file storage (R2 or local)
POST /api/export-mp4         → FFmpeg export (fallback)
```

## Build Order (strict)

1. **Edit DNA schema** — lock the TypeScript types + Zod validation
2. **Frame extraction** — FFmpeg-based endpoint on python-ai worker
3. **Analysis Engine** — cut detection → motion/color → vision captioning → Edit DNA assembly
4. **Headless bridge** — prove programmatic execution with a hand-written plan
5. **Intent Compiler** — LLM prompt + operation plan generation + retry-on-validation-failure
6. **Wire end-to-end** — analysis → compiler → headless execution
7. **Feedback loop** (v2) — diff output DNA vs reference, correction pass

Steps 1-2 are load-bearing. If the schema is wrong, everything downstream gets rebuilt.

## Testing Strategy

### Unit Tests
- Edit DNA schema validation (valid/invalid inputs)
- Frame extraction (mock video → verify frame count/timestamps)
- Intent compiler (mock DNA + manifest → verify operation plan structure)

### Integration Tests
- Frame extraction → vision AI → Edit DNA (real video, manual verification)
- Operation plan → headless execution → rendered MP4 (visual inspection)
- Full pipeline: upload → extract → analyze → compile → execute

### Manual Verification (critical for CV modules)

For the analysis engine, BEFORE wiring anything downstream: run on 5-10 known reference videos and manually check **cut points and motion labels** against what a human would say — not just the vision captions. The classical-CV fields (cut detection, motion classification) are the ones scoring intent-relevant details like pacing. If cut detection misses a hard cut or misclassifies a pan as static, the entire edit will be wrong.

Verification checklist per reference video:
- [ ] Cut points match human-identified scene boundaries (within 0.2s tolerance)
- [ ] Camera motion labels match what a viewer would say (static/pan/zoom/shake)
- [ ] Color temperature matches visual impression (warm/cool/neutral)
- [ ] Shot count matches human count
- [ ] Vision captions are accurate and describe the actual content
- [ ] Audio sync points land on real beats/downbeats

## Non-Goals (v1)

- Feedback loop (deferred to v2)
- Real-time preview during analysis
- Multi-reference blending
- Custom AI model training
- Mobile/client-side-only mode (server-side primary)

## File Structure

```
packages/
  edit-dna/
    src/
      schema.ts          # EditDNA TypeScript types
      zod-schema.ts      # Zod validation schema
      index.ts           # Public API
    package.json
    tsconfig.json
  
  intent-compiler/
    src/
      compiler.ts        # LLM call + prompt construction
      prompts/
        compile-intent.txt  # System prompt for LLM
      types.ts           # OperationPlan types
      index.ts           # Public API
    package.json
    tsconfig.json

workers/
  python-ai/
    workers/
      frame_extractor.py   # FFmpeg frame extraction
      cut_detector.py      # Histogram/frame diff cut detection
      motion_analyzer.py   # Optical flow motion classification
      color_analyzer.py    # Per-shot color profiling
    app.py                 # Add /extract-frames, /analyze-dna endpoints

apps/
  jalebi-advanced/         # Renamed from kove-advanced
    packages/
      core/
        src/
          headless/
            operation-executor.ts  # Plan → Project conversion
            index.ts

src/
  server/
    api/
      analyze-dna.ts       # New endpoint: video → Edit DNA
      compile-intent.ts    # New endpoint: DNA + clips + prompt → plan
      execute-plan.ts      # New endpoint: plan → rendered video
      pipeline.ts          # New endpoint: full pipeline
```
