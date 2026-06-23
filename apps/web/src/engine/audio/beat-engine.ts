import type { ProjectEDL as MonetEDL } from "@monet/edl";
import type { BeatEngine, BeatPoint } from "./audio-types";

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function nearestPoint(points: BeatPoint[], time: number, kind: BeatPoint["kind"]): BeatPoint | null {
  let nearest: BeatPoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    if (point.kind !== kind) {
      continue;
    }

    const distance = Math.abs(point.time - time);

    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function pulseFromNearest(point: BeatPoint | null, time: number, window: number): number {
  if (!point) return 0;

  const safeWindow = clampNumber(window, 0.01, 1);
  const distance = Math.abs(point.time - time);

  if (distance > safeWindow) return 0;

  const normalized = 1 - distance / safeWindow;
  return clampNumber(normalized * point.strength, 0, 1);
}

export function createBeatEngine(edl: MonetEDL): BeatEngine {
  const points: BeatPoint[] = [];

  for (const marker of edl.timeline.markers ?? []) {
    if (marker.type === "beat") {
      points.push({
        time: marker.time,
        strength: 0.75,
        kind: "beat",
      });
    }

    if (marker.type === "transient") {
      points.push({
        time: marker.time,
        strength: 1,
        kind: "transient",
      });
    }
  }

  points.sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind));

  return {
    getNearestBeat(time: number): BeatPoint | null {
      return nearestPoint(points, time, "beat");
    },

    getNearestTransient(time: number): BeatPoint | null {
      return nearestPoint(points, time, "transient");
    },

    isBeatHit(time: number, threshold = 0.045): boolean {
      const nearest = nearestPoint(points, time, "beat");
      return nearest !== null && Math.abs(nearest.time - time) <= threshold;
    },

    isTransientHit(time: number, threshold = 0.035): boolean {
      const nearest = nearestPoint(points, time, "transient");
      return nearest !== null && Math.abs(nearest.time - time) <= threshold;
    },

    getBeatPulse(time: number, window = 0.12): number {
      return pulseFromNearest(nearestPoint(points, time, "beat"), time, window);
    },

    getTransientPulse(time: number, window = 0.09): number {
      return pulseFromNearest(nearestPoint(points, time, "transient"), time, window);
    },

    getPoints(): BeatPoint[] {
      return points.slice();
    },
  };
}
