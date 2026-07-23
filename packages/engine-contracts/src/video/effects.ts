/**
 * Video Effects Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/types/effects.ts
 *                 apps/kove-advanced/packages/core/src/video/video-effects-engine.ts
 *
 * Defines all visual effects, their param schemas with min/max/step/default.
 * The AI generates effects matching these exact param definitions.
 */
import { z } from "zod";

// ── Effect Types ────────────────────────────────────────────────────────────

export const VideoEffectTypeSchema = z.enum([
  "blur",
  "brightness",
  "contrast",
  "saturation",
  "hue-saturation",
  "color-balance",
  "curves",
  "motion-blur",
  "radial-blur",
  "vignette",
  "film-grain",
  "chromatic-aberration",
  "glow",
  "shadow",
  "sharpen",
]);
export type VideoEffectType = z.infer<typeof VideoEffectTypeSchema>;

// ── Effect Param Definition ─────────────────────────────────────────────────

export const EffectParamTypeSchema = z.enum(["number", "color", "vector2d", "curve"]);
export type EffectParamType = z.infer<typeof EffectParamTypeSchema>;

export const EffectParamDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: EffectParamTypeSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  default: z.union([z.number(), z.string(), z.object({ x: z.number(), y: z.number() })]),
});
export type EffectParamDefinition = z.infer<typeof EffectParamDefinitionSchema>;

// ── Effect Definition ───────────────────────────────────────────────────────

export const EffectCategorySchema = z.enum(["blur", "color", "stylize"]);
export type EffectCategory = z.infer<typeof EffectCategorySchema>;

export const EffectDefinitionSchema = z.object({
  type: VideoEffectTypeSchema,
  name: z.string(),
  category: EffectCategorySchema,
  params: z.array(EffectParamDefinitionSchema),
});
export type EffectDefinition = z.infer<typeof EffectDefinitionSchema>;

// ── Layer Effect (applied to clip) ──────────────────────────────────────────

export const LayerEffectSchema = z.object({
  id: z.string(),
  type: VideoEffectTypeSchema,
  name: z.string(),
  enabled: z.boolean().default(true),
  params: z.record(z.string(), z.union([z.number(), z.array(z.object({
    time: z.number(),
    value: z.number(),
    easing: z.string().optional(),
  }))])).default({}),
});
export type LayerEffect = z.infer<typeof LayerEffectSchema>;

