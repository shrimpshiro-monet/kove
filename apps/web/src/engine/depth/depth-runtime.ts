// apps/web/src/engine/depth/depth-runtime.ts

import type { DepthMapTrack } from "./depth-types";

export function resolveDepthFrame(
  track: DepthMapTrack | undefined,
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
