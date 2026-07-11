# Style Replication — Complete Implementation

> Generated from the 15-task plan `docs/superpowers/plans/2026-07-08-style-replication-complete.md`

## Architecture Overview

```
Reference Video
  → FFmpeg scene detection + energy analysis
  → Per-shot effect extraction (reference-effect-extractor.ts)
  → Color grade keyframes (reference-color-extractor.ts)
  → Velocity ramp detection (reference-velocity-extractor.ts)
  → Flash frame detection (flash-frame-detector.ts)
  → OpenCV color profile (color_transfer.py)
  → Text overlay detection (text_detector.py)
  → Gemini LLM visual analysis
  → ReferenceStyle (unified style object)
  → EDL Generation
    → injectReferenceEffects() — reference vocabulary replaces generic pools
    → injectReferenceColorGrades() — per-shot color interpolation
    → Bézier velocity ramps (bezier-velocity.ts)
    → Reference-matched transitions
  → Canvas2D Preview (monet-renderer.ts + effects.ts)
  → FFmpeg Export (edl-to-editly.ts + editly-effects.ts + editly-transitions.ts)
  → Quality Gate (vmaf-quality-gate.ts)
```

---

## Files Created

### 1. `src/server/lib/reference-effect-extractor.ts` (361 lines)

Detects per-shot effects from FFmpeg frame data: impact_flash, context_shake, speed_ramp, whip_pan, color_pulse, push_in.

```typescript
export interface FrameData {
  timestamp: number;
  brightness: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  sceneChange: number;
  saturation: number;
}

export interface ReferenceEditTrace {
  shots: Array<{ startTime: number; duration: number }>;
}

interface DetectedEffect {
  type: string;
  intensity: number;
  timing: "start" | "middle" | "end" | "throughout";
  params?: Record<string, number>;
}

interface EffectVocabularyEntry {
  shotIndex: number;
  startTime: number;
  duration: number;
  effects: DetectedEffect[];
  transition?: { type: string; duration: number };
}

export function extractEffectVocabulary(
  trace: ReferenceEditTrace,
  frameData: FrameData[]
): EffectVocabularyEntry[] {
  if (frameData.length === 0 || trace.shots.length === 0) return [];

  const brightnessStats = computeStats(frameData.map((f) => f.brightness));
  const motionStats = computeStats(frameData.map((f) => f.motionScore));
  const contrastStats = computeStats(frameData.map((f) => f.contrast));

  const result: EffectVocabularyEntry[] = [];

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const shotEnd = shot.startTime + shot.duration;
    const shotFrames = frameData.filter(
      (f) => f.timestamp >= shot.startTime && f.timestamp < shotEnd
    );
    if (shotFrames.length === 0) {
      result.push({
        shotIndex: i,
        startTime: shot.startTime,
        duration: shot.duration,
        effects: [],
      });
      continue;
    }

    const effects = detectEffectsForShot(
      shotFrames,
      frameData,
      shot,
      i,
      brightnessStats,
      motionStats,
      contrastStats,
      trace.shots
    );

    result.push({
      shotIndex: i,
      startTime: shot.startTime,
      duration: shot.duration,
      effects,
    });
  }

  return result;
}

function detectEffectsForShot(
  shotFrames: FrameData[],
  allFrames: FrameData[],
  shot: { startTime: number; duration: number },
  shotIndex: number,
  brightnessStats: { mean: number; stddev: number },
  motionStats: { mean: number; stddev: number },
  contrastStats: { mean: number; stddev: number },
  allShots: Array<{ startTime: number; duration: number }>
): DetectedEffect[] {
  const effects: DetectedEffect[] = [];

  const impactFlash = detectImpactFlash(shotFrames, brightnessStats);
  if (impactFlash) effects.push(impactFlash);

  const contextShake = detectContextShake(shotFrames, motionStats);
  if (contextShake) effects.push(contextShake);

  const speedRamp = detectSpeedRamp(shotFrames, motionStats);
  if (speedRamp) effects.push(speedRamp);

  const whipPan = detectWhipPan(shot, allFrames, allShots, shotIndex);
  if (whipPan) effects.push(whipPan);

  const colorPulse = detectColorPulse(shotFrames, brightnessStats, contrastStats);
  if (colorPulse) effects.push(colorPulse);

  const pushIn = detectPushIn(shotFrames);
  if (pushIn) effects.push(pushIn);

  return effects;
}

function detectImpactFlash(
  frames: FrameData[],
  brightnessStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (brightnessStats.stddev === 0) return null;

  const threshold = brightnessStats.mean + 2 * brightnessStats.stddev;
  const flashFrames = frames.filter((f) => f.brightness > threshold);
  if (flashFrames.length === 0) return null;

  const peakFrame = flashFrames.reduce((max, f) =>
    f.brightness > max.brightness ? f : max
  );
  const intensity = Math.min(
    1,
    (peakFrame.brightness - brightnessStats.mean) / (brightnessStats.stddev * 3)
  );
  const relPos = (peakFrame.timestamp - frames[0].timestamp) / (frames[frames.length - 1].timestamp - frames[0].timestamp);
  const timing = getTimingPosition(relPos);

  return {
    type: "impact_flash",
    intensity,
    timing,
    params: {
      peakBrightness: peakFrame.brightness,
      flashFrameCount: flashFrames.length,
    },
  };
}

function detectContextShake(
  frames: FrameData[],
  motionStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (frames.length < 3 || motionStats.mean === 0) return null;

  const motionVariance = frames.reduce((s, f) => {
    const dev = f.motionScore - motionStats.mean;
    return s + dev * dev;
  }, 0) / frames.length;
  const motionStddev = Math.sqrt(motionVariance);

  if (motionStddev < motionStats.mean * 0.3) return null;
  if (motionStats.mean < motionStats.mean * 0.5) return null;

  const avgMotion = frames.reduce((s, f) => s + f.motionScore, 0) / frames.length;
  const intensity = Math.min(1, motionStddev / Math.max(motionStats.stddev, 0.01));

  return {
    type: "context_shake",
    intensity,
    timing: "throughout",
    params: {
      avgMotion,
      motionStddev,
    },
  };
}

function detectSpeedRamp(
  frames: FrameData[],
  motionStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (frames.length < 5) return null;

  const motionValues = frames.map((f) => f.motionScore);
  const peak = Math.max(...motionValues);
  const trough = Math.min(...motionValues);
  const avgMotion = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;

  const hasUMotion = isUShaped(motionValues);
  const hasPeak = peak > avgMotion * 1.5;
  const hasTrough = trough < avgMotion * 0.5;

  if (!hasUMotion && !(hasPeak && hasTrough)) return null;

  const peakIdx = motionValues.indexOf(peak);
  const normalizedPeakPos = peakIdx / (motionValues.length - 1);

  const intensity = Math.min(
    1,
    (peak - trough) / Math.max(motionStats.mean, 0.01)
  );

  return {
    type: "speed_ramp",
    intensity,
    timing: normalizedPeakPos < 0.3 ? "start" : normalizedPeakPos > 0.7 ? "end" : "middle",
    params: {
      peakMotion: peak,
      troughMotion: trough,
      peakPosition: normalizedPeakPos,
    },
  };
}

function detectWhipPan(
  shot: { startTime: number; duration: number },
  allFrames: FrameData[],
  allShots: Array<{ startTime: number; duration: number }>,
  shotIndex: number
): DetectedEffect | null {
  if (allShots.length < 2) return null;

  const isLastShot = shotIndex === allShots.length - 1;
  if (isLastShot) return null;

  const boundaryWindow = Math.min(shot.duration * 0.15, 0.3);
  const boundaryStart = shot.startTime + shot.duration - boundaryWindow;
  const boundaryFrames = allFrames.filter(
    (f) => f.timestamp >= boundaryStart && f.timestamp < shot.startTime + shot.duration
  );

  if (boundaryFrames.length === 0) return null;

  const avgMotion =
    boundaryFrames.reduce((s, f) => s + f.motionScore, 0) / boundaryFrames.length;
  const avgEdge =
    boundaryFrames.reduce((s, f) => s + f.edgeDensity, 0) / boundaryFrames.length;

  if (avgMotion < 0.6 || avgEdge < 0.5) return null;

  const intensity = Math.min(1, (avgMotion + avgEdge) / 1.6);

  return {
    type: "whip_pan",
    intensity,
    timing: "end",
    params: {
      boundaryMotion: avgMotion,
      boundaryEdge: avgEdge,
    },
  };
}

function detectColorPulse(
  frames: FrameData[],
  brightnessStats: { mean: number; stddev: number },
  contrastStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (frames.length < 3) return null;

  const contrastValues = frames.map((f) => f.contrast);
  const peakContrast = Math.max(...contrastValues);

  if (contrastStats.stddev === 0) return null;

  const contrastThreshold = contrastStats.mean + 2 * contrastStats.stddev;
  const hasContrastSpike = peakContrast > contrastThreshold;
  if (!hasContrastSpike) return null;

  const brightnessValues = frames.map((f) => f.brightness);
  const brightnessVariance = computeVariance(brightnessValues);
  const hasBrightnessSpike =
    brightnessVariance > brightnessStats.stddev * brightnessStats.stddev * 2;

  if (hasBrightnessSpike) return null;

  const spikeFrame = frames[contrastValues.indexOf(peakContrast)];
  const relPos = (spikeFrame.timestamp - frames[0].timestamp) / (frames[frames.length - 1].timestamp - frames[0].timestamp);

  return {
    type: "color_pulse",
    intensity: Math.min(
      1,
      (peakContrast - contrastStats.mean) / (contrastStats.stddev * 3)
    ),
    timing: getTimingPosition(relPos),
    params: {
      peakContrast,
    },
  };
}

function detectPushIn(frames: FrameData[]): DetectedEffect | null {
  if (frames.length < 5) return null;

  const motionValues = frames.map((f) => f.motionScore);
  const firstHalf = motionValues.slice(0, Math.floor(motionValues.length / 2));
  const secondHalf = motionValues.slice(Math.floor(motionValues.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (secondAvg <= firstAvg) return null;

  const increase = (secondAvg - firstAvg) / Math.max(firstAvg, 0.01);
  if (increase < 0.3) return null;

  const intensity = Math.min(1, increase);

  return {
    type: "push_in",
    intensity,
    timing: "throughout",
    params: {
      motionIncrease: increase,
      firstHalfAvg: firstAvg,
      secondHalfAvg: secondAvg,
    },
  };
}

function isUShaped(values: number[]): boolean {
  if (values.length < 5) return false;

  const mid = Math.floor(values.length / 2);
  const firstQuarter = values.slice(0, Math.floor(values.length / 4));
  const lastQuarter = values.slice(Math.floor((values.length * 3) / 4));
  const middle = values.slice(
    Math.floor(values.length * 0.3),
    Math.floor(values.length * 0.7)
  );

  const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
  const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
  const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;

  return (
    avgFirst > avgMiddle * 1.2 &&
    avgLast > avgMiddle * 1.2 &&
    avgMiddle < Math.max(avgFirst, avgLast) * 0.7
  );
}

function computeStats(values: number[]): {
  mean: number;
  stddev: number;
} {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = computeVariance(values);
  return { mean, stddev: Math.sqrt(variance) };
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
}

function getTimingPosition(
  relativePosition: number
): "start" | "middle" | "end" {
  if (relativePosition < 0.3) return "start";
  if (relativePosition > 0.7) return "end";
  return "middle";
}
```

