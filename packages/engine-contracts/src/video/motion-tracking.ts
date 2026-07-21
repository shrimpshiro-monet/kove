/**
 * Motion Tracking Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/motion-tracking-engine.ts
 *
 * Defines motion tracking params for following subjects across frames.
 */
import { z } from "zod";

// ── Tracking Method ─────────────────────────────────────────────────────────

export const TrackingMethodSchema = z.enum(["feature", "face", "object", "planar"]);
export type TrackingMethod = z.infer<typeof TrackingMethodSchema>;

// ── Tracking Keyframe ───────────────────────────────────────────────────────

export const TrackingKeyframeSchema = z.object({
  time: z.number().min(0),
  x: z.number().min(0).max(1).describe("Normalized 0-1"),
  y: z.number().min(0).max(1).describe("Normalized 0-1"),
  scale: z.number().min(0.1).max(10).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  confidence: z.number().min(0).max(1).optional(),
});
export type TrackingKeyframe = z.infer<typeof TrackingKeyframeSchema>;

// ── Motion Track ────────────────────────────────────────────────────────────

export const MotionTrackSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  method: TrackingMethodSchema,
  keyframes: z.array(TrackingKeyframeSchema),
});
export type MotionTrack = z.infer<typeof MotionTrackSchema>;

// ── Planar Track ────────────────────────────────────────────────────────────

export const PlanarTrackSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  keyframes: z.array(z.object({
    time: z.number().min(0),
    corners: z.tuple([
      z.object({ x: z.number(), y: z.number() }),
      z.object({ x: z.number(), y: z.number() }),
      z.object({ x: z.number(), y: z.number() }),
      z.object({ x: z.number(), y: z.number() }),
    ]),
    confidence: z.number().min(0).max(1).optional(),
  })),
});
export type PlanarTrack = z.infer<typeof PlanarTrackSchema>;

// ── Tracking Usage ──────────────────────────────────────────────────────────

export const TRACKING_USAGE = [
  "text-follow-subject",
  "effect-follow-subject",
  "crop-follow-subject",
  "stabilize",
  "replace-background",
] as const;
export type TrackingUsage = typeof TRACKING_USAGE[number];

// ── Validation ──────────────────────────────────────────────────────────────

export function validateMotionTrack(data: unknown): MotionTrack {
  return MotionTrackSchema.parse(data);
}

export function validatePlanarTrack(data: unknown): PlanarTrack {
  return PlanarTrackSchema.parse(data);
}
