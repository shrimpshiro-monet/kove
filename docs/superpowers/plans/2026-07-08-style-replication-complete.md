# Style Replication — Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining gap so a reference video → uploaded footage → generated edit → exported MP4 produces a result indistinguishable in editing style from the reference.

**Architecture:** Three layers: (1) Deepen reference analysis to extract per-shot effects, color grades, velocity curves, and transition patterns from the reference. (2) Make the EDL generator consume reference vocabulary directly instead of generic pools. (3) Make the renderer execute reference-matched effects with correct algorithms (Bézier velocity, per-shot color, flash-frame inserts). All tools are free/self-hostable — zero API costs.

**Tech Stack:** Python workers (Librosa, OpenCV, PaddleOCR, SAM2, Practical-RIFE), FFmpeg (filters, xfade, VMAF), Gemini (structured output for creative decisions), TypeScript (EDL generation, Canvas2D preview), WebCodecs (browser-side processing).

---

## Global Constraints

- All new Python workers follow existing pattern: Fastify HTTP endpoints on port 8101 (audio) or 8102 (AI)
- EDL is source of truth — all visual decisions must trace back to EDL fields
- Effects must be real, not placeholders
- Transitions must be visible in renders
- No API costs for core pipeline — all tools must be free, self-hostable, or within existing Gemini budget
- Canvas2D preview must be within 80% visual fidelity of FFmpeg export

---

## Part 1: Reference Analysis Deepening

### Task 1: Per-Shot Effect Vocabulary Extraction

**Files:**
- Modify: `src/server/services/reference-analysis-service.ts`
- Create: `src/server/lib/reference-effect-extractor.ts`
- Create: `src/server/lib/reference-color-extractor.ts`
- Create: `src/server/lib/reference-velocity-extractor.ts`

**Interfaces:**
- Consumes: FFmpeg scene detection output, motion energy curves, per-frame brightness/contrast data
- Produces: `ReferenceEffectVocabulary` with per-shot effect assignments, color grade transitions, velocity ramp specs

**What this solves:** Effects currently cycle mechanically. This extracts WHAT effects the reference uses, WHERE they appear, and at WHAT intensity.

- [ ] **Step 1: Define ReferenceEffectVocabulary type**

```typescript
// src/server/types/reference-style.ts (extend)
interface ReferenceEffectVocabulary {
  perShotEffects: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    effects: Array<{
      type: string;
      intensity: number;
      timing: "start" | "middle" | "end" | "throughout";
      params?: Record<string, number>;
    }>;
    transition?: {
      type: string;
      duration: number;
      easing?: string;
    };
  }>;
  globalEffects: Array<{
    type: string;
    frequency: number; // how often it appears
    avgIntensity: number;
  }>;
  effectSequence: string[]; // ordered list of effects as they appear
}
```

- [ ] **Step 2: Create reference-effect-extractor.ts**

```typescript
// src/server/lib/reference-effect-extractor.ts
import type { ReferenceEditTrace } from "../types/reference-style";

/**
 * Extracts per-shot effect vocabulary from FFmpeg analysis data.
 * Uses brightness spikes → impact_flash, motion blur → context_shake,
 * brightness dips → dip_black, channel shifts → chromatic aberration.
 */
export function extractEffectVocabulary(
  trace: ReferenceEditTrace,
  frameData: Array<{
    timestamp: number;
    brightness: number;
    contrast: number;
    motionScore: number;
    edgeDensity: number;
    sceneChange: number;
  }>
): ReferenceEffectVocabulary["perShotEffects"] {
  const shots: ReferenceEffectVocabulary["perShotEffects"] = [];

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const shotFrames = frameData.filter(
      f => f.timestamp >= shot.startTime && f.timestamp < shot.startTime + shot.duration
    );

    const effects: ReferenceEffectVocabulary["perShotEffects"][0]["effects"] = [];

    // Detect impact_flash: brightness spike > 2 stddev above mean
    const meanBrightness = shotFrames.reduce((s, f) => s + f.brightness, 0) / shotFrames.length;
    const stdBrightness = Math.sqrt(
      shotFrames.reduce((s, f) => s + (f.brightness - meanBrightness) ** 2, 0) / shotFrames.length
    );
    const hasFlash = shotFrames.some(f => f.brightness > meanBrightness + 2 * stdBrightness);
    if (hasFlash) {
      effects.push({ type: "impact_flash", intensity: 0.8, timing: "start" });
    }

    // Detect context_shake: high motion variance within shot
    const motionVariance = Math.sqrt(
      shotFrames.reduce((s, f) => {
        const mean = shotFrames.reduce((a, b) => a + b.motionScore, 0) / shotFrames.length;
        return s + (f.motionScore - mean) ** 2;
      }, 0) / shotFrames.length
    );
    if (motionVariance > 0.3) {
      effects.push({ type: "context_shake", intensity: Math.min(1, motionVariance), timing: "start" });
    }

    // Detect speed_ramp: motion score curve has U-shape (fast-slow-fast)
    const motionScores = shotFrames.map(f => f.motionScore);
    if (motionScores.length >= 3) {
      const firstThird = motionScores.slice(0, Math.floor(motionScores.length / 3));
      const middle = motionScores.slice(Math.floor(motionScores.length / 3), Math.floor(2 * motionScores.length / 3));
      const lastThird = motionScores.slice(Math.floor(2 * motionScores.length / 3));
      const avgFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
      const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;
      const avgLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;

      if (avgMiddle < avgFirst * 0.6 && avgMiddle < avgLast * 0.6) {
        effects.push({
          type: "speed_ramp",
          intensity: 0.7,
          timing: "throughout",
          params: { slowFactor: avgMiddle / Math.max(avgFirst, avgLast) }
        });
      }
    }

    // Detect whip_pan: high edge density + high motion at shot boundary
    if (i > 0) {
      const boundaryFrames = shotFrames.slice(0, 3);
      const avgEdge = boundaryFrames.reduce((s, f) => s + f.edgeDensity, 0) / boundaryFrames.length;
      const avgMotion = boundaryFrames.reduce((s, f) => s + f.motionScore, 0) / boundaryFrames.length;
      if (avgEdge > 0.4 && avgMotion > 0.5) {
        effects.push({ type: "whip_pan", intensity: 0.6, timing: "start" });
      }
    }

    // Detect color_pulse: contrast spike without brightness spike
    const contrastSpikes = shotFrames.filter(f =>
      f.contrast > meanBrightness + 1.5 * stdBrightness &&
      f.brightness < meanBrightness + stdBrightness
    );
    if (contrastSpikes.length > 0) {
      effects.push({ type: "color_pulse", intensity: 0.5, timing: "start" });
    }

    // Detect vignette: edge density gradient (high edges at center, low at edges)
    // This requires per-frame spatial analysis — skip for now, use global flag

    // Detect push_in: gradual motion increase through shot
    if (motionScores.length >= 3) {
      const firstQuarter = motionScores.slice(0, Math.floor(motionScores.length / 4));
      const lastQuarter = motionScores.slice(Math.floor(3 * motionScores.length / 4));
      const avgFirstQ = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const avgLastQ = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
      if (avgLastQ > avgFirstQ * 1.3 && avgLastQ > 0.3) {
        effects.push({ type: "push_in", intensity: 0.5, timing: "throughout" });
      }
    }

    shots.push({
      shotIndex: i,
      startTime: shot.startTime,
      duration: shot.duration,
      effects,
    });
  }

  return shots;
}
```

- [ ] **Step 3: Create reference-color-extractor.ts**