---

### 2. `src/server/lib/reference-color-extractor.ts` (142 lines)

Extracts per-shot color grade keyframes from frame-by-frame analysis using a 5-frame moving average.

```typescript
interface FrameData {
  timestamp: number;
  brightness: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  sceneChange: number;
  saturation: number;
}

interface ColorGradeEntry {
  timestamp: number;
  saturation: number;
  brightness: number;
  contrast: number;
  temperature: number;
}

export function extractColorGrades(frameData: FrameData[]): ColorGradeEntry[] {
  if (frameData.length === 0) return [];

  const smoothed = smoothFrameData(frameData, 5);
  return detectKeyframes(smoothed);
}

function smoothFrameData(data: FrameData[], windowSize: number): FrameData[] {
  if (data.length <= windowSize) return data;

  const result: FrameData[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
    const window = data.slice(start, end);

    result.push({
      timestamp: data[i].timestamp,
      brightness: avg(window.map((f) => f.brightness)),
      contrast: avg(window.map((f) => f.contrast)),
      motionScore: avg(window.map((f) => f.motionScore)),
      edgeDensity: avg(window.map((f) => f.edgeDensity)),
      sceneChange: data[i].sceneChange,
      saturation: avg(window.map((f) => f.saturation)),
    });
  }

  return result;
}

function detectKeyframes(data: FrameData[]): ColorGradeEntry[] {
  if (data.length < 3) {
    return data.map((f) => ({
      timestamp: f.timestamp,
      saturation: f.saturation,
      brightness: f.brightness,
      contrast: f.contrast,
      temperature: 0,
    }));
  }

  const satStats = computeStats(data.map((f) => f.saturation));
  const brightStats = computeStats(data.map((f) => f.brightness));
  const contrastStats = computeStats(data.map((f) => f.contrast));

  const satThreshold = Math.max(satStats.stddev * 0.5, 0.05);
  const brightThreshold = Math.max(brightStats.stddev * 0.5, 0.05);
  const contrastThreshold = Math.max(contrastStats.stddev * 0.5, 0.05);

  const keyframes: ColorGradeEntry[] = [
    {
      timestamp: data[0].timestamp,
      saturation: data[0].saturation,
      brightness: data[0].brightness,
      contrast: data[0].contrast,
      temperature: estimateTemperature(data[0]),
    },
  ];

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    const satDelta = Math.abs(curr.saturation - prev.saturation);
    const brightDelta = Math.abs(curr.brightness - prev.brightness);
    const contrastDelta = Math.abs(curr.contrast - prev.contrast);

    const isSignificant =
      satDelta > satThreshold ||
      brightDelta > brightThreshold ||
      contrastDelta > contrastThreshold;

    if (isSignificant) {
      const prevKf = keyframes[keyframes.length - 1];
      const timeSinceLast = curr.timestamp - prevKf.timestamp;
      if (timeSinceLast > 0.5) {
        keyframes.push({
          timestamp: curr.timestamp,
          saturation: curr.saturation,
          brightness: curr.brightness,
          contrast: curr.contrast,
          temperature: estimateTemperature(curr),
        });
      }
    }
  }

  if (
    keyframes.length === 1 ||
    keyframes[keyframes.length - 1].timestamp !== data[data.length - 1].timestamp
  ) {
    const last = data[data.length - 1];
    keyframes.push({
      timestamp: last.timestamp,
      saturation: last.saturation,
      brightness: last.brightness,
      contrast: last.contrast,
      temperature: estimateTemperature(last),
    });
  }

  return keyframes;
}

function estimateTemperature(frame: FrameData): number {
  const warm = frame.brightness * 0.6 + frame.contrast * 0.4;
  return Math.max(-1, Math.min(1, (warm - 0.5) * 2));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeStats(values: number[]): {
  mean: number;
  stddev: number;
} {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}
```

