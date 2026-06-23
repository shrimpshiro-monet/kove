import { Clip } from "@monet/edl/src/schemas";
import { safePushEffect } from "./utils";

export function applyImpactFlash(clip: Clip) {
  safePushEffect(clip, {
    id: `flash-${clip.id}`,
    type: "impact_flash",
    start: clip.startTime,
    duration: 0.15,
    params: {
      intensity: 0.9,
    },
  });
}