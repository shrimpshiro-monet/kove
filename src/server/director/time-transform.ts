/**
 * time-transform.ts — MoviePy-inspired time transformation for speed ramps.
 *
 * Pattern from Zulko/moviepy:
 *   time_transform(lambda t: factor * t)
 *
 * The cleanest way to implement variable-speed playback: transform the time
 * coordinate before sampling the source. Same input → same output = deterministic.
 */

/**
 * Generate a time mapping function for a speed ramp.
 * Maps output time [0, duration] → source time [inPoint, outPoint]
 * with variable speed via easing.
 *
 * @param inPoint - Source clip start (seconds)
 * @param outPoint - Source clip end (seconds)
 * @param duration - Output duration (seconds)
 * @param easing - Speed curve: "linear", "ease-in", "ease-out", "ease-in-out"
 * @returns Function that maps output time → source time
 */
export function createTimeTransform(
  inPoint: number,
  outPoint: number,
  duration: number,
  easing: string = "linear",
): (t: number) => number {
  const sourceDuration = outPoint - inPoint;

  return (t: number): number => {
    // Normalize t to [0, 1]
    const normalized = Math.min(1, Math.max(0, t / duration));

    // Apply easing to get warped position
    let warped: number;
    switch (easing) {
      case "ease-in":
        warped = normalized * normalized;
        break;
      case "ease-out":
        warped = 1 - (1 - normalized) * (1 - normalized);
        break;
      case "ease-in-out":
        warped = normalized < 0.5
          ? 2 * normalized * normalized
          : 1 - Math.pow(-2 * normalized + 2, 2) / 2;
        break;
      default: // linear
        warped = normalized;
    }

    // Map to source time
    return inPoint + warped * sourceDuration;
  };
}

/**
 * generateSetptsFilter — REMOVED: Redundant with bezier-velocity.ts.
 * Use velocityToSetpts() from bezier-velocity.ts for FFmpeg setpts generation.
 */

/**
 * Generate velocity factors for a speed ramp curve.
 * This is the "velocity curve" pattern from MoviePy.
 *
 * @param curve - Speed curve definition
 * @param totalFrames - Total frames in the shot
 * @returns Array of speed factors, one per frame
 */
export function generateVelocityFactors(
  curve: {
    entrySpeed: number;
    anchorSpeed: number;
    exitSpeed: number;
    entryFrames: number;
    exitFrames: number;
    anchorPosition: number;
  },
  totalFrames: number,
): number[] {
  const factors: number[] = [];
  const { entrySpeed, anchorSpeed, exitSpeed, entryFrames, exitFrames, anchorPosition } = curve;

  for (let i = 0; i < totalFrames; i++) {
    let factor: number;

    if (i < entryFrames) {
      // Entry: ease from entrySpeed to anchorSpeed
      const progress = i / entryFrames;
      factor = entrySpeed + (anchorSpeed - entrySpeed) * progress;
    } else if (i >= totalFrames - exitFrames) {
      // Exit: ease from anchorSpeed to exitSpeed
      const progress = (i - (totalFrames - exitFrames)) / exitFrames;
      factor = anchorSpeed + (exitSpeed - anchorSpeed) * progress;
    } else {
      // Middle: constant anchor speed
      factor = anchorSpeed;
    }

    factors.push(factor);
  }

  return factors;
}

/**
 * Apply time_transform to get effective cut points.
 * This is the MoviePy pattern applied to EDL shots.
 *
 * @param inPoint - Source clip start (seconds)
 * @param outPoint - Source clip end (seconds)
 * @param duration - Output duration (seconds)
 * @param fps - Frames per second
 * @param easing - Speed curve type
 * @returns Updated cutFrom/cutTo values for the clip
 */
export function applyTimeTransform(
  inPoint: number,
  outPoint: number,
  duration: number,
  fps: number,
  easing: string = "linear",
): { cutFrom: number; cutTo: number } {
  const transform = createTimeTransform(inPoint, outPoint, duration, easing);

  // Sample at start and end to get effective cut points
  const cutFrom = transform(0);
  const cutTo = transform(duration);

  return {
    cutFrom: Math.round(cutFrom * fps) / fps,
    cutTo: Math.round(cutTo * fps) / fps,
  };
}
