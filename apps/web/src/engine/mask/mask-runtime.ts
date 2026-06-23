// apps/web/src/engine/mask/mask-runtime.ts

import type { SubjectMaskTrack } from "./mask-types";

export function resolveMaskFrame(
  track: SubjectMaskTrack | undefined,
  time: number
): HTMLCanvasElement | null {
  if (!track || track.frames.length === 0) {
    return null;
  }

  let closest = track.frames[0];

  for (const frame of track.frames) {
    if (Math.abs(frame.time - time) < Math.abs(closest.time - time)) {
      closest = frame;
    }
  }

  return closest.canvas;
}