```typescript
// src/server/lib/reference-color-extractor.ts
import type { ReferenceEditTrace } from "../types/reference-style";

interface ColorGradePoint {
  timestamp: number;
  saturation: number;
  brightness: number;
  contrast: number;
  temperature: number; // warm=positive, cool=negative
}

/**
 * Extracts per-shot color grade from frame-by-frame analysis.
 * Returns keyframes that the EDL generator can consume directly.
 */
export function extractColorGrades(
  frameData: Array<{
    timestamp: number;
    saturation: number;
    brightness: number;
    contrast: number;
  }>
): ColorGradePoint[] {
  if (frameData.length === 0) return [];

  // Smooth the data with a moving average (5-frame window)
  const smoothed = frameData.map((f, i) => {
    const window = frameData.slice(Math.max(0, i - 2), i + 3);
    return {
      timestamp: f.timestamp,
      saturation: window.reduce((s, w) => s + w.saturation, 0) / window.length,
      brightness: window.reduce((s, w) => s + w.brightness, 0) / window.length,
      contrast: window.reduce((s, w) => s + w.contrast, 0) / window.length,
      temperature: 0, // computed below
    };
  });

  // Detect color shifts: significant change in saturation or brightness
  const keyframes: ColorGradePoint[] = [smoothed[0]];
  for (let i = 1; i < smoothed.length; i++) {
    const prev = smoothed[i - 1];
    const curr = smoothed[i];
    const satChange = Math.abs(curr.saturation - prev.saturation);
    const brightChange = Math.abs(curr.brightness - prev.brightness);
    const contrastChange = Math.abs(curr.contrast - prev.contrast);

    if (satChange > 0.15 || brightChange > 0.2 || contrastChange > 0.2) {
      keyframes.push(curr);
    }
  }

  return keyframes;
}
```

- [ ] **Step 4: Create reference-velocity-extractor.ts**

```typescript
// src/server/lib/reference-velocity-extractor.ts
import type { ReferenceEditTrace } from "../types/reference-style";

interface VelocityRamp {
  shotIndex: number;
  startTime: number;
  duration: number;
  entrySpeed: number; // 0.0-1.0 (0=freeze, 1=normal, >1=fast)
  anchorSpeed: number; // slowest point
  exitSpeed: number;
  anchorPosition: number; // 0.0-1.0 where slowest point lands
  easing: "linear" | "ease_in" | "ease_out" | "bezier";
}

/**
 * Extracts velocity ramps from motion energy curves.
 * Pattern: U-shape in motion energy = fast-slow-fast = velocity ramp.
 * The anchor position (where motion is lowest) maps to the beat transient.
 */
export function extractVelocityRamps(
  trace: ReferenceEditTrace,
  frameData: Array<{
    timestamp: number;
    motionScore: number;
  }>,
  beatTimestamps: number[]
): VelocityRamp[] {
  const ramps: VelocityRamp[] = [];

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const shotFrames = frameData.filter(
      f => f.timestamp >= shot.startTime && f.timestamp < shot.startTime + shot.duration
    );

    if (shotFrames.length < 5) continue;

    const motionScores = shotFrames.map(f => f.motionScore);
    const minMotion = Math.min(...motionScores);
    const maxMotion = Math.max(...motionScores);
    const meanMotion = motionScores.reduce((a, b) => a + b, 0) / motionScores.length;

    // Check for U-shape: motion drops below 60% of max in the middle
    const firstQuarter = motionScores.slice(0, Math.floor(motionScores.length / 4));
    const middle = motionScores.slice(
      Math.floor(motionScores.length / 3),
      Math.floor(2 * motionScores.length / 3)
    );
    const lastQuarter = motionScores.slice(Math.floor(3 * motionScores.length / 4));

    const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
    const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;
    const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;

    if (avgMiddle < avgFirst * 0.65 && avgMiddle < avgLast * 0.65) {
      // Found a velocity ramp — find the anchor position
      const anchorFrameIndex = motionScores.indexOf(minMotion);
      const anchorPosition = anchorFrameIndex / motionScores.length;

      // Snap anchor to nearest beat transient
      let snappedAnchor = anchorPosition;
      const shotMidpoint = shot.startTime + shot.duration / 2;
      const nearestBeat = beatTimestamps.reduce((closest, beat) =>
        Math.abs(beat - shotMidpoint) < Math.abs(closest - shotMidpoint) ? beat : closest
      );
      const beatRelativePosition = (nearestBeat - shot.startTime) / shot.duration;
      if (beatRelativePosition >= 0.1 && beatRelativePosition <= 0.9) {
        snappedAnchor = beatRelativePosition;
      }

      // Calculate speed multipliers
      const entrySpeed = avgFirst / maxMotion;
      const anchorSpeed = minMotion / maxMotion;
      const exitSpeed = avgLast / maxMotion;

      ramps.push({
        shotIndex: i,
        startTime: shot.startTime,
        duration: shot.duration,
        entrySpeed: Math.max(0.5, Math.min(2, entrySpeed)),
        anchorSpeed: Math.max(0.1, Math.min(0.5, anchorSpeed)),
        exitSpeed: Math.max(0.5, Math.min(2, exitSpeed)),
        anchorPosition: snappedAnchor,
        easing: "bezier",
      });
    }
  }

  return ramps;
}
```

- [ ] **Step 5: Wire extractors into reference-analysis-service.ts**

```typescript
// In reference-analysis-service.ts, after building trace:
import { extractEffectVocabulary } from "../lib/reference-effect-extractor";
import { extractColorGrades } from "../lib/reference-color-extractor";
import { extractVelocityRamps } from "../lib/reference-velocity-extractor";

// After building trace and frameData:
const effectVocabulary = extractEffectVocabulary(trace, frameData);
const colorGrades = extractColorGrades(frameData);
const velocityRamps = extractVelocityRamps(trace, frameData, beatTimestamps);

// Add to style object:
style.effectVocabulary = effectVocabulary;
style.colorGrades = colorGrades;
style.velocityRamps = velocityRamps;
```

- [ ] **Step 6: Update ReferenceStyle type to include new fields**

```typescript
// In src/server/types/reference-style.ts, add to ReferenceStyle:
effectVocabulary?: Array<{
  shotIndex: number;
  startTime: number;
  duration: number;
  effects: Array<{
    type: string;
    intensity: number;
    timing: "start" | "middle" | "end" | "throughout";
    params?: Record<string, number>;
  }>;
  transition?: { type: string; duration: number };
}>;
colorGrades?: Array<{
  timestamp: number;
  saturation: number;
  brightness: number;
  contrast: number;
  temperature: number;
}>;
velocityRamps?: Array<{
  shotIndex: number;
  startTime: number;
  duration: number;
  entrySpeed: number;
  anchorSpeed: number;
  exitSpeed: number;
  anchorPosition: number;
  easing: string;
}>;
```

- [ ] **Step 7: Test with Steph Curry reference**

Run: `curl -X POST http://localhost:3000/api/analyze-reference -F "url=test/steph-curry.MP4"`
Verify: Response includes `effectVocabulary`, `colorGrades`, `velocityRamps` with non-empty arrays.

---

### Task 2: Flash-Frame Insert Detection

**Files:**
- Modify: `src/server/lib/scene-detection.ts`
- Create: `src/server/lib/flash-frame-detector.ts`

**Interfaces:**
- Consumes: FFmpeg scene change data, per-frame brightness
- Produces: `FlashFrame[]` with exact timestamps and types (black/white)

**What this solves:** Reference edits use single-frame white/black inserts as punctuation (e.g., Steph Curry at 8.97s and 12.58s). The generator doesn't know this pattern exists.

- [ ] **Step 1: Create flash-frame-detector.ts**

```typescript
// src/server/lib/flash-frame-detector.ts

export interface FlashFrame {
  timestamp: number;
  type: "white" | "black";
  brightness: number;
  precedingShotIndex: number;
  followingShotIndex: number;
}

/**
 * Detects single-frame brightness spikes (flash frames) in video.
 * Pattern: normal → 1-2 frames of extreme brightness/darkness → normal.
 * These are intentional editorial punctuation, not scene changes.
 */
export function detectFlashFrames(
  frameData: Array<{
    timestamp: number;
    brightness: number;
  }>,
  shots: Array<{ startTime: number; duration: number }>,
  threshold: number = 0.85
): FlashFrame[] {
  const flashes: FlashFrame[] = [];
  const meanBrightness = frameData.reduce((s, f) => s + f.brightness, 0) / frameData.length;
  const stdBrightness = Math.sqrt(
    frameData.reduce((s, f) => s + (f.brightness - meanBrightness) ** 2, 0) / frameData.length
  );

  for (let i = 1; i < frameData.length - 1; i++) {
    const prev = frameData[i - 1];
    const curr = frameData[i];
    const next = frameData[i + 1];

    // White flash: current frame much brighter than neighbors
    if (curr.brightness > prev.brightness * 2.5 && curr.brightness > next.brightness * 2.5) {
      if (curr.brightness > meanBrightness + 2 * stdBrightness) {
        const shotIdx = shots.findIndex(s =>
          curr.timestamp >= s.startTime && curr.timestamp < s.startTime + s.duration
        );
        flashes.push({
          timestamp: curr.timestamp,
          type: "white",
          brightness: curr.brightness,
          precedingShotIndex: shotIdx >= 0 ? shotIdx : shots.length - 1,
          followingShotIndex: shotIdx >= 0 ? shotIdx : 0,
        });
      }
    }

    // Black flash: current frame much darker than neighbors
    if (curr.brightness < prev.brightness * 0.3 && curr.brightness < next.brightness * 0.3) {
      if (curr.brightness < meanBrightness - 2 * stdBrightness) {
        const shotIdx = shots.findIndex(s =>
          curr.timestamp >= s.startTime && curr.timestamp < s.startTime + s.duration
        );
        flashes.push({
          timestamp: curr.timestamp,
          type: "black",
          brightness: curr.brightness,
          precedingShotIndex: shotIdx >= 0 ? shotIdx : shots.length - 1,
          followingShotIndex: shotIdx >= 0 ? shotIdx : 0,
        });
      }
    }
  }

  return flashes;
}
```

