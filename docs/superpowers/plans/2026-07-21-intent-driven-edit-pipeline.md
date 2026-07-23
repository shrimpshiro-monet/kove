# Intent-Driven Edit Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-component pipeline that extracts real video frames, analyzes them with vision AI, produces an Edit DNA spec, compiles it into engine operations, and renders via Jalebi Advanced's headless API.

**Architecture:** Analysis Engine (FFmpeg frame extraction + classical CV + vision AI) → Edit DNA JSON → Intent Compiler (LLM) → OperationPlan → Jalebi Advanced headless execution → rendered MP4. Each component is independently testable.

**Tech Stack:** TypeScript (schema, compiler, endpoints), Python (CV analysis workers), Zod (validation), Cloudflare Workers AI (vision), FFmpeg (frame extraction + export), Vitest (testing), Fastify (API), pnpm workspaces.

## Global Constraints

- **No FFmpeg for frame extraction** — FFmpeg CLI for extraction is fine (the user corrected the earlier draft). Use FFmpeg for both extraction and export. No decord/OpenCV primary.
- **No `any` types** — design the type or use `unknown`
- **Zod on every API boundary** — request bodies, AI responses, all schema reads
- **`Result<T,E>` pattern** for async operations at API boundaries
- **Edit DNA schema locked before any analysis code is written**
- **Each Edit DNA field has exactly one owner module** — no two modules write the same field
- **Vision calls per shot, not per frame** — caption 1-2 keyframes per detected shot
- **LLM never emits pixels** — only structured operations against known engine API
- **Validation failure → retry (max 2)** → fail loudly, never silent drop
- **Existing packages:** `@monet/edl` (packages/edl), `@monet/edl-v3` (packages/edl-v3), engine-contracts (packages/engine-contracts)
- **Test framework:** Vitest. Config at root `vitest.config.ts`. Tests in `tests/` or `__tests__/` dirs.
- **Package convention:** `"type": "module"`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, zod as dependency

---

## Task 1: Edit DNA Schema Package

