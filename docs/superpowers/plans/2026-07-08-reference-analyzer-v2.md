# Reference Analyzer V2 — Structural Energy + Climax Detection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve reference analysis so Kove identifies hybrid structure (dialogue setup → climax trigger → rapid montage) instead of returning flat averages.

**Architecture:** Add optional `structuralAnalysis`, `rhythm.structure`, `climax`, and enhanced `intentMapping` fields to the existing ReferenceStyle output. Compute 1-second motion buckets, per-shot motion profiles, and half-split rhythm metrics from the existing FFmpeg frame/scene data. No schema changes, no generation changes.

**Tech Stack:** TypeScript (Node.js server), Python (deep_analysis.py for sanity check only), React (Style Lab display).

## Global Constraints

- Do NOT modify: EDL schema, Simple Editor, Chat Thread, Studio Preview, deep_analysis.py dataclass schemas
- Do NOT remove existing fields: motionEnergyProfile, rhythm, intentMapping, pacing, effects, colorProfile, effectVocabulary, colorGrades, velocityRamps, flashFrames
- Only ADD optional metadata and improve mappings
- No UI polish — make it observable with PASS/WARN badges

---

## Audit Phase

Before writing code, inspect these files and create `REFERENCE-ANALYZER-V2-VERIFY.md`:

### Task 0: Audit & Create Verification Doc

**Files:**
- Create: `REFERENCE-ANALYZER-V2-VERIFY.md`

**Steps:**

- [ ] **Step 1: Inspect where motionEnergyProfile is computed**

In `src/server/services/reference-analysis-service.ts:149`, `motionEnergy` is set from `energyResult.energyCurve`. The `energyCurve` is built in `src/server/lib/energy-analysis.ts:302` as 10 buckets over the timeline.

- [ ] **Step 2: Inspect where dominantPalette is assigned**

In `src/server/services/reference-analysis-service.ts:284`:
```ts
dominantPalette: llmStyle?.dominantPalette ?? ["unknown"],
```
The LLM schema at line 63 expects `dominantPalette` as an array of strings. The Python `deep_analysis.py` returns valid hex via `cluster_palette()` at line 258, but the TypeScript side never calls deep_analysis for palette — it relies on the LLM. The fallback is `["unknown"]`.

- [ ] **Step 3: Inspect where intentMapping is created**

In `src/server/services/reference-analysis-service.ts:295-306`, `intentMapping` is built from `cutFrequency` and `motionEnergy` averages only. No structural split, no variance-based inference. The `genre` field is hardcoded to `"other"`.

- [ ] **Step 4: Check if deep_analysis.py output is used**

The `analyzeReference()` function in `reference-analysis-service.ts` does NOT call `deep_analysis.py`. It calls FFmpeg scene detection, energy analysis, and LLM vision. The Python deep analysis is called separately via `/api/deep-analysis` for footage (not reference). So deep_analysis.py palette data is NOT consumed by reference analysis.

- [ ] **Step 5: Write REFERENCE-ANALYZER-V2-VERIFY.md**

Create the audit document with findings from steps 1-4.

---

## Implementation Tasks

### Task 1: Fix dominantPalette fallback

**Files:**
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: `llmStyle.dominantPalette` from LLM response
- Produces: `style.dominantPalette` as valid hex array or `[]`

- [ ] **Step 1: Add normalizeDominantPalette helper**

Add at the top of `reference-analysis-service.ts`, after the imports:

```ts
function normalizeDominantPalette(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((c): c is string =>
    typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)
  );
}
```

- [ ] **Step 2: Replace dominantPalette assignment in buildReferenceStyle**

In `buildReferenceStyle()` at line 284, change:
```ts
dominantPalette: llmStyle?.dominantPalette ?? ["unknown"],
```
to:
```ts
dominantPalette: normalizeDominantPalette(llmStyle?.dominantPalette),
```

- [ ] **Step 3: Verify no other code depends on `["unknown"]`**