---

### 3. `src/server/lib/reference-velocity-extractor.ts` (171 lines)

Extracts velocity ramps from motion energy curves. Detects U-shape (fast-slow-fast) patterns and snaps anchors to beat timestamps.

```typescript
interface FrameData {
  timestamp: number;
  brightness: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  sceneChange: number;
  saturation: number;
}

interface ReferenceEditTrace {
  shots: Array<{ startTime: number; duration: number }>;
}

interface VelocityRampEntry {
  shotIndex: number;
  startTime: number;
  duration: number;
  entrySpeed: number;
  anchorSpeed: number;
  exitSpeed: number;
  anchorPosition: number;
  easing: string;
}

export function extractVelocityRamps(
  trace: ReferenceEditTrace,
  frameData: FrameData[],
  beatTimestamps: number[] = []
): VelocityRampEntry[] {
  if (frameData.length === 0 || trace.shots.length === 0) return [];

  const motionByShot = computeMotionPerShot(trace, frameData);
  const ramps: VelocityRampEntry[] = [];

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const motion = motionByShot.get(i);
    if (!motion || motion.length < 5) continue;

    const isRamp = detectURampPattern(motion);
    if (!isRamp) continue;

    const entrySpeed = motion[0];
    const anchorSpeed = Math.min(...motion);
    const exitSpeed = motion[motion.length - 1];

    const anchorIdx = motion.indexOf(anchorSpeed);
    const anchorPosition = shot.startTime + (anchorIdx / (motion.length - 1)) * shot.duration;

    const snappedAnchor = snapToBeat(anchorPosition, beatTimestamps);

    const easing = classifyEasing(motion, anchorIdx);

    ramps.push({
      shotIndex: i,
      startTime: shot.startTime,
      duration: shot.duration,
      entrySpeed,
      anchorSpeed,
      exitSpeed,
      anchorPosition: snappedAnchor,
      easing,
    });
  }

  return ramps;
}

function computeMotionPerShot(
  trace: ReferenceEditTrace,
  frameData: FrameData[]
): Map<number, number[]> {
  const result = new Map<number, number[]>();

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const shotEnd = shot.startTime + shot.duration;
    const shotFrames = frameData.filter(
      (f) => f.timestamp >= shot.startTime && f.timestamp < shotEnd
    );
    result.set(i, shotFrames.map((f) => f.motionScore));
  }

  return result;
}

function detectURampPattern(motionValues: number[]): boolean {
  if (motionValues.length < 5) return false;

  const peak = Math.max(...motionValues);
  const trough = Math.min(...motionValues);
  const avg = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;

  const dynamicRange = peak - trough;
  if (dynamicRange < avg * 0.3) return false;

  const firstQuarter = motionValues.slice(0, Math.floor(motionValues.length / 4));
  const lastQuarter = motionValues.slice(Math.floor((motionValues.length * 3) / 4));
  const middle = motionValues.slice(
    Math.floor(motionValues.length * 0.3),
    Math.floor(motionValues.length * 0.7)
  );

  const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
  const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
  const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;

  return (
    avgFirst > avgMiddle * 1.15 &&
    avgLast > avgMiddle * 1.15 &&
    avgMiddle < peak * 0.8
  );
}

function snapToBeat(timestamp: number, beats: number[]): number {
  if (beats.length === 0) return timestamp;

  let closest = beats[0];
  let minDist = Math.abs(timestamp - closest);

  for (const beat of beats) {
    const dist = Math.abs(timestamp - beat);
    if (dist < minDist) {
      minDist = dist;
      closest = beat;
    }
  }

  if (minDist < 0.15) return closest;
  return timestamp;
}

function classifyEasing(motionValues: number[], anchorIdx: number): string {
  if (motionValues.length < 3) return "linear";

  const entryCurve = motionValues.slice(0, anchorIdx + 1);
  const exitCurve = motionValues.slice(anchorIdx);

  const entryDecel = isDecelerating(entryCurve);
  const exitAccel = isAccelerating(exitCurve);

  if (entryDecel && exitAccel) return "ease-in-out";
  if (entryDecel) return "ease-out";
  if (exitAccel) return "ease-in";
  return "linear";
}

function isDecelerating(values: number[]): boolean {
  if (values.length < 3) return false;

  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    diffs.push(values[i] - values[i - 1]);
  }

  const isDecreasing = diffs[diffs.length - 1] < diffs[0];
  return isDecreasing;
}

function isAccelerating(values: number[]): boolean {
  if (values.length < 3) return false;

  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    diffs.push(values[i] - values[i - 1]);
  }

  const isIncreasing = diffs[diffs.length - 1] > diffs[0];
  return isIncreasing;
}
```

---

### 4. `src/server/lib/flash-frame-detector.ts` (84 lines)

Detects single-frame brightness spikes (white/black flash inserts) in video frame data.

```typescript
export interface FlashFrame {
  timestamp: number;
  type: "white" | "black";
  brightness: number;
  precedingShotIndex: number;
  followingShotIndex: number;
}

export function detectFlashFrames(
  frameData: Array<{ timestamp: number; brightness: number }>,
  shots: Array<{ startTime: number; duration: number }>,
  threshold: number = 0.85
): FlashFrame[] {
  if (frameData.length < 3 || shots.length === 0) return [];

  const brightnesses = frameData.map((f) => f.brightness);
  const mean = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
  const variance =
    brightnesses.reduce((s, v) => s + (v - mean) ** 2, 0) / brightnesses.length;
  const stddev = Math.sqrt(variance);

  const flashes: FlashFrame[] = [];

  for (let i = 1; i < frameData.length - 1; i++) {
    const prev = brightnesses[i - 1];
    const curr = brightnesses[i];
    const next = brightnesses[i + 1];

    if (prev === 0 || next === 0) continue;

    const ratioToPrev = curr / prev;
    const ratioToNext = curr / next;

    let flashType: "white" | "black" | null = null;

    if (
      ratioToPrev > 2.5 &&
      ratioToNext > 2.5 &&
      curr > mean + 2 * stddev &&
      curr > threshold
    ) {
      flashType = "white";
    } else if (
      ratioToPrev < 0.4 &&
      ratioToNext < 0.4 &&
      curr < mean - 2 * stddev &&
      curr < (1 - threshold)
    ) {
      flashType = "black";
    }

    if (!flashType) continue;

    const timestamp = frameData[i].timestamp;
    let precedingShotIndex = 0;
    let followingShotIndex = 0;

    for (let s = 0; s < shots.length; s++) {
      const shotEnd = shots[s].startTime + shots[s].duration;
      if (timestamp >= shots[s].startTime && timestamp < shotEnd) {
        precedingShotIndex = s;
        followingShotIndex = Math.min(s + 1, shots.length - 1);
        break;
      }
      if (timestamp < shots[s].startTime) {
        precedingShotIndex = Math.max(0, s - 1);
        followingShotIndex = s;
        break;
      }
      precedingShotIndex = s;
      followingShotIndex = Math.min(s, shots.length - 1);
    }

    flashes.push({
      timestamp,
      type: flashType,
      brightness: curr,
      precedingShotIndex,
      followingShotIndex,
    });
  }

  return flashes;
}
```

