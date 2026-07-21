/**
 * Animation Presets Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/animation/gsap-engine.ts
 *                 apps/kove-advanced/packages/core/src/animation/animation-schema.ts
 *
 * Defines GSAP-style animation presets and composition rendering params.
 */
import { z } from "zod";

// ── Animation Property ──────────────────────────────────────────────────────

export const AnimationPropertySchema = z.enum([
  "position.x",
  "position.y",
  "scale.x",
  "scale.y",
  "rotation",
  "opacity",
  "width",
  "height",
]);
export type AnimationProperty = z.infer<typeof AnimationPropertySchema>;

// ── Animation Tween ─────────────────────────────────────────────────────────

export const AnimationTweenSchema = z.object({
  property: AnimationPropertySchema,
  from: z.number(),
  to: z.number(),
  duration: z.number().min(0).max(60).describe("seconds"),
  delay: z.number().min(0).max(30).default(0).describe("seconds"),
  easing: z.string().default("ease-in-out"),
});
export type AnimationTween = z.infer<typeof AnimationTweenSchema>;

// ── Animation Timeline ──────────────────────────────────────────────────────

export const AnimationTimelineSchema = z.object({
  id: z.string(),
  tweens: z.array(AnimationTweenSchema),
  duration: z.number().min(0).max(300).describe("Total timeline duration in seconds"),
  loop: z.boolean().default(false),
  yoyo: z.boolean().default(false).describe("Play forward then backward"),
});
export type AnimationTimeline = z.infer<typeof AnimationTimelineSchema>;

// ── Composition Layer ───────────────────────────────────────────────────────

export const CompositionLayerSchema = z.object({
  id: z.string(),
  type: z.enum(["video", "image", "text", "shape", "svg"]),
  zIndex: z.number().int().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  animation: AnimationTimelineSchema.optional(),
});
export type CompositionLayer = z.infer<typeof CompositionLayerSchema>;

// ── Composition ─────────────────────────────────────────────────────────────

export const CompositionSchema = z.object({
  id: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  fps: z.number().min(1).max(120).default(30),
  duration: z.number().min(0).max(600).describe("seconds"),
  layers: z.array(CompositionLayerSchema),
});
export type Composition = z.infer<typeof CompositionSchema>;

// ── Common Presets ──────────────────────────────────────────────────────────

export const ANIMATION_PRESETS = {
  "fade-in": {
    tweens: [{ property: "opacity" as const, from: 0, to: 1, duration: 0.5, delay: 0, easing: "ease-out" }],
  },
  "fade-out": {
    tweens: [{ property: "opacity" as const, from: 1, to: 0, duration: 0.5, delay: 0, easing: "ease-in" }],
  },
  "slide-in-left": {
    tweens: [
      { property: "position.x" as const, from: -100, to: 0, duration: 0.6, delay: 0, easing: "ease-out" },
      { property: "opacity" as const, from: 0, to: 1, duration: 0.3, delay: 0, easing: "ease-out" },
    ],
  },
  "slide-in-right": {
    tweens: [
      { property: "position.x" as const, from: 100, to: 0, duration: 0.6, delay: 0, easing: "ease-out" },
      { property: "opacity" as const, from: 0, to: 1, duration: 0.3, delay: 0, easing: "ease-out" },
    ],
  },
  "scale-in": {
    tweens: [
      { property: "scale.x" as const, from: 0, to: 1, duration: 0.5, delay: 0, easing: "ease-out" },
      { property: "scale.y" as const, from: 0, to: 1, duration: 0.5, delay: 0, easing: "ease-out" },
      { property: "opacity" as const, from: 0, to: 1, duration: 0.3, delay: 0, easing: "ease-out" },
    ],
  },
  "rotate-in": {
    tweens: [
      { property: "rotation" as const, from: -180, to: 0, duration: 0.8, delay: 0, easing: "ease-out" },
      { property: "opacity" as const, from: 0, to: 1, duration: 0.3, delay: 0, easing: "ease-out" },
    ],
  },
  "bounce-in": {
    tweens: [
      { property: "scale.x" as const, from: 0, to: 1, duration: 0.6, delay: 0, easing: "easeOutBounce" },
      { property: "scale.y" as const, from: 0, to: 1, duration: 0.6, delay: 0, easing: "easeOutBounce" },
    ],
  },
  "elastic-in": {
    tweens: [
      { property: "scale.x" as const, from: 0, to: 1, duration: 1, delay: 0, easing: "easeOutElastic" },
      { property: "scale.y" as const, from: 0, to: 1, duration: 1, delay: 0, easing: "easeOutElastic" },
    ],
  },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateAnimationTween(data: unknown): AnimationTween {
  return AnimationTweenSchema.parse(data);
}

export function validateAnimationTimeline(data: unknown): AnimationTimeline {
  return AnimationTimelineSchema.parse(data);
}

export function validateComposition(data: unknown): Composition {
  return CompositionSchema.parse(data);
}
