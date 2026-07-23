/**
 * Volume Automation Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/audio/clip-volume-automation.ts
 *                 apps/kove-advanced/packages/core/src/audio/volume-automation.ts
 *
 * Defines volume automation curves for clips.
 */
import { z } from "zod";

// ── Volume Point ────────────────────────────────────────────────────────────

export const VolumePointSchema = z.object({
  time: z.number().min(0),
  value: z.number().min(0).max(2).describe("0=silence, 1=normal, 2=double volume"),
});
export type VolumePoint = z.infer<typeof VolumePointSchema>;

// ── Volume Curve ────────────────────────────────────────────────────────────

export const VolumeCurveSchema = z.object({
  points: z.array(VolumePointSchema).min(1),
});
export type VolumeCurve = z.infer<typeof VolumeCurveSchema>;

// ── Clip Volume ─────────────────────────────────────────────────────────────

export const ClipVolumeSchema = z.object({
  clipId: z.string(),
  baseVolume: z.number().min(0).max(2).default(1),
  automation: VolumeCurveSchema.optional(),
  fade: z.object({
    fadeIn: z.number().min(0).max(30).default(0).describe("seconds"),
    fadeOut: z.number().min(0).max(30).default(0).describe("seconds"),
    fadeInCurve: z.enum(["linear", "exponential", "logarithmic", "s-curve"]).default("linear"),
    fadeOutCurve: z.enum(["linear", "exponential", "logarithmic", "s-curve"]).default("linear"),
  }).optional(),
});
export type ClipVolume = z.infer<typeof ClipVolumeSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateClipVolume(data: unknown): ClipVolume {
  return ClipVolumeSchema.parse(data);
}

export function interpolateVolume(points: VolumePoint[], time: number): number {
  if (points.length === 0) return 1;
  if (time <= points[0].time) return points[0].value;
  if (time >= points[points.length - 1].time) return points[points.length - 1].value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * t;
    }
  }
  return points[points.length - 1].value;
}
