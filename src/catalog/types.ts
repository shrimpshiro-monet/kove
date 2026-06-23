import { z } from "zod";

// --- Category Specific Schemas ---

export const EffectItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  intensity: z.number().optional(),
  params: z.record(z.any()).optional(),
  aiRationale: z.string(),
});

export const TransitionItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  duration: z.number().optional(),
  params: z.record(z.any()).optional(),
  aiRationale: z.string(),
});

export const TypographyItemSchema = z.object({
  id: z.string(),
  style: z.object({
    fontFamily: z.string(),
    fontSize: z.number(),
    color: z.string(),
    alignment: z.enum(["left", "center", "right"]),
  }).optional(),
  animation: z.object({
    inType: z.string(),
    outType: z.string(),
    duration: z.number(),
  }).optional(),
  aiRationale: z.string(),
});

export const MotionItemSchema = z.object({
  id: z.string(),
  speedRamp: z.object({
    startSpeed: z.number(),
    endSpeed: z.number(),
    easing: z.string(),
  }).optional(),
  shake: z.object({
    intensity: z.number(),
    duration: z.number(),
  }).optional(),
  aiRationale: z.string(),
});

export const CompositingItemSchema = z.object({
  id: z.string(),
  blendMode: z.string(),
  opacity: z.number(),
  aiRationale: z.string(),
});

export const AudioItemSchema = z.object({
  id: z.string(),
  voiceId: z.string().optional(),
  speed: z.number().optional(),
  pitch: z.number().optional(),
  masteringPreset: z.string().optional(),
  aiRationale: z.string(),
});

// --- Master Catalog Item Schema ---

export const CatalogItemSchema = z.union([
  EffectItemSchema,
  TransitionItemSchema,
  TypographyItemSchema,
  MotionItemSchema,
  CompositingItemSchema,
  AudioItemSchema,
]);

// --- Types ---

export type EffectItem = z.infer<typeof EffectItemSchema>;
export type TransitionItem = z.infer<typeof TransitionItemSchema>;
export type TypographyItem = z.infer<typeof TypographyItemSchema>;
export type MotionItem = z.infer<typeof MotionItemSchema>;
export type CompositingItem = z.infer<typeof CompositingItemSchema>;
export type AudioItem = z.infer<typeof AudioItemSchema>;

export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export type CatalogCategory = 
  | "effects" 
  | "transitions" 
  | "typography" 
  | "motion" 
  | "compositing" 
  | "audio";