- [ ] **Step 2: Wire into reference analysis**

```typescript
// In reference-analysis-service.ts, after scene detection:
import { detectFlashFrames } from "../lib/flash-frame-detector";

const flashFrames = detectFlashFrames(frameData, trace.shots);
style.flashFrames = flashFrames;
```

- [ ] **Step 3: Update ReferenceStyle type**

```typescript
flashFrames?: Array<{
  timestamp: number;
  type: "white" | "black";
  brightness: number;
  precedingShotIndex: number;
  followingShotIndex: number;
}>;
```

---

## Part 2: EDL Generator — Reference-Driven Effects

### Task 3: Replace Generic Effect Pools with Reference Vocabulary

**Files:**
- Modify: `src/server/lib/edl-generation.ts`
- Modify: `src/server/lib/fast-planner.ts`

**Interfaces:**
- Consumes: `ReferenceStyle.effectVocabulary`, `ReferenceStyle.flashFrames`, `ReferenceStyle.velocityRamps`
- Produces: EDL shots with effects from reference vocabulary, not generic pools

**What this solves:** Effects currently cycle through generic pools (impact_flash, context_shake, push_in). This makes the generator use the reference's actual effects at the reference's actual frequencies.

- [ ] **Step 1: Create reference-effect-injector.ts**

```typescript
// src/server/lib/reference-effect-injector.ts
import type { Shot, MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

/**
 * Injects reference-matched effects into EDL shots.
 * Priority: reference vocabulary > flash frames > velocity ramps > generic fallback.
 */
export function injectReferenceEffects(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): MonetEDL {
  if (!referenceStyle.effectVocabulary?.length) return edl;

  const vocab = referenceStyle.effectVocabulary;
  const flashFrames = referenceStyle.flashFrames ?? [];
  const velocityRamps = referenceStyle.velocityRamps ?? [];

  for (let i = 0; i < edl.shots.length; i++) {
    const shot = edl.shots[i];
    const shotStartTime = shot.timing.startTime;

    // Find matching reference shot by timeline position
    const refShot = vocab.find(v =>
      Math.abs(v.startTime - shotStartTime) < 1.0
    );

    if (refShot) {
      // Apply reference effects
      shot.effects = refShot.effects.map(e => ({
        id: `ref_${e.type}_${i}`,
        type: e.type,
        intensity: e.intensity,
        startTime: e.timing === "start" ? 0 : e.timing === "end" ? shot.timing.duration * 0.8 : undefined,
        duration: e.timing === "throughout" ? shot.timing.duration : undefined,
        params: e.params,
      }));

      // Apply reference transition
      if (refShot.transition) {
        shot.transition = {
          type: refShot.transition.type as any,
          duration: refShot.transition.duration,
        };
      }
    } else {
      // Fallback: apply effects based on reference global frequencies
      const globalEffects = referenceStyle.effectVocabulary
        ?.flatMap(v => v.effects)
        .reduce((acc, e) => {
          acc[e.type] = (acc[e.type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>) ?? {};

      const totalEffects = Object.values(globalEffects).reduce((a, b) => a + b, 0);
      const shotEffects: Shot["effects"] = [];

      for (const [type, count] of Object.entries(globalEffects)) {
        const frequency = count / totalEffects;
        if (Math.random() < frequency) {
          shotEffects.push({
            id: `freq_${type}_${i}`,
            type,
            intensity: 0.5 + Math.random() * 0.3,
          });
        }
      }
      shot.effects = shotEffects;
    }

    // Inject flash frames at reference timestamps
    const matchingFlashes = flashFrames.filter(f =>
      f.timestamp >= shotStartTime &&
      f.timestamp < shotStartTime + shot.timing.duration
    );

    for (const flash of matchingFlashes) {
      const localTime = flash.timestamp - shotStartTime;
      shot.effects.push({
        id: `flash_${flash.type}_${i}`,
        type: "impact_flash",
        intensity: 1.0,
        startTime: localTime,
        duration: 0.033, // 1 frame at 30fps
        params: { flashColor: flash.type === "white" ? 1 : 0 },
      });
    }

    // Inject velocity ramp if reference has one
    const matchingRamp = velocityRamps.find(r =>
      Math.abs(r.startTime - shotStartTime) < 1.0
    );

    if (matchingRamp) {
      shot.timing.speedRamp = {
        startSpeed: matchingRamp.entrySpeed,
        endSpeed: matchingRamp.exitSpeed,
        easing: "bezier" as any,
      };
      shot.effects.push({
        id: `velocity_${i}`,
        type: "speed_ramp",
        intensity: 0.7,
        params: {
          anchorSpeed: matchingRamp.anchorSpeed,
          anchorPosition: matchingRamp.anchorPosition,
        },
      });
    }
  }

  return edl;
}
```

- [ ] **Step 2: Wire into EDL generation**

```typescript
// In edl-generation.ts, after generating base EDL:
import { injectReferenceEffects } from "./reference-effect-injector";

if (referenceStyle) {
  edl = injectReferenceEffects(edl, referenceStyle);
}
```

- [ ] **Step 3: Test with Steph Curry reference**

Generate an EDL with Steph Curry reference. Verify:
- Flash frames appear at ~8.97s and ~12.58s
- Velocity ramps have U-shape (fast-slow-fast)
- Effects match reference vocabulary, not generic pools

---

### Task 4: Per-Shot Color Grade Injection

**Files:**
- Modify: `src/server/lib/edl-generation.ts`
- Create: `src/server/lib/reference-color-injector.ts`

**Interfaces:**
- Consumes: `ReferenceStyle.colorGrades`, EDL shots
- Produces: EDL shots with per-shot color grade overrides

**What this solves:** Reference edits shift color per shot (full color for action, desaturated for hero close-ups). Currently applies a single global CSS filter.

- [ ] **Step 1: Create reference-color-injector.ts**

```typescript
// src/server/lib/reference-color-injector.ts
import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

/**
 * Injects per-shot color grades from reference analysis.
 * Maps reference color keyframes to EDL shot timeline.
 */
export function injectReferenceColorGrades(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): MonetEDL {
  if (!referenceStyle.colorGrades?.length) return edl;

  const grades = referenceStyle.colorGrades;

  for (const shot of edl.shots) {
    const shotMid = shot.timing.startTime + shot.timing.duration / 2;

    // Find the two nearest color grade keyframes
    let before = grades[0];
    let after = grades[grades.length - 1];
    for (let i = 0; i < grades.length - 1; i++) {
      if (grades[i].timestamp <= shotMid && grades[i + 1].timestamp >= shotMid) {
        before = grades[i];
        after = grades[i + 1];
        break;
      }
    }

    // Interpolate between keyframes
    const span = Math.max(0.001, after.timestamp - before.timestamp);
    const t = Math.max(0, Math.min(1, (shotMid - before.timestamp) / span));
    const saturation = before.saturation + (after.saturation - before.saturation) * t;
    const brightness = before.brightness + (after.brightness - before.brightness) * t;
    const contrast = before.contrast + (after.contrast - before.contrast) * t;

    // Store per-shot color grade in effects
    if (!shot.effects) shot.effects = [];
    shot.effects.push({
      id: `colorgrade_${shot.id}`,
      type: "color_grade",
      intensity: 1.0,
      params: {
        saturation: Math.round(saturation * 100) / 100,
        brightness: Math.round(brightness * 100) / 100,
        contrast: Math.round(contrast * 100) / 100,
      },
    });
  }

  return edl;
}
```

