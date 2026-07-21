/**
 * Text Animation Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/text/text-animation.ts
 *                 apps/kove-advanced/packages/core/src/text/text-animation-presets.ts
 *
 * Defines text entrance/exit animation presets and their params.
 */
import { z } from "zod";

// ── Animation Preset ────────────────────────────────────────────────────────

export const TextAnimationPresetSchema = z.enum([
  "none",
  "typewriter",
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "scale",
  "blur",
  "bounce",
  "rotate",
  "wave",
  "shake",
  "pop",
  "glitch",
  "split",
  "flip",
  "word-by-word",
  "rainbow",
]);
export type TextAnimationPreset = z.infer<typeof TextAnimationPresetSchema>;

// ── Animation Unit ──────────────────────────────────────────────────────────

export const TextAnimationUnitSchema = z.enum(["character", "word", "line"]);
export type TextAnimationUnit = z.infer<typeof TextAnimationUnitSchema>;

// ── Animation Params ────────────────────────────────────────────────────────

export const TextAnimationParamsSchema = z.object({
  fadeOpacity: z.object({ start: z.number(), end: z.number() }).optional(),
  slideDistance: z.number().optional(),
  scaleFrom: z.number().optional(),
  scaleTo: z.number().optional(),
  blurAmount: z.number().optional(),
  bounceHeight: z.number().optional(),
  bounceCount: z.number().optional(),
  rotateAngle: z.number().optional(),
  waveAmplitude: z.number().optional(),
  waveFrequency: z.number().optional(),
  shakeIntensity: z.number().optional(),
  shakeSpeed: z.number().optional(),
  popOvershoot: z.number().optional(),
  glitchIntensity: z.number().optional(),
  glitchSpeed: z.number().optional(),
  splitDirection: z.enum(["horizontal", "vertical"]).optional(),
  flipAxis: z.enum(["x", "y"]).optional(),
  rainbowSpeed: z.number().optional(),
  wordDelay: z.number().optional(),
  easing: z.string().optional(),
});
export type TextAnimationParams = z.infer<typeof TextAnimationParamsSchema>;

// ── Text Animation ──────────────────────────────────────────────────────────

export const TextAnimationSchema = z.object({
  preset: TextAnimationPresetSchema,
  params: TextAnimationParamsSchema.default({}),
  inDuration: z.number().min(0).max(5).default(0.5).describe("Entrance duration in seconds"),
  outDuration: z.number().min(0).max(5).default(0.3).describe("Exit duration in seconds"),
  stagger: z.number().min(0).max(1).optional().describe("Delay between characters/words"),
  unit: TextAnimationUnitSchema.default("word"),
});
export type TextAnimation = z.infer<typeof TextAnimationSchema>;

// ── Presets ─────────────────────────────────────────────────────────────────

export const TEXT_ANIMATION_PRESETS: Record<TextAnimationPreset, Partial<TextAnimationParams>> = {
  "none": {},
  "typewriter": {},
  "fade": { fadeOpacity: { start: 0, end: 1 } },
  "slide-left": { slideDistance: 100 },
  "slide-right": { slideDistance: -100 },
  "slide-up": { slideDistance: 50 },
  "slide-down": { slideDistance: -50 },
  "scale": { scaleFrom: 0, scaleTo: 1 },
  "blur": { blurAmount: 10 },
  "bounce": { bounceHeight: 20, bounceCount: 3 },
  "rotate": { rotateAngle: 360 },
  "wave": { waveAmplitude: 10, waveFrequency: 3 },
  "shake": { shakeIntensity: 5, shakeSpeed: 10 },
  "pop": { popOvershoot: 1.2 },
  "glitch": { glitchIntensity: 5, glitchSpeed: 20 },
  "split": { splitDirection: "horizontal" },
  "flip": { flipAxis: "y" },
  "word-by-word": { wordDelay: 0.1 },
  "rainbow": { rainbowSpeed: 2 },
};

// ── Validation ──────────────────────────────────────────────────────────────

export function validateTextAnimation(data: unknown): TextAnimation {
  return TextAnimationSchema.parse(data);
}
