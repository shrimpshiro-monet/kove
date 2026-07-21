/**
 * Mask Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/mask-engine.ts
 *                 apps/kove-advanced/packages/core/src/types/effects.ts (mask params)
 *
 * Defines mask shapes and params for selective effects.
 */
import { z } from "zod";

// ── Mask Type ───────────────────────────────────────────────────────────────

export const MaskTypeSchema = z.enum(["rectangle", "ellipse", "polygon", "bezier"]);
export type MaskType = z.infer<typeof MaskTypeSchema>;

// ── Mask Params ─────────────────────────────────────────────────────────────

export const MaskParamsSchema = z.object({
  type: MaskTypeSchema,
  points: z.array(z.object({ x: z.number(), y: z.number() })).default([]).describe("Vertices for polygon/bezier"),
  feather: z.number().min(0).max(100).default(0).describe("Edge softness in pixels"),
  inverted: z.boolean().default(false).describe("Invert the mask"),
  expansion: z.number().min(-100).max(100).default(0).describe("Expand/contract mask edge"),
});
export type MaskParams = z.infer<typeof MaskParamsSchema>;

// ── Rectangle Mask ──────────────────────────────────────────────────────────

export const RectangleMaskSchema = MaskParamsSchema.extend({
  type: z.literal("rectangle"),
}).extend({
  x: z.number().min(0).max(1).default(0.25).describe("Left edge (0-1 normalized)"),
  y: z.number().min(0).max(1).default(0.25).describe("Top edge (0-1 normalized)"),
  width: z.number().min(0).max(1).default(0.5).describe("Width (0-1 normalized)"),
  height: z.number().min(0).max(1).default(0.5).describe("Height (0-1 normalized)"),
});

// ── Ellipse Mask ────────────────────────────────────────────────────────────

export const EllipseMaskSchema = MaskParamsSchema.extend({
  type: z.literal("ellipse"),
}).extend({
  centerX: z.number().min(0).max(1).default(0.5),
  centerY: z.number().min(0).max(1).default(0.5),
  radiusX: z.number().min(0).max(1).default(0.3),
  radiusY: z.number().min(0).max(1).default(0.3),
});

// ── Presets ─────────────────────────────────────────────────────────────────

export const MASK_PRESETS = {
  "center-focus": {
    type: "ellipse" as const,
    centerX: 0.5, centerY: 0.5, radiusX: 0.35, radiusY: 0.35,
    feather: 30, inverted: false,
  },
  "vignette-mask": {
    type: "ellipse" as const,
    centerX: 0.5, centerY: 0.5, radiusX: 0.5, radiusY: 0.5,
    feather: 50, inverted: true,
  },
  "top-third": {
    type: "rectangle" as const,
    x: 0, y: 0, width: 1, height: 0.333,
    feather: 10, inverted: false,
  },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateMask(data: unknown): MaskParams {
  return MaskParamsSchema.parse(data);
}
