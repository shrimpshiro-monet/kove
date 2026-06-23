import { Clip } from "@monet/edl/src/schemas";
import { safePushEffect } from "./utils";

export function applyShake(clip: Clip) {
  if (clip.duration < 0.5) return;

  safePushEffect(clip, {
    id: `shake-${clip.id}`,
    type: "context_shake",
    start: clip.startTime,
    duration: clip.duration,
    params: {
      intensity: 0.4,
      frequency: 8,
      decay: true,
    },
  });
}