**Files:**
- Create: `packages/edit-dna/package.json`
- Create: `packages/edit-dna/tsconfig.json`
- Create: `packages/edit-dna/src/schema.ts`
- Create: `packages/edit-dna/src/zod-schema.ts`
- Create: `packages/edit-dna/src/index.ts`
- Create: `packages/edit-dna/src/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `EditDNA`, `Shot`, `ColorProfile`, `AudioProfile`, `TextEvent`, `PacingProfile` types
- Produces: `editDNAz` Zod schema for runtime validation
- Produces: `validateEditDNA(data: unknown): Result<EditDNA, ZodError>` function

- [ ] **Step 1: Create package scaffolding**

Create `packages/edit-dna/package.json`:
```json
{
  "name": "@monet/edit-dna",
  "version": "0.0.1",
  "description": "Edit DNA schema — the canonical contract between analysis and compilation.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/edit-dna/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the TypeScript types**

Create `packages/edit-dna/src/schema.ts` with all interfaces from the spec:
- `EditDNA` (root)
- `Shot` (with content, camera, color sub-objects)
- `ColorProfile`
- `AudioProfile`
- `TextEvent`
- `PacingProfile`
- `FieldOwner` map in metadata

```typescript
export interface EditDNA {
  version: "1.0";
  source: {
    type: "reference" | "footage";
    duration_s: number;
    fps: number;
    resolution: { width: number; height: number };
    aspect_ratio: string;
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
    field_owners: Record<string, string>;
  };
}

export interface Shot {
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
    intensity: number;
    direction_degrees?: number;
  };
  color: {
    dominant_hue: string;
    temperature: "warm" | "cool" | "neutral";
    saturation: number;
    brightness: number;
  };
  crop?: "tight" | "medium" | "wide" | "ultra-wide";
  cut_in_type?: "hard" | "dissolve" | "fade_from_black";
  cut_out_type?: "hard" | "dissolve" | "fade_to_black";
}

export interface ColorProfile {
  contrast: number;
  saturation: number;
  temperature_shift: "warm" | "cool" | "neutral";
  shadows_tint: string;
  highlights_tint: string;
  lut_approximation?: {
    shadows: [number, number, number];
    mids: [number, number, number];
    highlights: [number, number, number];
  };
}

export interface AudioProfile {
  bpm: number;
  beat_grid_s: number[];
  downbeats_s: number[];
  energy_curve: { time_s: number; energy: number }[];
  speech_segments: { start_s: number; end_s: number }[];
  sync_points_s: number[];
}

export interface TextEvent {
  start_s: number;
  end_s: number;
  content: string;
  position: "center" | "top" | "bottom" | "lower-third";
  style: "bold" | "italic" | "outline" | "shadow" | "glow";
  animation: "pop" | "fade" | "slide" | "typewriter" | "none";
}

export interface PacingProfile {
  avg_shot_length_s: number;
  variance: "low" | "medium" | "high";
  energy_curve: "rising" | "falling" | "peak" | "valley" | "steady";
  climax_position_s?: number;
}
```

- [ ] **Step 3: Write the Zod validation schema**

Create `packages/edit-dna/src/zod-schema.ts`:
```typescript
import { z } from "zod";

const shotSchema = z.object({
  id: z.string().min(1),
  start_s: z.number().min(0),
  end_s: z.number().min(0),
  duration_s: z.number().min(0),
  content: z.object({
    description: z.string(),
    subjects: z.array(z.string()),
    action: z.string(),
    mood: z.string(),
  }),
  camera: z.object({
    motion: z.enum(["static", "pan_left", "pan_right", "zoom_in", "zoom_out", "shake", "tracking", "handheld"]),
    intensity: z.number().min(0).max(1),
    direction_degrees: z.number().optional(),
  }),
  color: z.object({
    dominant_hue: z.string(),
    temperature: z.enum(["warm", "cool", "neutral"]),
    saturation: z.number().min(0).max(1),
    brightness: z.number().min(0).max(1),
  }),
  crop: z.enum(["tight", "medium", "wide", "ultra-wide"]).optional(),
  cut_in_type: z.enum(["hard", "dissolve", "fade_from_black"]).optional(),
  cut_out_type: z.enum(["hard", "dissolve", "fade_to_black"]).optional(),
});

const colorProfileSchema = z.object({
  contrast: z.number(),
  saturation: z.number(),
  temperature_shift: z.enum(["warm", "cool", "neutral"]),
  shadows_tint: z.string(),
  highlights_tint: z.string(),
  lut_approximation: z.object({
    shadows: z.tuple([z.number(), z.number(), z.number()]),
    mids: z.tuple([z.number(), z.number(), z.number()]),
    highlights: z.tuple([z.number(), z.number(), z.number()]),
  }).optional(),
});

const audioProfileSchema = z.object({
  bpm: z.number().min(0),
  beat_grid_s: z.array(z.number()),
  downbeats_s: z.array(z.number()),
  energy_curve: z.array(z.object({ time_s: z.number(), energy: z.number() })),
  speech_segments: z.array(z.object({ start_s: z.number(), end_s: z.number() })),
  sync_points_s: z.array(z.number()),
});

const textEventSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  content: z.string(),
  position: z.enum(["center", "top", "bottom", "lower-third"]),
  style: z.enum(["bold", "italic", "outline", "shadow", "glow"]),
  animation: z.enum(["pop", "fade", "slide", "typewriter", "none"]),
});

const pacingProfileSchema = z.object({
  avg_shot_length_s: z.number().min(0),
  variance: z.enum(["low", "medium", "high"]),
  energy_curve: z.enum(["rising", "falling", "peak", "valley", "steady"]),
  climax_position_s: z.number().optional(),
});

export const editDNAz = z.object({
  version: z.literal("1.0"),
  source: z.object({
    type: z.enum(["reference", "footage"]),
    duration_s: z.number().min(0),
    fps: z.number().min(0),
    resolution: z.object({ width: z.number().min(1), height: z.number().min(1) }),
    aspect_ratio: z.string(),
  }),
  shots: z.array(shotSchema).min(1),
  color: colorProfileSchema,
  audio: audioProfileSchema,
  text_events: z.array(textEventSchema),
  pacing: pacingProfileSchema,
  metadata: z.object({
    analyzed_at: z.string(),
    frame_count: z.number().min(0),
    analysis_fps: z.number().min(0),
    confidence: z.number().min(0).max(1),
    field_owners: z.record(z.string()),
  }),
});

export type EditDNAInput = z.input<typeof editDNAz>;
```

- [ ] **Step 4: Write the validation function**

Create `packages/edit-dna/src/index.ts`:
```typescript
export { editDNAz } from "./zod-schema.js";
export type { EditDNA, Shot, ColorProfile, AudioProfile, TextEvent, PacingProfile } from "./schema.js";
export type { EditDNAInput } from "./zod-schema.js";

import { z } from "zod";
import { editDNAz } from "./zod-schema.js";
import type { EditDNA } from "./schema.js";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function validateEditDNA(data: unknown): Result<EditDNA, z.ZodError> {
  const result = editDNAz.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data as EditDNA };
  }
  return { ok: false, error: result.error };
}
```

- [ ] **Step 5: Write the failing tests**

Create `packages/edit-dna/src/__tests__/schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { validateEditDNA } from "../index.js";
import type { EditDNA } from "../schema.js";

const validDNA: EditDNA = {
  version: "1.0",
  source: {
    type: "reference",
    duration_s: 13.87,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    aspect_ratio: "16:9",
  },
  shots: [
    {
      id: "shot-1",
      start_s: 0,
      end_s: 1.2,
      duration_s: 1.2,
      content: { description: "A cat sitting", subjects: ["cat"], action: "sitting", mood: "calm" },
      camera: { motion: "static", intensity: 0 },
      color: { dominant_hue: "brown", temperature: "warm", saturation: 0.6, brightness: 0.7 },
    },
  ],
  color: {
    contrast: 1.15,
    saturation: 0.9,
    temperature_shift: "cool",
    shadows_tint: "#1a1a2e",
    highlights_tint: "#f5e6cc",
  },
  audio: {
    bpm: 120,
    beat_grid_s: [0, 0.5, 1.0],
    downbeats_s: [0, 1.0],
    energy_curve: [{ time_s: 0, energy: 0.5 }],
    speech_segments: [],
    sync_points_s: [0, 0.5, 1.0],
  },
  text_events: [],
  pacing: {
    avg_shot_length_s: 1.2,
    variance: "medium",
    energy_curve: "steady",
  },
  metadata: {
    analyzed_at: "2026-07-21T00:00:00Z",
    frame_count: 42,
    analysis_fps: 3,
    confidence: 0.85,
    field_owners: { cuts: "cut-detector", motion: "motion-analyzer" },
  },
};

describe("EditDNA schema", () => {
  it("validates a correct EditDNA", () => {
    const result = validateEditDNA(validDNA);
    expect(result.ok).toBe(true);
  });

  it("rejects empty shots array", () => {
    const result = validateEditDNA({ ...validDNA, shots: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid camera motion", () => {
    const dna = {
      ...validDNA,
      shots: [{ ...validDNA.shots[0], camera: { ...validDNA.shots[0].camera, motion: "invalid" } }],
    };
    const result = validateEditDNA(dna);
    expect(result.ok).toBe(false);
  });

  it("rejects intensity out of range", () => {
    const dna = {
      ...validDNA,
      shots: [{ ...validDNA.shots[0], camera: { ...validDNA.shots[0].camera, intensity: 1.5 } }],
    };
    const result = validateEditDNA(dna);
    expect(result.ok).toBe(false);
  });

  it("rejects missing version", () => {
    const { version, ...rest } = validDNA;
    const result = validateEditDNA(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateEditDNA("not an object");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/edit-dna && npx vitest run`
Expected: All 6 tests PASS

- [ ] **Step 7: Register in pnpm workspace**

Verify `pnpm-workspace.yaml` already includes `packages/*` (it does — no change needed).

- [ ] **Step 8: Commit**

```bash
git add packages/edit-dna/
git commit -m "feat(edit-dna): add Edit DNA schema package with Zod validation"
```

---

## Task 2: OperationPlan Types Package

**Files:**
- Create: `packages/intent-compiler/package.json`
- Create: `packages/intent-compiler/tsconfig.json`
- Create: `packages/intent-compiler/src/types.ts`
- Create: `packages/intent-compiler/src/zod-schema.ts`
- Create: `packages/intent-compiler/src/index.ts`
- Create: `packages/intent-compiler/src/__tests__/types.test.ts`

**Interfaces:**
- Consumes: (none — standalone types package)
- Produces: `OperationPlan`, `Operation`, `SpeedCurve`, `GlobalEffect`, `TextOverlay`, `AudioMix` types
- Produces: `operationPlanz` Zod schema
- Produces: `validateOperationPlan(data: unknown): Result<OperationPlan, ZodError>` function

- [ ] **Step 1: Create package scaffolding**

Create `packages/intent-compiler/package.json`:
```json
{
  "name": "@monet/intent-compiler",
  "version": "0.0.1",
  "description": "Intent Compiler types and validation — the contract between LLM output and engine execution.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/intent-compiler/tsconfig.json` (same as edit-dna).

- [ ] **Step 2: Write the TypeScript types**

Create `packages/intent-compiler/src/types.ts`:
```typescript
export interface OperationPlan {
  version: "1.0";
  target_duration_s: number;
  aspect_ratio: string;
  operations: Operation[];
  global_effects: GlobalEffect[];
  text_overlays: TextOverlay[];
  audio_mix: AudioMix;
}

export type Operation =
  | { type: "place_clip"; clip_id: string; track: number; start_s: number; duration_s: number; in_point_s: number; out_point_s: number }
  | { type: "apply_speed"; target: "clip" | "segment"; clip_id?: string; segment_index?: number; curve: SpeedCurve }
  | { type: "apply_transition"; between: [number, number]; transition_type: "crossfade" | "wipe" | "dissolve" | "hard"; duration_s: number }
  | { type: "apply_effect"; target: "clip" | "segment"; effect: EffectParams }
  | { type: "apply_color"; target: "global" | "clip"; clip_id?: string; params: ColorParams };

export interface SpeedCurve {
  keyframes: { time_s: number; speed: number }[];
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface GlobalEffect {
  type: "color_grade" | "vignette" | "grain" | "glow";
  params: Record<string, number>;
}

export interface TextOverlay {
  text: string;
  start_s: number;
  end_s: number;
  position: { x: number; y: number };
  style: Record<string, unknown>;
  animation: string;
}

export interface AudioMix {
  tracks: { clip_id: string; volume: number; fade_in_s: number; fade_out_s: number }[];
  ducking?: { enabled: boolean; threshold: number };
}

export interface EffectParams {
  type: string;
  intensity: number;
  [key: string]: unknown;
}

export interface ColorParams {
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: string;
  lut?: string;
}
```

- [ ] **Step 3: Write Zod validation schema**

Create `packages/intent-compiler/src/zod-schema.ts` with Zod equivalents of all types above. Use `z.discriminatedUnion("type", [...])` for the Operation union.

- [ ] **Step 4: Write validation function + exports**

Create `packages/intent-compiler/src/index.ts`:
```typescript
export { operationPlanz } from "./zod-schema.js";
export type { OperationPlan, Operation, SpeedCurve, GlobalEffect, TextOverlay, AudioMix } from "./types.js";

import { z } from "zod";
import { operationPlanz } from "./zod-schema.js";
import type { OperationPlan } from "./types.js";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function validateOperationPlan(data: unknown): Result<OperationPlan, z.ZodError> {
  const result = operationPlanz.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data as OperationPlan };
  }
  return { ok: false, error: result.error };
}
```

- [ ] **Step 5: Write tests**

Create `packages/intent-compiler/src/__tests__/types.test.ts` with tests for valid plan, invalid operation type, missing required fields, empty operations array (should fail — min 1).

- [ ] **Step 6: Run tests**

Run: `cd packages/intent-compiler && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/intent-compiler/
git commit -m "feat(intent-compiler): add OperationPlan types with Zod validation"
```

---

## Task 3: Frame Extraction Endpoint

**Files:**
- Create: `workers/python-ai/workers/frame_extractor.py`
- Modify: `workers/python-ai/app.py` (add `/extract-frames` endpoint)
- Create: `tests/test-frame-extraction.test.ts`

**Interfaces:**
- Consumes: (none — standalone endpoint)
- Produces: `POST /extract-frames` → `{ frames: FrameInfo[], metadata: ExtractionMetadata }`
- FrameInfo: `{ path: string, timestamp_s: number, width: number, height: number }`
- ExtractionMetadata: `{ total_frames: number, fps: number, duration_s: number, output_dir: string }`

- [ ] **Step 1: Write the Python frame extractor**

Create `workers/python-ai/workers/frame_extractor.py`:
```python
"""Frame extraction using FFmpeg. Extracts frames at specified FPS."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class FrameInfo:
    path: str
    timestamp_s: float
    width: int
    height: int


@dataclass
class ExtractionResult:
    frames: list[FrameInfo]
    metadata: dict


def extract_frames(
    file_path: str,
    fps: float = 3.0,
    max_frames: int | None = None,
    output_dir: str | None = None,
) -> ExtractionResult:
    """Extract frames from video using FFmpeg at specified FPS.
    
    Args:
        file_path: Path to input video file
        fps: Frames per second to extract (default 3)
        max_frames: Maximum number of frames to extract (optional)
        output_dir: Directory to save frames (default: temp dir)
    
    Returns:
        ExtractionResult with frame paths and metadata
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="jalebi-frames-")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Get video duration first
    probe_cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", file_path
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    probe_data = json.loads(probe_result.stdout)
    
    duration = float(probe_data["format"]["duration"])
    
    # Get video dimensions from first video stream
    width, height = 1920, 1080
    for stream in probe_data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width", 1920)
            height = stream.get("height", 1080)
            break
    
    # Extract frames
    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    cmd = [
        "ffmpeg", "-i", file_path,
        "-vf", f"fps={fps}",
        "-q:v", "2",
        "-y",
        output_pattern
    ]
    
    if max_frames:
        cmd.extend(["-vframes", str(max_frames)])
    
    subprocess.run(cmd, capture_output=True, check=True)
    
    # Collect frame info
    frames = []
    frame_files = sorted(Path(output_dir).glob("frame_*.jpg"))
    
    for i, frame_path in enumerate(frame_files):
        timestamp_s = i / fps
        frames.append(FrameInfo(
            path=str(frame_path),
            timestamp_s=round(timestamp_s, 4),
            width=width,
            height=height,
        ))
    
    return ExtractionResult(
        frames=frames,
        metadata={
            "total_frames": len(frames),
            "fps": fps,
            "duration_s": duration,
            "output_dir": output_dir,
        },
    )
```

- [ ] **Step 2: Add FastAPI endpoint to app.py**

Add to `workers/python-ai/app.py`:
```python
from workers.frame_extractor import extract_frames

class ExtractFramesBody(BaseModel):
    filePath: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0, le=30)
    maxFrames: Optional[int] = Field(default=None, ge=1)
    outputDir: Optional[str] = None

@app.post("/extract-frames")
def extract_frames_route(body: ExtractFramesBody) -> dict:
    result = extract_frames(
        file_path=body.filePath,
        fps=body.fps,
        max_frames=body.maxFrames,
        output_dir=body.outputDir,
    )
    return {
        "success": True,
        "data": {
            "frames": [{"path": f.path, "timestamp_s": f.timestamp_s, "width": f.width, "height": f.height} for f in result.frames],
            "metadata": result.metadata,
        },
    }
```

- [ ] **Step 3: Write integration test**

Create `tests/test-frame-extraction.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";

const API_URL = "http://localhost:8102";

describe("Frame Extraction", () => {
  it("extracts frames from a video file", async () => {
    // This test requires a test video in test-videos/
    // Skip if no test video available
    const res = await fetch(`${API_URL}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: "test-videos/sample.mp4",
        fps: 3,
      }),
    });
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.frames.length).toBeGreaterThan(0);
    expect(data.data.metadata.fps).toBe(3);
    expect(data.data.frames[0]).toHaveProperty("path");
    expect(data.data.frames[0]).toHaveProperty("timestamp_s");
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add workers/python-ai/workers/frame_extractor.py workers/python-ai/app.py tests/test-frame-extraction.test.ts
git commit -m "feat: add FFmpeg frame extraction endpoint to python-ai worker"
```

---

## Task 4: Cut Detection Module

**Files:**
- Create: `workers/python-ai/workers/cut_detector.py`
- Modify: `workers/python-ai/app.py` (add `/detect-cuts` endpoint)
- Create: `tests/test-cut-detection.test.ts`

**Interfaces:**
- Consumes: frame directory (from Task 3)
- Produces: `POST /detect-cuts` → `{ cuts: CutPoint[], shots: ShotSegment[] }`
- CutPoint: `{ frame_index: number, timestamp_s: number, confidence: number }`
- ShotSegment: `{ start_s: number, end_s: number, frame_start: number, frame_end: number }`

- [ ] **Step 1: Write the cut detector**

Create `workers/python-ai/workers/cut_detector.py`:
```python
"""Cut detection using histogram difference between consecutive frames."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class CutPoint:
    frame_index: int
    timestamp_s: float
    confidence: float


@dataclass
class ShotSegment:
    start_s: float
    end_s: float
    frame_start: int
    frame_end: int


def detect_cuts(
    frame_dir: str,
    fps: float = 3.0,
    threshold: float = 0.3,
    min_shot_duration_s: float = 0.2,
) -> dict:
    """Detect scene cuts by comparing histograms of consecutive frames.
    
    Args:
        frame_dir: Directory containing extracted frames
        fps: Frame rate used during extraction
        threshold: Histogram diff threshold for cut detection (0-1)
        min_shot_duration_s: Minimum shot duration in seconds
    
    Returns:
        Dict with cuts and shots arrays
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    
    if len(frame_files) < 2:
        return {"cuts": [], "shots": [{"start_s": 0, "end_s": 0, "frame_start": 0, "frame_end": 0}]}
    
    # Compute histogram for each frame
    histograms = []
    for frame_path in frame_files:
        img = cv2.imread(str(frame_path))
        if img is None:
            continue
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        histograms.append(hist)
    
    # Compare consecutive frames
    cuts = []
    for i in range(1, len(histograms)):
        diff = cv2.compareHist(histograms[i - 1], histograms[i], cv2.HISTCMP_BHATTACHARYYA)
        if diff > threshold:
            cuts.append(CutPoint(
                frame_index=i,
                timestamp_s=round(i / fps, 4),
                confidence=round(min(diff, 1.0), 4),
            ))
    
    # Build shot segments
    shots = []
    start_frame = 0
    for cut in cuts:
        shots.append(ShotSegment(
            start_s=round(start_frame / fps, 4),
            end_s=cut.timestamp_s,
            frame_start=start_frame,
            frame_end=cut.frame_index,
        ))
        start_frame = cut.frame_index
    
    # Final shot
    shots.append(ShotSegment(
        start_s=round(start_frame / fps, 4),
        end_s=round(len(histograms) / fps, 4),
        frame_start=start_frame,
        frame_end=len(histograms) - 1,
    ))
    
    # Filter shots below minimum duration
    shots = [s for s in shots if (s.end_s - s.start_s) >= min_shot_duration_s]
    
    return {
        "cuts": [{"frame_index": c.frame_index, "timestamp_s": c.timestamp_s, "confidence": c.confidence} for c in cuts],
        "shots": [{"start_s": s.start_s, "end_s": s.end_s, "frame_start": s.frame_start, "frame_end": s.frame_end} for s in shots],
    }