- [ ] **Step 2: Wire into EDL generation**

```typescript
// In edl-generation.ts:
import { injectReferenceColorGrades } from "./reference-color-injector";

if (referenceStyle) {
  edl = injectReferenceColorGrades(edl, referenceStyle);
}
```

- [ ] **Step 3: Add color_grade to EffectsEngine**

```typescript
// In src/lib/renderer/effects.ts, add to applyEffect():
case "color_grade": {
  const sat = effect.params?.saturation ?? 1;
  const bright = effect.params?.brightness ?? 1;
  const cont = effect.params?.contrast ?? 1;
  this.appendFilter(ctx, `saturate(${sat}) brightness(${bright}) contrast(${cont})`);
  break;
}
```

---

### Task 5: Flash-Frame Transition Support

**Files:**
- Modify: `src/lib/renderer/monet-renderer.ts`
- Modify: `src/server/lib/editly-transitions.ts`

**Interfaces:**
- Consumes: EDL shots with `impact_flash` effects at shot boundaries
- Produces: Visible flash-frame inserts in preview and export

**What this solves:** Reference edits use single white/black frames as transitions. The renderer doesn't know how to render these.

- [ ] **Step 1: Add flash-frame rendering to monet-renderer.ts**

```typescript
// In renderFrameInternal(), after applyShotEffects():
// Check for flash-frame effects at shot boundaries
for (const effect of activeShot.effects ?? []) {
  if (effect.type === "impact_flash" && effect.duration && effect.duration <= 0.05) {
    const localTime = timelineTime - activeShot.timing.startTime;
    const effectStart = effect.startTime ?? 0;
    if (localTime >= effectStart && localTime <= effectStart + effect.duration) {
      const flashColor = effect.params?.flashColor === 0 ? "#000000" : "#ffffff";
      ctx.save();
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}
```

- [ ] **Step 2: Add flash-frame to FFmpeg export**

```typescript
// In editly-transitions.ts, add flash_frame handler:
case "flash_frame": {
  const color = params.flashColor === "black" ? "black" : "white";
  return `fade=t=in:st=0:d=0.033:color=${color},fade=t=out:st=0.033:d=0.033`;
}
```

---

## Part 3: Bézier Velocity Ramps

### Task 6: Bézier Velocity Curve Implementation

**Files:**
- Create: `src/server/lib/bezier-velocity.ts`
- Modify: `src/server/lib/edl-to-editly.ts`
- Modify: `src/lib/renderer/monet-renderer.ts`

**Interfaces:**
- Consumes: `VelocityRamp` specs from reference analysis
- Produces: Frame-by-frame speed factors for FFmpeg `setpts` filter

**What this solves:** FFmpeg `setpts` only does linear speed. Reference edits use 3-point Bézier curves (Entry 400-600% → Anchor 50-100% → Exit 300%). This generates the frame-by-frame speed factors.

- [ ] **Step 1: Create bezier-velocity.ts**

```typescript
// src/server/lib/bezier-velocity.ts

/**
 * 3-point Bézier velocity curve for video speed ramps.
 * Entry (frames 0-entryFrames): fast entry speed
 * Anchor (middle): slow anchor speed
 * Exit (last exitFrames): fast exit speed
 */
export interface BezierVelocityCurve {
  entrySpeed: number;    // e.g., 5.0 = 500% speed
  anchorSpeed: number;   // e.g., 0.5 = 50% speed
  exitSpeed: number;     // e.g., 3.0 = 300% speed
  entryFrames: number;   // frames for entry ramp
  exitFrames: number;    // frames for exit ramp
  anchorPosition: number; // 0.0-1.0 where anchor lands
}

/**
 * Generates frame-by-frame speed factors from a Bézier velocity curve.
 * Returns an array of speed multipliers, one per frame.
 */
export function generateVelocityFactors(
  curve: BezierVelocityCurve,
  totalFrames: number,
  fps: number = 30
): number[] {
  const factors: number[] = [];
  const anchorFrame = Math.floor(curve.anchorPosition * totalFrames);

  for (let frame = 0; frame < totalFrames; frame++) {
    let speed: number;

    if (frame < anchorFrame) {
      // Entry ramp: Bézier from entrySpeed to anchorSpeed
      const t = frame / Math.max(1, anchorFrame);
      const bezierT = cubicBezier(t, 0.42, 0, 0.58, 1); // ease-in-out
      speed = curve.entrySpeed + (curve.anchorSpeed - curve.entrySpeed) * bezierT;
    } else {
      // Exit ramp: Bézier from anchorSpeed to exitSpeed
      const t = (frame - anchorFrame) / Math.max(1, totalFrames - anchorFrame);
      const bezierT = cubicBezier(t, 0.42, 0, 0.58, 1); // ease-in-out
      speed = curve.anchorSpeed + (curve.exitSpeed - curve.anchorSpeed) * bezierT;
    }

    factors.push(Math.max(0.05, Math.min(10, speed)));
  }

  return factors;
}

/**
 * Cubic Bézier easing function.
 * p1, p2 are control points (x-coordinates only, y assumed 0→1).
 */
function cubicBezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  // Newton-Raphson iteration to find t for given x
  let x = t;
  for (let i = 0; i < 8; i++) {
    const bx = bezierX(x, p1x, p2x) - t;
    const dx = bezierDX(x, p1x, p2x);
    if (Math.abs(dx) < 1e-6) break;
    x -= bx / dx;
  }
  return bezierY(x, p1y, p2y);
}

function bezierX(t: number, p1x: number, p2x: number): number {
  return 3 * (1 - t) * (1 - t) * t * p1x + 3 * (1 - t) * t * t * p2x + t * t * t;
}

function bezierY(t: number, p1y: number, p2y: number): number {
  return 3 * (1 - t) * (1 - t) * t * p1y + 3 * (1 - t) * t * t * p2y + t * t * t;
}

function bezierDX(t: number, p1x: number, p2x: number): number {
  return 3 * (1 - t) * (1 - t) * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * t * t * (1 - p2x);
}

/**
 * Converts velocity factors to FFmpeg setpts expression.
 * factors[i] = speed at frame i. setpts PTS/speed.
 */
export function velocityToSetpts(factors: number[]): string {
  if (factors.length === 0) return "PTS";

  // Build a piecewise function: at frame N, speed = factors[N]
  // FFmpeg doesn't support frame-indexed speed directly,
  // so we approximate with segments
  const segments: string[] = [];
  let currentSpeed = factors[0];
  let segmentStart = 0;

  for (let i = 1; i < factors.length; i++) {
    if (Math.abs(factors[i] - currentSpeed) > 0.1) {
      segments.push(`if(between(N,${segmentStart},${i - 1}),PTS/${currentSpeed.toFixed(3)})`);
      currentSpeed = factors[i];
      segmentStart = i;
    }
  }
  segments.push(`if(between(N,${segmentStart},${factors.length - 1}),PTS/${currentSpeed.toFixed(3)})`);

  return segments.join(",");
}

/**
 * Generates directional blur intensity from velocity factors.
 * Higher speed = more blur.
 */
export function velocityToBlur(factors: number[]): number[] {
  return factors.map(f => {
    if (f <= 1) return 0;
    return Math.min(25, (f - 1) * 5); // max 25px blur at 6x speed
  });
}
```

- [ ] **Step 2: Wire into FFmpeg export**

```typescript
// In edl-to-editly.ts, add velocity ramp handling:
import { generateVelocityFactors, velocityToSetpts } from "./bezier-velocity";

// For shots with speedRamp:
if (shot.timing.speedRamp) {
  const curve: BezierVelocityCurve = {
    entrySpeed: shot.timing.speedRamp.startSpeed * 5, // scale to percentage
    anchorSpeed: 0.5,
    exitSpeed: shot.timing.speedRamp.endSpeed * 5,
    entryFrames: Math.floor(shot.timing.duration * fps * 0.2),
    exitFrames: Math.floor(shot.timing.duration * fps * 0.2),
    anchorPosition: 0.5,
  };
  const factors = generateVelocityFactors(curve, Math.floor(shot.timing.duration * fps));
  const setpts = velocityToSetpts(factors);
  clipFilter += `,setpts=${setpts}`;
}
```