---

### 5. `src/server/lib/reference-effect-injector.ts` (277 lines)

Injects reference-matched effects, flash frames, velocity ramps, and transitions into EDL shots.

```typescript
import type { MonetEDL, Effect } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

interface RefEffect {
  type: string;
  intensity: number;
  timing: "start" | "middle" | "end" | "throughout";
  params?: Record<string, number>;
}

interface RefShot {
  shotIndex: number;
  startTime: number;
  duration: number;
  effects: RefEffect[];
  transition?: { type: string; duration: number };
}

let effectIdCounter = 0;
const nextId = (prefix: string) => `ref_${prefix}_${Date.now()}_${++effectIdCounter}`;

function mapRefEffectToEDLEffect(
  refEffect: RefEffect,
  shotStartTime: number,
  shotDuration: number,
): { id: string; type: string; intensity: number; startTime?: number; duration?: number; params?: Record<string, number> } {
  let startTime: number;
  let duration: number;

  switch (refEffect.timing) {
    case "start":
      startTime = shotStartTime;
      duration = Math.min(0.15, shotDuration * 0.15);
      break;
    case "end":
      startTime = shotStartTime + shotDuration * 0.85;
      duration = Math.min(0.15, shotDuration * 0.15);
      break;
    case "middle":
      startTime = shotStartTime + shotDuration * 0.4;
      duration = Math.min(0.2, shotDuration * 0.2);
      break;
    case "throughout":
    default:
      startTime = shotStartTime;
      duration = shotDuration;
      break;
  }

  return {
    id: nextId(refEffect.type),
    type: refEffect.type,
    intensity: Math.max(0, Math.min(1, refEffect.intensity)),
    startTime,
    duration,
    params: refEffect.params,
  };
}

function findMatchingRefShot(
  edlShotStartTime: number,
  refShots: RefShot[],
  tolerance: number,
): RefShot | undefined {
  let best: RefShot | undefined;
  let bestDist = tolerance;
  for (const rs of refShots) {
    const dist = Math.abs(rs.startTime - edlShotStartTime);
    if (dist < bestDist) {
      bestDist = dist;
      best = rs;
    }
  }
  return best;
}

function pickFromVocabulary(
  refStyle: ReferenceStyle,
  shotIndex: number,
): RefEffect[] {
  const vocab = refStyle.effectVocabulary;
  if (!vocab || vocab.length === 0) return [];

  const allEffects: RefEffect[] = [];
  for (const entry of vocab) {
    for (const e of entry.effects) {
      allEffects.push(e);
    }
  }
  if (allEffects.length === 0) return [];

  const effectCounts = new Map<string, number>();
  for (const e of allEffects) {
    effectCounts.set(e.type, (effectCounts.get(e.type) ?? 0) + 1);
  }

  const sorted = [...effectCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalEffects = allEffects.length;

  const selected: RefEffect[] = [];
  let remaining = Math.min(2, sorted.length);

  for (const [type, count] of sorted) {
    if (remaining <= 0) break;
    const freq = count / totalEffects;
    if (freq < 0.05) continue;

    const matching = allEffects.filter((e) => e.type === type);
    const pick = matching[shotIndex % matching.length];
    selected.push({ ...pick, timing: pick.timing ?? "throughout" });
    remaining--;
  }

  return selected;
}

function isGenericEffect(effect: { id: string; type: string }): boolean {
  return effect.id.startsWith("effect-glow-");
}

function normalizeEffectType(type: string): string {
  const map: Record<string, string> = {
    morph_cut: "glitch",
    push_in: "zoom_pulse",
    pull_out: "zoom_pulse",
    glitch: "glitch",
    shake: "shake",
    zoom: "zoom_pulse",
    flash: "glow",
    flash_white: "glow",
    chromatic: "chromatic_aberration",
    desaturation: "saturation",
    color_shift: "color_shift",
    speed_ramp: "posterize_time",
    impact: "glow",
    glow: "glow",
    vignette: "vignette_pro",
    blur: "blur",
    contrast: "contrast",
    saturation: "saturation",
    brightness: "brightness",
    rgb_split: "rgb_split",
    radial_blur: "directional_blur",
  };
  return map[type] ?? type;
}

export function injectReferenceEffects(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle,
): MonetEDL {
  if (!referenceStyle.effectVocabulary && !referenceStyle.flashFrames && !referenceStyle.velocityRamps) {
    return edl;
  }

  const refShots = referenceStyle.effectVocabulary ?? [];
  const shots = edl.shots.map((shot, i) => {
    const existingEffects: Effect[] = (shot.effects ?? []).filter((e) => !isGenericEffect(e));
    const refMatch = findMatchingRefShot(shot.timing.startTime, refShots, 1.0);

    let newEffects: Effect[];

    if (refMatch && refMatch.effects.length > 0) {
      const refEffects = refMatch.effects.map((re) =>
        mapRefEffectToEDLEffect(
          { ...re, type: normalizeEffectType(re.type) },
          shot.timing.startTime,
          shot.timing.duration,
        ),
      ) as Effect[];
      newEffects = [...existingEffects, ...refEffects];
    } else {
      const vocabEffects = pickFromVocabulary(referenceStyle, i);
      if (vocabEffects.length > 0) {
        const mapped = vocabEffects.map((re) =>
          mapRefEffectToEDLEffect(
            { ...re, type: normalizeEffectType(re.type) },
            shot.timing.startTime,
            shot.timing.duration,
          ),
        ) as Effect[];
        newEffects = [...existingEffects, ...mapped];
      } else {
        newEffects = existingEffects;
      }
    }

    return { ...shot, effects: newEffects };
  });

  let enrichedShots = [...shots];

  if (referenceStyle.flashFrames && referenceStyle.flashFrames.length > 0) {
    for (const ff of referenceStyle.flashFrames) {
      const targetShot = enrichedShots.find(
        (s) =>
          ff.timestamp >= s.timing.startTime &&
          ff.timestamp < s.timing.startTime + s.timing.duration,
      );
      if (targetShot) {
        const flashEffect = {
          id: nextId("impact_flash"),
          type: "flash_white",
          intensity: ff.brightness,
          startTime: ff.timestamp,
          duration: 0.033,
        } as unknown as Effect;
        const existing = targetShot.effects ?? [];
        targetShot.effects = [...existing, flashEffect];
      }
    }
  }

  if (referenceStyle.velocityRamps && referenceStyle.velocityRamps.length > 0) {
    for (const vr of referenceStyle.velocityRamps) {
      const targetShot = enrichedShots.find(
        (s) =>
          vr.startTime >= s.timing.startTime &&
          vr.startTime < s.timing.startTime + s.timing.duration,
      );
      if (targetShot) {
        const easingMap: Record<string, string> = {
          linear: "linear",
          ease_in: "ease-in",
          ease_out: "ease-out",
          ease_in_out: "ease-in-out",
        };
        targetShot.timing = {
          ...targetShot.timing,
          speedRamp: {
            startSpeed: vr.entrySpeed,
            endSpeed: vr.exitSpeed,
            easing: (easingMap[vr.easing] ?? "ease-in-out") as any,
          },
        };
      }
    }
  }

  const breakdown = referenceStyle.effects?.transitionsBreakdown ?? {
    cutPercentage: 0.7,
    crossfadePercentage: 0.2,
    otherPercentage: 0.1,
  };

  const flashFrames = referenceStyle.flashFrames ?? [];

  for (let i = 0; i < enrichedShots.length; i++) {
    const shot = enrichedShots[i];
    const rand = Math.random();
    let transitionType: string;

    if (rand < breakdown.cutPercentage) {
      transitionType = "cut";
    } else if (rand < breakdown.cutPercentage + breakdown.crossfadePercentage) {
      transitionType = "crossfade";
    } else {
      const hasFlashFrame = flashFrames.some(
        (f) =>
          f.timestamp >= shot.timing.startTime &&
          f.timestamp < shot.timing.startTime + shot.timing.duration,
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

  return { ...edl, shots: enrichedShots };
}
```