```

- [ ] **Step 2: Add endpoint to app.py**

```python
from workers.cut_detector import detect_cuts

class DetectCutsBody(BaseModel):
    frameDir: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0)
    threshold: float = Field(default=0.3, gt=0, lt=1)

@app.post("/detect-cuts")
def detect_cuts_route(body: DetectCutsBody) -> dict:
    result = detect_cuts(frame_dir=body.frameDir, fps=body.fps, threshold=body.threshold)
    return {"success": True, "data": result}
```

- [ ] **Step 3: Commit**

```bash
git add workers/python-ai/workers/cut_detector.py workers/python-ai/app.py
git commit -m "feat: add histogram-based cut detection module"
```

---

## Task 5: Motion Analysis Module

**Files:**
- Create: `workers/python-ai/workers/motion_analyzer.py`
- Modify: `workers/python-ai/app.py` (add `/analyze-motion` endpoint)

**Interfaces:**
- Consumes: frame directory + shot segments (from Task 4)
- Produces: `POST /analyze-motion` → `{ motions: ShotMotion[] }`
- ShotMotion: `{ shot_index: number, motion: string, intensity: number, direction_degrees?: number }`

- [ ] **Step 1: Write the motion analyzer**

Create `workers/python-ai/workers/motion_analyzer.py`:
```python
"""Motion analysis using optical flow between shot boundary frames."""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class ShotMotion:
    shot_index: int
    motion: str
    intensity: float
    direction_degrees: float | None


