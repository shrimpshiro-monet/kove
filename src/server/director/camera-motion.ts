/**
 * camera-motion.ts — Classify camera motion patterns from optical flow data.
 *
 * Aggregates per-shot motion direction into camera movement patterns:
 * - pan (horizontal movement)
 * - tilt (vertical movement)
 * - zoom_in / zoom_out (scale change)
 * - handheld (random small movements)
 * - steadicam (smooth movement)
 * - static (no movement)
 */

export interface CameraMotionProfile {
  overall: "static" | "pan" | "tilt" | "zoom_in" | "zoom_out" | "handheld" | "steadicam" | "mixed";
  breakdown: {
    panRatio: number;
    tiltRatio: number;
    zoomRatio: number;
    handheldRatio: number;
    steadyRatio: number;
    staticRatio: number;
  };
  avgMagnitude: number;
  maxMagnitude: number;
  dominantDirection: string;
  motionVariability: number;
}

/**
 * Classify camera motion from per-shot velocity data.
 *
 * @param shots - Array of shots with motionDir and motion fields
 * @param velocity - Full velocity data from optical flow
 * @returns Camera motion profile
 */
export function classifyCameraMotion(
  shots: Array<{ motionDir: string; motion: number; start_time: number; end_time: number }>,
  velocity: Array<{ timestamp: number; magnitude: number; direction: string }>,
): CameraMotionProfile {
  if (shots.length === 0) {
    return {
      overall: "static",
      breakdown: { panRatio: 0, tiltRatio: 0, zoomRatio: 0, handheldRatio: 0, steadyRatio: 0, staticRatio: 1 },
      avgMagnitude: 0,
      maxMagnitude: 0,
      dominantDirection: "none",
      motionVariability: 0,
    };
  }

  // Count motion directions across shots
  const directionCounts: Record<string, number> = {};
  let totalMagnitude = 0;
  let maxMagnitude = 0;
  let staticShots = 0;
  let handheldShots = 0;
  let steadyShots = 0;

  for (const shot of shots) {
    const dir = shot.motionDir || "none";
    directionCounts[dir] = (directionCounts[dir] || 0) + 1;
    totalMagnitude += shot.motion;
    maxMagnitude = Math.max(maxMagnitude, shot.motion);

    if (shot.motion < 0.5) {
      staticShots++;
    } else if (shot.motion < 2.0 && dir !== "none") {
      // Low magnitude with direction = steady movement
      steadyShots++;
    } else if (shot.motion > 3.0) {
      // High magnitude = handheld or dynamic
      handheldShots++;
    }
  }

  const total = shots.length;
  const avgMagnitude = totalMagnitude / total;

  // Calculate direction ratios
  const leftRight = (directionCounts["left"] || 0) + (directionCounts["right"] || 0);
  const upDown = (directionCounts["up"] || 0) + (directionCounts["down"] || 0);

  const panRatio = leftRight / total;
  const tiltRatio = upDown / total;
  const staticRatio = staticShots / total;
  const handheldRatio = handheldShots / total;
  const steadyRatio = steadyShots / total;

  // Zoom detection: look for consistent magnitude changes within shots
  const zoomRatio = detectZoomFromVelocity(velocity, shots);

  // Determine overall classification
  let overall: CameraMotionProfile["overall"];
  if (staticRatio > 0.6) {
    overall = "static";
  } else if (panRatio > 0.4 && panRatio > tiltRatio) {
    overall = "pan";
  } else if (tiltRatio > 0.4 && tiltRatio > panRatio) {
    overall = "tilt";
  } else if (zoomRatio > 0.3) {
    overall = avgMagnitude > 2 ? "zoom_in" : "zoom_out";
  } else if (handheldRatio > 0.3) {
    overall = "handheld";
  } else if (steadyRatio > 0.3) {
    overall = "steadicam";
  } else {
    overall = "mixed";
  }

  // Find dominant direction
  let dominantDirection = "none";
  let maxCount = 0;
  for (const [dir, count] of Object.entries(directionCounts)) {
    if (count > maxCount && dir !== "none") {
      maxCount = count;
      dominantDirection = dir;
    }
  }

  // Calculate motion variability (std dev of magnitudes)
  const magnitudes = shots.map(s => s.motion);
  const mean = avgMagnitude;
  const variance = magnitudes.reduce((s, m) => s + (m - mean) ** 2, 0) / magnitudes.length;
  const motionVariability = Math.sqrt(variance);

  return {
    overall,
    breakdown: {
      panRatio,
      tiltRatio,
      zoomRatio,
      handheldRatio,
      steadyRatio,
      staticRatio,
    },
    avgMagnitude,
    maxMagnitude,
    dominantDirection,
    motionVariability,
  };
}

/**
 * Detect zoom patterns from velocity data within shots.
 * Zoom is characterized by consistent magnitude changes (increasing or decreasing).
 */
function detectZoomFromVelocity(
  velocity: Array<{ timestamp: number; magnitude: number }>,
  shots: Array<{ start_time: number; end_time: number }>,
): number {
  let zoomShots = 0;

  for (const shot of shots) {
    const samples = velocity
      .filter(v => v.timestamp >= shot.start_time && v.timestamp < shot.end_time)
      .map(v => v.magnitude);

    if (samples.length < 3) continue;

    // Check for consistent trend (zoom = monotonic increase or decrease)
    let increasing = 0;
    let decreasing = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] > samples[i - 1]) increasing++;
      else if (samples[i] < samples[i - 1]) decreasing++;
    }

    const trend = Math.abs(increasing - decreasing) / (samples.length - 1);
    if (trend > 0.6) {
      zoomShots++;
    }
  }

  return shots.length > 0 ? zoomShots / shots.length : 0;
}
