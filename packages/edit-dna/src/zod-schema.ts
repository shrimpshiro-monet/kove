import { z } from "zod";

const shotSchema = z.object({
  id: z.string().min(1),
  start_s: z.number().min(0),
  end_s: z.number().min(0),
  duration_s: z.number().min(0),
  content: z.object({
    description: z.string(),
    subjects: z.array(z.string()),
    action: z.string(),
    mood: z.string(),
  }),
  camera: z.object({
    motion: z.enum(["static", "pan_left", "pan_right", "zoom_in", "zoom_out", "shake", "tracking", "handheld"]),
    intensity: z.number().min(0).max(1),
    direction_degrees: z.number().optional(),
  }),
  color: z.object({
    dominant_hue: z.string(),
    temperature: z.enum(["warm", "cool", "neutral"]),
    saturation: z.number().min(0).max(1),
    brightness: z.number().min(0).max(1),
  }),
  crop: z.enum(["tight", "medium", "wide", "ultra-wide"]).optional(),
  cut_in_type: z.enum(["hard", "dissolve", "fade_from_black"]).optional(),
  cut_out_type: z.enum(["hard", "dissolve", "fade_to_black"]).optional(),
});

const colorProfileSchema = z.object({
  contrast: z.number(),
  saturation: z.number(),
  temperature_shift: z.enum(["warm", "cool", "neutral"]),
  shadows_tint: z.string(),
  highlights_tint: z.string(),
  lut_approximation: z.object({
    shadows: z.tuple([z.number(), z.number(), z.number()]),
    mids: z.tuple([z.number(), z.number(), z.number()]),
    highlights: z.tuple([z.number(), z.number(), z.number()]),
  }).optional(),
});

const audioProfileSchema = z.object({
  bpm: z.number().min(0),
  beat_grid_s: z.array(z.number()),
  downbeats_s: z.array(z.number()),
  energy_curve: z.array(z.object({ time_s: z.number(), energy: z.number() })),
  speech_segments: z.array(z.object({ start_s: z.number(), end_s: z.number() })),
  sync_points_s: z.array(z.number()),
});

const textEventSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  content: z.string(),
  position: z.enum(["center", "top", "bottom", "lower-third"]),
  style: z.enum(["bold", "italic", "outline", "shadow", "glow"]),
  animation: z.enum(["pop", "fade", "slide", "typewriter", "none"]),
});

const pacingProfileSchema = z.object({
  avg_shot_length_s: z.number().min(0),
  variance: z.enum(["low", "medium", "high"]),
  energy_curve: z.enum(["rising", "falling", "peak", "valley", "steady"]),
  climax_position_s: z.number().optional(),
});

export const editDNAz = z.object({
  version: z.literal("1.0"),
  source: z.object({
    type: z.enum(["reference", "footage"]),
    duration_s: z.number().min(0),
    fps: z.number().min(0),
    resolution: z.object({ width: z.number().min(1), height: z.number().min(1) }),
    aspect_ratio: z.string(),
  }),
  shots: z.array(shotSchema).min(1),
  color: colorProfileSchema,
  audio: audioProfileSchema,
  text_events: z.array(textEventSchema),
  pacing: pacingProfileSchema,
  metadata: z.object({
    analyzed_at: z.string(),
    frame_count: z.number().min(0),
    analysis_fps: z.number().min(0),
    confidence: z.number().min(0).max(1),
    field_owners: z.record(z.string()),
  }),
});

export type EditDNAInput = z.input<typeof editDNAz>;