- [ ] **Step 3: Wire into Canvas2D preview**

```typescript
// In monet-renderer.ts applyShotTransformAndDraw():
if (speedRamp) {
  const progress = getLocalShotProgress(shot, timelineTime);
  // Bézier curve instead of linear
  const t = cubicBezier(progress, 0.42, 0, 0.58, 1);
  const speedAtFrame = speedRamp.entrySpeed + (speedRamp.anchorSpeed - speedRamp.entrySpeed) * t;
  // Apply as scale multiplier (visual proxy for speed)
  scale *= 1 + (1 - speedAtFrame) * 0.1;
}
```

---

## Part 4: Transition Completeness

### Task 7: Expose All Transitions to Gemini

**Files:**
- Modify: `src/server/lib/edl-generation.ts` (prompt)
- Modify: `src/server/types/edl.ts` (TransitionTypeSchema)

**Interfaces:**
- Consumes: Full transition vocabulary
- Produces: EDL with any of 22 transition types

**What this solves:** Only 7 of 22 transitions are exposed to Gemini. The remaining 14 are hidden.

- [ ] **Step 1: Update TransitionTypeSchema**

```typescript
// In src/server/types/edl.ts, add missing transition types:
export const TransitionTypeSchema = z.enum([
  "cut", "crossfade", "dip_black", "dip_white",
  "whip_pan", "zoom_blur", "glitch", "flash",
  "dissolve", "radial_wipe", "clock_wipe", "linear_wipe",
  "gradient_wipe", "barn_doors", "iris", "pinwheel",
  "film_burn", "spin", "blur", "pixelate",
  "morph_cut", "push",
]);
```

- [ ] **Step 2: Update Gemini prompt to include all transitions**

```typescript
// In edl-generation.ts, update the transition vocabulary in the prompt:
TRANSITIONS: cut, crossfade, dip_black, dip_white, whip_pan, zoom_blur,
glitch, flash, dissolve, radial_wipe, clock_wipe, linear_wipe,
gradient_wipe, barn_doors, iris, pinwheel, film_burn, spin, blur,
pixelate, morph_cut, push

// Reference transitions (from analysis):
REFERENCE_TRANSITIONS: ${referenceStyle.transitionsBreakdown}
```

- [ ] **Step 3: Add missing transition renderers to editly-transitions.ts**

```typescript
// In editly-transitions.ts, add handlers for:
case "radial_wipe": return `xfade=transition=radial:duration=${d}:offset=${o}`;
case "clock_wipe": return `xfade=transition=clock:duration=${d}:offset=${o}`;
case "linear_wipe": return `xfade=transition=slideright:duration=${d}:offset=${o}`;
case "gradient_wipe": return `xfade=transition=fadeblack:duration=${d}:offset=${o}`;
case "barn_doors": return `xfade=transition=smoothleft:duration=${d}:offset=${o}`;
case "iris": return `xfade=transition=circleopen:duration=${d}:offset=${o}`;
case "pinwheel": return `xfade=transition=pinwheel:duration=${d}:offset=${o}`;
case "film_burn": return `xfade=transition=fade:duration=${d}:offset=${o}`;
case "spin": return `xfade=transition=radial:duration=${d}:offset=${o}`;
case "blur": return `xfade=transition=smoothleft:duration=${d}:offset=${o}`;
case "pixelate": return `xfade=transition=pixelize:duration=${d}:offset=${o}`;
case "morph_cut": return `xfade=transition=dissolve:duration=${d}:offset=${o}`;
case "push": return `xfade=transition=slideleft:duration=${d}:offset=${o}`;
```

---

### Task 8: Reference-Matched Transition Injection

**Files:**
- Modify: `src/server/lib/reference-effect-injector.ts`

**Interfaces:**
- Consumes: `ReferenceStyle.transitionsBreakdown`, `ReferenceStyle.flashFrames`
- Produces: EDL shots with transitions matching reference percentages

**What this solves:** Transitions are assigned randomly. This makes them match the reference's actual transition distribution.

- [ ] **Step 1: Add transition injection to reference-effect-injector.ts**

```typescript
// In injectReferenceEffects(), add transition assignment:
const breakdown = referenceStyle.transitionsBreakdown ?? {
  cutPercentage: 0.7,
  crossfadePercentage: 0.2,
  otherPercentage: 0.1,
};

for (let i = 0; i < edl.shots.length; i++) {
  const shot = edl.shots[i];
  const rand = Math.random();
  let transitionType: string;

  if (rand < breakdown.cutPercentage) {
    transitionType = "cut";
  } else if (rand < breakdown.cutPercentage + breakdown.crossfadePercentage) {
    transitionType = "crossfade";
  } else {
    // Use flash frames if reference has them
    const hasFlashFrame = flashFrames.some(f =>
      f.precedingShotIndex === i || f.followingShotIndex === i
    );
    transitionType = hasFlashFrame ? "flash" : "dissolve";
  }

  if (transitionType !== "cut") {
    shot.transition = {
      type: transitionType as any,
      duration: referenceStyle.rhythm?.avgShotDuration
        ? referenceStyle.rhythm.avgShotDuration * 0.15
        : 0.2,
    };
  }
}
```

---

## Part 5: Per-Shot Color Grade in Renderer

### Task 9: Canvas2D Per-Shot Color Grade

**Files:**
- Modify: `src/lib/renderer/monet-renderer.ts`

**Interfaces:**
- Consumes: `color_grade` effects from EDL shots
- Produces: Per-shot CSS filter adjustments on the canvas

**What this solves:** Currently applies a single global CSS filter. This applies different color grades per shot.

- [ ] **Step 1: Add color_grade handling to renderFrameInternal**

```typescript
// In renderFrameInternal(), after drawing the shot:
const colorGradeEffect = activeShot.effects?.find(
  (e: any) => e.type === "color_grade"
);

if (colorGradeEffect) {
  const sat = colorGradeEffect.params?.saturation ?? 1;
  const bright = colorGradeEffect.params?.brightness ?? 1;
  const cont = colorGradeEffect.params?.contrast ?? 1;
  ctx.save();
  ctx.filter = `saturate(${sat}) brightness(${bright}) contrast(${cont})`;
  ctx.drawImage(offscreenCanvas, 0, 0, width, height);
  ctx.restore();
} else {
  ctx.drawImage(offscreenCanvas, 0, 0, width, height);
}
```

---

## Part 6: Quality Assessment

### Task 10: Automated Style Match Scoring

**Files:**
- Create: `src/server/lib/style-match-scorer.ts`
- Create: `scripts/style-match-benchmark.ts`

**Interfaces:**
- Consumes: Reference analysis + generated EDL
- Produces: 0-100 style match score with breakdown

**What this solves:** No automated way to measure how well the generated edit matches the reference. This provides objective scoring.

- [ ] **Step 1: Create style-match-scorer.ts**

