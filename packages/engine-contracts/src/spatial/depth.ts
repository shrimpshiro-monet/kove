/**
 * Depth Engine Contract
 *
 * Extracted from: apps/web/src/engine/depth/depth-runtime.ts
 *                 apps/web/src/engine/depth/depth-types.ts
 *
 * Defines depth-based effects using depth estimation maps.
 */
import { z } from "zod";

// ── Depth Effect Type ───────────────────────────────────────────────────────

export const DepthEffectTypeSchema = z.enum([
  "depth-blur",
  "depth-fog",
  "depth-parallax",
  "depth-glow",
  "depth-color",
]);
export type DepthEffectType = z.infer<typeof DepthEffectTypeSchema>;

// ── Depth Map ───────────────────────────────────────────────────────────────

export const DepthMapSchema = z.object({
  clipId: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  data: z.string().describe("Base64-encoded depth map image"),
  nearPlane: z.number().min(0).max(1).default(0).describe("Closest depth value"),
  farPlane: z.number().min(0).max(1).default(1).describe("Furthest depth value"),
});
export type DepthMap = z.infer<typeof DepthMapSchema>;

// ── Depth Effect Params ─────────────────────────────────────────────────────

export const DepthEffectParamsSchema = z.object({
  type: DepthEffectTypeSchema,
  focusDepth: z.number().min(0).max(1).default(0.5).describe("Depth to focus on"),
  blurRadius: z.number().min(0).max(50).default(10).describe("Max blur amount"),
  fogColor: z.string().optional().describe("Color for depth-fog"),
  fogDensity: z.number().min(0).max(1).optional().describe("Fog density"),
  parallaxAmount: z.number().min(0).max(1).default(0.2).describe("Parallax displacement"),
  glowColor: z.string().optional(),
  glowIntensity: z.number().min(0).max(3).optional(),
});
export type DepthEffectParams = z.infer<typeof DepthEffectParamsSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateDepthEffect(data: unknown): DepthEffectParams {
  return DepthEffectParamsSchema.parse(data);
}

export function validateDepthMap(data: unknown): DepthMap {
  return DepthMapSchema.parse(data);
}
