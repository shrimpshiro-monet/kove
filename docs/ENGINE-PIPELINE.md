# Monet Style Replication Engine — Full Pipeline Documentation

> **Last updated:** 2026-07-10 | **Status:** Functional v1 (77.5% similarity) | **Tests:** 134/134 passing

---

## What This Engine Does

Upload a reference video → the system extracts its complete editing DNA → applies that style to new footage → renders a preview. No manual editing required.

**Input:** Reference video + raw footage + music + prompt  
**Output:** Beat-synced, style-matched edit with effects, transitions, text overlays, and color grading

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUTS                              │
│  Reference Video  │  Raw Footage  │  Music  │  Prompt           │
└────────┬──────────┴──────┬────────┴────┬────┴────┬──────────────┘
         │                 │             │         │
         ▼                 ▼             ▼         │
┌────────────────────────────────────────────────┐│
│              REFERENCE ANALYSIS                ││
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐ ││
│  │ FFmpeg   │ │ Gemini   │ │ Perception     │ ││
│  │ Scenes   │ │ LLM      │ │ Plugins        │ ││
│  │ Energy   │ │ Vision   │ │ (Python)       │ ││
│  │ Rhythm   │ │ Analysis │ │                │ ││
│  └────┬─────┘ └────┬─────┘ └───────┬────────┘ ││
│       └─────────────┼───────────────┘          ││
│                     ▼                          ││
│            ┌────────────────┐                  ││
│            │ ReferenceStyle │ ◄────────────────┘│
│            │ (Editing DNA)  │                   │
│            └───────┬────────┘                   │
└────────────────────┼───────────────────────────┘
                     │