---

### 6. `src/server/lib/reference-color-injector.ts` (86 lines)

Injects per-shot color grades from reference analysis using linear interpolation between keyframes.

```typescript
import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function findBracketingGrades(
  colorGrades: NonNullable<ReferenceStyle["colorGrades"]>,
  time: number
): { prev: number; next: number } {
  if (colorGrades.length === 0) return { prev: -1, next: -1 };

  for (let i = 0; i < colorGrades.length - 1; i++) {
    if (time >= colorGrades[i].timestamp && time <= colorGrades[i + 1].timestamp) {
      return { prev: i, next: i + 1 };
    }
  }

  if (time < colorGrades[0].timestamp) {
    return { prev: 0, next: 0 };
  }

  return { prev: colorGrades.length - 1, next: colorGrades.length - 1 };
}

function interpolateColorGrade(
  colorGrades: NonNullable<ReferenceStyle["colorGrades"]>,
  time: number
): { saturation: number; brightness: number; contrast: number } {
  const { prev, next } = findBracketingGrades(colorGrades, time);

  if (prev === -1 || next === -1) {
    return { saturation: 1, brightness: 1, contrast: 1 };
  }

  if (prev === next) {
    const grade = colorGrades[prev];
    return {
      saturation: grade.saturation,
      brightness: grade.brightness,
      contrast: grade.contrast,
    };
  }

  const a = colorGrades[prev];
  const b = colorGrades[next];
  const t = (time - a.timestamp) / (b.timestamp - a.timestamp || 1);

  return {
    saturation: lerp(a.saturation, b.saturation, t),
    brightness: lerp(a.brightness, b.brightness, t),
    contrast: lerp(a.contrast, b.contrast, t),
  };
}

export function injectReferenceColorGrades(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): MonetEDL {
  const colorGrades = referenceStyle.colorGrades;
  if (!colorGrades || colorGrades.length === 0) return edl;

  for (const shot of edl.shots) {
    const midpoint = shot.timing.startTime + shot.timing.duration / 2;
    const grade = interpolateColorGrade(colorGrades, midpoint);

    const colorGradeEffect = {
      id: `fx_color_grade_${shot.id}`,
      type: "color_grade",
      intensity: 1,
      startTime: shot.timing.startTime,
      duration: shot.timing.duration,
      params: {
        saturation: grade.saturation,
        brightness: grade.brightness,
        contrast: grade.contrast,
      },
    };

    if (!shot.effects) shot.effects = [];
    shot.effects.push(colorGradeEffect);
  }

  return edl;
}
```

---

### 7. `src/server/lib/bezier-velocity.ts` (91 lines)

3-point Bézier velocity curve for video speed ramps. Generates frame-by-frame speed factors and FFmpeg setpts expressions.

```typescript
export interface BezierVelocityCurve {
  entrySpeed: number;
  anchorSpeed: number;
  exitSpeed: number;
  entryFrames: number;
  exitFrames: number;
  anchorPosition: number;
}

export function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let guessT = clamped;
  for (let i = 0; i < 8; i++) {
    const currentX = ((ax * guessT + bx) * guessT + cx) * guessT;
    const dx = (3 * ax * guessT + 2 * bx) * guessT + cx;
    if (Math.abs(dx) < 1e-6) break;
    guessT -= (currentX - clamped) / dx;
  }

  guessT = Math.max(0, Math.min(1, guessT));
  return ((ay * guessT + by) * guessT + cy) * guessT;
}

export function generateVelocityFactors(
  curve: BezierVelocityCurve,
  totalFrames: number,
): number[] {
  const factors: number[] = new Array(totalFrames);
  const entryEnd = Math.min(curve.entryFrames, totalFrames);
  const exitStart = Math.max(totalFrames - curve.exitFrames, 0);
  const midFrames = Math.max(0, exitStart - entryEnd);
  const anchorFrame = Math.floor(entryEnd + midFrames * curve.anchorPosition);

  for (let i = 0; i < totalFrames; i++) {
    let speed: number;

    if (i < entryEnd) {
      const t = entryEnd > 0 ? i / entryEnd : 1;
      const eased = cubicBezier(t, 0.42, 0, 0.58, 1);
      speed = curve.entrySpeed + (curve.anchorSpeed - curve.entrySpeed) * eased;
    } else if (i >= exitStart) {
      const t = midFrames + curve.exitFrames > 0
        ? (i - exitStart) / curve.exitFrames
        : 1;
      const eased = cubicBezier(t, 0.42, 0, 0.58, 1);
      speed = curve.anchorSpeed + (curve.exitSpeed - curve.anchorSpeed) * eased;
    } else {
      speed = curve.anchorSpeed;
    }

    factors[i] = Math.max(0.01, speed);
  }

  return factors;
}

export function velocityToSetpts(factors: number[]): string {
  if (factors.length === 0) return "PTS";

  const segments: string[] = [];
  let i = 0;
  while (i < factors.length) {
    let j = i + 1;
    while (j < factors.length && Math.abs(factors[j] - factors[i]) < 0.001) {
      j++;
    }
    const factor = factors[i];
    const ptsFactor = (1 / factor).toFixed(6);
    if (i === 0 && j === factors.length) {
      return `setpts=${ptsFactor}*PTS`;
    }
    segments.push(`between(N,${i},${j - 1})/${ptsFactor}`);
    i = j;
  }

  return `setpts=(${segments.join("+")})*PTS`;
}

export function velocityToBlur(factors: number[]): number[] {
  return factors.map((speed) => {
    if (speed <= 1.0) return 0;
    return Math.min((speed - 1.0) * 2.5, 8);
  });
}
```

---

### 8. `src/server/lib/style-match-scorer.ts` (166 lines)

Automated 0-100 style match scoring with 4-dimension breakdown: shot duration, cut frequency, effect vocabulary, transition style.

