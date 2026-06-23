// apps/web/src/engine/keyframes/interpolator.ts

import type { Keyframe } from "./keyframe-types";

export function resolveAnimatedValue(
  param: any,
  time: number
): number {
  if (param === undefined || param === null) {
    return 0;
  }

  if (typeof param === "number") {
    return param;
  }

  if (typeof param === "string") {
    const val = Number(param);
    return isNaN(val) ? 0 : val;
  }

  const base = Number(param.base ?? 0);

  if (!param.keyframes || param.keyframes.length === 0) {
    return base;
  }

  const frames = param.keyframes as Keyframe[];

  let prev = frames[0];
  let next = frames[frames.length - 1];

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];

    if (time >= a.time && time <= b.time) {
      prev = a;
      next = b;
      break;
    }
  }

  if (!prev || !next) {
    return base;
  }

  const duration = next.time - prev.time;

  if (duration <= 0) {
    return prev.value;
  }

  const t = (time - prev.time) / duration;

  const eased = applyEasing(next.easing ?? "linear", t);

  return prev.value + (next.value - prev.value) * eased;
}

function applyEasing(type: string, t: number): number {
  switch (type) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}
