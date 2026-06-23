import { Clip } from "@monet/edl/src/schemas";

export function applyPushIn(clip: Clip) {
  const endScale = 1.1;

  clip.transforms.scale = [
    { time: 0, value: 1 },
    { time: clip.duration, value: endScale, easing: "ease-in-out" },
  ];
}