// ── Complete Effect Definitions ─────────────────────────────────────────────

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    type: "blur", name: "Gaussian Blur", category: "blur",
    params: [
      { key: "radius", label: "Radius", type: "number", min: 0, max: 100, step: 1, unit: "px", default: 10 },
    ],
  },
  {
    type: "brightness", name: "Brightness", category: "color",
    params: [
      { key: "value", label: "Brightness", type: "number", min: -100, max: 100, step: 1, unit: "%", default: 0 },
    ],
  },
  {
    type: "contrast", name: "Contrast", category: "color",
    params: [
      { key: "value", label: "Contrast", type: "number", min: -100, max: 100, step: 1, unit: "%", default: 0 },
    ],
  },
  {
    type: "saturation", name: "Saturation", category: "color",
    params: [
      { key: "value", label: "Saturation", type: "number", min: -100, max: 100, step: 1, unit: "%", default: 0 },
    ],
  },
  {
    type: "hue-saturation", name: "Hue/Saturation", category: "color",
    params: [
      { key: "hue", label: "Hue", type: "number", min: -180, max: 180, step: 1, unit: "°", default: 0 },
      { key: "saturation", label: "Saturation", type: "number", min: -100, max: 100, step: 1, unit: "%", default: 0 },
      { key: "lightness", label: "Lightness", type: "number", min: -100, max: 100, step: 1, unit: "%", default: 0 },
    ],
  },
  {
    type: "color-balance", name: "Color Balance", category: "color",
    params: [
      { key: "shadowsCyanRed", label: "Shadows C/R", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "shadowsMagentaGreen", label: "Shadows M/G", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "shadowsYellowBlue", label: "Shadows Y/B", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "midtonesCyanRed", label: "Midtones C/R", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "midtonesMagentaGreen", label: "Midtones M/G", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "midtonesYellowBlue", label: "Midtones Y/B", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "highlightsCyanRed", label: "Highlights C/R", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "highlightsMagentaGreen", label: "Highlights M/G", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "highlightsYellowBlue", label: "Highlights Y/B", type: "number", min: -100, max: 100, step: 1, default: 0 },
    ],
  },
  {
    type: "curves", name: "Curves", category: "color",
    params: [
      { key: "blackPoint", label: "Black Point", type: "number", min: 0, max: 255, step: 1, default: 0 },
      { key: "whitePoint", label: "White Point", type: "number", min: 0, max: 255, step: 1, default: 255 },
      { key: "gamma", label: "Gamma", type: "number", min: 0.1, max: 3, step: 0.01, default: 1 },
    ],
  },
  {
    type: "motion-blur", name: "Motion Blur", category: "blur",
    params: [
      { key: "angle", label: "Angle", type: "number", min: 0, max: 360, step: 1, unit: "°", default: 0 },
      { key: "distance", label: "Distance", type: "number", min: 0, max: 100, step: 1, unit: "px", default: 20 },
    ],
  },
  {
    type: "radial-blur", name: "Radial Blur", category: "blur",
    params: [
      { key: "amount", label: "Amount", type: "number", min: 0, max: 100, step: 1, default: 20 },
      { key: "centerX", label: "Center X", type: "number", min: 0, max: 100, step: 1, unit: "%", default: 50 },
      { key: "centerY", label: "Center Y", type: "number", min: 0, max: 100, step: 1, unit: "%", default: 50 },
    ],
  },
  {
    type: "vignette", name: "Vignette", category: "stylize",
    params: [
      { key: "amount", label: "Amount", type: "number", min: 0, max: 100, step: 1, default: 50 },
      { key: "size", label: "Size", type: "number", min: 0, max: 100, step: 1, unit: "%", default: 50 },
      { key: "roundness", label: "Roundness", type: "number", min: -100, max: 100, step: 1, default: 0 },
      { key: "feather", label: "Feather", type: "number", min: 0, max: 100, step: 1, default: 50 },
    ],
  },
  {
    type: "film-grain", name: "Film Grain", category: "stylize",
    params: [
      { key: "amount", label: "Amount", type: "number", min: 0, max: 100, step: 1, default: 20 },
      { key: "size", label: "Size", type: "number", min: 0.5, max: 3, step: 0.1, default: 1 },
      { key: "roughness", label: "Roughness", type: "number", min: 0, max: 100, step: 1, default: 50 },
    ],
  },
  {
    type: "chromatic-aberration", name: "Chromatic Aberration", category: "stylize",
    params: [
      { key: "amount", label: "Amount", type: "number", min: 0, max: 50, step: 0.5, unit: "px", default: 5 },
      { key: "angle", label: "Angle", type: "number", min: 0, max: 360, step: 1, unit: "°", default: 0 },
    ],
  },
  {
    type: "glow", name: "Glow", category: "stylize",
    params: [
      { key: "radius", label: "Radius", type: "number", min: 0, max: 100, step: 1, unit: "px", default: 10 },
      { key: "intensity", label: "Intensity", type: "number", min: 0, max: 3, step: 0.1, default: 1 },
    ],
  },
  {
    type: "shadow", name: "Drop Shadow", category: "stylize",
    params: [
      { key: "offsetX", label: "Offset X", type: "number", min: -100, max: 100, step: 1, unit: "px", default: 5 },
      { key: "offsetY", label: "Offset Y", type: "number", min: -100, max: 100, step: 1, unit: "px", default: 5 },
      { key: "blur", label: "Blur", type: "number", min: 0, max: 100, step: 1, unit: "px", default: 10 },
      { key: "opacity", label: "Opacity", type: "number", min: 0, max: 1, step: 0.01, default: 0.8 },
      { key: "colorR", label: "Red", type: "number", min: 0, max: 255, step: 1, default: 0 },
      { key: "colorG", label: "Green", type: "number", min: 0, max: 255, step: 1, default: 0 },
      { key: "colorB", label: "Blue", type: "number", min: 0, max: 255, step: 1, default: 0 },
    ],
  },
  {
    type: "sharpen", name: "Sharpen", category: "blur",
    params: [
      { key: "amount", label: "Amount", type: "number", min: 0, max: 2, step: 0.1, default: 0.5 },
      { key: "radius", label: "Radius", type: "number", min: 0.1, max: 5, step: 0.1, default: 1 },
      { key: "threshold", label: "Threshold", type: "number", min: 0, max: 255, step: 1, default: 0 },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getEffectDefinition(type: VideoEffectType): EffectDefinition | undefined {
  return EFFECT_DEFINITIONS.find((def) => def.type === type);
}

export function getEffectsByCategory(category: EffectCategory): EffectDefinition[] {
  return EFFECT_DEFINITIONS.filter((def) => def.category === category);
}

export function validateEffectParams(type: VideoEffectType, params: Record<string, unknown>): boolean {
  const def = getEffectDefinition(type);
  if (!def) return false;
  for (const paramDef of def.params) {
    const val = params[paramDef.key];
    if (val === undefined) continue;
    if (typeof val !== "number") return false;
    if (paramDef.min !== undefined && val < paramDef.min) return false;
    if (paramDef.max !== undefined && val > paramDef.max) return false;
  }
  return true;
}
