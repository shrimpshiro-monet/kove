# Style Replication Pipeline — File Inventory

> Generated from session fa7b895..HEAD (20 commits, 11 files changed, +4001/-1388 lines)

---

## Files Modified (in this session)

| File | What changed |
|------|-------------|
| `src/server/api/generate-edl.ts` | Empty EDL guard, duration invariant clamping, section fidelity enforcement (V3 + legacy), transition distribution enforcement, diagnostic logging |
| `src/server/types/reference-style.ts` | Added `structuralAnalysis?`, `climax?`, `rhythm.structure?`, `intentMapping.structure?`, `intentMapping.energyArc?` optional fields |

## Files Created (in this session)

| File | Purpose |
|------|---------|
| `src/server/lib/python-velocity-bridge.ts` | Spawns Python deep_analysis.py as subprocess, processes real optical flow velocity into motionEnergyProfile1s + shotMotionProfile |
| `REFERENCE-ANALYZER-V2-VERIFY.md` | Verification document for Reference Analyzer V2 |
| `.superpowers/sdd/task-scene-detection-report.md` | Scene detection fix report |

## Files Modified by Prior Sessions (pre-existing, part of the pipeline)

| File | Role |
|------|------|
| `src/routes/style-lab.tsx` | Style Lab UI — scene thumbnails, structural analysis display, PASS/WARN badges, duration invariant check |
| `src/server/api/detect-scenes.ts` | Scene detection endpoint — thumbnails, segment extraction |
| `src/server/lib/scene-detection.ts` | FFmpeg scene detection, thumbnail extraction, short-shot merging |
| `src/server/lib/edl-generation.ts` | V3 EDL generation — Gemini prompt with structure constraints, section fidelity enforcement, music field patching |
| `src/server/services/reference-analysis-service.ts` | Reference analysis orchestrator — Python velocity bridge, structural analysis, climax detection, rhythm splits |
| `workers/python-ai/workers/deep_analysis.py` | Python deep analysis — PySceneDetect, OpenCV optical flow, Librosa audio, KMeans palette |

---

## Complete Pipeline File Map

### Layer 1: Reference Analysis (input → style DNA)

```
src/server/api/analyze-reference.ts          — HTTP endpoint
src/server/services/reference-analysis-service.ts — orchestrator
src/server/lib/python-velocity-bridge.ts     — Python subprocess bridge
src/server/lib/scene-detection.ts            — FFmpeg scene detection + thumbnails
src/server/lib/energy-analysis.ts            — FFmpeg frame energy (fallback)
src/server/lib/reference-effect-extractor.ts — per-shot effect vocabulary
src/server/lib/reference-color-extractor.ts  — color grade keyframes
src/server/lib/reference-velocity-extractor.ts — velocity ramp detection
src/server/lib/flash-frame-detector.ts       — flash frame detection
src/server/lib/text-overlay-extractor.ts     — text overlay detection
src/server/types/reference-style.ts          — TypeScript types
workers/python-ai/workers/deep_analysis.py   — Python: optical flow, audio, palette
```

### Layer 2: EDL Generation (style DNA → edit)

```
src/server/api/generate-edl.ts               — HTTP endpoint + guards
src/server/lib/edl-generation.ts             — V3 pipeline (Gemini) + validation
src/server/lib/fast-planner.ts               — deterministic fallback planner
src/server/lib/validate-advanced-edl.ts      — Zod schema validation
src/server/lib/effect-mapper.ts              — abstract intent → concrete effects
src/server/lib/reference-style-enforcer.ts   — reference style enforcement
src/server/lib/reference-effect-injector.ts  — inject reference effects
src/server/lib/reference-color-injector.ts   — inject reference color grades
src/server/director/enhance-edl-with-style.ts — style directive post-processor
src/server/director/style-directives.ts      — reference → directive compiler
```

### Layer 3: UI (display + interaction)

```
src/routes/style-lab.tsx                     — Style Lab page
src/server/api/detect-scenes.ts              — scene detection + thumbnails
src/server/api/analyze-reference.ts          — reference analysis endpoint
```

---

## Data Flow

```
Reference Video
  ↓ upload
  ↓ /api/analyze-reference
  ├─ Python deep_analysis.py (optical flow, palette, audio BPM)
  ├─ FFmpeg scene detection + thumbnails
  ├─ Effect vocabulary extraction
  ├─ Color grade extraction
  ├─ Structural analysis (1s motion buckets, per-shot profiles)
  ├─ Rhythm split (first/second half)
  ├─ Climax detection (motion + rhythm signals)
  └─ Intent mapping (structure, energyArc, pacing)
  → ReferenceStyle JSON
  ↓
Raw Footage + Music
  ↓ /api/analyze
  ↓ /api/generate-edl
  ├─ V3 pipeline (Gemini with structure constraints)
  │   ├─ Section fidelity enforcement (pre/post climax effects)
  │   ├─ Transition distribution enforcement (80/20 cut/crossfade)
  │   └─ Duration invariant clamping
  ├─ Fallback: legacy skeleton + fast planner
  │   └─ Same enforcement applied
  └─ Music field patching (id, bpm, beatGrid)
  → MonetEDL JSON
  ↓
Style Lab
  ├─ Filmstrip thumbnails
  ├─ Structural analysis display
  ├─ PASS/WARN badges
  └─ Export MP4
```

---

## Python Dependencies

```
opencv-python-headless>=4.8.0
numpy>=1.22.0
scenedetect[opencv]>=0.6.2
librosa>=0.10.0
scikit-learn>=1.0.0
```

System: `ffmpeg`, `ffprobe`

---

## Commit History

```
c5ef31d feat: wire Python velocity data into reference analysis — real motion profiles
cdfbf3a fix: climax detection edge guards + motion profile diagnostics
42cd7a4 feat: Style Lab shows scene preview thumbnails as filmstrip
4535f89 fix: increase scene detection min_scene_len to reduce over-splitting
6d86a54 fix: enforce reference transition distribution — 80% cuts, 20% crossfades
d7016a0 fix: add section fidelity enforcement to legacy EDL generation path
7c24275 fix: enforce section fidelity — cap pre-climax effects, boost post-climax effects
e602ba3 fix: pass setup_to_montage structure to generation prompt for section fidelity
ca18a37 fix: patch music fields in patchRawEDLForZod for V3 pipeline validation
5b74443 fix: clamp EDL shots to timeline duration invariant
9a354f5 fix: Style Lab validates EDL is non-empty and checks duration invariant
d4eb6d2 fix: add empty EDL guard — never return success with 0 shots
b543645 docs: Reference Analyzer V2 verification results
a204fca feat: Style Lab displays structural analysis, rhythm splits, climax, and PASS/WARN badges
c972b4f feat: enhance intentMapping with structure, energyArc, and inferred pacing
ebb2274 feat: add climax candidate detection with motion/cut/duration signals
12e3522 feat: add rhythm.structure with first/second half split metrics
5d5e56d feat: add high-resolution structuralAnalysis with 1s motion buckets and per-shot profiles
0bb5930 fix: normalize dominantPalette to valid hex or empty array
```
