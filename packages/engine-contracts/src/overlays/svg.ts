/**
 * SVG Animation Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/graphics/svg-animation-presets.ts
 *
 * Defines SVG overlay animation presets.
 */
import { z } from "zod";

// ── SVG Animation Type ──────────────────────────────────────────────────────

export const SVGAnimationTypeSchema = z.enum([
  "none",
  "draw-stroke",
  "fade-in",
  "scale-in",
  "rotate-in",
  "slide-in",
  "morph",
  "path-trace",
]);
export type SVGAnimationType = z.infer<typeof SVGAnimationTypeSchema>;

// ── SVG Animation ───────────────────────────────────────────────────────────

export const SVGAnimationSchema = z.object({
  type: SVGAnimationTypeSchema.default("none"),
  duration: z.number().min(0).max(10).default(1),
  delay: z.number().min(0).max(10).default(0),
  easing: z.string().default("ease-in-out"),
  loop: z.boolean().default(false),
});
export type SVGAnimation = z.infer<typeof SVGAnimationSchema>;

// ── SVG Overlay ─────────────────────────────────────────────────────────────

export const SVGOverlaySchema = z.object({
  id: z.string(),
  svgContent: z.string(),
  viewBox: z.object({
    minX: z.number(),
    minY: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  scale: z.number().min(0.1).max(10).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  animation: SVGAnimationSchema.optional(),
  tint: z.object({
    color: z.string(),
    opacity: z.number().min(0).max(1).default(1),
  }).optional(),
});
export type SVGOverlay = z.infer<typeof SVGOverlaySchema>;

// ── Presets ─────────────────────────────────────────────────────────────────

export const SVG_ANIMATION_PRESETS: Record<SVGAnimationType, Partial<SVGAnimation>> = {
  "none": {},
  "draw-stroke": { duration: 1.5, easing: "ease-in-out" },
  "fade-in": { duration: 0.5, easing: "ease-out" },
  "scale-in": { duration: 0.6, easing: "ease-out" },
  "rotate-in": { duration: 0.8, easing: "ease-out" },
  "slide-in": { duration: 0.5, easing: "ease-out" },
  "morph": { duration: 1, easing: "ease-in-out" },
  "path-trace": { duration: 2, easing: "linear" },
};

// ── Validation ──────────────────────────────────────────────────────────────

export function validateSVGOverlay(data: unknown): SVGOverlay {
  return SVGOverlaySchema.parse(data);
}