┌────────────────────┼───────────────────────────┐
│              DETERMINISTIC ENGINE               │
│                                                 │
│  ┌─────────────┐  ┌──────────────┐             │
│  │ Source       │  │ Timing       │             │
│  │ Orchestrator │  │ Planner      │             │
│  │ (multi-clip) │  │ (beat-aware) │             │
│  └──────┬──────┘  └──────┬───────┘             │
│         └────────┬───────┘                      │
│                  ▼                              │
│  ┌───────────────────────────┐                  │
│  │ Shot Generator            │                  │
│  │ • Effect selection        │                  │
│  │ • Transition assignment   │                  │
│  │ • Text overlay generation │                  │
│  │ • Color grade injection   │                  │
│  └──────────┬────────────────┘                  │
│             ▼                                   │
│  ┌─────────────────────┐                        │
│  │ Smooth Constraints  │ ◄─ minClipDuration    │
│  │ (auto-editor algo)  │                       │
│  └──────────┬──────────┘                        │
│             ▼                                   │
│  ┌─────────────────────────┐                    │
│  │ AI Humanization Pass    │ ◄─ Gemini temp 0.35│
│  │ (optional)              │                    │
│  └──────────┬──────────────┘                    │
│             ▼                                   │
│  ┌─────────────────────────┐                    │
│  │ Post-Processing Chain   │                    │
│  │ • Reference enforcement │                    │
│  │ • Motion continuity     │                    │
│  │ • Beat-lock             │                    │
│  │ • Scene boundary snap   │                    │
│  │ • Color signal effects  │                    │
│  └──────────┬──────────────┘                    │
│             ▼                                   │
│  ┌─────────────────────────┐                    │
│  │ Similarity Scorer       │ ◄─ 5 metrics      │
│  │ (retry up to 3x)        │                   │
│  └──────────┬──────────────┘                    │
└─────────────┼──────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│                    RENDER                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Editly   │  │ Canvas2D │  │ FFmpeg       │  │
│  │ (server) │  │ (browser)│  │ (export)     │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       └──────────────┼──────────────┘           │
│                      ▼                          │
│              ┌──────────────┐                   │
│              │ Preview MP4  │                   │
│              └──────────────┘                   │
└─────────────────────────────────────────────────┘
```

---

## Component Deep Dive

### 1. Reference Analysis Pipeline

**Purpose:** Extract complete editing DNA from a reference video.

**Files:**
- `src/server/services/reference-analysis-service.ts` (1093 lines) — orchestrator
- `src/server/lib/scene-detection.ts` — FFmpeg scene change detection
- `src/server/lib/energy-analysis.ts` — per-frame motion/brightness energy
- `src/server/lib/real-trace-builder.ts` — builds ReferenceEditTrace from FFmpeg data
- `src/server/lib/reference-effect-extractor.ts` — per-shot effect detection
- `src/server/lib/reference-color-extractor.ts` — color grade keyframes
- `src/server/lib/reference-velocity-extractor.ts` — speed ramp detection
- `src/server/lib/flash-frame-detector.ts` — white/black flash detection
- `src/server/lib/text-overlay-extractor.ts` — OpenCV text detection
- `src/server/lib/moment-mapping.ts` — reference → moment-by-moment timeline
- `src/server/lib/effect-vocabulary.ts` — effect instance extraction
- `src/server/director/transition-detector.ts` — cut/crossfade/whip detection
- `src/server/director/camera-motion.ts` — camera motion classification
- `src/server/director/semantic-sequence.ts` — narrative arc detection
- `src/server/lib/python-velocity-bridge.ts` — Python optical flow analysis

**Perception Plugins (Python workers):**
- `workers/python-ai/workers/text_overlay_analyzer.py` — PaddleOCR text detection + animation estimation
- `workers/python-ai/workers/subject_tracker.py` — YOLO + ByteTrack subject tracking
- `workers/python-ai/workers/scene_boundary_analyzer.py` — PySceneDetect validation
- `workers/python-ai/workers/audio_sync_analyzer.py` — librosa beat-cut alignment
- `workers/python-ai/workers/signal_stats_analyzer.py` — FFmpeg signalstats color/flash
- `workers/python-ai/workers/silence_detector.py` — FFmpeg silencedetect (from auto-editor)
- `workers/python-ai/workers/motion_scorer.py` — per-segment motion intensity (from auto-editor)
- `workers/python-ai/workers/audio_normalizer.py` — EBU R128 loudness (from auto-editor)

**TypeScript client:** `src/server/lib/perception-client.ts`

**What gets extracted:**

| Data | Source | Type |
|------|--------|------|
| Cut timestamps + scores | FFmpeg scene detection | REAL |
| Shot durations | FFmpeg scene detection | REAL |
| Energy curve (10 buckets) | FFmpeg frame diff | REAL |
| Beat grid (BPM, onsets) | Python librosa | REAL |
| Reference trace (events) | Scene + energy | REAL |
| Text overlays | PaddleOCR | REAL (animation estimated) |
| Subject tracks | YOLO + ByteTrack | REAL |
| Scene boundaries | PySceneDetect | REAL |
| Audio-visual sync | librosa | REAL |
| Color signal stats | FFmpeg signalstats | REAL |
| Silence analysis | FFmpeg silencedetect | REAL |
| Motion profile | FFmpeg frame diff | REAL |
| Audio normalization | FFmpeg loudnorm | REAL |
| Color palette | Gemini LLM vision | REAL |
| Editing philosophy | Gemini LLM vision | GUESSED |
| Emotional arc | Gemini LLM vision | GUESSED |
| Composition/layering | Gemini LLM vision | GUESSED |
| Text style | Gemini + OpenCV | HYBRID |

**Output:** `ReferenceStyle` object with 15+ sections, stored in D1.

---

### 2. Source Orchestrator

**Purpose:** Select which footage segments go in which shot slots.

**File:** `src/server/director/source-orchestrator.ts`

**Scoring function (0-20 points per candidate):**
```
candidateScore = baseScore * 10                    // 0-10 (footage quality)
  + motionContinuityBonus                          // 0-2 (matches previous shot's motion)
  + subjectMatchBonus                              // 0-3 (reference subject positioning)
  + silenceMotionBonus                             // 0-2 (matches reference silence/motion)
  + faceCenteredBonus                              // 0-1 (reference has centered subject)
  + velocityRampBonus                              // 0-1.5 (reference has speed ramps)
  - semanticVarietyPenalty                         // -1 (same tags as previous)