```typescript
import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

interface StyleMatchScore {
  total: number;
  breakdown: {
    shotDuration: number;
    cutFrequency: number;
    effectVocabulary: number;
    transitionStyle: number;
  };
  details: string[];
}

function scoreShotDuration(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  if (edl.shots.length === 0) return { score: 0, detail: "No shots in EDL" };

  const totalDuration = edl.shots.reduce((sum, s) => sum + s.timing.duration, 0);
  const edlAvg = totalDuration / edl.shots.length;
  const refAvg = reference.rhythm.avgShotDuration;

  const diff = Math.abs(edlAvg - refAvg);
  const tolerance = refAvg * 0.3;

  if (diff <= tolerance * 0.5) {
    return { score: 25, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (excellent)` };
  }
  if (diff <= tolerance) {
    return { score: 20, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (good)` };
  }
  if (diff <= tolerance * 2) {
    return { score: 15, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (fair)` };
  }
  if (diff <= tolerance * 3) {
    return { score: 10, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (poor)` };
  }
  return { score: 5, detail: `Shot duration mismatch: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s` };
}

function scoreCutFrequency(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  if (edl.timeline.duration <= 0) return { score: 0, detail: "Zero duration timeline" };

  const edlCutsPerSec = edl.shots.length / edl.timeline.duration;
  const refCutsPerSec = 1 / reference.rhythm.avgShotDuration;

  const diff = Math.abs(edlCutsPerSec - refCutsPerSec);
  const tolerance = refCutsPerSec * 0.3;

  if (diff <= tolerance * 0.5) {
    return { score: 25, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (excellent)` };
  }
  if (diff <= tolerance) {
    return { score: 20, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (good)` };
  }
  if (diff <= tolerance * 2) {
    return { score: 15, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (fair)` };
  }
  if (diff <= tolerance * 3) {
    return { score: 10, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (poor)` };
  }
  return { score: 5, detail: `Cut frequency mismatch: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s` };
}

function scoreEffectVocabulary(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  const refEffects = new Set(reference.effects.commonEffects.map(e => e.toLowerCase()));
  const edlEffects = new Set<string>();

  for (const shot of edl.shots) {
    if (shot.effects) {
      for (const effect of shot.effects) {
        edlEffects.add(effect.type.toLowerCase());
      }
    }
  }

  if (refEffects.size === 0 && edlEffects.size === 0) {
    return { score: 25, detail: "No effects in either (neutral match)" };
  }
  if (refEffects.size === 0) {
    return { score: 10, detail: `EDL has ${edlEffects.size} effects but reference has none` };
  }
  if (edlEffects.size === 0) {
    return { score: 5, detail: "EDL has no effects but reference expects effects" };
  }

  const matched = Array.from(refEffects).filter(e => edlEffects.has(e));
  const coverage = matched.length / refEffects.size;

  const score = Math.round(5 + coverage * 20);
  return {
    score: Math.min(25, Math.max(5, score)),
    detail: `Effect vocabulary: ${matched.length}/${refEffects.size} reference effects used (${(coverage * 100).toFixed(0)}%)`,
  };
}

function scoreTransitionStyle(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  let cuts = 0;
  let crossfades = 0;
  let other = 0;
  let withTransition = 0;

  for (const shot of edl.shots) {
    if (shot.transition) {
      withTransition++;
      const t = shot.transition.type.toLowerCase();
      if (t === "cut") {
        cuts++;
      } else if (t === "crossfade" || t === "dissolve") {
        crossfades++;
      } else {
        other++;
      }
    }
  }

  const total = withTransition > 0 ? withTransition : edl.shots.length;

  if (total === 0) {
    return { score: 15, detail: "No transition data available" };
  }

  const edlCutPct = cuts / total;
  const refCutPct = reference.effects.transitionsBreakdown.cutPercentage;

  const diff = Math.abs(edlCutPct - refCutPct);
  const tolerance = 0.15;

  if (diff <= tolerance * 0.5) {
    return { score: 25, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (excellent)` };
  }
  if (diff <= tolerance) {
    return { score: 20, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (good)` };
  }
  if (diff <= tolerance * 2) {
    return { score: 15, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (fair)` };
  }
  return { score: 10, detail: `Transition style mismatch: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}%` };
}

export function scoreStyleMatch(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): StyleMatchScore {
  const details: string[] = [];

  const shotDuration = scoreShotDuration(edl, referenceStyle);
  const cutFrequency = scoreCutFrequency(edl, referenceStyle);
  const effectVocabulary = scoreEffectVocabulary(edl, referenceStyle);
  const transitionStyle = scoreTransitionStyle(edl, referenceStyle);

  details.push(shotDuration.detail);
  details.push(cutFrequency.detail);
  details.push(effectVocabulary.detail);
  details.push(transitionStyle.detail);

  return {
    total: shotDuration.score + cutFrequency.score + effectVocabulary.score + transitionStyle.score,
    breakdown: {
      shotDuration: shotDuration.score,
      cutFrequency: cutFrequency.score,
      effectVocabulary: effectVocabulary.score,
      transitionStyle: transitionStyle.score,
    },
    details,
  };
}
```

---

### 9. `packages/edl/src/effect-spec.ts` (700 lines)

Shared effect specification with 48 effects. Both Canvas2D and FFmpeg renderers consume this. See full file above.

Key effects: blur, brightness, contrast, saturation, glow, shake, zoom_pulse, invert, sharpen, echo, rgb_split, chromatic_aberration, glitch, scanlines, wave_warp, fisheye, color_balance, noise_grain, light_leak, bloom, context_shake, whip_pan, flash_white, overlay, color_grade, mosaic, find_edges, posterize, strobe_light, mirror, magnify, directional_blur, radial_zoom_blur, motion_blur, chromatic_glitch, comic_ink_edges, frame_stutter_anime, lens_flare, particle_system, vhs_tracking, halftone_benday, posterize_time, desaturate, vignette_pro, bw_toggle, multi_exposure, displacement_map, waveform.

---

### 10. `src/lib/renderer/webcodecs-interpolator.ts` (50 lines)

WebCodecs API utility for hardware-accelerated frame decoding and blending.

```typescript
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

### 11. `workers/python-ai/color_transfer.py` (76 lines)

OpenCV color grading transfer using Reinhard's algorithm + histogram matching.

