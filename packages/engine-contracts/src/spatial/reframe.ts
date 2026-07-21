/**
 * Auto Reframe Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/ai/auto-reframe-engine.ts
 *                 apps/web/src/engine/reframe/reframe-applier.ts
 *
 * Defines auto-reframe params for smart cropping to different aspect ratios.
 */
import { z } from "zod";

// ── Reframe Mode ────────────────────────────────────────────────────────────

export const ReframeModeSchema = z.enum([
  "center",
  "face",
  "object",
  "smart",
]);
export type ReframeMode = z.infer<typeof ReframeModeSchema>;

// ── Reframe Params ──────────────────────────────────────────────────────────

export const ReframeParamsSchema = z.object({
  targetRatio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).describe("Target aspect ratio"),
  mode: ReframeModeSchema.default("smart"),
  lockSubject: z.string().optional().describe("Track ID to keep in frame"),
  padding: z.number().min(0).max(0.5).default(0.05).describe("Padding around subject"),
  smoothness: z.number().min(0).max(1).default(0.5).describe("Motion smoothing"),
});
export type ReframeParams = z.infer<typeof ReframeParamsSchema>;

// ── Reframe Crop Path ───────────────────────────────────────────────────────

export const ReframeCropPointSchema = z.object({
  time: z.number().min(0),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type ReframeCropPoint = z.infer<typeof ReframeCropPointSchema>;

export const ReframeCropPathSchema = z.object({
  clipId: z.string(),
  sourceRatio: z.string(),
  targetRatio: z.string(),
  points: z.array(ReframeCropPointSchema),
  fps: z.number().min(1).max(120).default(30),
});
export type ReframeCropPath = z.infer<typeof ReframeCropPathSchema>;

// ── Ratio Conversions ───────────────────────────────────────────────────────

export const RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
  "3:4": { width: 1080, height: 1440 },
};

// ── Validation ──────────────────────────────────────────────────────────────

export function validateReframeParams(data: unknown): ReframeParams {
  return ReframeParamsSchema.parse(data);
}

export function validateReframeCropPath(data: unknown): ReframeCropPath {
  return ReframeCropPathSchema.parse(data);
}