```

**Constraints:**
- No clip exceeds 40% of total shots (strict) or relaxed if only 1 clip
- No segment repeated within 3-shot window
- Deterministic tiebreaker: prefer lower segment index

---

### 3. Deterministic Style Engine

**Purpose:** Generate complete EDL without Gemini, using reference analysis constraints.

**File:** `src/server/director/style-replicator.ts`

**Pipeline:**
1. **Plan timing slots** — Calculate shot count from avgShotDuration, assign section roles (hook/setup/drop/peak/ending), snap to beat grid
2. **Fill timeline** — Ensure shots cover full target duration
3. **Scene boundary refinement** — Snap cuts to PySceneDetect-detected boundaries
4. **Smooth constraints** — Enforce minClipDuration (0.3s) from auto-editor
5. **Re-snap to beats** — Re-align after smoothing
6. **Map source segments** — Assign footage atoms to timing slots
7. **Select effects** — Based on section role, energy level, reference effect vocabulary
8. **Assign transitions** — Cut/crossfade based on reference transition breakdown
9. **Generate text overlays** — From PaddleOCR reference trace
10. **Apply color metrics** — From OpenCV/signalstats data

**What it reads from ReferenceStyle:**
- `rhythm.avgShotDuration` — shot count calculation
- `rhythm.cutAlignment` — beat-locking strictness
- `rhythm.shotDurationVariance` — hook/setup duration modulation
- `pacing.climaxPosition` — section role boundaries
- `pacing.energyCurve` — energy level per slot
- `effects.commonEffects` — conditional effect placement
- `effects.effectsFrequency` — whether to add effects at all
- `effects.transitionsBreakdown` — cut/crossfade ratio
- `visualStyle.colorGrade` — global color preset
- `visualStyle._colorMetrics` — per-shot color effects
- `editingPhilosophy.summary` — metadata only
- `textOverlayTrace` — text overlay generation
- `subjectTracks` — source selection scoring
- `silenceAnalysis` — silence-aware source scoring
- `motionAnalysis` — motion-aware source scoring
- `velocityRamps` — speed ramp placement
- `flashFrames` — flash effect placement
- `colorSignalStats` — color pulse effects
- `sceneBoundaryTrace` — cut position refinement
- `audioVisualSync` — beat-locking control

---

### 4. AI Humanization Pass

**Purpose:** Add controlled creative micro-decisions that make edits feel crafted.

**Files:**
- `src/server/director/style-replicator.ts` — `humanizeSkeleton()` + `applyDeterministicHumanization()`
- `src/server/prompts/humanize-skeleton.txt` — Gemini prompt for AI humanization

**Deterministic humanization (no AI):**
1. Extend 2 hero/setup shots by 0.2s
2. Shorten 1 montage shot by 0.15s
3. Syncopate 1 beat-locked cut (shorten previous shot by 2 frames)
4. Boost hero shot primary effect intensity (+0.15)
5. Reduce closing shot effect intensity (-0.2)
6. Reflow all start times
7. Preserve total duration

**AI humanization (Gemini at temp 0.35):**
- Picks 2-3 shots to hold longer
- Picks 1-2 shots to shorten
- Adds syncopation (cuts before beats)
- Adjusts effect intensities
- Adds breathing moments

---

### 5. Post-Processing Chain

**Purpose:** Enforce reference constraints and clean up the EDL.

| Step | File | What it does |
|------|------|-------------|
| Reference enforcement | `reference-style-enforcer.ts` | Section-aware duration clamping, transition mix |
| Color injection | `reference-color-injector.ts` | Per-shot color grade from reference keyframes |
| Effect placement | `effect-placement.ts` | Motivated effects based on onsets/drops |
| Motion continuity | `shot-continuity.ts` | Greedy reorder for smooth motion flow |
| Beat-lock | `edl-scoring.ts` | Snap cuts to nearest beat (max 70ms drift) |

---

### 6. Similarity Scorer

**Purpose:** Measure how well the generated EDL matches the reference.

**File:** `src/server/director/reference-similarity.ts`

**5 metrics (weighted):**

| Metric | Weight | How it's measured |
|--------|--------|-------------------|
| avgShotDuration | 20% | Relative difference of averages |
| eventSequence | 20% | Frequency-based effect type comparison |
| energyCurve | 30% | Cosine similarity of 10-bucket energy curves |
| effectDensity | 15% | Effects-per-second difference (excludes color_grade) |
| pacing | 15% | Mean + std + percentile rank comparison |

**Retry loop:** Up to 3 attempts with source rotation (different segment selections per attempt).

---

### 7. Rendering Pipeline

**Purpose:** Convert EDL to playable video.

**Server rendering:** `src/server/lib/render-engine-editly.ts`
- Compiles MonetEDL → EditlySpec
- Maps effects to FFmpeg filter chains (665 lines of filter mappings)
- Maps transitions to Editly/GL transitions (33 types)
- Handles speed ramps, transforms, text overlays
- Outputs preview (854x480) or final (1920x1080) MP4

**Browser preview:** Canvas2D renderer (real-time, no export)

**Export:** FFmpeg via `/api/export-mp4`

---

### 8. OpenReel NLE Bridge

**Purpose:** Export EDL to browser-based NLE for manual tweaking.

**Files:**
- `packages/openreel-adapter/src/edl-to-openreel.ts` — MonetEDL → OpenReelProject
- `packages/openreel-adapter/src/openreel-to-edl.ts` — OpenReelProject → MonetEDL
- Supports: keyframes, effects, transitions, tracks, text overlays

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/analyze-reference` | Extract reference editing DNA |
| `POST /api/analyze` | Analyze raw footage segments |
| `POST /api/replicate-style` | Full deterministic style replication |
| `POST /api/generate-edl` | Gemini-based EDL generation (legacy) |
| `POST /api/refine-edl` | Iterative EDL refinement |
| `POST /api/render-preview` | Render preview MP4 |
| `POST /api/export-mp4` | Export final MP4 |
| `POST /api/style/compile` | Compile text prompt to StyleDNA |

