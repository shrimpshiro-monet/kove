# E2E Pipeline Documentation

## Overview

Two pipeline implementations exist:

1. **`scripts/e2e-pipeline.py`** — Lightweight vision-first pipeline. Quick and dirty. Uses Cloudflare Workers AI vision model to analyze reference + footage mosaics, then renders with FFmpeg.

2. **`scripts/monet_pipeline.py`** — Full-featured pipeline. 35 analyzer modules, DNA/grammar system, EDL generation, OpenReel export, Docker + FFmpeg rendering with per-clip effects, color grading, and beat sync.

---

## Pipeline 1: `e2e-pipeline.py` (The One You Just Ran)

### Flow (7 steps)

```
Reference Video + Footage Video
        │
        ▼
┌─ 1. Extract frames (3fps) ─────────────────────┐
│   FFmpeg: -vf fps=3 -q:v 2                     │
│   Reference: ~238 frames (79s)                  │
│   Footage: ~1255 frames (418s)                  │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 2. Detect cuts ───────────────────────────────┐
│   Calls Python AI worker: POST /detect-cuts    │
│   Returns shot boundaries + timestamps         │
│   Reference: 71 shots                          │
│   Footage: 96 shots                            │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 3. Create mosaics (contact sheets) ───────────┐
│   Calls Python AI worker: POST /create-mosaic  │
│   Grid of thumbnails from all frames           │
│   Resized to ~500KB for API limits             │
│   Reference: 487KB, Footage: 448KB             │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 4. Vision AI analysis ────────────────────────┐
│   Sends BOTH mosaics to Cloudflare in ONE call │
│   Model: @cf/meta/llama-3.2-11b-vision-instruct│
│   Prompt asks for JSON with:                   │
│     - reference_analysis (style, pacing, mood) │
│     - footage_analysis (content, best moments) │
│     - edit_plan (shot selection, timing, etc)  │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 5. Compile edit plan ─────────────────────────┐
│   Reads AI's cut_timing recommendation         │
│   Calculates target cuts from reference pacing │
│   target_total_cuts = cuts_per_min × duration  │
│   Divides footage into EVENLY SPACED segments  │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 6. Render ────────────────────────────────────┐
│   For each segment:                            │
│     FFmpeg: -ss {start} -i footage -t {dur}   │
│     Optional speed via setpts filter           │
│   Concat all segments                          │
│   Strips audio (-an)                           │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 7. Apply color grade ─────────────────────────┐
│   Keyword-matches AI's color_grade text:       │
│     "desaturated" → saturation=0.3             │
│     "warm" → curves=r                         │
│     "cool" → curves=b                         │
│     default → saturation=0.7                   │
│   Capped at 30s duration                       │
└─────────────────────────────────────────────────┘
        │
        ▼
    Output: {name}.mp4
```

### What's Broken

#### 1. Vision Analysis Hallucinated
The AI returned this for a **Steph Curry basketball video**:
```json
"footage_analysis": {
    "content": "Outdoor activities, such as hiking, biking, and kayaking.",
    "best_moments": [
        "0:10:00 - A group of friends hiking to a scenic viewpoint.",
        "0:25:00 - A group of people cheering and high-fiving."
    ]
}
```
It completely hallucinated the content. The JSON was also wrapped in markdown code fences and the regex extraction failed, so the entire analysis ended up as `raw_response` — the pipeline fell back to time-based segment splitting with no AI guidance.

#### 2. Segment Selection is Dumb
Even if the AI worked, segment selection is purely time-based:
```python
foot_step = foot_dur / max(target_total_cuts, 1)
for i in range(target_total_cuts):
    start = i * foot_step
    dur = min(foot_step, foot_dur - start)
    segments.append({"start": start, "duration": dur})
```
This just slices the footage into equal chunks. It doesn't pick the best moments, match reference shot types, or follow any content-aware logic.

#### 3. Speed Adjustments Are Hardcoded Patterns
```python
if "slow" in speed_text:
    for i in range(0, len(segments), 4):  # Every 4th segment
        speed_adjustments[i] = 0.6
if "fast" in speed_text:
    for i in range(2, len(segments), 4):  # Every 4th segment starting at 2
        speed_adjustments[i] = 1.5
```
It doesn't apply slow-mo to specific moments — just a fixed pattern.

#### 4. Color Grading Is Keyword Matching
The AI says "high-contrast" → it applies `contrast=1.15:saturation=0.7`. No nuance, no per-shot variation, no understanding of what "high-contrast" means for this specific video.

#### 5. No Audio Handling
The pipeline strips audio (`-an`). No beat sync, no music overlay, no audio-aware cutting.

#### 6. 30s Cap
Output is capped at 30 seconds regardless of reference duration.

---

## Pipeline 2: `monet_pipeline.py` (The Real One)

### Flow (4 steps)

