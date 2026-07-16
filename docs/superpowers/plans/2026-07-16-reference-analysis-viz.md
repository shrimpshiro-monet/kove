# Reference Video Analysis + Preview Pipeline

## Goal

Upload a reference video → get a visual preview showing exactly what editing DNA was extracted (effects, transitions, text, cuts, color grade), plus a structured report.

## Global Constraints

1. All detection functions must use the REAL algorithms from `scripts/analyzers/` — no stubs
2. The `ReferenceStyleProfile` pydantic model in `workers/python-director/src/reference_engine.py` is the canonical output format
3. Output format: analysis JSON conforms to `ReferenceStyleProfile` schema
4. Overlay video uses FFmpeg `drawtext`/`drawbox` — no external libraries
5. API endpoint returns `{ overlayVideoUrl: string | null, report: ReferenceStyleProfile }`
6. Frontend component renders in the `apps/web/src/` codebase
7. No changes to existing EDL schema or application pipeline code (those are Key 2, separate)

## Tasks

### Task 1: Unify Detection in `reference_engine.py`

Replace stubs with real detection algorithms from `scripts/analyzers/`.

**Files to modify:**
- `workers/python-director/src/reference_engine.py`

**Changes:**
1. Import and integrate `scripts/analyzers/effect_detector.py` functions (`detect_effects`, `analyze_shot_effects`, etc.) into `analyze_reference_style()`
2. Import and integrate `scripts/analyzers/text_detector.py` into segment analysis
3. Import and integrate `scripts/analyzers/speed_ramp_detector.py` into segment analysis
4. Replace `detect_camera_motion()` stub with real motion analysis (use FFmpeg motion vectors or optical flow)
5. Replace `detect_transitions()` stub with real transition detection from effect_detector
6. Populate `effect_vocabulary` field from detected effects per segment
7. Populate `SegmentStyle` fields (blur, vignette, grain, glow, shake, rgb_split) from detected effects
8. Add `post_analysis_video_path` field to `ReferenceStyleProfile` for the overlay video URL
9. Add CLI mode: `python reference_engine.py analyze <video.mp4> [-o analysis.json]` that outputs JSON
10. Keep the existing `apply_reference_style()` and `__main__` intact

**Verification:**
```bash
cd workers/python-director
python -c "from src.reference_engine import ReferenceStyleProfile, analyze_reference_style; print('imports OK')"
python src/reference_engine.py analyze /path/to/test/video.mp4 -o /tmp/analysis.json 2>&1
```

### Task 2: Build Overlay Video Generator

Create `scripts/visualize_reference_analysis.py` that takes analysis JSON + reference video and produces an annotated MP4.

**Output:** `scripts/visualize_reference_analysis.py`

**Behavior:**
- CLI: `python scripts/visualize_reference_analysis.py <reference.mp4> <analysis.json> [-o overlay.mp4]`
- Generates an FFmpeg filter complex that draws:
  - **Cut markers:** vertical lines on the timeline bar (bottom 60px) showing where cuts happen
  - **Effect labels:** for each shot, show detected effects as semi-transparent text overlay in the top-left corner (e.g. "FLASH | BLUR | VIGNETTE")
  - **Text detection:** draw bounding boxes at detected text locations using `drawbox`
  - **Color grade info:** small color swatch in top-right showing dominant color
  - **Transition labels:** at cut points, show transition type ("CROSSFADE", "WIPE", "CUT")
  - **Info bar:** bottom 60px shows BPM, pacing type, total cuts count
  - **Energy curve:** bottom-left, a small waveform showing the energy curve bars

**Implementation approach:**
- Use `ffmpeg-python` or subprocess calls to build a complex filter
- For each shot segment, create a drawtext overlay showing effect names
- For cuts, use drawbox/geq for timeline markers
- Use `select` and `sendcmd` or per-segment overlay approach
- Simpler fallback: generate an overlay video by rendering each shot segment as a separate ffmpeg command with drawtext/drawbox overlays, then concat