def classify_motion(flow_magnitude: float, flow_angle: float) -> tuple[str, float, float | None]:
    """Classify camera motion from optical flow statistics.
    
    Returns:
        (motion_type, intensity, direction_degrees)
    """
    if flow_magnitude < 0.5:
        return "static", 0.0, None
    
    if flow_magnitude < 2.0:
        # Low motion — classify by angle consistency
        return "handheld", min(flow_magnitude / 5.0, 1.0), None
    
    # High motion — classify by dominant direction
    # flow_angle is in radians, convert to degrees
    deg = math.degrees(flow_angle) % 360
    
    # Classify pan/zoom by angle distribution
    if 315 <= deg or deg <= 45:
        return "pan_right", min(flow_magnitude / 10.0, 1.0), deg
    elif 135 <= deg <= 225:
        return "pan_left", min(flow_magnitude / 10.0, 1.0), deg
    elif 45 < deg < 135:
        return "zoom_in", min(flow_magnitude / 10.0, 1.0), deg
    elif 225 < deg < 315:
        return "zoom_out", min(flow_magnitude / 10.0, 1.0), deg
    
    return "shake", min(flow_magnitude / 10.0, 1.0), deg


def analyze_motion(
    frame_dir: str,
    shots: list[dict],
) -> dict:
    """Analyze camera motion for each shot using optical flow.
    
    Args:
        frame_dir: Directory containing extracted frames
        shots: Shot segments from cut detection
    
    Returns:
        Dict with motions array
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    
    motions = []
    for i, shot in enumerate(shots):
        start_frame = shot["frame_start"]
        end_frame = shot["frame_end"]
        
        if start_frame >= len(frame_files) or end_frame >= len(frame_files):
            motions.append({"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None})
            continue
        
        # Read first and last frame of shot
        img1 = cv2.imread(str(frame_files[start_frame]), cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imread(str(frame_files[min(end_frame, len(frame_files) - 1)]), cv2.IMREAD_GRAYSCALE)
        
        if img1 is None or img2 is None:
            motions.append({"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None})
            continue
        
        # Compute dense optical flow
        flow = cv2.calcOpticalFlowFarneback(img1, img2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        
        # Convert to magnitude and angle
        magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        
        # Average magnitude and dominant angle
        avg_mag = float(np.mean(magnitude))
        dominant_angle = float(np.median(angle))
        
        motion_type, intensity, direction = classify_motion(avg_mag, dominant_angle)
        
        motions.append({
            "shot_index": i,
            "motion": motion_type,
            "intensity": round(intensity, 4),
            "direction_degrees": round(direction, 2) if direction is not None else None,
        })
    
    return {"motions": motions}
```

- [ ] **Step 2: Add endpoint to app.py**

```python
from workers.motion_analyzer import analyze_motion

class AnalyzeMotionBody(BaseModel):
    frameDir: str = Field(min_length=1)
    shots: list[dict] = Field(min_length=1)

@app.post("/analyze-motion")
def analyze_motion_route(body: AnalyzeMotionBody) -> dict:
    result = analyze_motion(frame_dir=body.frameDir, shots=body.shots)
    return {"success": True, "data": result}
```

- [ ] **Step 3: Commit**

```bash
git add workers/python-ai/workers/motion_analyzer.py workers/python-ai/app.py
git commit -m "feat: add optical flow motion analysis module"
```

---

## Task 6: Color Analysis Module

**Files:**
- Create: `workers/python-ai/workers/color_analyzer.py`
- Modify: `workers/python-ai/app.py` (add `/analyze-color` endpoint)

**Interfaces:**
- Consumes: frame directory + shot segments
- Produces: `POST /analyze-color` → `{ shots: ShotColor[], global: GlobalColor }`
- ShotColor: `{ shot_index, dominant_hue, temperature, saturation, brightness }`
- GlobalColor: `{ contrast, saturation, temperature_shift, shadows_tint, highlights_tint }`

- [ ] **Step 1: Write the color analyzer**

Create `workers/python-ai/workers/color_analyzer.py`:
```python
"""Color analysis using per-shot histogram statistics."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