```
Reference Video(s) + Footage Video + [Music]
        │
        ▼
┌─ 1. Extract Reference Grammar ─────────────────┐
│   10-stage analysis per reference:             │
│     [0] Classify type (sports/vlog/anime/etc)  │
│     [1] Detect cuts (FFmpeg scene detect)      │
│     [2] Analyze motion (optical flow)          │
│     [3] Detect beats (librosa)                 │
│     [4] Analyze color (k-means clustering)     │
│     [5] Classify shot types (face detection)   │
│     [6] Detect effects (blur/flash/vignette)   │
│     [7] Detect text overlays (OCR)             │
│     [8] Detect speed ramps                     │
│     [9] Semantic analysis (LLM)                │
│     [10] Build DNA from all above              │
│                                                │
│   Multi-ref: blend DNAs (weighted_avg/dominant) │
│   Output: {name}-dna.json                      │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 2. Generate EDL ──────────────────────────────┐
│   Analyze USER's footage separately:           │
│     - Segments, motion peaks, semantic events  │
│     - Beat detection on footage                │
│                                                │
│   Apply reference grammar to footage:          │
│     - Target clip count from ref avg duration  │
│     - Rank segments by edit_score              │
│       (motion + semantics + beat proximity)    │
│     - Match ref shot type distribution         │
│     - Narrative arc ordering:                  │
│       0-20%: establishing (wide, calm)         │
│       20-60%: building (varied)                │
│       60-90%: climax (high energy)             │
│       90-100%: resolution (calm)               │
│     - Snap cuts to beats (if beat-driven)      │
│     - 3-layer CRT protection:                  │
│       L1: Effect allowlist per ref type        │
│       L2: Style intensity scaling (0-1)        │
│       L3: Intensity-bounded effect params      │
│                                                │
│   Output: {name}-edl.json                      │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 3. Export to OpenReel ────────────────────────┐
│   Convert EDL to browser editor JSON format    │
│   Includes media library, timeline tracks,     │
│   clip transforms, Monet metadata              │
│   Output: {name}-openreel.json                 │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ 4. Render Video ──────────────────────────────┐
│   Docker render (full effects + color grade)   │
│   OR FFmpeg concat fallback:                   │
│     Per clip:                                  │
│       - Extract segment                        │
│       - Subject crop (from tracked data)       │
│       - Effects (up to 2 per clip):            │
│         blur, vignette, flash, shake, glow,    │
│         desaturation, high_contrast,           │
│         chromatic_aberration, grain            │
│       - Color grade (LUT presets + curves      │
│         + color wheels, intensity-scaled)      │
│     Concat all clips                           │
│     Add music overlay (AAC 192k)               │
│   Output: {name}-render.mp4                    │
└─────────────────────────────────────────────────┘
```

### The 35 Analyzers

| Module | What It Does |
|--------|-------------|
| `motion_analyzer.py` | Optical flow magnitude (cv2 Farneback), per-frame motion 0-1 |
| `beat_detector.py` | Librosa beat tracking, tempo BPM, beat strength |
| `color_analyzer.py` | K-means dominant palette, grade classification |
| `shot_type_classifier.py` | Wide/medium/close/extreme_close via face detection |
| `effect_detector.py` | Blur, flash, vignette, shake, glow, desaturation, etc. |
| `text_detector.py` | OCR text overlays (pytesseract + EasyOCR) |
| `speed_ramp_detector.py` | Slow-mo, fast motion, ramp points |
| `semantic_analyzer.py` | LLM-based action/emotion/subject understanding |
| `reference_type_classifier.py` | LLM classifies video type (8 categories) |
| `type_profiles.py` | Per-type threshold overrides |
| `dna_blender.py` | Multi-reference DNA blending |
| `footage_analyzer.py` | User footage analysis (separate from reference) |
| `composite_detector.py` | Split-screen, PiP, grid detection |
| `composition_analyzer.py` | Rule-of-thirds, headroom, leading lines |
| `color_grade_tracker.py` | Per-shot color grade changes |
| `transition_classifier.py` | Cut, fade, dissolve, wipe classification |
| `speed_direction_analyzer.py` | Forward/reverse playback detection |
| `edit_events_analyzer.py` | Transitions + speed ramps + keyframes |
| `pipeline_context.py` | Pre-processing orchestration |
| `dialogue_grammar.py` | Speech-led cutting grammar |
| `edit_director.py` | CV + LLM edit decision making |
| `edit_grammar.py` | Structured shot/video/profile decomposition |
| `speech_pipeline.py` | Word-level transcription + VAD + emphasis |
| `director_router.py` | Dialogue vs montage routing |
| `llm_provider.py` | Multi-vendor LLM with fallback |
| `llm_analyzer.py` | Moment-by-moment timeline analysis |
| `editorial_style_export.py` | Full style breakdown export |
| `dna_schema.py` | Shared data structures |

### DNA Structure (Core Data Model)

