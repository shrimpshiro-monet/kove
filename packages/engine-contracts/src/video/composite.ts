/**
 * Composite Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/composite-engine.ts
 *                 apps/kove-advanced/packages/core/src/video/types.ts
 *
 * Defines blend modes, opacity, and layer compositing rules.
 */
import { z } from "zod";

// ── Blend Modes ─────────────────────────────────────────────────────────────

export const BlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

// ── Composite Layer ─────────────────────────────────────────────────────────

export const CompositeLayerSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  blendMode: BlendModeSchema.default("normal"),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(0),
});
export type CompositeLayer = z.infer<typeof CompositeLayerSchema>;

// ── Clip Compositing ────────────────────────────────────────────────────────

export const ClipCompositingSchema = z.object({
  blendMode: BlendModeSchema.default("normal"),
  blendOpacity: z.number().min(0).max(1).default(1),
  maskId: z.string().optional().describe("Reference to a mask applied to this clip"),
});
export type ClipCompositing = z.infer<typeof ClipCompositingSchema>;

// ── Blend Mode Categories ───────────────────────────────────────────────────

export const BLEND_MODE_CATEGORIES = {
  "normal": ["normal"],
  "darken": ["multiply", "darken", "color-burn"],
  "lighten": ["screen", "lighten", "color-dodge"],
  "contrast": ["overlay", "hard-light", "soft-light"],
  "invert": ["difference", "exclusion"],
  "color": ["hue", "saturation", "color", "luminosity"],
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateBlendMode(mode: string): mode is BlendMode {
  return BlendModeSchema.safeParse(mode).success;
}

export function validateClipCompositing(data: unknown): ClipCompositing {
  return ClipCompositingSchema.parse(data);
}