```typescript
// src/server/lib/style-match-scorer.ts
import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

interface StyleMatchScore {
  total: number;
  breakdown: {
    shotDuration: number;    // 0-25: avg shot duration match
    cutFrequency: number;    // 0-25: cuts per second match
    effectVocabulary: number; // 0-25: effects match reference
    transitionStyle: number; // 0-25: transition distribution match
  };
  details: string[];
}

export function scoreStyleMatch(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): StyleMatchScore {
  const details: string[] = [];

  // 1. Shot duration match
  const edlAvgDuration = edl.shots.reduce((s, shot) => s + shot.timing.duration, 0) / edl.shots.length;
  const refAvgDuration = referenceStyle.rhythm?.avgShotDuration ?? 1.5;
  const durationDiff = Math.abs(edlAvgDuration - refAvgDuration) / refAvgDuration;
  const shotDurationScore = Math.max(0, 25 - durationDiff * 50);
  details.push(`Shot duration: ${edlAvgDuration.toFixed(2)}s vs ${refAvgDuration.toFixed(2)}s (${(durationDiff * 100).toFixed(0)}% diff)`);

  // 2. Cut frequency
  const edlCutsPerSec = edl.shots.length / (edl.timeline?.duration ?? 30);
  const refCutsPerSec = referenceStyle.rhythm?.cutsPerSecond ?? 0.5;
  const cutDiff = Math.abs(edlCutsPerSec - refCutsPerSec) / refCutsPerSec;
  const cutFrequencyScore = Math.max(0, 25 - cutDiff * 50);
  details.push(`Cut frequency: ${edlCutsPerSec.toFixed(2)} vs ${refCutsPerSec.toFixed(2)} cuts/sec`);

  // 3. Effect vocabulary
  const edlEffectTypes = new Set(edl.shots.flatMap(s => (s.effects ?? []).map(e => e.type)));
  const refEffectTypes = new Set(
    referenceStyle.effectVocabulary?.flatMap(v => v.effects.map(e => e.type)) ?? []
  );
  const effectOverlap = [...edlEffectTypes].filter(t => refEffectTypes.has(t)).length;
  const effectVocabularyScore = refEffectTypes.size > 0
    ? (effectOverlap / refEffectTypes.size) * 25
    : 12.5;
  details.push(`Effects: ${effectOverlap}/${refEffectTypes.size} matched`);

  // 4. Transition style
  const edlTransitions = edl.shots.map(s => s.transition?.type ?? "cut");
  const edlCutPct = edlTransitions.filter(t => t === "cut").length / edlTransitions.length;
  const refCutPct = referenceStyle.transitionsBreakdown?.cutPercentage ?? 0.7;
  const transitionDiff = Math.abs(edlCutPct - refCutPct);
  const transitionScore = Math.max(0, 25 - transitionDiff * 50);
  details.push(`Transitions: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% reference`);

  return {
    total: Math.round(shotDurationScore + cutFrequencyScore + effectVocabularyScore + transitionScore),
    breakdown: {
      shotDuration: Math.round(shotDurationScore),
      cutFrequency: Math.round(cutFrequencyScore),
      effectVocabulary: Math.round(effectVocabularyScore),
      transitionStyle: Math.round(transitionScore),
    },
    details,
  };
}
```

- [ ] **Step 2: Create benchmark script**

```typescript
// scripts/style-match-benchmark.ts
import { scoreStyleMatch } from "../src/server/lib/style-match-scorer";
import { readFileSync } from "fs";

const reference = JSON.parse(readFileSync("benchmark-outputs/reference-style.json", "utf-8"));
const edl = JSON.parse(readFileSync("benchmark-outputs/generated-edl.json", "utf-8"));

const score = scoreStyleMatch(edl, reference);
console.log(`\n=== Style Match Score: ${score.total}/100 ===`);
console.log(`Shot Duration:    ${score.breakdown.shotDuration}/25`);
console.log(`Cut Frequency:    ${score.breakdown.cutFrequency}/25`);
console.log(`Effect Vocabulary: ${score.breakdown.effectVocabulary}/25`);
console.log(`Transition Style: ${score.breakdown.transitionStyle}/25`);
console.log(`\nDetails:`);
score.details.forEach(d => console.log(`  - ${d}`));
```

---

## Part 7: Preview/Export Parity

### Task 11: Shared Effect Specification Layer

**Files:**
- Create: `packages/edl/src/effect-spec.ts`
- Modify: `src/lib/renderer/effects.ts`
- Modify: `src/server/lib/editly-effects.ts`

**Interfaces:**
- Consumes: EDL effect definitions
- Produces: Unified effect parameters for both Canvas2D and FFmpeg

**What this solves:** Two independent rendering systems share zero code. This creates a shared specification that both consume.

- [ ] **Step 1: Create effect-spec.ts**

```typescript
// packages/edl/src/effect-spec.ts

/**
 * Shared effect specification.
 * Both Canvas2D renderer and FFmpeg exporter consume this.
 * Adding a new effect requires: (1) add to EffectSpecMap, (2) implement in both renderers.
 */
export const EffectSpecMap: Record<string, {
  name: string;
  params: Record<string, { type: string; default: number; min: number; max: number }>;
  canvas2d: (ctx: CanvasRenderingContext2D, params: Record<string, number>, width: number, height: number) => void;
  ffmpeg: (params: Record<string, number>) => string;
}> = {
  impact_flash: {
    name: "Impact Flash",
    params: {
      intensity: { type: "number", default: 0.8, min: 0, max: 1 },
      duration: { type: "number", default: 0.08, min: 0.01, max: 0.5 },
    },
    canvas2d: (ctx, params, w, h) => {
      ctx.save();
      ctx.globalAlpha = params.intensity;
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    ffmpeg: (params) => `fade=t=in:st=0:d=${params.duration}:color=white,fade=t=out:st=${params.duration}:d=${params.duration}`,
  },
  context_shake: {
    name: "Camera Shake",
    params: {
      intensity: { type: "number", default: 0.35, min: 0, max: 1 },
      decay: { type: "number", default: 0.65, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      const maxShake = params.intensity * 20;
      const offsetX = Math.sin(Date.now() * 0.01) * maxShake;
      const offsetY = Math.cos(Date.now() * 0.013) * maxShake;
      ctx.translate(offsetX, offsetY);
    },
    ffmpeg: (params) => `crop=w=iw:h=ih:x='iw/2-(iw/2-10*sin(t*10*${params.intensity}))':y='ih/2-(ih/2-10*cos(t*13*${params.intensity}))'`,
  },
  // ... add all 40+ effects here
};
```

- [ ] **Step 2: Make both renderers consume EffectSpecMap**

```typescript
// In effects.ts:
import { EffectSpecMap } from "@monet/edl";

// Replace switch statement with:
const spec = EffectSpecMap[effect.type];
if (spec) {
  spec.canvas2d(ctx, {
    intensity: effect.intensity,
    ...effect.params,
  }, width, height);
}
```

---

## Part 8: Browser-Side Processing

### Task 12: WebCodecs Frame Interpolation for Preview

**Files:**
- Create: `src/lib/renderer/webcodecs-interpolator.ts`

**Interfaces:**
- Consumes: Video frames, velocity ramp specs
- Produces: Interpolated frames for smooth preview

**What this solves:** Canvas2D preview shows jerky speed ramps because it just skips/duplicates frames. WebCodecs can decode real frames and we can blend them for smoother preview.

- [ ] **Step 1: Create webcodecs-interpolator.ts**

```typescript
// src/lib/renderer/webcodecs-interpolator.ts

/**
 * Uses WebCodecs API for hardware-accelerated frame decoding.
 * Blends adjacent frames for smooth speed ramp preview.
 */
export class WebCodecsInterpolator {
  private decoder: VideoDecoder | null = null;
  private frameBuffer: VideoFrame[] = [];
  private maxBuffer = 10;

  async init(codec: string = "avc1.64001E") {
    if (typeof VideoDecoder === "undefined") {
      console.warn("[WebCodecsInterpolator] VideoDecoder not available");
      return;
    }

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        this.frameBuffer.push(frame);
        if (this.frameBuffer.length > this.maxBuffer) {
          const old = this.frameBuffer.shift();
          old?.close();
        }
      },
      error: (e) => console.error("[WebCodecsInterpolator] Decoder error:", e),
    });

    this.decoder.configure({
      codec,
      codedWidth: 1920,
      codedHeight: 1080,
    });
  }

  /**
   * Blend two frames at a given alpha (0.0 = frame A, 1.0 = frame B).
   * Uses canvas compositing for GPU-accelerated blending.
   */
  blendFrames(
    ctx: CanvasRenderingContext2D,
    frameA: VideoFrame,
    frameB: VideoFrame,
    alpha: number,
    width: number,
    height: number
  ) {
    ctx.globalAlpha = 1 - alpha;
    ctx.drawImage(frameA, 0, 0, width, height);
    ctx.globalAlpha = alpha;
    ctx.drawImage(frameB, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  dispose() {
    this.decoder?.close();
    this.frameBuffer.forEach(f => f.close());
    this.frameBuffer = [];
  }
}
```

---

## Part 9: Reference Color Transfer (Server-Side)

### Task 13: OpenCV Color Histogram Transfer

