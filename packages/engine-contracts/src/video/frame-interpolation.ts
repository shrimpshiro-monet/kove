/**
 * Frame Interpolation Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/frame-interpolation/frame-interpolation-engine.ts
 *
 * Defines frame interpolation params for generating intermediate frames (slow-mo, smooth playback).
 */
import { z } from "zod";

// ── Interpolation Method ────────────────────────────────────────────────────

export const InterpolationMethodSchema = z.enum([
  "linear",
  "optical-flow",
  "rife",
  "frame-blending",
]);
export type InterpolationMethod = z.infer<typeof InterpolationMethodSchema>;

// ── Interpolation Quality ───────────────────────────────────────────────────

export const InterpolationQualitySchema = z.enum(["low", "medium", "high"]);
export type InterpolationQuality = z.infer<typeof InterpolationQualitySchema>;

// ── Frame Interpolation Params ──────────────────────────────────────────────

export const FrameInterpolationParamsSchema = z.object({
  method: InterpolationMethodSchema.default("optical-flow"),
  quality: InterpolationQualitySchema.default("medium"),
  targetFps: z.number().min(24).max(240).optional().describe("Target output FPS"),
  motionBlur: z.boolean().default(false).describe("Add motion blur to interpolated frames"),
  sensitivity: z.number().min(0).max(1).default(0.5).describe("Motion sensitivity threshold"),
});
export type FrameInterpolationParams = z.infer<typeof FrameInterpolationParamsSchema>;

// ── Speed → Interpolation Mapping ───────────────────────────────────────────

export const SPEED_INTERPOLATION_MAP = {
  0.25: { method: "rife" as const, quality: "high" as const },
  0.5: { method: "optical-flow" as const, quality: "high" as const },
  0.75: { method: "optical-flow" as const, quality: "medium" as const },
  1.0: { method: "linear" as const, quality: "low" as const },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateFrameInterpolation(data: unknown): FrameInterpolationParams {
  return FrameInterpolationParamsSchema.parse(data);
}

export function getInterpolationForSpeed(speed: number): FrameInterpolationParams {
  if (speed >= 1) return { method: "linear", quality: "low", motionBlur: false, sensitivity: 0.5 };
  if (speed <= 0.25) return { method: "rife", quality: "high", motionBlur: true, sensitivity: 0.3 };
  return { method: "optical-flow", quality: "high", motionBlur: false, sensitivity: 0.5 };
}
