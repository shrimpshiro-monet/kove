# REFERENCE-ANALYZER-V2 — Audit Verification

Audit date: 2026-07-08
Auditor: Task 0 subagent

## 1. motionEnergyProfile computation

**Where:** `src/server/services/reference-analysis-service.ts:149`
```ts
motionEnergy = energyResult.energyCurve;
```

**Source:** `src/server/lib/energy-analysis.ts:302` — `buildEnergyCurve()`

- 10 buckets over the timeline, each representing 10% of total duration
- Each bucket averages `combined` energy (motion * 0.65 + brightness * 0.35)
- Frames sampled every 0.5s by default
- Falls back to `[0.5, 0.5, ...]` (10 values) on empty input
- Motion is calculated via mean absolute pixel difference between consecutive grayscale frames (sampled at every Nth byte for speed)
- Brightness is mean luminance of sampled bytes

**Quality notes:**
- Motion calculation uses raw PNG byte sampling (not true pixel decode) — works as a proxy but isn't exact
- `motionEnergyProfile` is stored as-is on the style object (line 282: `motionEnergyProfile: motionEnergy`)
- The `pacing.energyCurve` field on the full ReferenceStyle (line 309) slices to first 10 values: `motionEnergy.slice(0, 10)` — same data

## 2. dominantPalette assignment

**Where:** `src/server/services/reference-analysis-service.ts:284`
```ts
dominantPalette: llmStyle?.dominantPalette ?? ["unknown"],
```

**Source of truth:** LLM (Gemini) response only. The TypeScript side never calls Python for palette.

**Python alternative exists:** `workers/python-ai/workers/deep_analysis.py:258` — `cluster_palette()`
- Uses MiniBatchKMeans on sampled 16x16 resized frames
- Returns valid hex colors (e.g. `#ff8800`)
- 5 cluster centers by default
- Called by `run_deep_analysis()` at line 309, output stored in `AnalysisResult.dominant_palette`

**Gap:** `analyzeReference()` in the TS service does NOT call `deep_analysis.py`. The Python palette data is consumed only by `/api/deep-analysis` (for footage analysis), not reference analysis. Reference palette depends entirely on LLM vision accuracy. Fallback is `["unknown"]`.

## 3. intentMapping construction

**Where:** `src/server/services/reference-analysis-service.ts:295-306`

```ts
style.intentMapping = {
  genre: "other",                           // HARDCODED
  pacing: isFastPaced ? "fast" : ...,       // from cutFrequency only
  syncToBeat: cutFrequency.cutsPerSecond > 1,
  beatSyncStrength: Math.min(1, cutFrequency.cutsPerSecond / 3),
  colorTreatment: isHighEnergy ? "vibrant" : "raw",   // binary from motion avg
  effectsIntensity: isHighEnergy ? 0.6 : 0.3,          // binary
  transitionStyle: cutFrequency.cutsPerSecond > 2 ? "aggressive" : ...,
  avgShotDuration: cutFrequency.avgShotDuration,
  mood: isHighEnergy ? ["energetic", "intense"] : ["calm", "cinematic"],
  energy: isHighEnergy ? "high" : "medium",
};
```

**Issues identified:**
- `genre` is always `"other"` — no inference from LLM or content analysis
- `pacing` derived solely from `avgShotDuration < 1.0` threshold — no structural split
- `colorTreatment` is binary (vibrant vs raw) based on `avgMotion > 0.5 || cutsPerSecond > 1.5`
- `mood` is binary (energetic/intense vs calm/cinematic) — no variance-based inference
- `effectsIntensity` is binary (0.6 vs 0.3) — no frequency weighting
- No use of `energyCurve` variance, `breathingMoments`, or LLM emotional arc data
- The `intentMapping.genre` field in the TypeScript schema (reference-style.ts:169-178) defines 9 valid genres but none are ever selected

## 4. deep_analysis.py usage gap

**Confirmed:** `analyzeReference()` does NOT call `deep_analysis.py`.

The Python deep analysis pipeline (`run_deep_analysis()`) provides:
- `dominant_palette` (hex colors from KMeans clustering)
- `velocity_curve` (optical flow magnitude per frame)
- `color_samples` (HSV brightness/saturation/contrast/temperature per frame)
- `flash_frames` (white/black flash detection)
- `audio` analysis (BPM, beat times, onset detection)
- `pacing` classification (frantic/fast/medium/slow)

None of this data flows into the ReferenceStyle object built by `reference-analysis-service.ts`.

**What IS consumed from Python in reference analysis:**
- `workers/python-ai/color_transfer.py` — called at line 26 for OpenCV color profile (saturation/brightness/contrast/temperature averages), stored as `style.colorProfile`
- `workers/python-ai/text_detector.py` — called at line 38 for text overlay detection

**What is NOT consumed:**
- `deep_analysis.py` palette data
- `deep_analysis.py` velocity/optical flow
- `deep_analysis.py` flash frame detection (TS has its own at `flash-frame-detector.ts`)
- `deep_analysis.py` audio analysis

## 5. Style Lab UI

**Where:** `src/routes/style-lab.tsx` (682 lines)

- Multi-step reference analysis UI with upload → scene detection → analysis → results
- Calls `/api/analyze-reference` for the main analysis
- Displays ReferenceStyle JSON in collapsible blocks
- Provides scene segment selection (manual override of detected segments)
- No integration with `deep_analysis.py` — analysis is purely TS-side + LLM

## Summary of V2 improvement opportunities