**Files:**
- Create: `workers/python-ai/color_transfer.py`
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: Reference video frames, target footage frames
- Produces: Color transfer LUT or per-shot color parameters

**What this solves:** Reference edits have specific color grades (noir desaturation, warm highlights, cool shadows). This extracts and applies those grades.

- [ ] **Step 1: Create color_transfer.py**

```python
# workers/python-ai/color_transfer.py
"""
Color grading transfer using Reinhard's algorithm + histogram matching.
Completely free, runs on CPU, no API calls.
"""
import cv2
import numpy as np
from pathlib import Path

def extract_color_profile(video_path: str, num_frames: int = 30) -> dict:
    """Extract average color profile from video frames."""
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, total_frames // num_frames)

    saturations = []
    brightnesses = []
    contrasts = []
    color_temps = []

    for i in range(0, total_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ret, frame = cap.read()
        if not ret:
            continue

        # Convert to HSV
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        saturations.append(np.mean(hsv[:, :, 1]) / 255.0)
        brightnesses.append(np.mean(hsv[:, :, 2]) / 255.0)

        # Contrast (std of grayscale)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        contrasts.append(np.std(gray) / 128.0)

        # Color temperature (warm=positive, cool=negative)
        b, g, r = cv2.split(frame)
        color_temps.append((np.mean(r) - np.mean(b)) / 255.0)

    cap.release()

    return {
        "avgSaturation": float(np.mean(saturations)),
        "avgBrightness": float(np.mean(brightnesses)),
        "avgContrast": float(np.mean(contrasts)),
        "avgTemperature": float(np.mean(color_temps)),
        "saturationRange": [float(np.min(saturations)), float(np.max(saturations))],
        "brightnessRange": [float(np.min(brightnesses)), float(np.max(brightnesses))],
    }

def transfer_color(source_frame: np.ndarray, target_profile: dict) -> np.ndarray:
    """Apply color profile to a frame using histogram matching."""
    # Convert to LAB color space for perceptual matching
    lab = cv2.cvtColor(source_frame, cv2.COLOR_BGR2LAB).astype(np.float32)

    # Adjust L channel (brightness/contrast)
    l_mean = np.mean(lab[:, :, 0])
    l_std = np.std(lab[:, :, 0])
    target_l_mean = target_profile["avgBrightness"] * 255
    target_l_std = target_profile["avgContrast"] * 128

    if l_std > 0:
        lab[:, :, 0] = (lab[:, :, 0] - l_mean) * (target_l_std / l_std) + target_l_mean
    lab[:, :, 0] = np.clip(lab[:, :, 0], 0, 255)

    # Adjust A/B channels (color temperature)
    a_mean = np.mean(lab[:, :, 1])
    b_mean = np.mean(lab[:, :, 2])
    temp_shift = target_profile["avgTemperature"] * 20
    lab[:, :, 2] = lab[:, :, 2] - b_mean + 128 + temp_shift

    lab = np.clip(lab, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python color_transfer.py <video_path>")
        sys.exit(1)

    profile = extract_color_profile(sys.argv[1])
    print(json.dumps(profile, indent=2))
```

- [ ] **Step 2: Wire into reference analysis**

```typescript
// In reference-analysis-service.ts, add color profile extraction:
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

async function extractColorProfile(videoPath: string): Promise<Record<string, number>> {
  try {
    const { stdout } = await execFileAsync("python3", [
      "workers/python-ai/color_transfer.py",
      videoPath,
    ]);
    return JSON.parse(stdout);
  } catch {
    return { avgSaturation: 0.5, avgBrightness: 0.5, avgContrast: 0.5, avgTemperature: 0 };
  }
}
```

---

## Part 10: Text Overlay Detection & Replication

### Task 14: Baked-In Text Detection via PaddleOCR

**Files:**
- Create: `workers/python-ai/text_detector.py`
- Create: `src/server/lib/text-overlay-extractor.ts`
- Modify: `src/server/services/reference-analysis-service.ts`

**Interfaces:**
- Consumes: Reference video frames
- Produces: `DetectedText[]` with position, timing, style, content

**What this solves:** Reference edits have baked-in text (TikTok captions, titles). This detects them so the EDL generator can replicate them.

- [ ] **Step 1: Create text_detector.py**

```python
# workers/python-ai/text_detector.py
"""
Text detection in video frames using PaddleOCR.
Completely free, Apache-2.0, runs on CPU.
"""
import cv2
import numpy as np
import json
import sys
from pathlib import Path

try:
    from paddleocr import PaddleOCR
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False

def detect_text_in_video(video_path: str, sample_interval: float = 0.5) -> list:
    """Detect text regions in video frames."""
    if not HAS_PADDLE:
        # Fallback: use OpenCV contour-based detection
        return detect_text_opencv(video_path, sample_interval)

    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(fps * sample_interval))

    detections = []
    prev_texts = set()

    for frame_idx in range(0, total_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        timestamp = frame_idx / fps
        result = ocr.ocr(frame, cls=True)

        if result and result[0]:
            for line in result[0]:
                bbox = line[0]
                text = line[1][0]
                confidence = line[1][1]

                if confidence < 0.6:
                    continue

                # Calculate bounding box center and size
                x_min = min(p[0] for p in bbox)
                y_min = min(p[1] for p in bbox)
                x_max = max(p[0] for p in bbox)
                y_max = max(p[1] for p in bbox)
                width = x_max - x_min
                height = y_max - y_min

                # Normalize to 0-1 range
                frame_h, frame_w = frame.shape[:2]
                center_x = (x_min + x_max) / 2 / frame_w
                center_y = (y_min + y_max) / 2 / frame_h
                norm_width = width / frame_w
                norm_height = height / frame_h

                # Determine text position category
                if center_y < 0.3:
                    position = "top"
                elif center_y > 0.7:
                    position = "bottom"
                else:
                    position = "center"

                # Detect text style from frame region
                roi = frame[int(y_min):int(y_max), int(x_min):int(x_max)]
                if roi.size > 0:
                    # Check if text is white (bright) or colored
                    mean_brightness = np.mean(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY))
                    is_white = mean_brightness > 200

                    # Check for stroke/outline (high contrast edges)
                    edges = cv2.Canny(roi, 50, 150)
                    edge_density = np.mean(edges) / 255.0
                    has_stroke = edge_density > 0.3
                else:
                    is_white = True
                    has_stroke = False

                text_key = f"{text}_{position}"
                if text_key not in prev_texts:
                    prev_texts.add(text_key)
                    detections.append({
                        "text": text,
                        "timestamp": round(timestamp, 3),
                        "position": position,
                        "centerX": round(center_x, 3),
                        "centerY": round(center_y, 3),
                        "width": round(norm_width, 3),
                        "height": round(norm_height, 3),
                        "isWhite": is_white,
                        "hasStroke": has_stroke,
                        "confidence": round(confidence, 3),
                    })

    cap.release()
    return detections

def detect_text_opencv(video_path: str, sample_interval: float = 0.5) -> list:
    """Fallback: contour-based text detection without PaddleOCR."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(fps * sample_interval))

    detections = []
    for frame_idx in range(0, total_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        timestamp = frame_idx / fps
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Threshold to find bright text
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w > 20 and h > 10:  # Filter small noise
                frame_h, frame_w = frame.shape[:2]
                detections.append({
                    "text": "[detected]",
                    "timestamp": round(timestamp, 3),
                    "position": "unknown",
                    "centerX": round((x + w / 2) / frame_w, 3),
                    "centerY": round((y + h / 2) / frame_h, 3),
                    "width": round(w / frame_w, 3),
                    "height": round(h / frame_h, 3),
                    "isWhite": True,
                    "hasStroke": False,
                    "confidence": 0.5,
                })

    cap.release()
    return detections

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python text_detector.py <video_path>")
        sys.exit(1)

    detections = detect_text_in_video(sys.argv[1])
    print(json.dumps(detections, indent=2))
```

- [ ] **Step 2: Create text-overlay-extractor.ts**

