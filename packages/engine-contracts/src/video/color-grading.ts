/**
 * Color Grading Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/types/effects.ts
 *                 apps/kove-advanced/packages/core/src/video/color-grading-engine.ts
 *
 * Defines color grading params: color wheels, curves, LUT, HSL adjustments.
 */
import { z } from "zod";

// ── Color Wheel ─────────────────────────────────────────────────────────────

export const ColorWheelSchema = z.object({
  r: z.number().min(-1).max(1).default(0),
  g: z.number().min(-1).max(1).default(0),
  b: z.number().min(-1).max(1).default(0),
});
export type ColorWheel = z.infer<typeof ColorWheelSchema>;

// ── Color Wheels ────────────────────────────────────────────────────────────

export const ColorWheelsSchema = z.object({
  shadows: ColorWheelSchema,
  midtones: ColorWheelSchema,
  highlights: ColorWheelSchema,
  shadowsLift: z.number().min(-1).max(1).default(0),
  midtonesGamma: z.number().min(0.1).max(4).default(1),
  highlightsGain: z.number().min(0).max(4).default(1),
});
export type ColorWheels = z.infer<typeof ColorWheelsSchema>;

// ── Curve Point ─────────────────────────────────────────────────────────────

export const CurvePointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type CurvePoint = z.infer<typeof CurvePointSchema>;

// ── Curves ──────────────────────────────────────────────────────────────────

export const CurvesSchema = z.object({
  rgb: z.array(CurvePointSchema).default([{ x: 0, y: 0 }, { x: 1, y: 1 }]),
  red: z.array(CurvePointSchema).default([{ x: 0, y: 0 }, { x: 1, y: 1 }]),
  green: z.array(CurvePointSchema).default([{ x: 0, y: 0 }, { x: 1, y: 1 }]),
  blue: z.array(CurvePointSchema).default([{ x: 0, y: 0 }, { x: 1, y: 1 }]),
});
export type Curves = z.infer<typeof CurvesSchema>;

// ── HSL ─────────────────────────────────────────────────────────────────────

export const HSLAdjustmentSchema = z.object({
  hue: z.array(z.number().min(-180).max(180)).length(8),
  saturation: z.array(z.number().min(-1).max(1)).length(8),
  luminance: z.array(z.number().min(-1).max(1)).length(8),
});
export type HSLAdjustment = z.infer<typeof HSLAdjustmentSchema>;

// ── LUT ─────────────────────────────────────────────────────────────────────

export const LUTSchema = z.object({
  lutData: z.string().describe("Base64-encoded 3D LUT data"),
  intensity: z.number().min(0).max(1).default(1),
});
export type LUT = z.infer<typeof LUTSchema>;

// ── Complete Color Grading ──────────────────────────────────────────────────

export const ColorGradingSchema = z.object({
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(0).max(2).default(1),
  saturation: z.number().min(0).max(2).default(1),
  temperature: z.number().min(-1).max(1).default(0),
  tint: z.number().min(-1).max(1).default(0),
  shadows: z.number().min(-1).max(1).default(0),
  midtones: z.number().min(-1).max(1).default(0),
  highlights: z.number().min(-1).max(1).default(0),
  colorWheels: ColorWheelsSchema.optional(),
  curves: CurvesSchema.optional(),
  hsl: HSLAdjustmentSchema.optional(),
  lut: LUTSchema.optional(),
}).describe("Complete color grading params — any combination of adjustments");
export type ColorGrading = z.infer<typeof ColorGradingSchema>;

// ── Presets ─────────────────────────────────────────────────────────────────

export const COLOR_GRADING_PRESETS: Record<string, Partial<ColorGrading>> = {
  "warm": { temperature: 0.3, saturation: 1.1, contrast: 1.05 },
  "cool": { temperature: -0.3, saturation: 0.95 },
  "cinematic": { contrast: 1.2, saturation: 0.85, temperature: -0.1, shadows: -0.1 },
  "vintage": { saturation: 0.7, contrast: 1.1, temperature: 0.2, grain: 0.3 },
  "high-contrast": { contrast: 1.5, saturation: 1.1 },
  "desaturated": { saturation: 0.4, contrast: 1.1 },
  "bleach-bypass": { contrast: 1.4, saturation: 0.5, brightness: -0.05 },
} as const;
