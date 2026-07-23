/**
 * Stabilization Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/stabilization/stabilization-engine.ts
 *                 apps/kove-advanced/packages/core/src/video/stabilization/vidstab-engine.ts
 *
 * Defines video stabilization params.
 */
import { z } from "zod";

// ── Stabilization Profile ───────────────────────────────────────────────────

export const StabilizationProfileSchema = z.enum([
  "subtle",
  "standard",
  "aggressive",
  "tripod",
]);
export type StabilizationProfile = z.infer<typeof StabilizationProfileSchema>;

// ── Crop Mode ───────────────────────────────────────────────────────────────

export const StabilizationCropModeSchema = z.enum(["auto", "none"]);
export type StabilizationCropMode = z.infer<typeof StabilizationCropModeSchema>;

// ── Stabilization Params ────────────────────────────────────────────────────

export const StabilizationParamsSchema = z.object({
  enabled: z.boolean().default(false),
  strength: z.number().min(0).max(1).default(0.5).describe("0=subtle, 1=maximum"),
  cropMode: StabilizationCropModeSchema.default("auto"),
  profile: StabilizationProfileSchema.optional(),
});
export type StabilizationParams = z.infer<typeof StabilizationParamsSchema>;

// ── Stabilization Presets ───────────────────────────────────────────────────

export const STABILIZATION_PRESETS: Record<StabilizationProfile, StabilizationParams> = {
  "subtle": { enabled: true, strength: 0.2, cropMode: "auto", profile: "subtle" },
  "standard": { enabled: true, strength: 0.5, cropMode: "auto", profile: "standard" },
  "aggressive": { enabled: true, strength: 0.8, cropMode: "auto", profile: "aggressive" },
  "tripod": { enabled: true, strength: 1.0, cropMode: "none", profile: "tripod" },
};

// ── Validation ──────────────────────────────────────────────────────────────

export function validateStabilization(data: unknown): StabilizationParams {
  return StabilizationParamsSchema.parse(data);
}