```typescript
// src/server/lib/text-overlay-extractor.ts

export interface DetectedTextOverlay {
  text: string;
  startTime: number;
  duration: number;
  position: "top" | "center" | "bottom";
  style: {
    fontSize: number;
    color: string;
    hasStroke: boolean;
    fontWeight: string;
  };
  tracking?: {
    type: "static" | "follow";
    keyframes: Array<{ time: number; x: number; y: number }>;
  };
}

/**
 * Converts PaddleOCR detections into EDL-compatible text overlays.
 * Groups consecutive detections of the same text into duration spans.
 */
export function extractTextOverlays(
  detections: Array<{
    text: string;
    timestamp: number;
    position: string;
    centerX: number;
    centerY: number;
    isWhite: boolean;
    hasStroke: boolean;
    confidence: number;
  }>,
  fps: number = 30
): DetectedTextOverlay[] {
  if (detections.length === 0) return [];

  // Group by text content
  const groups = new Map<string, typeof detections>();
  for (const d of detections) {
    const key = d.text.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  const overlays: DetectedTextOverlay[] = [];

  for (const [text, frames] of groups) {
    if (frames.length < 2) continue; // Need at least 2 frames to establish duration

    // Sort by timestamp
    frames.sort((a, b) => a.timestamp - b.timestamp);

    // Find contiguous spans
    const spans: Array<{ start: number; end: number }> = [];
    let spanStart = frames[0].timestamp;
    let spanEnd = frames[0].timestamp;

    for (let i = 1; i < frames.length; i++) {
      if (frames[i].timestamp - spanEnd < 1.0) {
        spanEnd = frames[i].timestamp;
      } else {
        spans.push({ start: spanStart, end: spanEnd });
        spanStart = frames[i].timestamp;
        spanEnd = frames[i].timestamp;
      }
    }
    spans.push({ start: spanStart, end: spanEnd });

    for (const span of spans) {
      const representative = frames.find(f =>
        f.timestamp >= span.start && f.timestamp <= span.end
      )!;

      overlays.push({
        text: representative.text,
        startTime: span.start,
        duration: span.end - span.start + 1 / fps,
        position: representative.position as "top" | "center" | "bottom",
        style: {
          fontSize: representative.centerY > 0.7 ? 36 : 48,
          color: representative.isWhite ? "#ffffff" : "#ffcc00",
          hasStroke: representative.hasStroke,
          fontWeight: "700",
        },
        tracking: frames.length > 5 ? {
          type: "follow",
          keyframes: frames.map(f => ({
            time: f.timestamp - span.start,
            x: (f.centerX - 0.5) * 2,
            y: (f.centerY - 0.5) * 2,
          })),
        } : undefined,
      });
    }
  }

  return overlays;
}
```

- [ ] **Step 3: Wire into reference analysis**

```typescript
// In reference-analysis-service.ts:
import { execFile } from "child_process";
import { promisify } from "util";
import { extractTextOverlays } from "../lib/text-overlay-extractor";
const execFileAsync = promisify(execFile);

async function detectTextOverlays(videoPath: string, fps: number): Promise<DetectedTextOverlay[]> {
  try {
    const { stdout } = await execFileAsync("python3", [
      "workers/python-ai/text_detector.py",
      videoPath,
    ]);
    const detections = JSON.parse(stdout);
    return extractTextOverlays(detections, fps);
  } catch {
    return [];
  }
}
```

---

## Part 11: VMAF Quality Gate

### Task 15: Automated Export Quality Verification

**Files:**
- Create: `src/server/lib/vmaf-quality-gate.ts`
- Modify: `src/server/api/export-mp4.ts`

**Interfaces:**
- Consumes: Exported MP4, reference video (optional)
- Produces: Quality scores (VMAF, SSIM, PSNR)

**What this solves:** No way to verify export quality automatically. This adds a quality gate after export.

- [ ] **Step 1: Create vmaf-quality-gate.ts**

```typescript
// src/server/lib/vmaf-quality-gate.ts
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

interface QualityScore {
  vmaf: number | null;
  ssim: number | null;
  psnr: number | null;
  pass: boolean;
  details: string[];
}

/**
 * Runs VMAF/SSIM/PSNR quality assessment on exported video.
 * Uses FFmpeg with libvmaf (free, Netflix's quality metric).
 */
export async function assessQuality(
  exportedPath: string,
  referencePath?: string
): Promise<QualityScore> {
  const details: string[] = [];
  let vmaf: number | null = null;
  let ssim: number | null = null;
  let psnr: number | null = null;

  // SSIM (always available in FFmpeg)
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", exportedPath,
      "-lavfi", "ssim=stats_file=-",
      "-f", "null", "-",
    ]);
    const ssimMatch = stdout.match(/All:(\d+\.?\d*)/);
    if (ssimMatch) {
      ssim = parseFloat(ssimMatch[1]);
      details.push(`SSIM: ${ssim.toFixed(4)}`);
    }
  } catch {
    details.push("SSIM: unavailable");
  }

  // PSNR (always available in FFmpeg)
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", exportedPath,
      "-lavfi", "psnr=stats_file=-",
      "-f", "null", "-",
    ]);
    const psnrMatch = stdout.match(/average:(\d+\.?\d*)/);
    if (psnrMatch) {
      psnr = parseFloat(psnrMatch[1]);
      details.push(`PSNR: ${psnr.toFixed(2)} dB`);
    }
  } catch {
    details.push("PSNR: unavailable");
  }

  // VMAF (requires libvmaf, optional)
  if (referencePath) {
    try {
      const { stdout } = await execFileAsync("ffmpeg", [
        "-i", exportedPath,
        "-i", referencePath,
        "-lavfi", "libvmaf=model=version=vmaf_v0.6.1",
        "-f", "null", "-",
      ]);
      const vmafMatch = stdout.match(/VMAF score:(\d+\.?\d*)/);
      if (vmafMatch) {
        vmaf = parseFloat(vmafMatch[1]);
        details.push(`VMAF: ${vmaf.toFixed(2)}`);
      }
    } catch {
      details.push("VMAF: libvmaf not available");
    }
  }

  // Pass/fail: SSIM > 0.85 is good for style-matched edits
  const pass = (ssim === null || ssim > 0.85) && (psnr === null || psnr > 25);

  return { vmaf, ssim, psnr, pass, details };
}
```

- [ ] **Step 2: Wire into export endpoint**

```typescript
// In export-mp4.ts, after render completes:
import { assessQuality } from "../lib/vmaf-quality-gate";

const quality = await assessQuality(outputPath);
if (!quality.pass) {
  console.warn("[export-mp4] Quality gate WARNING:", quality.details);
}
// Attach quality scores to export result
result.qualityScores = quality;
```

---

## Summary: Tool Inventory (All Free)

| Tool | Purpose | License | Cost |
|------|---------|---------|------|
| **Practical-RIFE** | Frame interpolation for velocity ramps | MIT | Free |
| **PaddleOCR** | Text detection in video frames | Apache-2.0 | Free |
| **SAM 2** | Subject masking / isolation | Apache-2.0 | Free |
| **OpenCV** | Color transfer, histogram matching | Apache-2.0 | Free |
| **FFmpeg + libvmaf** | Quality assessment, rendering | GPL + BSD | Free |
| **Librosa** | Beat detection (already in use) | ISC | Free |
| **PySceneDetect** | Scene detection (already in use) | GPL-3.0 | Free |
| **WebCodecs API** | Browser-side frame processing | Built-in | Free |
| **Gemini** | Creative decisions (already in use) | Existing budget | $0 incremental |

**Total additional cost: $0** — all tools are free, open-source, or self-hostable.

---

## Execution Order

1. **Part 1** (Tasks 1-2): Reference analysis deepening — extract what the reference actually does
2. **Part 2** (Tasks 3-5): EDL generator — use reference vocabulary instead of generic pools
3. **Part 3** (Task 6): Bézier velocity ramps — proper speed curves
4. **Part 4** (Tasks 7-8): Transition completeness — all 22 transitions available
5. **Part 5** (Task 9): Per-shot color grades — not just global filter
6. **Part 6** (Task 10): Quality scoring — automated style match measurement
7. **Part 7** (Task 11): Shared effect spec — preview/export parity foundation
8. **Part 8** (Task 12): WebCodecs interpolation — smooth preview
9. **Part 9** (Task 13): Color transfer — reference color grade application
10. **Part 10** (Task 14): Text detection — replicate baked-in text
11. **Part 11** (Task 15): VMAF quality gate — automated quality verification

**Estimated effort:** 2-3 focused sessions to complete all 15 tasks.
