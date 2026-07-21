/**
 * Speed Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/speed-engine.ts
 *
 * Defines the parameter schema for speed control on clips:
 * constant speed, variable speed ramps, freeze frames, and pitch correction.
 *
 * The AI generates params matching this contract.
 * Both the simple editor and kove-advanced consume them.
 */
import { z } from "zod";

// ── Easing ──────────────────────────────────────────────────────────────────

export const SpeedEasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);
export type SpeedEasing = z.infer<typeof SpeedEasingSchema>;

// ── Speed Keyframe ──────────────────────────────────────────────────────────

export const SpeedKeyframeSchema = z.object({
  id: z.string(),
  time: z.number().min(0),
  speed: z.number().min(0.1).max(20),
  easing: SpeedEasingSchema,
});
export type SpeedKeyframe = z.infer<typeof SpeedKeyframeSchema>;

// ── Freeze Frame ────────────────────────────────────────────────────────────

export const FreezeFrameSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  sourceTime: z.number().min(0),
  startTime: z.number().min(0),
  duration: z.number().min(0.01),
});
export type FreezeFrame = z.infer<typeof FreezeFrameSchema>;

// ── Clip Speed Data ─────────────────────────────────────────────────────────

export const ClipSpeedDataSchema = z.object({
  clipId: z.string(),
  baseSpeed: z.number().min(0.1).max(20).default(1),
  reverse: z.boolean().default(false),
  keyframes: z.array(SpeedKeyframeSchema).default([]),
  pitchCorrection: z.boolean().default(false),
  freezeFrames: z.array(FreezeFrameSchema).default([]),
  originalDuration: z.number().min(0),
});
export type ClipSpeedData = z.infer<typeof ClipSpeedDataSchema>;

// ── Speed Ramp Presets ──────────────────────────────────────────────────────

export const SPEED_RAMP_PRESETS = {
  "slow-mo-half": { baseSpeed: 0.5, keyframes: [] },
  "slow-mo-quarter": { baseSpeed: 0.25, keyframes: [] },
  "speed-up-2x": { baseSpeed: 2, keyframes: [] },
  "speed-up-4x": { baseSpeed: 4, keyframes: [] },
  "ramp-in": {
    baseSpeed: 1,
    keyframes: [
      { id: "kf-start", time: 0, speed: 0.5, easing: "ease-out" as const },
      { id: "kf-end", time: 1, speed: 2, easing: "ease-in" as const },
    ],
  },
  "ramp-out": {
    baseSpeed: 1,
    keyframes: [
      { id: "kf-start", time: 0, speed: 2, easing: "ease-out" as const },
      { id: "kf-end", time: 1, speed: 0.5, easing: "ease-in" as const },
    ],
  },
  "dramatic-slow": {
    baseSpeed: 1,
    keyframes: [
      { id: "kf-1", time: 0, speed: 1, easing: "linear" as const },
      { id: "kf-2", time: 0.3, speed: 0.25, easing: "ease-in" as const },
      { id: "kf-3", time: 0.7, speed: 0.25, easing: "ease-out" as const },
      { id: "kf-4", time: 1, speed: 1, easing: "linear" as const },
    ],
  },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 20;

export function validateClipSpeed(data: unknown): ClipSpeedData {
  return ClipSpeedDataSchema.parse(data);
}

export function isValidSpeed(speed: number): boolean {
  return speed >= SPEED_MIN && speed <= SPEED_MAX;
}