```python
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

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        saturations.append(np.mean(hsv[:, :, 1]) / 255.0)
        brightnesses.append(np.mean(hsv[:, :, 2]) / 255.0)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        contrasts.append(np.std(gray) / 128.0)

        b, g, r = cv2.split(frame)
        color_temps.append((np.mean(r) - np.mean(b)) / 255.0)

    cap.release()

    return {
        "avgSaturation": float(np.mean(saturations)) if saturations else 0.5,
        "avgBrightness": float(np.mean(brightnesses)) if brightnesses else 0.5,
        "avgContrast": float(np.mean(contrasts)) if contrasts else 0.5,
        "avgTemperature": float(np.mean(color_temps)) if color_temps else 0.0,
        "saturationRange": [float(np.min(saturations)), float(np.max(saturations))] if saturations else [0, 1],
        "brightnessRange": [float(np.min(brightnesses)), float(np.max(brightnesses))] if brightnesses else [0, 1],
    }

def transfer_color(source_frame: np.ndarray, target_profile: dict) -> np.ndarray:
    """Apply color profile to a frame using histogram matching."""
    lab = cv2.cvtColor(source_frame, cv2.COLOR_BGR2LAB).astype(np.float32)

    l_mean = np.mean(lab[:, :, 0])
    l_std = np.std(lab[:, :, 0])
    target_l_mean = target_profile["avgBrightness"] * 255
    target_l_std = target_profile["avgContrast"] * 128

    if l_std > 0:
        lab[:, :, 0] = (lab[:, :, 0] - l_mean) * (target_l_std / l_std) + target_l_mean
    lab[:, :, 0] = np.clip(lab[:, :, 0], 0, 255)

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

---

### 12. `workers/python-ai/text_detector.py` (400 lines)

PaddleOCR text detection with OpenCV fallback. Detects text overlays with confidence gating. See full file above.

---

### 13. `src/server/lib/text-overlay-extractor.ts` (84 lines)

Converts PaddleOCR detections into EDL-compatible text overlays with duration grouping.

```typescript
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
}

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

  const sorted = [...detections].sort((a, b) => a.timestamp - b.timestamp);
  const overlays: DetectedTextOverlay[] = [];
  let current = sorted[0];
  let group = [current];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const sameText = next.text === current.text;
    const samePosition = next.position === current.position;
    const timeGap = next.timestamp - current.timestamp;

    if (sameText && samePosition && timeGap < 1.0) {
      group.push(next);
      current = next;
    } else {
      overlays.push(buildOverlay(group));
      group = [next];
      current = next;
    }
  }

  if (group.length > 0) {
    overlays.push(buildOverlay(group));
  }

  return overlays;
}

function buildOverlay(group: Array<{
  text: string;
  timestamp: number;
  position: string;
  centerX: number;
  centerY: number;
  isWhite: boolean;
  hasStroke: boolean;
  confidence: number;
}>): DetectedTextOverlay {
  const first = group[0];
  const last = group[group.length - 1];
  const avgWidth = group.reduce((s, d) => s + d.centerX, 0) / group.length;
  const fontSize = Math.round(group[0].height * 100);

  return {
    text: first.text,
    startTime: first.timestamp,
    duration: last.timestamp - first.timestamp + (1 / 30),
    position: first.position as "top" | "center" | "bottom",
    style: {
      fontSize: Math.max(12, Math.min(72, fontSize)),
      color: first.isWhite ? "#FFFFFF" : "#000000",
      hasStroke: first.hasStroke,
      fontWeight: first.height > 0.05 ? "bold" : "normal",
    },
  };
}
```

---

### 14. `src/server/lib/vmaf-quality-gate.ts` (224 lines)

Automated export quality verification using FFmpeg (SSIM, PSNR, VMAF, bitrate, resolution, black frame detection). See full file above.

---

### 15. `scripts/style-match-benchmark.ts` (14 lines)

CLI benchmark runner for the style match scorer.

```typescript
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

## Files Modified

### 1. `src/server/types/reference-style.ts`

Added per-shot analysis fields to `ReferenceStyle` interface:

```typescript
// === PER-SHOT ANALYSIS (extracted from FFmpeg frame data) ===
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
flashFrames?: Array<{
  timestamp: number;
  type: "white" | "black";
  brightness: number;
  precedingShotIndex: number;
  followingShotIndex: number;
}>;
```

### 2. `src/server/services/reference-analysis-service.ts`

Added imports and wiring for all extractors, OpenCV color profile, and text detection:

```typescript
import { extractEffectVocabulary, type FrameData, type ReferenceEditTrace } from "../lib/reference-effect-extractor";
import { extractColorGrades } from "../lib/reference-color-extractor";
import { extractVelocityRamps } from "../lib/reference-velocity-extractor";
import { detectFlashFrames } from "../lib/flash-frame-detector";
import { extractTextOverlays, type DetectedTextOverlay } from "../lib/text-overlay-extractor";

async function extractOpenCVColorProfile(videoPath: string): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync("python3", [
      "workers/python-ai/color_transfer.py",
      videoPath,
    ], { timeout: 30_000 });
    return JSON.parse(stdout);
  } catch {
    return { avgSaturation: 0.5, avgBrightness: 0.5, avgContrast: 0.5, avgTemperature: 0, saturationRange: [0, 1], brightnessRange: [0, 1] };
  }
}

async function detectTextOverlays(videoPath: string, fps: number): Promise<DetectedTextOverlay[]> {
  try {
    const { stdout } = await execFileAsync("python3", [
      "workers/python-ai/text_detector.py",
      videoPath,
    ], { timeout: 60_000 });
    const detections = JSON.parse(stdout);
    return extractTextOverlays(detections, fps);
  } catch {
    return [];
  }
}
```

Added to `analyzeReference()`:

```typescript
style.colorProfile = opencvColorProfile;

if (energyFrames.length > 0 && totalDuration > 0) {
  const frameData = buildFrameDataFromEnergy(energyFrames, totalDuration);
  const trace = buildTraceFromScenes(sceneResult, totalDuration);
  const beatTimestamps = llmStyle?.detectedEffects
    ?.filter((e: any) => e.type === "transition")
    .flatMap((e: any) => e.timestampRange ?? []) ?? [];

  style.effectVocabulary = extractEffectVocabulary(trace, frameData);
  style.colorGrades = extractColorGrades(frameData);
  style.velocityRamps = extractVelocityRamps(trace, frameData, beatTimestamps);
  style.flashFrames = detectFlashFrames(frameData, trace.shots);
}
```

### 3. `src/server/lib/edl-generation.ts`

Added imports and wiring for reference effect and color grade injection:

```typescript
import { injectReferenceEffects } from "./reference-effect-injector";
import { injectReferenceColorGrades } from "./reference-color-injector";

// After enforceReferenceStyleOnEDL:
if (referenceStyle) {
  edl = injectReferenceEffects(edl, referenceStyle);
}

if (referenceStyle) {
  edl = injectReferenceColorGrades(edl, referenceStyle);
}
```

### 4. `src/lib/renderer/monet-renderer.ts`

Added flash-frame rendering (lines 1221-1237):

```typescript
if (effectId === "impact_flash" || effectId === "flash_white" || effectId === "flash_black") {
  const flashStart = getEffectParam(effect, "startTime", 0);
  const flashDuration = getEffectParam(effect, "duration", getEffectParam(effect, "durationSec", 0.08));

  if (localTime >= flashStart && localTime <= flashStart + flashDuration) {
    const isFlashFrame = flashDuration <= 0.05;
    const t = (localTime - flashStart) / Math.max(0.001, flashDuration);

    if (isFlashFrame) {
      const flashColor = (effect as any).params?.flashColor === 0
        || (effect as any).params?.flashColor === "black"
        || effectId === "flash_black"
        ? "#000000" : "#ffffff";
      ctx.save();
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else {
      // ... existing flash blend logic
    }
  }
}
```

Added color_grade effect timing fix (line 582):

```typescript
["shake", "zoom_pulse", "whip_pan", "color_grade"].includes(e.type)
```

### 5. `src/lib/renderer/effects.ts`

Added EffectSpecMap lookup and color_grade case:

