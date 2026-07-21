/**
 * Keyframes Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/types/timeline.ts
 *                 apps/kove-advanced/packages/core/src/video/keyframe-engine.ts
 *
 * Defines all easing types and keyframe interpolation contracts.
 * These are the exact easing functions available in kove-advanced.
 */
import { z } from "zod";

// ── Easing Types ────────────────────────────────────────────────────────────

export const EasingTypeSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "bezier",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
]);
export type EasingType = z.infer<typeof EasingTypeSchema>;

// ── Keyframe ────────────────────────────────────────────────────────────────

export const KeyframeSchema = z.object({
  id: z.string(),
  time: z.number().min(0),
  property: z.string(),
  value: z.unknown(),
  easing: EasingTypeSchema.default("linear"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

// ── Simplified Keyframe Types (for common use) ──────────────────────────────

export const ScalarKeyframeSchema = z.object({
  time: z.number().min(0),
  value: z.number(),
  easing: EasingTypeSchema.default("linear"),
});
export type ScalarKeyframe = z.infer<typeof ScalarKeyframeSchema>;

export const Vec2KeyframeSchema = z.object({
  time: z.number().min(0),
  x: z.number(),
  y: z.number(),
  easing: EasingTypeSchema.default("linear"),
});
export type Vec2Keyframe = z.infer<typeof Vec2KeyframeSchema>;

// ── Transform Keyframes ─────────────────────────────────────────────────────

export const TransformKeyframesSchema = z.object({
  position: z.array(Vec2KeyframeSchema).default([{ time: 0, x: 0, y: 0 }]),
  scale: z.array(ScalarKeyframeSchema).default([{ time: 0, value: 1 }]),
  rotation: z.array(ScalarKeyframeSchema).default([{ time: 0, value: 0 }]),
  opacity: z.array(ScalarKeyframeSchema).optional(),
  crop: z.array(z.object({
    time: z.number(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })).optional(),
});
export type TransformKeyframes = z.infer<typeof TransformKeyframesSchema>;

// ── Easing Function Map ─────────────────────────────────────────────────────

export type EasingFunction = (t: number) => number;

export const EASING_FUNCTIONS: Record<EasingType, EasingFunction> = {
  "linear": (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  "bezier": (t) => t, // fallback to linear
  "easeInQuad": (t) => t * t,
  "easeOutQuad": (t) => t * (2 - t),
  "easeInOutQuad": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  "easeInCubic": (t) => t * t * t,
  "easeOutCubic": (t) => (--t) * t * t + 1,
  "easeInOutCubic": (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  "easeInQuart": (t) => t * t * t * t,
  "easeOutQuart": (t) => 1 - (--t) * t * t * t,
  "easeInOutQuart": (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),
  "easeInQuint": (t) => t * t * t * t * t,
  "easeOutQuint": (t) => 1 + (--t) * t * t * t * t,
  "easeInOutQuint": (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t),
  "easeInSine": (t) => 1 - Math.cos((t * Math.PI) / 2),
  "easeOutSine": (t) => Math.sin((t * Math.PI) / 2),
  "easeInOutSine": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  "easeInExpo": (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  "easeOutExpo": (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  "easeInOutExpo": (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  "easeInCirc": (t) => 1 - Math.sqrt(1 - t * t),
  "easeOutCirc": (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  "easeInOutCirc": (t) => (t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2),
  "easeInBack": (t) => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
  "easeOutBack": (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  "easeInOutBack": (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  "easeInElastic": (t) => (t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3))),
  "easeOutElastic": (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  "easeInOutElastic": (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1;
  },
  "easeInBounce": (t) => 1 - EASING_FUNCTIONS.easeOutBounce(1 - t),
  "easeOutBounce": (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  "easeInOutBounce": (t) =>
    t < 0.5
      ? (1 - EASING_FUNCTIONS.easeOutBounce(1 - 2 * t)) / 2
      : (1 + EASING_FUNCTIONS.easeOutBounce(2 * t - 1)) / 2,
};

// ── Interpolation ───────────────────────────────────────────────────────────

export function interpolateKeyframes(
  keyframes: Array<{ time: number; value: number; easing?: EasingType }>,
  time: number,
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  // Clamp to range
  if (time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  // Find surrounding keyframes
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (time >= a.time && time <= b.time) {
      const duration = b.time - a.time;
      if (duration <= 0) return a.value;
      const t = (time - a.time) / duration;
      const easing = EASING_FUNCTIONS[a.easing ?? "linear"];
      const easedT = easing(t);
      return a.value + (b.value - a.value) * easedT;
    }
  }

  return keyframes[keyframes.length - 1].value;
}
