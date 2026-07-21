/**
 * Audio Effects Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/audio/audio-effects-engine.ts
 *                 apps/kove-advanced/packages/core/src/audio/clip-audio-resolution.ts
 *
 * Re-exports audio effect types from ducking.ts and adds clip-level audio resolution.
 */
import { z } from "zod";

// Re-export all audio effect types from ducking contract
export {
  AudioEffectTypeSchema,
  type AudioEffectType,
  EQBandSchema,
  type EQBand,
  CompressorParamsSchema,
  type CompressorParams,
  ReverbParamsSchema,
  type ReverbParams,
  DelayParamsSchema,
  type DelayParams,
  NoiseReductionParamsSchema,
  type NoiseReductionParams,
  FadeParamsSchema,
  FadeCurveSchema,
  type FadeParams,
  type FadeCurve,
  AudioEffectParamsSchema,
  type AudioEffectParams,
} from "./ducking";

// ── Clip Audio Resolution ───────────────────────────────────────────────────

export const ClipAudioResolutionSchema = z.object({
  clipId: z.string(),
  volume: z.number().min(0).max(2).default(1),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  audioTrackIndex: z.number().int().min(0).default(0).describe("Which audio track within the source file"),
  fade: z.object({
    fadeIn: z.number().min(0).default(0),
    fadeOut: z.number().min(0).default(0),
  }).optional(),
});
export type ClipAudioResolution = z.infer<typeof ClipAudioResolutionSchema>;

// ── Volume Automation Point ─────────────────────────────────────────────────

export const VolumeAutomationPointSchema = z.object({
  time: z.number().min(0),
  value: z.number().min(0).max(2),
});
export type VolumeAutomationPoint = z.infer<typeof VolumeAutomationPointSchema>;

// ── Volume Automation ───────────────────────────────────────────────────────

export const VolumeAutomationSchema = z.object({
  clipId: z.string(),
  points: z.array(VolumeAutomationPointSchema),
});
export type VolumeAutomation = z.infer<typeof VolumeAutomationSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateClipAudio(data: unknown): ClipAudioResolution {
  return ClipAudioResolutionSchema.parse(data);
}