| Area | Current state | V2 opportunity |
|------|--------------|----------------|
| Palette | LLM-only, fallback `["unknown"]` | Use Python KMeans palette as primary or fallback |
| intentMapping.genre | Hardcoded `"other"` | LLM genre classification or content-based heuristic |
| intentMapping.pacing | Binary threshold on avgShotDuration | Use energyCurve variance + LLM pacing |
| intentMapping.mood | Binary energetic/calm | Use emotionalArc from LLM + breathingMoments |
| intentMapping.effectsIntensity | Binary 0.6/0.3 | Weight by effectsFrequency + detected effect count |
| Python data reuse | Only color_transfer.py consumed | Integrate velocity, palette, audio BPM |
| motionEnergyProfile | Proxy via byte sampling | Consider true pixel decode or optical flow from Python |

## 6. Motion extraction sanity check — deep_analysis.py

**File:** `workers/python-ai/workers/deep_analysis.py` (367 lines)
**Audit date:** 2026-07-08
**Auditor:** Task 6 subagent

### Step 1: Sequential cap.read() — PASS

`extract_all_frame_metrics()` at line 143 opens `cv2.VideoCapture` once (line 154). The main loop (line 172-175) uses `while True: ret, frame = cap.read()` — sequential reads, no random access. No `cap.set(cv2.CAP_PROP_POS_FRAMES)` anywhere in the function. This is correct for reliable codec support.

### Step 2: Every-frame brightness — PASS

Line 180: `brightness_timeline.append(float(np.mean(gray_full) / 255.0))` is inside the main loop but **outside** any interval gate. Brightness is sampled every single frame. The `flow_interval` (default 3), `color_interval` (default 5), and `palette_interval` (default 5) counters do NOT gate brightness. This is intentional — flash detection (`detect_flash_from_timeline()`) requires per-frame resolution.

### Step 3: Schema unchanged — PASS

`AnalysisResult` dataclass (line 58-74) has 16 top-level fields:
`total_duration`, `fps`, `total_frames`, `width`, `height`, `shots`, `velocity_curve`, `color_samples`, `flash_frames`, `audio`, `cut_frequency`, `avg_shot_duration`, `shot_duration_variance`, `pacing`, `dominant_palette`, `summary`.

Serialized via `asdict(result)` at line 336. No schema drift detected.

### Step 4: Farneback parameters — PASS

Lines 187-190:
```python
cv2.calcOpticalFlowFarneback(
    prev_flow_gray, flow_small, None,
    pyr_scale=0.5, levels=2, winsize=11,
    iterations=2, poly_n=5, poly_sigma=1.2, flags=0,
)
```

Parameters are reasonable for CPU-based optical flow at 320x180 resolution:
- `levels=2`: sufficient pyramid depth for typical video content
- `winsize=11`: good balance between smoothing and detail
- `iterations=2`: adequate convergence without excessive compute
- `poly_n=5, poly_sigma=1.2`: standard Gaussian weighting for polynomial expansion

The spec suggested "consider levels=3, winsize=13" but only if motion is under-detected. Since Python-side motion data works correctly and flat motion issues are on the TypeScript side (10-bucket smoothing in `buildEnergyCurve()`), no parameter changes needed.

### Conclusion

**Python deep_analysis.py is correct. No changes needed.** The flat motion issue observed in reference analysis is a TypeScript-side artifact (10-bucket energy curve smoothing), not a Python extraction problem. The optical flow pipeline correctly uses sequential reads, per-frame brightness, and well-tuned Farneback parameters.

---

## 7. Reference Analyzer V2 — Verification Results

**Date:** 2026-07-08
**Verified by:** Task 8 subagent

### Typecheck

`pnpm turbo typecheck`: 10/11 packages pass. The single failure (`@monet/web`) is pre-existing — all 7 errors are in files NOT modified by V2 (`kove-generation-pipeline.ts`, `media-loader.ts`). V2 server-side packages typecheck clean.

### Implementation verification

| Feature | Status | File(s) |
|---------|--------|---------|
| `dominantPalette` hex normalization | ✅ Done | `reference-analysis-service.ts:284` |
| `structuralAnalysis` (1s energy buckets) | ✅ Done | `energy-analysis.ts:buildHighResEnergyCurve()` |
| `shotMotionProfile` (per-shot motion) | ✅ Done | `scene-detection.ts` + `reference-analysis-service.ts` |
| `rhythm.structure` (first/second half) | ✅ Done | `reference-analysis-service.ts:270-283` |
| `climax` candidate detection | ✅ Done | `reference-analysis-service.ts:285-295` |
| `intentMapping.structure` | ✅ Done | `reference-analysis-service.ts:297-306` |
| `intentMapping.energyArc` | ✅ Done | `reference-analysis-service.ts:307-315` |
| `intentMapping.pacing` (inferred) | ✅ Done | `reference-analysis-service.ts:297-306` |
| Style Lab UI (structural display + badges) | ✅ Done | `style-lab.tsx` |

### What could not be verified (no dev server / footage)

- Live `/api/analyze-reference` response with `reference_suits.MP4`
- Runtime `dominantPalette` output (hex vs `["unknown"]`)
- `motionEnergyProfile1s` length matches video duration
- `shotMotionProfile` entries per detected shot
- `rhythm.structure` first/second half split correctness
- `climax` detection accuracy
- `intentMapping.pacing` value at runtime
- No regressions in existing ReferenceStyle fields

### Existing V2 opportunity table (from Task 0 audit)

The following gaps remain as documented in §5 of this file. V2 addressed palette normalization and intentMapping richness but did NOT close:
- Python `deep_analysis.py` data reuse (palette, velocity, audio BPM)
- True pixel motion extraction (still byte-sampling proxy)
- Genre inference (still hardcoded `"other"`)
