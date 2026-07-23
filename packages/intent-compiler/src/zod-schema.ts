import { z } from "zod";

const speedCurveSchema = z.object({
  keyframes: z.array(z.object({ time_s: z.number(), speed: z.number() })),
  easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]),
});

const effectParamsSchema = z.object({
  type: z.string(),
  intensity: z.number(),
}).passthrough();

const colorParamsSchema = z.object({
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  temperature: z.number().optional(),
  tint: z.string().optional(),
  lut: z.string().optional(),
});

const placeClipSchema = z.object({
  type: z.literal("place_clip"),
  clip_id: z.string(),
  track: z.number().int().min(0),
  start_s: z.number().min(0),
  duration_s: z.number().min(0),
  in_point_s: z.number().min(0),
  out_point_s: z.number().min(0),
});

const applySpeedSchema = z.object({
  type: z.literal("apply_speed"),
  target: z.enum(["clip", "segment"]),
  clip_id: z.string().optional(),
  segment_index: z.number().int().min(0).optional(),
  curve: speedCurveSchema,
});

const applyTransitionSchema = z.object({
  type: z.literal("apply_transition"),
  between: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  transition_type: z.enum(["crossfade", "wipe", "dissolve", "hard"]),
  duration_s: z.number().min(0),
});

const applyEffectSchema = z.object({
  type: z.literal("apply_effect"),
  target: z.enum(["clip", "segment"]),
  effect: effectParamsSchema,
});

const applyColorSchema = z.object({
  type: z.literal("apply_color"),
  target: z.enum(["global", "clip"]),
  clip_id: z.string().optional(),
  params: colorParamsSchema,
});

const operationSchema = z.discriminatedUnion("type", [
  placeClipSchema,
  applySpeedSchema,
  applyTransitionSchema,
  applyEffectSchema,
  applyColorSchema,
]);

const globalEffectSchema = z.object({
  type: z.enum(["color_grade", "vignette", "grain", "glow"]),
  params: z.record(z.number()),
});

const textOverlaySchema = z.object({
  text: z.string(),
  start_s: z.number().min(0),
  end_s: z.number().min(0),
  position: z.object({ x: z.number(), y: z.number() }),
  style: z.record(z.unknown()),
  animation: z.string(),
});

const audioMixSchema = z.object({
  tracks: z.array(z.object({
    clip_id: z.string(),
    volume: z.number().min(0).max(1),
    fade_in_s: z.number().min(0),
    fade_out_s: z.number().min(0),
  })),
  ducking: z.object({
    enabled: z.boolean(),
    threshold: z.number(),
  }).optional(),
});

export const operationPlanz = z.object({
  version: z.literal("1.0"),
  target_duration_s: z.number().min(0),
  aspect_ratio: z.string(),
  operations: z.array(operationSchema).min(1),
  global_effects: z.array(globalEffectSchema),
  text_overlays: z.array(textOverlaySchema),
  audio_mix: audioMixSchema,
});

export type OperationPlanInput = z.input<typeof operationPlanz>;