---

## Data Flow — End to End

```
1. User uploads: reference.mp4 + footage.mp4 + music.mp3
2. POST /api/analyze-reference
   → FFmpeg scene detection (cut timestamps, shot durations)
   → FFmpeg energy analysis (motion/brightness per frame)
   → Python librosa (BPM, beats, onsets, drop candidates)
   → Python perception (text overlays, subjects, scene boundaries)
   → Python signalstats (color, flash, saturation curves)
   → Python silence/motion/normalization (auto-editor algorithms)
   → Gemini LLM (visual style, editing philosophy, emotional arc)
   → buildReferenceStyle() merges all data into ReferenceStyle
   → Store in D1

3. POST /api/analyze (footage)
   → Scene detection per clip
   → Segment scoring (motion, emotion, semantic tags)
   → Perception plugins (subjects, velocity, color)

4. POST /api/replicate-style
   → buildSourcePlan() — select segments (subject/silence/motion aware)
   → replicateStyle() — deterministic EDL generation
     → planTimingSlots() — section roles + beat grid
     → fillTimeline() — cover full duration
     → scene boundary refinement
     → smooth constraints (minClipDuration 0.3s)
     → re-snap to beats
     → selectEffectsForShot() — reference-aware effect placement
     → generateTextOverlays() — from PaddleOCR trace
     → selectTransition() — cut/crossfade ratio
   → humanizeSkeleton() — AI at temp 0.35
   → enforceReferenceStyleOnEDL() — section timing
   → enforceMotionContinuity() — motion flow
   → ensureBeatLocksForMusic() — beat sync
   → compareReferenceTraceToEDL() — similarity scoring
   → retry loop (up to 3 attempts with source rotation)
   → Return EDL + similarity + scores

5. POST /api/render-preview
   → monetEDLToEditlySpec() — compile EDL to Editly
   → editly(spec) — FFmpeg render
   → Return preview MP4

6. User downloads preview or exports final
```

---

## Key Files Inventory

