// apps/web/src/engine/timeline-resolver.ts

import type { ProjectEDL as MonetEDL, Clip } from "@monet/edl";

export interface ResolvedFrame {
  clip: Clip;
  localTime: number;
  globalTime: number;
}

export function resolveFrame(
  edl: MonetEDL,
  time: number
): ResolvedFrame | null {
  for (const track of edl.timeline.tracks) {
    if (track.type !== "video") continue;

    for (const clip of track.clips) {
      const start = clip.startTime;
      const end = clip.startTime + clip.duration;

      if (time >= start && time <= end) {
        return {
          clip,
          localTime: (time - start) * (clip.speed || 1),
          globalTime: time,
        };
      }
    }
  }

  return null;
}