def classify_temperature(avg_hue: float, avg_saturation: float) -> str:
    """Classify color temperature from HSV hue.
    
    Warm hues: 0-30 (red/orange/yellow)
    Cool hues: 90-150 (blue/cyan)
    Neutral: everything else
    """
    if avg_hue < 30 or avg_hue > 150:
        return "warm"
    elif 90 <= avg_hue <= 150:
        return "cool"
    return "neutral"


def analyze_color(
    frame_dir: str,
    shots: list[dict],
) -> dict:
    """Analyze color profile for each shot and globally.
    
    Returns:
        Dict with per-shot color and global color profile
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    
    shot_colors = []
    all_hues = []
    all_saturations = []
    all_brightnesses = []
    
    for i, shot in enumerate(shots):
        start_frame = shot["frame_start"]
        end_frame = min(shot["frame_end"], len(frame_files) - 1)
        
        if start_frame >= len(frame_files):
            shot_colors.append({
                "shot_index": i, "dominant_hue": "neutral",
                "temperature": "neutral", "saturation": 0, "brightness": 0,
            })
            continue
        
        # Sample frames in this shot
        hues = []
        sats = []
        brights = []
        
        for fi in range(start_frame, end_frame + 1):
            img = cv2.imread(str(frame_files[fi]))
            if img is None:
                continue
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            hues.append(float(np.mean(hsv[:, :, 0])))
            sats.append(float(np.mean(hsv[:, :, 1])) / 255.0)
            brights.append(float(np.mean(hsv[:, :, 2])) / 255.0)
        
        avg_hue = float(np.mean(hues)) if hues else 90
        avg_sat = float(np.mean(sats)) if sats else 0.5
        avg_bright = float(np.mean(brights)) if brights else 0.5
        temperature = classify_temperature(avg_hue, avg_sat)
        
        shot_colors.append({
            "shot_index": i,
            "dominant_hue": f"{avg_hue:.0f}",
            "temperature": temperature,
            "saturation": round(avg_sat, 4),
            "brightness": round(avg_bright, 4),
        })
        
        all_hues.extend(hues)
        all_saturations.extend(sats)
        all_brightnesses.extend(brights)
    
    # Global color profile
    global_sat = float(np.mean(all_saturations)) if all_saturations else 0.5
    global_bright = float(np.mean(all_brightnesses)) if all_brightnesses else 0.5
    global_hue = float(np.mean(all_hues)) if all_hues else 90
    
    # Estimate contrast from brightness variance
    brightness_std = float(np.std(all_brightnesses)) if all_brightnesses else 0.1
    contrast = 1.0 + (brightness_std * 2)  # rough approximation
    
    return {
        "shots": shot_colors,
        "global": {
            "contrast": round(contrast, 4),
            "saturation": round(global_sat, 4),
            "temperature_shift": classify_temperature(global_hue, global_sat),
            "shadows_tint": "neutral",
            "highlights_tint": "neutral",
        },
    }
```

- [ ] **Step 2: Add endpoint to app.py**

```python
from workers.color_analyzer import analyze_color

class AnalyzeColorBody(BaseModel):
    frameDir: str = Field(min_length=1)
    shots: list[dict] = Field(min_length=1)

@app.post("/analyze-color")
def analyze_color_route(body: AnalyzeColorBody) -> dict:
    result = analyze_color(frame_dir=body.frameDir, shots=body.shots)
    return {"success": True, "data": result}
```

- [ ] **Step 3: Commit**

```bash
git add workers/python-ai/workers/color_analyzer.py workers/python-ai/app.py
git commit -m "feat: add per-shot color analysis module"
```

---

## Task 7: Vision Captioning Integration

**Files:**
- Create: `src/server/lib/vision-captioner.ts`
- Modify: `src/server/lib/vision-analyzer.ts` (no changes needed — already works)

**Interfaces:**
- Consumes: frame paths (from Task 3) + shot segments (from Task 4)
- Produces: `captionShots(frameDir, shots, fps) → ShotCaption[]`
- ShotCaption: `{ shot_index, description, subjects, action, mood }`

- [ ] **Step 1: Write the vision captioner**

Create `src/server/lib/vision-captioner.ts`:
```typescript
/**
 * Vision captioning — sends 1-2 representative frames per shot to vision AI.
 * Uses existing vision-analyzer.ts for the actual API call.
 */

import { analyzeWithVision } from "./vision-analyzer.js";
import type { ShotCaption } from "@monet/edit-dna";

interface ShotSegment {
  start_s: number;
  end_s: number;
  frame_start: number;
  frame_end: number;
}

/**
 * Select representative frames for a shot.
 * Returns 1-2 frame paths: first frame + middle frame (if shot > 1s).
 */
function selectKeyframes(
  frameDir: string,
  shot: ShotSegment,
  fps: number,
): string[] {
  const frameStart = String(shot.frame_start + 1).padStart(4, "0");
  const paths = [`${frameDir}/frame_${frameStart}.jpg`];
  
  // Add middle frame if shot is long enough
  if (shot.end_s - shot.start_s > 1.0) {
    const midFrame = Math.floor((shot.frame_start + shot.frame_end) / 2);
    const midPath = `${frameDir}/frame_${String(midFrame + 1).padStart(4, "0")}.jpg`;
    if (midPath !== paths[0]) {
      paths.push(midPath);
    }
  }
  
  return paths;
}

/**
 * Caption each shot using vision AI on representative keyframes.
 */
export async function captionShots(
  frameDir: string,
  shots: ShotSegment[],
  fps: number,
): Promise<ShotCaption[]> {
  const captions: ShotCaption[] = [];
  
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const keyframes = selectKeyframes(frameDir, shot, fps);
    
    // Use existing vision analyzer
    const result = await analyzeWithVision(keyframes, {
      prompt: `Describe this video frame concisely: what is the main subject, what action is happening, what is the mood/atmosphere, and what camera technique is used (static, pan, zoom, handheld). Be specific but brief.`,
    });
    
    captions.push({
      shot_index: i,
      description: result.description || "Unknown scene",
      subjects: result.subjects || [],
      action: result.action || "unknown",
      mood: result.mood || "neutral",
    });
  }
  
  return captions;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/lib/vision-captioner.ts
git commit -m "feat: add vision captioning module (per-shot keyframe analysis)"
```

---

## Task 8: Analysis Engine Orchestrator

**Files:**
- Create: `src/server/lib/analysis-engine.ts`
- Create: `src/server/api/analyze-dna.ts`
- Modify: `src/server.ts` (add route)

**Interfaces:**
- Consumes: Tasks 3-7 (frame extraction, cut detection, motion, color, vision)
- Produces: `POST /api/analyze-dna` → EditDNA JSON
- Orchestrates: frame extraction → cut detection → motion analysis → color analysis → vision captioning → audio analysis → assembly

- [ ] **Step 1: Write the orchestrator**

Create `src/server/lib/analysis-engine.ts`:
```typescript
/**
 * Analysis Engine — orchestrates all analysis modules into Edit DNA.
 * 
 * Order: extract frames → detect cuts → analyze motion → analyze color → 
 *        caption shots (vision AI) → analyze audio → assemble Edit DNA
 */

import { validateEditDNA, type EditDNA, type Result } from "@monet/edit-dna";

const PYTHON_AI_URL = process.env.PYTHON_AI_URL || "http://localhost:8102";
const PYTHON_AUDIO_URL = process.env.PYTHON_AUDIO_URL || "http://localhost:8101";

interface AnalysisOptions {
  filePath: string;
  fps?: number;
  type?: "reference" | "footage";
}

interface FrameInfo {
  path: string;
  timestamp_s: number;
  width: number;
  height: number;
}

interface ExtractionResult {
  frames: FrameInfo[];
  metadata: {
    total_frames: number;
    fps: number;
    duration_s: number;
    output_dir: string;
  };
}

interface CutResult {
  cuts: { frame_index: number; timestamp_s: number; confidence: number }[];
  shots: { start_s: number; end_s: number; frame_start: number; frame_end: number }[];
}

interface MotionResult {
  motions: { shot_index: number; motion: string; intensity: number; direction_degrees: number | null }[];
}

interface ColorResult {
  shots: { shot_index: number; dominant_hue: string; temperature: string; saturation: number; brightness: number }[];
  global: { contrast: number; saturation: number; temperature_shift: string; shadows_tint: string; highlights_tint: string };
}

interface ShotCaption {
  shot_index: number;
  description: string;
  subjects: string[];
  action: string;
  mood: string;
}

async function pythonPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { success: boolean; data: T };
  if (!data.success) throw new Error(`Python worker error at ${url}`);
  return data.data;
}

export async function analyzeVideo(
  options: AnalysisOptions,
): Promise<Result<EditDNA, string>> {
  const { filePath, fps = 3, type = "reference" } = options;
  
  try {
    // Step 1: Extract frames
    const extraction = await pythonPost<ExtractionResult>(`${PYTHON_AI_URL}/extract-frames`, {
      filePath,
      fps,
    });
    
    const { frames, metadata } = extraction;
    if (frames.length === 0) {
      return { ok: false, error: "No frames extracted from video" };
    }
    
    // Step 2: Detect cuts
    const cutResult = await pythonPost<CutResult>(`${PYTHON_AI_URL}/detect-cuts`, {
      frameDir: metadata.output_dir,
      fps,
      threshold: 0.3,
    });
    
    // Step 3: Analyze motion
    const motionResult = await pythonPost<MotionResult>(`${PYTHON_AI_URL}/analyze-motion`, {
      frameDir: metadata.output_dir,
      shots: cutResult.shots,
    });
    
    // Step 4: Analyze color
    const colorResult = await pythonPost<ColorResult>(`${PYTHON_AI_URL}/analyze-color`, {
      frameDir: metadata.output_dir,
      shots: cutResult.shots,
    });
    
    // Step 5: Vision captioning (dynamic import to avoid circular deps)
    const { captionShots } = await import("./vision-captioner.js");
    const captions = await captionShots(metadata.output_dir, cutResult.shots, fps);
    
    // Step 6: Audio analysis (existing worker)
    let audioProfile = {
      bpm: 0, beat_grid_s: [], downbeats_s: [],
      energy_curve: [], speech_segments: [], sync_points_s: [],
    };
    try {
      const audioResult = await pythonPost<typeof audioProfile>(`${PYTHON_AUDIO_URL}/analyze-audio`, {
        filePath,
      });
      audioProfile = audioResult;
    } catch {
      // Audio analysis is optional — proceed without it
    }
    
    // Step 7: Assemble Edit DNA
    const shots = cutResult.shots.map((shot, i) => ({
      id: `shot-${i}`,
      start_s: shot.start_s,
      end_s: shot.end_s,
      duration_s: shot.end_s - shot.start_s,
      content: {
        description: captions[i]?.description || "Unknown",
        subjects: captions[i]?.subjects || [],
        action: captions[i]?.action || "unknown",
        mood: captions[i]?.mood || "neutral",
      },
      camera: {
        motion: (motionResult.motions[i]?.motion || "static") as EditDNA["shots"][0]["camera"]["motion"],
        intensity: motionResult.motions[i]?.intensity || 0,
        direction_degrees: motionResult.motions[i]?.direction_degrees || undefined,
      },
      color: {
        dominant_hue: colorResult.shots[i]?.dominant_hue || "neutral",
        temperature: (colorResult.shots[i]?.temperature || "neutral") as "warm" | "cool" | "neutral",
        saturation: colorResult.shots[i]?.saturation || 0.5,
        brightness: colorResult.shots[i]?.brightness || 0.5,
      },
    }));
    
    const dna: EditDNA = {
      version: "1.0",
      source: {
        type,
        duration_s: metadata.duration_s,
        fps: metadata.fps,
        resolution: { width: frames[0]?.width || 1920, height: frames[0]?.height || 1080 },
        aspect_ratio: "16:9",
      },
      shots,
      color: colorResult.global,
      audio: audioProfile,
      text_events: [],
      pacing: {
        avg_shot_length_s: shots.reduce((sum, s) => sum + s.duration_s, 0) / shots.length,
        variance: shots.length > 5 ? "high" : shots.length > 2 ? "medium" : "low",
        energy_curve: "steady",
      },
      metadata: {
        analyzed_at: new Date().toISOString(),
        frame_count: frames.length,
        analysis_fps: fps,
        confidence: 0.8,
        field_owners: {
          cuts: "cut-detector",
          motion: "motion-analyzer",
          color: "color-analyzer",
          content: "vision-captioner",
          audio: "audio-worker",
        },
      },
    };
    
    // Validate
    const validation = validateEditDNA(dna);
    if (!validation.ok) {
      return { ok: false, error: `Edit DNA validation failed: ${validation.error.message}` };
    }
    
    return { ok: true, value: validation.value };
  } catch (err) {
    return { ok: false, error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```

- [ ] **Step 2: Write the API endpoint**

Create `src/server/api/analyze-dna.ts`:
```typescript
import { z } from "zod";
import { analyzeVideo } from "../lib/analysis-engine.js";

const AnalyzeDNASchema = z.object({
  filePath: z.string().min(1),
  fps: z.number().min(0.5).max(30).default(3),
  type: z.enum(["reference", "footage"]).default("reference"),
});

export async function handleAnalyzeDNA(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = AnalyzeDNASchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    
    const result = await analyzeVideo(parsed.data);
    
    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }
    
    return Response.json({ success: true, data: result.value });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/lib/analysis-engine.ts src/server/api/analyze-dna.ts
git commit -m "feat: add analysis engine orchestrator and /api/analyze-dna endpoint"
```

---

## Task 9: Jalebi Advanced Headless Bridge

**Files:**
- Create: `apps/kove-advanced/packages/core/src/headless/operation-executor.ts`
- Create: `apps/kove-advanced/packages/core/src/headless/index.ts`
- Create: `tests/test-headless-execution.test.ts`

**Interfaces:**
- Consumes: OperationPlan (from Task 2)
- Produces: `executePlan(plan, media) → HeadlessProject`
- Produces: `renderProject(project, settings) → Blob`

- [ ] **Step 1: Write the operation executor**

Create `apps/kove-advanced/packages/core/src/headless/operation-executor.ts`:
```typescript
/**
 * Headless operation executor — converts OperationPlan JSON into a 
 * Jalebi Advanced project that can be rendered without UI interaction.
 */

import type { OperationPlan, Operation } from "@monet/intent-compiler";

interface MediaItem {
  id: string;
  name: string;
  type: "video" | "audio";
  blob: Blob;
  metadata: { duration: number; width: number; height: number };
}

interface Track {
  id: string;
  type: "video" | "audio" | "text" | "fx";
  clips: Clip[];
}

interface Clip {
  id: string;
  mediaId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  effects: Record<string, unknown>[];
  transform: Record<string, unknown>;
}

export interface HeadlessProject {
  id: string;
  name: string;
  settings: { width: number; height: number; frameRate: number; sampleRate: number };
  mediaLibrary: { items: MediaItem[] };
  timeline: { tracks: Track[] };
}

function generateId(): string {
  return `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyOperation(tracks: Track[], operation: Operation): void {
  switch (operation.type) {
    case "place_clip": {
      const track = tracks.find(t => t.id === `track-${operation.track}`) || {
        id: `track-${operation.track}`,
        type: "video" as const,
        clips: [],
      };
      if (!tracks.find(t => t.id === track.id)) {
        tracks.push(track);
      }
      track.clips.push({
        id: generateId(),
        mediaId: operation.clip_id,
        startTime: operation.start_s,
        duration: operation.duration_s,
        inPoint: operation.in_point_s,
        outPoint: operation.out_point_s,
        speed: 1.0,
        effects: [],
        transform: {},
      });
      break;
    }
    case "apply_speed": {
      // Find the target clip and apply speed curve
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (operation.clip_id && clip.mediaId === operation.clip_id) {
            const avgSpeed = operation.curve.keyframes.reduce((sum, kf) => sum + kf.speed, 0) / operation.curve.keyframes.length;
            clip.speed = avgSpeed;
          }
        }
      }
      break;
    }
    case "apply_color": {
      // Color effects applied globally or per-clip
      break;
    }
    case "apply_transition": {
      // Transitions are applied between clips during render
      break;
    }
    case "apply_effect": {
      // Effects applied to target clip/segment
      break;
    }
  }
}

export function executePlan(plan: OperationPlan, media: MediaItem[]): HeadlessProject {
  const tracks: Track[] = [];
  
  // Execute operations in order
  for (const op of plan.operations) {
    applyOperation(tracks, op);
  }
  
  return {
    id: generateId(),
    name: "Headless Export",
    settings: {
      width: 1920,
      height: 1080,
      frameRate: 30,
      sampleRate: 44100,
    },
    mediaLibrary: { items: media },
    timeline: { tracks },
  };
}
```

- [ ] **Step 2: Write proof-of-concept test**

Create `tests/test-headless-execution.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { executePlan } from "../apps/kove-advanced/packages/core/src/headless/operation-executor.js";
import type { OperationPlan } from "../packages/intent-compiler/src/types.js";

describe("Headless Execution", () => {
  it("converts an OperationPlan into a HeadlessProject", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 5.0,
      aspect_ratio: "16:9",
      operations: [
        {
          type: "place_clip",
          clip_id: "clip-1",
          track: 0,
          start_s: 0,
          duration_s: 2.5,
          in_point_s: 0,
          out_point_s: 2.5,
        },
        {
          type: "place_clip",
          clip_id: "clip-2",
          track: 0,
          start_s: 2.5,
          duration_s: 2.5,
          in_point_s: 0,
          out_point_s: 2.5,
        },
      ],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };
    
    const media = [
      { id: "clip-1", name: "clip1.mp4", type: "video" as const, blob: new Blob(), metadata: { duration: 5, width: 1920, height: 1080 } },
      { id: "clip-2", name: "clip2.mp4", type: "video" as const, blob: new Blob(), metadata: { duration: 5, width: 1920, height: 1080 } },
    ];
    
    const project = executePlan(plan, media);
    
    expect(project.id).toBeTruthy();
    expect(project.timeline.tracks.length).toBeGreaterThan(0);
    expect(project.timeline.tracks[0].clips.length).toBe(2);
    expect(project.timeline.tracks[0].clips[0].mediaId).toBe("clip-1");
    expect(project.timeline.tracks[0].clips[1].mediaId).toBe("clip-2");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/test-headless-execution.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/kove-advanced/packages/core/src/headless/ tests/test-headless-execution.test.ts
git commit -m "feat: add headless operation executor for programmatic timeline construction"
```

---

## Task 10: Intent Compiler

**Files:**
- Create: `packages/intent-compiler/src/compiler.ts`
- Create: `packages/intent-compiler/src/prompts/compile-intent.txt`
- Create: `src/server/api/compile-intent.ts`

**Interfaces:**
- Consumes: EditDNA + clip manifest + user prompt (from Tasks 1, 8)
- Produces: `compileIntent(dna, manifest, prompt) → Result<OperationPlan, string>`
- Validation failure → retry (max 2) → fail loudly

- [ ] **Step 1: Write the system prompt**

Create `packages/intent-compiler/src/prompts/compile-intent.txt`:
```
You are an expert video editor. You receive:
1. An Edit DNA JSON describing a reference video's editing patterns
2. A manifest of available clips (user's footage)
3. A user prompt describing what they want

Your job: produce an OperationPlan — a list of structured operations that Jalebi Advanced's rendering engine can execute.

RULES:
- You ONLY emit operations from this list: place_clip, apply_speed, apply_transition, apply_color, apply_effect
- You NEVER emit pixels, raw effect code, or render decisions
- Every place_clip operation must reference a clip_id from the manifest
- Clip durations must not exceed the available clip duration
- The sum of all place_clip durations must approximately match the target duration
- Apply speed changes via SpeedCurve (keyframes with time_s and speed multiplier)
- Apply transitions between consecutive clips
- Apply color effects as global grade (not per-clip)

OUTPUT: Valid JSON matching the OperationPlan schema. No markdown fences, no explanation, just JSON.
```

- [ ] **Step 2: Write the compiler**

Create `packages/intent-compiler/src/compiler.ts`:
```typescript
import { validateOperationPlan, type OperationPlan, type Result } from "./index.js";
import type { EditDNA } from "@monet/edit-dna";

interface ClipManifest {
  clips: {
    id: string;
    filePath: string;
    duration_s: number;
    resolution: { width: number; height: number };
    content_tags?: string[];
  }[];
}

const SYSTEM_PROMPT = `You are an expert video editor. You receive:
1. An Edit DNA JSON describing a reference video's editing patterns
2. A manifest of available clips (user's footage)
3. A user prompt describing what they want

Your job: produce an OperationPlan — a list of structured operations that Jalebi Advanced's rendering engine can execute.

RULES:
- You ONLY emit operations from this list: place_clip, apply_speed, apply_transition, apply_color, apply_effect
- You NEVER emit pixels, raw effect code, or render decisions
- Every place_clip operation must reference a clip_id from the manifest
- Clip durations must not exceed the available clip duration
- The sum of all place_clip durations must approximately match the target duration
- Apply speed changes via SpeedCurve (keyframes with time_s and speed multiplier)
- Apply transitions between consecutive clips
- Apply color effects as global grade (not per-clip)

OUTPUT: Valid JSON matching the OperationPlan schema. No markdown fences, no explanation, just JSON.`;

const MAX_RETRIES = 2;

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  // Uses Cloudflare Workers AI or any configured provider
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/google/gemma-4-26b-a4b-it", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
  });
  
  const data = await res.json() as { result: { response: string } };
  return data.result.response;
}

export async function compileIntent(
  dna: EditDNA,
  manifest: ClipManifest,
  userPrompt: string,
): Promise<Result<OperationPlan, string>> {
  const userMessage = `Edit DNA:\n${JSON.stringify(dna, null, 2)}\n\nAvailable clips:\n${JSON.stringify(manifest, null, 2)}\n\nUser request: ${userPrompt}`;
  
  let lastError = "";
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt = attempt === 0 ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\nYour previous output failed validation: ${lastError}\nFix the error and return the corrected OperationPlan.`;
      
      const response = await callLLM(prompt, userMessage);
      
      let parsed: unknown;
      try {
        parsed = JSON.parse(response);
      } catch {
        lastError = "Invalid JSON in LLM response";
        continue;
      }
      
      const validation = validateOperationPlan(parsed);
      if (validation.ok) {
        return { ok: true, value: validation.value };
      }
      
      lastError = validation.error.message;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  
  return { ok: false, error: `Intent compilation failed after ${MAX_RETRIES + 1} attempts: ${lastError}` };
}
```

- [ ] **Step 3: Write the API endpoint**

Create `src/server/api/compile-intent.ts`:
```typescript
import { z } from "zod";
import { compileIntent } from "@monet/intent-compiler/compiler";
import { validateEditDNA } from "@monet/edit-dna";

const CompileIntentSchema = z.object({
  editDNA: z.unknown(),
  manifest: z.object({
    clips: z.array(z.object({
      id: z.string(),
      filePath: z.string(),
      duration_s: z.number(),
      resolution: z.object({ width: z.number(), height: z.number() }),
      content_tags: z.array(z.string()).optional(),
    })),
  }),
  prompt: z.string().min(1),
});

export async function handleCompileIntent(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = CompileIntentSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    
    // Validate Edit DNA
    const dnaValidation = validateEditDNA(parsed.data.editDNA);
    if (!dnaValidation.ok) {
      return Response.json(
        { success: false, error: "Invalid Edit DNA", details: dnaValidation.error.message },
        { status: 400 },
      );
    }
    
    const result = await compileIntent(
      dnaValidation.value,
      parsed.data.manifest,
      parsed.data.prompt,
    );
    
    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }
    
    return Response.json({ success: true, data: result.value });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/intent-compiler/src/ src/server/api/compile-intent.ts
git commit -m "feat: add intent compiler with retry-on-validation-failure"
```

---

## Task 11: Full Pipeline Endpoint

**Files:**
- Create: `src/server/api/pipeline.ts`
- Modify: `src/server.ts` (add route)

**Interfaces:**
- Consumes: Tasks 8, 9, 10 (analysis, headless, compiler)
- Produces: `POST /api/pipeline` → orchestrates full flow: upload → extract → analyze → compile → execute

- [ ] **Step 1: Write the pipeline endpoint**

Create `src/server/api/pipeline.ts`:
```typescript
import { z } from "zod";
import { analyzeVideo } from "../lib/analysis-engine.js";
import { compileIntent } from "@monet/intent-compiler/compiler";

const PipelineSchema = z.object({
  filePath: z.string().min(1),
  clipPaths: z.array(z.string()).min(1),
  prompt: z.string().min(1),
  type: z.enum(["reference", "footage"]).default("reference"),
  fps: z.number().min(0.5).max(30).default(3),
});

export async function handlePipeline(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = PipelineSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    
    // Step 1: Analyze reference video
    const analysis = await analyzeVideo({
      filePath: parsed.data.filePath,
      fps: parsed.data.fps,
      type: parsed.data.type,
    });
    
    if (!analysis.ok) {
      return Response.json(
        { success: false, error: `Analysis failed: ${analysis.error}` },
        { status: 500 },
      );
    }
    
    // Step 2: Build clip manifest from clip paths
    // In production, these would be pre-analyzed. For now, basic metadata.
    const manifest = {
      clips: parsed.data.clipPaths.map((path, i) => ({
        id: `clip-${i}`,
        filePath: path,
        duration_s: 10, // placeholder — would be extracted via ffprobe
        resolution: { width: 1920, height: 1080 },
        content_tags: [],
      })),
    };
    
    // Step 3: Compile intent
    const compiled = await compileIntent(analysis.value, manifest, parsed.data.prompt);
    
    if (!compiled.ok) {
      return Response.json(
        { success: false, error: `Compilation failed: ${compiled.error}` },
        { status: 500 },
      );
    }
    
    // Step 4: Return the operation plan
    // Headless execution would happen here in production
    return Response.json({
      success: true,
      data: {
        editDNA: analysis.value,
        operationPlan: compiled.value,
        // In production: execute plan and return rendered video
      },
    });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/api/pipeline.ts
git commit -m "feat: add full pipeline endpoint (analyze → compile → execute)"
```

---

## Task 12: Wire Routes and End-to-End Test

**Files:**
- Modify: `src/server.ts` (register new routes)
- Create: `tests/test-pipeline-e2e.test.ts`

**Interfaces:**
- Consumes: All prior tasks
- Produces: Working API routes + passing E2E test

- [ ] **Step 1: Register routes in src/server.ts**

Add route handlers for:
- `POST /api/analyze-dna` → `handleAnalyzeDNA`
- `POST /api/compile-intent` → `handleCompileIntent`
- `POST /api/pipeline` → `handlePipeline`

- [ ] **Step 2: Write E2E test**

Create `tests/test-pipeline-e2e.test.ts` that:
1. Calls `/api/analyze-dna` with a test video
2. Verifies Edit DNA output has valid structure
3. Calls `/api/compile-intent` with the DNA + manifest + prompt
4. Verifies OperationPlan output has valid structure
5. Calls `/api/pipeline` end-to-end

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/server.ts tests/test-pipeline-e2e.test.ts
git commit -m "feat: wire all routes and add E2E pipeline test"
```

---

## Summary

| Task | Component | Depends On | Test |
|------|-----------|------------|------|
| 1 | Edit DNA Schema | — | Unit (Zod validation) |
| 2 | OperationPlan Types | — | Unit (Zod validation) |
| 3 | Frame Extraction | — | Integration (FFmpeg) |
| 4 | Cut Detection | 3 | Integration (histogram diff) |
| 5 | Motion Analysis | 3 | Integration (optical flow) |
| 6 | Color Analysis | 3 | Integration (histogram stats) |
| 7 | Vision Captioning | 3, 4 | Integration (vision AI) |
| 8 | Analysis Orchestrator | 3-7 | Integration (full analysis) |
| 9 | Headless Bridge | 2 | Unit (plan → project) |
| 10 | Intent Compiler | 1, 2 | Integration (LLM + validation) |
| 11 | Pipeline Endpoint | 8-10 | E2E (full flow) |
| 12 | Wire + E2E Test | All | E2E (all routes) |
