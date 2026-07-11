/**
 * Bézier Time-Remapping Generator
 * Generates frame-accurate velocity maps for premium speed ramping.
 * Fast → Slow → Fast per clip, beat-synced.
 */

interface BezierConfig {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

/**
 * Standard Cubic Bézier solver for a single dimension.
 * Newton-Raphson iteration to find x matching t.
 */
function getBezierValue(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  if (t === 0 || t === 1) return t;

  let x = t;
  for (let i = 0; i < 8; i++) {
    const currentX =
      3 * Math.pow(1 - x, 2) * x * p1x +
      3 * (1 - x) * Math.pow(x, 2) * p2x +
      Math.pow(x, 3);
    const derivativeX =
      3 * Math.pow(1 - x, 2) * p1x +
      6 * (1 - x) * x * (p2x - p1x) +
      3 * Math.pow(x, 2) * (1 - p2x);
    if (Math.abs(currentX - t) < 1e-6) break;
    if (Math.abs(derivativeX) < 1e-6) break;
    x -= (currentX - t) / derivativeX;
  }

  return (
    3 * Math.pow(1 - x, 2) * x * p1y +
    3 * (1 - x) * Math.pow(x, 2) * p2y +
    Math.pow(x, 3)
  );
}

interface VelocityMapOptions {
  sourceFps: number;
  outputFps: number;
  totalDurationFrames: number;
  beatFrame: number;
  curves: {
    entry: BezierConfig;
    exit: BezierConfig;
  };
}

/**
 * Generates an array mapping each output frame index to its precise
 * fractional source frame index.
 *
 * Entry phase (frames 0 → beatFrame):
 *   Fast deceleration from 400% → 100% speed
 *
 * Exit phase (frames beatFrame → end):
 *   Fast acceleration from 100% → 300% speed
 */
export function generateVelocityFrameMap(
  options: Pick<VelocityMapOptions, "totalDurationFrames" | "beatFrame" | "curves">
): number[] {
  const { totalDurationFrames, beatFrame, curves } = options;
  const frameMap = new Array<number>(totalDurationFrames);

  let currentSourceFrame = 0;

  for (let outFrame = 0; outFrame < totalDurationFrames; outFrame++) {
    if (outFrame <= beatFrame) {
      const progress = outFrame / (beatFrame || 1);
      const easedProgress = getBezierValue(
        progress,
        curves.entry.p1x,
        curves.entry.p1y,
        curves.entry.p2x,
        curves.entry.p2y
      );
      currentSourceFrame = easedProgress * beatFrame * 2.5;
    } else {
      const progress =
        (outFrame - beatFrame) / (totalDurationFrames - beatFrame || 1);
      const easedProgress = getBezierValue(
        progress,
        curves.exit.p1x,
        curves.exit.p1y,
        curves.exit.p2x,
        curves.exit.p2y
      );
      const baseSourceIndex = beatFrame * 2.5;
      currentSourceFrame =
        baseSourceIndex +
        easedProgress * (totalDurationFrames - beatFrame) * 1.8;
    }

    frameMap[outFrame] = currentSourceFrame;
  }

  return frameMap;
}

/**
 * Standard velocity presets matching CapCut/AE style editing.
 */
export const VELOCITY_PRESETS = {
  /** Default: Fast → Slow → Fast (most common) */
  default: {
    entry: { p1x: 0.1, p1y: 0.9, p2x: 0.2, p2y: 1.0 },
    exit: { p1x: 0.8, p1y: 0.0, p2x: 0.9, p2y: 0.2 },
  },
  /** Whip: Aggressive entry, quick exit */
  whip: {
    entry: { p1x: 0.05, p1y: 0.95, p2x: 0.15, p2y: 1.0 },
    exit: { p1x: 0.85, p1y: 0.0, p2x: 0.95, p2y: 0.3 },
  },
  /** Slow-mo emphasis: Long anchor phase */
  slowmo: {
    entry: { p1x: 0.2, p1y: 0.8, p2x: 0.3, p2y: 1.0 },
    exit: { p1x: 0.7, p1y: 0.0, p2x: 0.8, p2y: 0.2 },
  },
  /** Snap: Instant deceleration */
  snap: {
    entry: { p1x: 0.0, p1y: 1.0, p2x: 0.1, p2y: 1.0 },
    exit: { p1x: 0.9, p1y: 0.0, p2x: 1.0, p2y: 0.0 },
  },
} as const;

export type VelocityPreset = keyof typeof VELOCITY_PRESETS;