**Verification:**
```bash
python scripts/visualize_reference_analysis.py test-renders/sample.mp4 /tmp/analysis.json -o /tmp/overlay.mp4
ffprobe /tmp/overlay.mp4  # verify it exists
```

### Task 3: New Analyze-Reference API Endpoint

Add `POST /api/analyze-reference` to the Kove Fastify API.

**Files to modify:**
- Create `apps/api/src/api/analyze-reference.ts`
- Register route in `apps/api/src/server.ts`

**Endpoint:**
```
POST /api/analyze-reference
Content-Type: multipart/form-data
Fields: reference (file, required)

Response 200:
{
  jobId: string
  status: "queued"
}

GET /api/analyze-reference/status/:jobId
Response 200:
{
  jobId: string
  status: "queued" | "analyzing" | "generating_overlay" | "complete" | "failed"
  progress: number
  message: string
  result?: {
    overlayVideoUrl: string | null
    report: ReferenceStyleProfile
  }
}
```

**Implementation:**
- Accept reference video file upload (multipart, similar to vibe-generate.ts)
- Run `reference_engine.py analyze` via subprocess
- Read the analysis JSON output
- Run `visualize_reference_analysis.py` via subprocess to generate overlay
- Serve the overlay video from a static directory or /tmp path
- Return job-based status (same pattern as vibe-generate)

**Verification:**
```bash
curl -X POST -F "reference=@test-renders/sample.mp4" http://localhost:3000/api/analyze-reference
# Poll status endpoint, check overlay URL is accessible
```

### Task 4: Frontend Preview Component

Build a React split-view component in `apps/web/src/`.

**Files to create/modify:**
- `apps/web/src/components/reference-analysis/ReferencePreview.tsx`
- `apps/web/src/components/reference-analysis/ReportPanel.tsx`
- `apps/web/src/components/reference-analysis/types.ts`

**Component:**
```
┌─────────────────────────────────────┐
│  Reference Analysis Preview          │
│  ┌───────────────────┐ ┌──────────┐ │
│  │  Overlay Video     │ │ Report   │ │
│  │                   │ │ Panel    │ │
│  │                   │ │          │ │
│  │                   │ │ • Cuts   │ │
│  │                   │ │ • Effects│ │
│  │                   │ │ • Color  │ │
│  │                   │ │ • Pacing │ │
│  └───────────────────┘ └──────────┘ │
│  [Upload Reference] [Analyze]       │
└─────────────────────────────────────┘
```

**ReferencePreview.tsx:**
- Upload section: drag-drop zone for reference video
- Analysis button
- Video player for the overlay video (once analysis completes)
- Polls status endpoint during analysis
- Props: onAnalysisComplete callback

**ReportPanel.tsx:**
- Receives `ReferenceStyleProfile` as prop
- Sections:
  - **Summary:** duration, cuts, avg shot, BPM, pacing type
  - **Per-shot timeline:** scrollable list of shots with start/end time, duration, effects detected, transition type
  - **Color grade:** color swatch, brightness/contrast/saturation values
  - **Camera motion:** distribution pie (static/pan/zoom/handheld)
  - **Effects vocabulary:** list of unique effects found across all shots with frequency count
  - **Energy curve:** simple bar chart showing energy over time

**Verification:**
```bash
pnpm typecheck  # verify TS compiles
```

### Task 5: Application Key (Key 2)

Wire ReferenceStyleProfile into the existing EDL generation.

**Files to modify:**
- `workers/python-director/src/style_transfer_engine.py`
- `scripts/monet_pipeline.py` or create new `scripts/apply_style.py`

**Changes:**
1. Add `apply_style.py` CLI: `python scripts/apply_style.py <profile.json> <footage.mp4> [-o output.mp4]`
2. Import and use `monet_pipeline.py`'s `generate_edl_from_dna()` but feed it the ReferenceStyleProfile data
3. Add `POST /api/apply-style` endpoint (profile JSON + footage file → rendered video)
4. Schema bridge: convert `ReferenceStyleProfile` → the DNA dict format expected by `generate_edl_from_dna()`