### Core Engine (new)
| File | Lines | Purpose |
|------|-------|---------|
| `src/server/director/source-orchestrator.ts` | 200 | Multi-clip segment selection |
| `src/server/director/style-replicator.ts` | 486 | Deterministic EDL generation |
| `src/server/api/replicate-style.ts` | 110 | API endpoint with retry loop |
| `src/server/lib/perception-client.ts` | 190 | Perception plugin orchestration |
| `src/server/prompts/humanize-skeleton.txt` | 27 | AI humanization prompt |

### Reference Analysis (existing + enhanced)
| File | Lines | Purpose |
|------|-------|---------|
| `src/server/services/reference-analysis-service.ts` | 1300+ | Full analysis orchestrator |
| `src/server/lib/scene-detection.ts` | 315 | FFmpeg scene detection |
| `src/server/lib/energy-analysis.ts` | 380 | Per-frame energy |
| `src/server/lib/real-trace-builder.ts` | 262 | ReferenceEditTrace builder |
| `src/server/director/reference-director.ts` | 274 | Gemini prompt builder |
| `src/server/director/reference-similarity.ts` | 284 | Similarity scoring |

### Perception Plugins (Python)
| File | Purpose |
|------|---------|
| `workers/python-ai/workers/text_overlay_analyzer.py` | PaddleOCR text detection |
| `workers/python-ai/workers/subject_tracker.py` | YOLO + ByteTrack |
| `workers/python-ai/workers/scene_boundary_analyzer.py` | PySceneDetect |
| `workers/python-ai/workers/audio_sync_analyzer.py` | librosa beat-sync |
| `workers/python-ai/workers/signal_stats_analyzer.py` | FFmpeg signalstats |
| `workers/python-ai/workers/silence_detector.py` | FFmpeg silencedetect |
| `workers/python-ai/workers/motion_scorer.py` | Motion intensity scoring |
| `workers/python-ai/workers/audio_normalizer.py` | EBU R128 loudness |

### Rendering (existing)
| File | Lines | Purpose |
|------|-------|---------|
| `src/server/lib/render-engine-editly.ts` | 125 | Editly render orchestration |
| `src/server/lib/edl-to-editly.ts` | 384 | EDL → EditlySpec compiler |
| `src/server/lib/editly-effects.ts` | 665 | Effect → FFmpeg filter mapping |
| `src/server/lib/editly-transitions.ts` | 94 | Transition mapping |

### Tests
| File | Tests | Purpose |
|------|-------|---------|
| `src/server/lib/__tests__/source-orchestrator.test.ts` | 7 | Source selection |
| `src/server/lib/__tests__/style-replicator.test.ts` | 11 | EDL generation |
| Total | 134 | Full suite |

---

## Current Performance

**Test case:** SPIDERMAN reference (12 shots, 19s) → Steph Curry footage + bbf.mp3 music

| Metric | Score | Status |
|--------|-------|--------|
| Avg Shot Duration | 96.6% | ✅ Excellent |
| Energy Curve | 94.4% | ✅ Excellent |
| Event Sequence | 86.0% | ✅ Good |
| **Overall** | **77.5%** | ✅ Above 65% threshold |
| Pacing | 51.0% | ⚠️ Histogram shape differs |
| Effect Density | 33.3% | ⚠️ Reference has few effects |

---

## What's Next — Generational Engine Vision

The current engine is a **functional v1 deterministic editor with AI assistance**. The generational leap requires:

1. **Reference Grammar** — Structured editing DNA, not just stats
2. **Candidate Generation** — 5-10 competing EDLs, not one
3. **Footage Atomization** — Searchable edit atoms, not raw clips
4. **Constraint Solver** — LLM = director, Solver = assistant editor
5. **Multi-Judge Scoring** — Structural + Editorial + Render judges
6. **Patch Refinement** — Surgical fixes, not regeneration
7. **Effect Compiler** — Abstract → renderer-specific recipes
8. **Memory of Wins** — Successful edits become reusable cases

**Target pipeline:** understand → plan → construct → style → compile → render → judge → patch (loop)

See `MEMORY.md` Architecture Decisions for the full generational vision.