```typescript
import { EffectSpecMap } from "@monet/edl";

// In applyEffect():
const spec = EffectSpecMap[effect.type];
if (spec?.canvas2d) {
  const params = { intensity: effect.intensity, ...(effect.params ?? {}) };
  for (const [key, def] of Object.entries(spec.params)) {
    if (params[key] === undefined) params[key] = def.default;
  }
  spec.canvas2d(ctx, params, width, height);
  return;
}

// Added case:
case "color_grade": {
  const sat = effect.params?.saturation ?? 1;
  const bright = effect.params?.brightness ?? 1;
  const cont = effect.params?.contrast ?? 1;
  this.appendFilter(ctx, `saturate(${sat}) brightness(${bright}) contrast(${cont})`);
  break;
}
```

### 6. `src/server/lib/editly-effects.ts`

Added EffectSpecMap fallback:

```typescript
import { EffectSpecMap } from "@monet/edl";

// In default case:
default: {
  const spec = EffectSpecMap[effect.type as string];
  if (spec?.ffmpeg) {
    const params = { intensity: effect.intensity ?? 0.5, ...(effect.params ?? {}) };
    for (const [key, def] of Object.entries(spec.params)) {
      if (params[key] === undefined) params[key] = def.default;
    }
    return spec.ffmpeg(params);
  }
}
```

### 7. `src/server/lib/editly-transitions.ts`

Added 14 missing transition mappings:

```typescript
radial_wipe: { name: "Radial" },
clock_wipe: { name: "Radial" },
linear_wipe: { name: "Directional", params: { direction: 0 } },
gradient_wipe: { name: "Directional", params: { direction: 0 } },
barn_doors: { name: "doorway" },
iris: { name: "CircleOpen" },
pinwheel: { name: "PinWheel" },
film_burn: { name: "burn" },
spin: { name: "Angular" },
blur: { name: "CrossZoom" },
pixelate: { name: "pixelize" },
morph_cut: { name: "fade" },
push: { name: "Directional", params: { direction: 1 } },
flash_frame: { name: "fadeBlack" },
flash_white: { name: "fade" },
```

### 8. `src/server/lib/edl-to-editly.ts`

Added Bézier velocity ramp support:

```typescript
import { generateVelocityFactors, velocityToSetpts } from "./bezier-velocity";

// In clip building:
let bezierSetpts: string | undefined;
if (shot.timing.speedRamp && shot.timing.speedRamp.easing !== "linear") {
  const fps = edl.timeline.fps || 30;
  const totalFrames = Math.floor(shot.timing.duration * fps);
  const { startSpeed, endSpeed } = shot.timing.speedRamp;
  const entryFrames = Math.floor(totalFrames * 0.2);
  const exitFrames = Math.floor(totalFrames * 0.2);
  const curve = {
    entrySpeed: startSpeed,
    anchorSpeed: (startSpeed + endSpeed) / 2,
    exitSpeed: endSpeed,
    entryFrames,
    exitFrames,
    anchorPosition: 0.5,
  };
  const factors = generateVelocityFactors(curve, totalFrames);
  bezierSetpts = velocityToSetpts(factors);
}

// Combine filters:
if (bezierSetpts) allFilters.push(bezierSetpts);
if (speedFilter && !bezierSetpts) allFilters.push(speedFilter);
```

### 9. `packages/edl/src/zod-schemas.ts`

Added 14 missing transition types to TransitionTypeSchema:

```typescript
export const TransitionTypeSchema = z.enum([
  "cut", "crossfade", "dissolve", "whip-pan", "whip_pan",
  "zoom-blur", "glitch", "flash", "dip_black", "slide",
  "radial_wipe", "clock_wipe", "linear_wipe", "gradient_wipe",
  "barn_doors", "morph", "iris", "pinwheel", "film_burn",
  "spin", "blur", "pixelate", "flash_frame", "flash_white",
  "morph_cut", "push", "cube", "ripple", "swirl", "dreamy",
  "wind", "mosaic", "radial", "doorway", "heart", "kaleidoscope",
]);
```

### 10. `packages/edl/src/index.ts`

Added effect-spec export:

```typescript
export * from "./effect-spec.js";
```

### 11. `src/server/prompts/generate-edl-v3.txt`

Updated TRANSITIONS section with all 30+ transition types organized by category (BASIC, WIPE, CREATIVE).

### 12. `src/server/api/export-mp4.ts`

Added quality gate after render:

```typescript
import { assessQuality } from "../lib/vmaf-quality-gate";

const quality = await assessQuality(result.filePath);
if (!quality.pass) {
  console.warn("[export-mp4] Quality gate WARNING:", quality.details);
} else {
  console.log("[export-mp4] Quality gate PASSED:", quality.details);
}
```

---

## Data Flow Diagram

```
Reference Video
  │
  ├─→ FFmpeg scene detection ──→ trace.shots[]
  ├─→ FFmpeg energy analysis ──→ energyFrames[]
  ├─→ OpenCV color_transfer.py ──→ colorProfile {}
  ├─→ PaddleOCR text_detector.py ──→ textOverlays[]
  ├─→ Gemini LLM analysis ──→ llmStyle {}
  │
  ├─→ extractEffectVocabulary(trace, frameData) ──→ effectVocabulary[]
  ├─→ extractColorGrades(frameData) ──→ colorGrades[]
  ├─→ extractVelocityRamps(trace, frameData, beats) ──→ velocityRamps[]
  ├─→ detectFlashFrames(frameData, shots) ──→ flashFrames[]
  │
  └─→ ReferenceStyle { effectVocabulary, colorGrades, velocityRamps, flashFrames, ... }
       │
       ├─→ EDL Generation
       │    ├─→ enforceReferenceStyleOnEDL()
       │    ├─→ injectReferenceEffects(edl, style) ──→ effects from vocabulary
       │    ├─→ injectReferenceColorGrades(edl, style) ──→ per-shot color
       │    ├─→ Bézier velocity ramps via bezier-velocity.ts
       │    └─→ Reference-matched transitions
       │
       ├─→ Canvas2D Preview
       │    ├─→ monet-renderer.ts (flash frames, color_grade effects)
       │    ├─→ effects.ts (EffectSpecMap lookup + fallback)
       │    └─→ webcodecs-interpolator.ts (future: frame blending)
       │
       ├─→ FFmpeg Export
       │    ├─→ edl-to-editly.ts (Bézier setpts filters)
       │    ├─→ editly-effects.ts (EffectSpecMap FFmpeg fallback)
       │    └─→ editly-transitions.ts (30+ transition renderers)
       │
       └─→ Quality Gate
            └─→ vmaf-quality-gate.ts (SSIM, PSNR, VMAF, bitrate, black frames)
```

---

## Tool Inventory (All Free)

| Tool | Purpose | License | Cost |
|------|---------|---------|------|
| **Practical-RIFE** | Frame interpolation for velocity ramps | MIT | Free |
| **PaddleOCR** | Text detection in video frames | Apache-2.0 | Free |
| **OpenCV** | Color transfer, histogram matching | Apache-2.0 | Free |
| **FFmpeg + libvmaf** | Quality assessment, rendering | GPL + BSD | Free |
| **Librosa** | Beat detection (already in use) | ISC | Free |
| **WebCodecs API** | Browser-side frame processing | Built-in | Free |
| **Gemini** | Creative decisions (already in use) | Existing budget | $0 incremental |

**Total additional cost: $0**