Search for `"unknown"` in reference-style consumers. The Style Lab and generation code should handle empty arrays gracefully.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/reference-analysis-service.ts
git commit -m "fix: normalize dominantPalette to valid hex or empty array"
```

---

### Task 2: Add high-resolution motion profile

**Files:**
- Modify: `src/server/types/reference-style.ts`
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: `energyFrames` (FrameEnergy[]), `sceneResult` (SceneDetectionResult), `totalDuration`
- Produces: `style.structuralAnalysis` with 1s buckets, per-shot profiles, early/late energy

- [ ] **Step 1: Add structuralAnalysis type to ReferenceStyle**

In `src/server/types/reference-style.ts`, add after the `flashFrames` field (around line 164):

```ts
structuralAnalysis?: {
  motionEnergyProfile1s: number[];
  shotMotionProfile: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    meanMotion: number;
    maxMotion: number;
  }>;
  earlyEnergy: number;
  lateEnergy: number;
  energyVarianceRatio: number;
  peakMotionTimestamp?: number;
};
```

- [ ] **Step 2: Build 1-second motion buckets**

In `reference-analysis-service.ts`, add a new function after `buildTraceFromScenes`:

```ts
function buildMotionProfile1s(
  energyFrames: FrameEnergy[],
  totalDuration: number,
  sceneResult: SceneDetectionResult | null
): {
  motionEnergyProfile1s: number[];
  shotMotionProfile: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    meanMotion: number;
    maxMotion: number;
  }>;
  earlyEnergy: number;
  lateEnergy: number;
  energyVarianceRatio: number;
  peakMotionTimestamp?: number;
} {
  const bucketCount = Math.max(1, Math.ceil(totalDuration));
  const motionEnergyProfile1s: number[] = new Array(bucketCount).fill(0);
  const bucketCounts: number[] = new Array(bucketCount).fill(0);

  for (const frame of energyFrames) {
    const bucket = Math.min(bucketCount - 1, Math.floor(frame.timestamp));
    motionEnergyProfile1s[bucket] += frame.motion;
    bucketCounts[bucket]++;
  }

  for (let i = 0; i < bucketCount; i++) {
    if (bucketCounts[i] > 0) {
      motionEnergyProfile1s[i] = motionEnergyProfile1s[i] / bucketCounts[i];
    }
  }

  // Per-shot motion profile
  const shotMotionProfile: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    meanMotion: number;
    maxMotion: number;
  }> = [];

  if (sceneResult && sceneResult.shotDurations.length > 0) {
    let accumulated = 0;
    for (let i = 0; i < sceneResult.shotDurations.length; i++) {
      const dur = sceneResult.shotDurations[i];
      const shotStart = accumulated;
      const shotEnd = accumulated + dur;
      const shotFrames = energyFrames.filter(
        f => f.timestamp >= shotStart && f.timestamp < shotEnd
      );
      const motions = shotFrames.map(f => f.motion);
      shotMotionProfile.push({
        shotIndex: i,
        startTime: shotStart,
        duration: dur,
        meanMotion: motions.length > 0 ? motions.reduce((a, b) => a + b, 0) / motions.length : 0,
        maxMotion: motions.length > 0 ? Math.max(...motions) : 0,
      });
      accumulated += dur;
    }
  }

  // Early/late energy split
  const midpoint = totalDuration / 2;
  const earlyFrames = energyFrames.filter(f => f.timestamp < midpoint);
  const lateFrames = energyFrames.filter(f => f.timestamp >= midpoint);
  const earlyEnergy = earlyFrames.length > 0
    ? earlyFrames.reduce((s, f) => s + f.combined, 0) / earlyFrames.length
    : 0;
  const lateEnergy = lateFrames.length > 0
    ? lateFrames.reduce((s, f) => s + f.combined, 0) / lateFrames.length
    : 0;
  const energyVarianceRatio = earlyEnergy > 0 ? lateEnergy / earlyEnergy : 1;

  // Peak motion timestamp
  let peakMotionTimestamp: number | undefined;
  if (energyFrames.length > 0) {
    const peakFrame = energyFrames.reduce((max, f) =>
      f.motion > max.motion ? f : max, energyFrames[0]);
    peakMotionTimestamp = peakFrame.timestamp;
  }

  return {
    motionEnergyProfile1s,
    shotMotionProfile,
    earlyEnergy,
    lateEnergy,
    energyVarianceRatio,
    peakMotionTimestamp,
  };
}
```

- [ ] **Step 3: Integrate into analyzeReference**

In `analyzeReference()`, after the energy analysis try block (around line 154), add:

```ts
let structuralAnalysis: ReturnType<typeof buildMotionProfile1s> | null = null;
if (energyFrames.length > 0 && totalDuration > 0) {
  structuralAnalysis = buildMotionProfile1s(energyFrames, totalDuration, sceneResult);
}
```

Then after `buildReferenceStyle` (around line 221), add:

```ts
if (structuralAnalysis) {
  style.structuralAnalysis = structuralAnalysis;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/server/types/reference-style.ts src/server/services/reference-analysis-service.ts
git commit -m "feat: add high-resolution structuralAnalysis with 1s motion buckets and per-shot profiles"
```

---

### Task 3: Add shot rhythm split metrics

**Files:**
- Modify: `src/server/types/reference-style.ts`
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: `sceneResult.shotDurations`, `totalDuration`
- Produces: `style.rhythm.structure` with first/second half splits

- [ ] **Step 1: Add rhythm.structure type**

In `src/server/types/reference-style.ts`, inside the `rhythm` interface (around line 19), add:

```ts
structure?: {
  firstHalfAvgShotDuration: number;
  secondHalfAvgShotDuration: number;
  firstHalfCutsPerSecond: number;
  secondHalfCutsPerSecond: number;
  shortestShotDuration: number;
  longestShotDuration: number;
  shotDurationVariance: number;
  accelerationRatio: number;
};
```

- [ ] **Step 2: Build rhythm structure metrics**

In `reference-analysis-service.ts`, add after `buildMotionProfile1s`:

```ts
function buildRhythmStructure(
  shotDurations: number[],
  totalDuration: number
): {
  firstHalfAvgShotDuration: number;
  secondHalfAvgShotDuration: number;
  firstHalfCutsPerSecond: number;
  secondHalfCutsPerSecond: number;
  shortestShotDuration: number;
  longestShotDuration: number;
  shotDurationVariance: number;
  accelerationRatio: number;
} | null {
  if (shotDurations.length < 2) return null;

  const midpoint = totalDuration / 2;
  let accumulated = 0;
  const firstHalfDurations: number[] = [];
  const secondHalfDurations: number[] = [];

  for (const dur of shotDurations) {
    if (accumulated + dur <= midpoint) {
      firstHalfDurations.push(dur);
    } else if (accumured >= midpoint) {
      secondHalfDurations.push(dur);
    } else {
      // Shot spans midpoint — split proportionally
      const firstPart = midpoint - accumulated;
      const secondPart = dur - firstPart;
      if (firstPart > 0.01) firstHalfDurations.push(firstPart);
      if (secondPart > 0.01) secondHalfDurations.push(secondPart);
    }
    accumulated += dur;
  }

  const firstHalfAvg = firstHalfDurations.length > 0
    ? firstHalfDurations.reduce((a, b) => a + b, 0) / firstHalfDurations.length
    : totalDuration;
  const secondHalfAvg = secondHalfDurations.length > 0
    ? secondHalfDurations.reduce((a, b) => a + b, 0) / secondHalfDurations.length
    : totalDuration;

  const firstHalfDuration = Math.min(midpoint, totalDuration);
  const secondHalfDuration = Math.max(0, totalDuration - midpoint);

  const firstHalfCutsPerSecond = firstHalfDuration > 0
    ? firstHalfDurations.length / firstHalfDuration
    : 0;
  const secondHalfCutsPerSecond = secondHalfDuration > 0
    ? secondHalfDurations.length / secondHalfDuration
    : 0;

  const allDurations = shotDurations;
  const shortestShotDuration = Math.min(...allDurations);
  const longestShotDuration = Math.max(...allDurations);
  const mean = allDurations.reduce((a, b) => a + b, 0) / allDurations.length;
  const shotDurationVariance = allDurations.reduce((s, d) => s + (d - mean) ** 2, 0) / allDurations.length;
  const accelerationRatio = firstHalfAvg / (secondHalfAvg + 1e-5);

  return {
    firstHalfAvgShotDuration: firstHalfAvg,
    secondHalfAvgShotDuration: secondHalfAvg,
    firstHalfCutsPerSecond,
    secondHalfCutsPerSecond,
    shortestShotDuration,
    longestShotDuration,
    shotDurationVariance,
    accelerationRatio,
  };
}
```

- [ ] **Step 3: Integrate into buildReferenceStyle**

In `buildReferenceStyle()`, after setting `style.rhythm` (around line 294), add:

```ts
if (cutFrequency.shotDurations) {
  // Not directly available here — pass from caller
}
```

Actually, the `cutFrequency` param only has `cutsPerSecond`, `avgShotDuration`, `variance`. We need to pass `shotDurations` through. Modify `buildReferenceStyle` signature to accept `shotDurations`:

Change the function signature at line 263:
```ts
function buildReferenceStyle(
  referenceId: string,
  duration: number,
  cutFrequency: { cutsPerSecond: number; avgShotDuration: number; variance: number },
  motionEnergy: number[],
  llmStyle: any,
  shotDurations?: number[]
)
```

Then at line 213 where it's called, pass `sceneResult?.shotDurations`:
```ts
const style = buildReferenceStyle(
  referenceId,
  totalDuration,
  cutFrequency,
  motionEnergy,
  llmStyle,
  sceneResult?.shotDurations
);
```

And after `style.rhythm = { ... }` block, add:
```ts
if (shotDurations && shotDurations.length > 0) {
  const structure = buildRhythmStructure(shotDurations, totalDuration);
  if (structure) {
    style.rhythm.structure = structure;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/server/types/reference-style.ts src/server/services/reference-analysis-service.ts
git commit -m "feat: add rhythm.structure with first/second half split metrics"
```

---

### Task 4: Add climax candidate detection

**Files:**
- Modify: `src/server/types/reference-style.ts`
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: structuralAnalysis (earlyEnergy, lateEnergy, energyVarianceRatio), rhythm.structure (accelerationRatio, firstHalfCutsPerSecond, secondHalfCutsPerSecond)
- Produces: `style.climax` with timestamp, confidence, reason, signals

- [ ] **Step 1: Add climax type to ReferenceStyle**

In `src/server/types/reference-style.ts`, add after `structuralAnalysis?`:

```ts
climax?: {
  timestamp: number;
  confidence: number;
  reason: string;
  signals: {
    motionJump: number;
    cutAcceleration: number;
    shotDurationDrop: number;
    peakMotion?: number;
  };
};
```

- [ ] **Step 2: Implement climax detection**

In `reference-analysis-service.ts`, add:

```ts
function detectClimax(
  structuralAnalysis: {
    earlyEnergy: number;
    lateEnergy: number;
    energyVarianceRatio: number;
    peakMotionTimestamp?: number;
    motionEnergyProfile1s: number[];
  },
  rhythmStructure: {
    firstHalfCutsPerSecond: number;
    secondHalfCutsPerSecond: number;
    firstHalfAvgShotDuration: number;
    secondHalfAvgShotDuration: number;
    accelerationRatio: number;
  } | null,
  totalDuration: number
): {
  timestamp: number;
  confidence: number;
  reason: string;
  signals: {
    motionJump: number;
    cutAcceleration: number;
    shotDurationDrop: number;
    peakMotion?: number;
  };
} | null {
  const motionJump = structuralAnalysis.earlyEnergy > 0
    ? structuralAnalysis.lateEnergy / structuralAnalysis.earlyEnergy
    : 1;
  const cutAcceleration = rhythmStructure
    ? rhythmStructure.secondHalfCutsPerSecond / (rhythmStructure.firstHalfCutsPerSecond + 1e-5)
    : 1;
  const shotDurationDrop = rhythmStructure
    ? rhythmStructure.firstHalfAvgShotDuration / (rhythmStructure.secondHalfAvgShotDuration + 1e-5)
    : 1;

  // Score confidence as weighted average of signals
  const motionScore = Math.min(3, motionJump) / 3;
  const cutScore = Math.min(3, cutAcceleration) / 3;
  const durationScore = Math.min(3, shotDurationDrop) / 3;
  const confidence = Math.min(1, (motionScore * 0.35 + cutScore * 0.35 + durationScore * 0.3));

  // Estimate climax timestamp
  // Use peak motion if available, otherwise estimate from energy profile
  let timestamp = totalDuration * 0.5; // default midpoint
  let reason = "estimated from midpoint";

  if (structuralAnalysis.peakMotionTimestamp !== undefined) {
    timestamp = structuralAnalysis.peakMotionTimestamp;
    reason = "peak motion timestamp";
  } else if (structuralAnalysis.motionEnergyProfile1s.length > 0) {
    // Find the bucket where motion jumps significantly
    const profile = structuralAnalysis.motionEnergyProfile1s;
    const avg = profile.reduce((a, b) => a + b, 0) / profile.length;
    for (let i = 1; i < profile.length; i++) {
      if (profile[i] > avg * 1.3 && profile[i - 1] < avg) {
        timestamp = i;
        reason = `motion jump at ${i}s`;
        break;
      }
    }
  }

  if (confidence < 0.2) {
    reason += " (low confidence — signals weak)";
  }

  return {
    timestamp,
    confidence,
    reason,
    signals: {
      motionJump,
      cutAcceleration,
      shotDurationDrop,
      peakMotion: structuralAnalysis.peakMotionTimestamp,
    },
  };
}
```

- [ ] **Step 3: Integrate into analyzeReference**

After computing `structuralAnalysis` and `rhythm.structure`, add:

```ts
if (structuralAnalysis && totalDuration > 0) {
  const rhythmStruct = style.rhythm?.structure;
  const climax = detectClimax(structuralAnalysis, rhythmStruct ?? null, totalDuration);
  if (climax) {
    style.climax = climax;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/server/types/reference-style.ts src/server/services/reference-analysis-service.ts
git commit -m "feat: add climax candidate detection with motion/cut/duration signals"
```

---

### Task 5: Improve intentMapping from structural metrics

**Files:**
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: `cutFrequency`, `rhythm.structure`, `structuralAnalysis`, `climax`
- Produces: enhanced `style.intentMapping` with structure, energyArc, non-undefined pacing

- [ ] **Step 1: Enhance intentMapping building**

In `buildReferenceStyle()`, replace the `intentMapping` block (lines 295-306) with:

```ts
// Infer structure from rhythm split
let structureType: "setup_to_montage" | "uniform_montage" | "dialogue_drama" | "unknown" = "unknown";
let energyArc: "flat" | "build" | "climax_spike" | "decline" = "flat";

// These will be set after rhythm.structure is computed
// For now, use available data
const hasVariance = cutFrequency.variance > 0.3;
const isFastPaced = cutFrequency.avgShotDuration < 1.2;
const isHighCuts = cutFrequency.cutsPerSecond > 0.8;

// Pacing inference — never leave undefined
let inferredPacing: "aggressive" | "fast" | "medium" | "slow" | "varied";
if (isFastPaced || isHighCuts) {
  inferredPacing = cutFrequency.avgShotDuration < 0.5 ? "aggressive" : "fast";
} else if (cutFrequency.avgShotDuration < 2.0) {
  inferredPacing = "medium";
} else {
  inferredPacing = "slow";
}

style.intentMapping = {
  genre: "other",
  pacing: inferredPacing,
  syncToBeat: cutFrequency.cutsPerSecond > 1,
  beatSyncStrength: Math.min(1, cutFrequency.cutsPerSecond / 3),
  colorTreatment: isHighEnergy ? "vibrant" : "raw",
  effectsIntensity: isHighEnergy ? 0.6 : 0.3,
  transitionStyle: cutFrequency.cutsPerSecond > 2 ? "aggressive" : cutFrequency.cutsPerSecond > 1 ? "dynamic" : "smooth",
  avgShotDuration: cutFrequency.avgShotDuration,
  mood: isHighEnergy ? ["energetic", "intense"] : ["calm", "cinematic"],
  contentFocus: [],
};
```

Then, after `style.intentMapping` is set and rhythm.structure is available, enhance it:

```ts
// Post-hoc enhancement using structural data
if (style.rhythm?.structure) {
  const s = style.rhythm.structure;
  const highVariance = s.shotDurationVariance > 0.3;
  const highAccel = s.accelerationRatio > 1.3;

  if (highVariance && highAccel) {
    structureType = "setup_to_montage";
    energyArc = "climax_spike";
  } else if (highAccel) {
    structureType = "uniform_montage";
    energyArc = "build";
  } else if (!isFastPaced && !isHighCuts) {
    structureType = "dialogue_drama";
    energyArc = "flat";
  }

  style.intentMapping.structure = structureType;
  style.intentMapping.energyArc = energyArc;

  // Override pacing if structural data is stronger
  if (s.secondHalfCutsPerSecond > s.firstHalfCutsPerSecond * 1.5) {
    style.intentMapping.pacing = "varied";
  }
}
```

- [ ] **Step 2: Update ReferenceStyle intentMapping type**

In `src/server/types/reference-style.ts`, add to the `intentMapping` interface (around line 193):

```ts
structure?: "setup_to_montage" | "uniform_montage" | "dialogue_drama" | "unknown";
energyArc?: "flat" | "build" | "climax_spike" | "decline";
```

- [ ] **Step 3: Commit**

```bash
git add src/server/types/reference-style.ts src/server/services/reference-analysis-service.ts
git commit -m "feat: enhance intentMapping with structure, energyArc, and inferred pacing"
```

---

### Task 6: Motion extraction sanity check

**Files:**
- Inspect: `workers/python-ai/workers/deep_analysis.py`

**Steps:**

- [ ] **Step 1: Verify deep_analysis.py uses sequential cap.read()**

Check `extract_all_frame_metrics()` at line 143. It already uses `while True: ret, frame = cap.read()` — sequential reads. No `cap.set(cv2.CAP_PROP_POS_FRAMES)` in the main loop. Good.

- [ ] **Step 2: Verify every-frame brightness timeline**

Line 180: `brightness_timeline.append(float(np.mean(gray_full) / 255.0))` — appended every frame. Good.

- [ ] **Step 3: Verify schema unchanged**

16 top-level keys in `AnalysisResult` at line 58. `asdict(result)` at line 336. No changes needed.

- [ ] **Step 4: Verify Farneback parameters**

Line 187-190: `levels=2, winsize=11, iterations=2`. These are reasonable. The spec says "consider levels=3, winsize=13" but only if motion is under-detected. Since this is a sanity check and the Python side already works, do NOT change parameters unless verification shows flat motion.

- [ ] **Step 5: Note findings in REFERENCE-ANALYZER-V2-VERIFY.md**

Append findings: Python deep_analysis.py is correct, no changes needed. The flat motion issue is on the TypeScript side (10-bucket smoothing), not Python.

---

### Task 7: Style Lab display updates

**Files:**
- Modify: `src/routes/style-lab.tsx`

**Interfaces:**
- Consumes: `refStyle.structuralAnalysis`, `refStyle.climax`, `refStyle.rhythm.structure`, `refStyle.intentMapping.structure/energyArc`

- [ ] **Step 1: Add structural analysis display after reference analysis step**

In `style-lab.tsx`, after the existing `ANALYZE-DETAIL` log lines (around line 433), add new logging for structural data:

```ts
// Structural analysis
if (style.structuralAnalysis) {
  const sa = style.structuralAnalysis;
  l("STRUCTURAL", `motionEnergyProfile1s: ${sa.motionEnergyProfile1s.length} buckets`, sa.motionEnergyProfile1s.length > 0);
  l("STRUCTURAL", `shotMotionProfile: ${sa.shotMotionProfile.length} shots`);
  l("STRUCTURAL", `earlyEnergy: ${sa.earlyEnergy.toFixed(3)}, lateEnergy: ${sa.lateEnergy.toFixed(3)}, varianceRatio: ${sa.energyVarianceRatio.toFixed(2)}`);
  if (sa.peakMotionTimestamp !== undefined) {
    l("STRUCTURAL", `peakMotionTimestamp: ${sa.peakMotionTimestamp.toFixed(2)}s`);
  }
}

// Rhythm structure
if (style.rhythm?.structure) {
  const rs = style.rhythm.structure;
  l("RHYTHM-SPLIT", `firstHalf: ${rs.firstHalfAvgShotDuration.toFixed(2)}s avg, ${rs.firstHalfCutsPerSecond.toFixed(2)} cuts/s`);
  l("RHYTHM-SPLIT", `secondHalf: ${rs.secondHalfAvgShotDuration.toFixed(2)}s avg, ${rs.secondHalfCutsPerSecond.toFixed(2)} cuts/s`);
  l("RHYTHM-SPLIT", `shortest: ${rs.shortestShotDuration.toFixed(2)}s, longest: ${rs.longestShotDuration.toFixed(2)}s, variance: ${rs.shotDurationVariance.toFixed(4)}`);
  l("RHYTHM-SPLIT", `accelerationRatio: ${rs.accelerationRatio.toFixed(2)}`, rs.accelerationRatio > 1.3);
}

// Climax
if (style.climax) {
  l("CLIMAX", `timestamp: ${style.climax.timestamp.toFixed(2)}s, confidence: ${style.climax.confidence.toFixed(2)}, reason: ${style.climax.reason}`, style.climax.confidence > 0.3);
}

// Enhanced intentMapping
if (style.intentMapping?.structure) {
  l("INTENT-V2", `structure: ${style.intentMapping.structure}, energyArc: ${style.intentMapping.energyArc}, pacing: ${style.intentMapping.pacing}`);
}

// PASS/WARN badges
const palettes = style.dominantPalette ?? [];
const paletteValid = palettes.length > 0 && palettes.every((c: string) => /^#[0-9a-fA-F]{6}$/.test(c));
l("BADGE", `palette: ${paletteValid ? "PASS" : "WARN"} (${palettes.length} colors)`, paletteValid);

const hasStructuralSplit = (style.rhythm?.structure?.accelerationRatio ?? 1) > 1.3;
l("BADGE", `structural split: ${hasStructuralSplit ? "PASS" : "WARN"}`, hasStructuralSplit);

const hasClimax = (style.climax?.confidence ?? 0) > 0.3;
l("BADGE", `climax candidate: ${hasClimax ? "PASS" : "WARN"}`, hasClimax);

const motionNotFlat = (style.structuralAnalysis?.energyVarianceRatio ?? 1) !== 1;
l("BADGE", `motion profile: ${motionNotFlat ? "PASS" : "WARN"}`, motionNotFlat);

const pacingInferred = style.intentMapping?.pacing !== undefined;
l("BADGE", `pacing inferred: ${pacingInferred ? "PASS" : "WARN"}`, pacingInferred);
```

- [ ] **Step 2: Add structural JSON block**

After the existing `JsonBlock` for ReferenceStyle (line 645), add expandable blocks for the new data:

```ts
{refStyle?.structuralAnalysis && <JsonBlock label="Structural Analysis" data={refStyle.structuralAnalysis} />}
{refStyle?.rhythm?.structure && <JsonBlock label="Rhythm Structure" data={refStyle.rhythm.structure} />}
{refStyle?.climax && <JsonBlock label="Climax Candidate" data={refStyle.climax} />}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/style-lab.tsx
git commit -m "feat: Style Lab displays structural analysis, rhythm splits, climax, and PASS/WARN badges"
```

---

### Task 8: Verification

**Files:**
- Create/Update: `REFERENCE-ANALYZER-V2-VERIFY.md`

**Steps:**

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Fix any type errors. The new optional fields should not break existing code.

- [ ] **Step 2: Run the dev server and test with reference_suits.MP4**

Upload reference_suits.MP4 through Style Lab and verify:

- `/api/analyze-reference` returns 200
- `dominantPalette` is valid hex or `[]`, not `["unknown"]`
- `motionEnergyProfile1s` exists with ~one value per second
- `shotMotionProfile` has entries per detected shot
- `rhythm.structure` shows first/second half split
- `climax` candidate detected with confidence and reason
- `intentMapping.structure` and `intentMapping.energyArc` populated
- `intentMapping.pacing` is not undefined
- No regressions in existing fields

- [ ] **Step 3: Update REFERENCE-ANALYZER-V2-VERIFY.md with results**

Fill in all verification fields from Task 8 of the spec.

- [ ] **Step 4: Final commit**

```bash
git add REFERENCE-ANALYZER-V2-VERIFY.md
git commit -m "docs: Reference Analyzer V2 verification results"
```