```json
{
  "name": "reference-name",
  "referenceType": "sports_highlight",
  "totalShots": 71,
  "avgShotDuration": 1.12,
  "cutRate": 0.89,
  "shots": [{
    "index": 0,
    "start": 0.0, "end": 1.12, "duration": 1.12,
    "shotType": "close",
    "effects": ["flash"],
    "cameraMotion": "handheld",
    "subjectMotion": "high",
    "energy": 0.85,
    "semanticEvent": {
      "event_type": "action",
      "emotion": "excitement",
      "narrative_role": "climax"
    }
  }],
  "colorProfile": {
    "grade": "high_contrast",
    "temperature": "neutral",
    "dominantPalette": [...]
  },
  "audioAnalysis": {
    "tempo_bpm": 128,
    "beats": [...],
    "beat_count": 170
  },
  "grammarRules": {
    "pacing": {"cutRate": 0.89},
    "rhythm": {"tempo_bpm": 128, "isBeatDriven": true},
    "motion": {"avgMagnitude": 0.12},
    "effects": {"effectsPerShot": 0.3}
  }
}
```

### EDL Structure (MonetEDL)

```json
{
  "version": 1,
  "meta": {
    "aspectRatio": "16:9",
    "fps": 30,
    "styleIntensity": 0.7,
    "referenceType": "sports_highlight"
  },
  "assets": {
    "media": {"footage-main": {id, path, duration, width, height}}
  },
  "timeline": {
    "duration": 30.0,
    "tracks": [{
      "id": "video-main",
      "type": "video",
      "clips": [{
        "id": "clip-001",
        "mediaId": "footage-main",
        "startTime": 0.0,
        "duration": 1.12,
        "inPoint": 45.3,
        "outPoint": 46.42,
        "speed": 1.0,
        "effects": ["flash"],
        "transition": {"type": "cut"},
        "colorGrade": {"preset": "high_contrast", "intensity": 0.7},
        "meta": {
          "shotType": "close",
          "cameraMotion": "handheld",
          "semanticEvent": {"narrative_role": "climax"}
        }
      }]
    }]
  }
}
```

### How to Run

```bash
# Single reference
python scripts/monet_pipeline.py \
  --reference "monet-reference-edits/2nd imporatnt.MP4" \
  --footage "test-videos/Steph Curry IGNITES.mp4" \
  --name "steph-curry" \
  --style-intensity 0.7

# Multiple references
python scripts/monet_pipeline.py \
  --references "ref1.mp4" "ref2.mp4" \
  --footage "footage.mp4" \
  --name "my-edit" \
  --blend-strategy weighted_avg
```

---

## Why `e2e-pipeline.py` Output Is "Underedited"

| Problem | Root Cause |
|---------|-----------|
| AI hallucinated content | Vision model saw mosaics but described wrong video |
| JSON parsing failed | Response wrapped in ```markdown fences, regex missed it |
| No content-aware cutting | Segments are evenly spaced, not based on best moments |
| Generic speed patterns | Hardcoded every-4th-segment pattern |
| Keyword-matching color | "warm" → one preset, no per-shot variation |
| No audio handling | Strips audio entirely |
| 30s cap | Hardcoded `min(ref_dur, foot_dur, 30)` |
| Single AI call for everything | One prompt tries to analyze style + content + plan edits |

## What `monet_pipeline.py` Does Better

| Feature | e2e-pipeline | monet_pipeline |
|---------|-------------|----------------|
| Analysis | 1 vision call | 35 specialized analyzers |
| Content understanding | Hallucinated | LLM semantic analysis |
| Cut selection | Time-based | Score-based (motion + semantics + beats) |
| Shot type matching | None | Matches ref distribution |
| Narrative structure | None | Establishing → climax arc |
| Beat sync | None | Snaps cuts to beats |
| Effects | None | Per-shot, type-safe, intensity-scaled |
| Color grading | Keyword match | LUT + curves + wheels, per-shot |
| Audio | Stripped | Beat detection, music overlay |
| Multi-reference | No | DNA blending |
| Output length | 30s cap | Full duration |

---

## Running the Pipeline

### Prerequisites

```bash
# Python AI worker (for detect-cuts, create-mosaic)
pnpm python:ai    # Starts on localhost:8102

# Cloudflare credentials in .dev.vars
CLOUDFLARE_API_TOKEN=cfat_...
CLOUDFLARE_ACCOUNT_ID=24bf285c...
```

### Quick Test (e2e-pipeline)

```bash
python scripts/e2e-pipeline.py \
  "monet-reference-edits/2nd imporatnt.MP4" \
  "test-videos/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4"
```

### Full Pipeline (monet_pipeline)

```bash
python scripts/monet_pipeline.py \
  --reference "monet-reference-edits/2nd imporatnt.MP4" \
  --footage "test-videos/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4" \
  --name "steph-curry-full"
```

Output goes to `scripts/validation-output/e2e-pipeline/` (e2e) or `output/` (monet).
