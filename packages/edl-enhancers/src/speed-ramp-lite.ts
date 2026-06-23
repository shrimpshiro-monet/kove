import { Clip } from "@monet/edl/src/schemas";
import { safePushEffect } from "./utils";

export function applySpeedRamp(clip: Clip) {
  if (clip.duration < 1) return;

  const rampDuration = Math.min(0.4, clip.duration / 2);

  safePushEffect(clip, {
    id: `speed-ramp-${clip.id}`,
    type: "speed_ramp",
    start: clip.startTime,
    duration: rampDuration,
    params: {
      from: 1,
      to: 1.5,
      easing: "ease-in",
    },
  });
}