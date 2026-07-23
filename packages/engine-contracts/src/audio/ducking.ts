/**
 * Audio Ducking Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/audio/audio-engine.ts
 *                 apps/kove-advanced/packages/core/src/types/effects.ts (AudioEffectParams)
 *
 * Defines audio ducking, beat sync, and audio effect params.
 */
import { z } from "zod";

// ── Ducking Params ──────────────────────────────────────────────────────────

export const DuckingParamsSchema = z.object({
  musicTrackId: z.string().describe("Track to duck"),
  voiceTrackId: z.string().optional().describe("Track that triggers ducking"),
  duckAmount: z.number().min(0).max(1).default(0.3).describe("How much to reduce volume"),
  attack: z.number().min(0).max(2).default(0.1).describe("Fade-in time in seconds"),
  release: z.number().min(0).max(5).default(0.5).describe("Fade-out time in seconds"),
});
export type DuckingParams = z.infer<typeof DuckingParamsSchema>;

// ── Audio Effect Types ──────────────────────────────────────────────────────

export const AudioEffectTypeSchema = z.enum([
  "gain",
  "pan",
  "eq",
  "compressor",
  "reverb",
  "delay",
  "noiseReduction",
  "fadeIn",
  "fadeOut",
]);
export type AudioEffectType = z.infer<typeof AudioEffectTypeSchema>;

// ── EQ Band ─────────────────────────────────────────────────────────────────

export const EQBandTypeSchema = z.enum([
  "lowshelf", "highshelf", "peaking", "lowpass", "highpass", "notch",
]);
export type EQBandType = z.infer<typeof EQBandTypeSchema>;

export const EQBandSchema = z.object({
  type: EQBandTypeSchema,
  frequency: z.number().min(20).max(20000).describe("Hz"),
  gain: z.number().min(-24).max(24).describe("dB"),
  q: z.number().min(0.1).max(18).describe("Quality factor"),
});
export type EQBand = z.infer<typeof EQBandSchema>;

// ── Compressor ──────────────────────────────────────────────────────────────

export const CompressorParamsSchema = z.object({
  threshold: z.number().min(-60).max(0).default(-20).describe("dB"),
  ratio: z.number().min(1).max(20).default(4),
  attack: z.number().min(0.001).max(1).default(0.01).describe("seconds"),
  release: z.number().min(0.01).max(3).default(0.1).describe("seconds"),
  knee: z.number().min(0).max(40).default(6).describe("dB"),
  makeupGain: z.number().min(0).max(24).default(0).describe("dB"),
});
export type CompressorParams = z.infer<typeof CompressorParamsSchema>;

// ── Reverb ──────────────────────────────────────────────────────────────────

export const ReverbParamsSchema = z.object({
  roomSize: z.number().min(0).max(1).default(0.5),
  damping: z.number().min(0).max(1).default(0.5),
  wetLevel: z.number().min(0).max(1).default(0.3),
  dryLevel: z.number().min(0).max(1).default(0.8),
  preDelay: z.number().min(0).max(100).default(10).describe("ms"),
});
export type ReverbParams = z.infer<typeof ReverbParamsSchema>;

// ── Delay ───────────────────────────────────────────────────────────────────

export const DelayParamsSchema = z.object({
  time: z.number().min(0).max(2).default(0.3).describe("seconds"),
  feedback: z.number().min(0).max(0.95).default(0.3),
  wetLevel: z.number().min(0).max(1).default(0.3),
  sync: z.boolean().default(false).describe("Sync to tempo"),
});
export type DelayParams = z.infer<typeof DelayParamsSchema>;

// ── Noise Reduction ─────────────────────────────────────────────────────────

export const NoiseReductionParamsSchema = z.object({
  threshold: z.number().min(-60).max(0).default(-30).describe("dB"),
  reduction: z.number().min(0).max(1).default(0.5),
  attack: z.number().min(0).max(100).default(5).describe("ms"),
  release: z.number().min(0).max(500).default(50).describe("ms"),
  focus: z.enum(["balanced", "speech", "whiteNoise", "music", "heavy", "wind", "hum"]).optional(),
});
export type NoiseReductionParams = z.infer<typeof NoiseReductionParamsSchema>;

// ── Fade ────────────────────────────────────────────────────────────────────

export const FadeCurveSchema = z.enum(["linear", "exponential", "logarithmic", "s-curve"]);
export type FadeCurve = z.infer<typeof FadeCurveSchema>;

export const FadeParamsSchema = z.object({
  duration: z.number().min(0).max(30).describe("seconds"),
  curve: FadeCurveSchema.default("linear"),
});
export type FadeParams = z.infer<typeof FadeParamsSchema>;

// ── Complete Audio Effect Params ────────────────────────────────────────────

export const AudioEffectParamsSchema = z.object({
  gain: z.object({ value: z.number() }).optional(),
  pan: z.object({ value: z.number().min(-1).max(1) }).optional(),
  eq: z.object({ bands: z.array(EQBandSchema) }).optional(),
  compressor: CompressorParamsSchema.optional(),
  reverb: ReverbParamsSchema.optional(),
  delay: DelayParamsSchema.optional(),
  noiseReduction: NoiseReductionParamsSchema.optional(),
  fadeIn: FadeParamsSchema.optional(),
  fadeOut: FadeParamsSchema.optional(),
});
export type AudioEffectParams = z.infer<typeof AudioEffectParamsSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateDucking(data: unknown): DuckingParams {
  return DuckingParamsSchema.parse(data);
}

export function validateAudioEffects(data: unknown): AudioEffectParams {
  return AudioEffectParamsSchema.parse(data);
}
