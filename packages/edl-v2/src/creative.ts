import { z } from 'zod'

export const EntitySchema = z.object({
  type: z.enum(['person', 'people', 'object', 'text', 'graphic']),
  role: z.enum(['hero', 'supporting', 'background', 'prop', 'overlay']),
  description: z.string(),
  detectionFrames: z.array(z.number()).optional(),
  boundingBoxes: z.record(z.string(), z.tuple([z.number(), z.number(), z.number(), z.number()])).optional(),
  faceLandmarks: z.record(z.string(), z.object({
    left_eye: z.tuple([z.number(), z.number()]),
    right_eye: z.tuple([z.number(), z.number()]),
    nose: z.tuple([z.number(), z.number()]),
  })).optional(),
  depthMask: z.string().optional(),
})

export const StoryPhaseSchema = z.object({
  phase: z.string(), start: z.number(), end: z.number(), emotion: z.string(),
})

export const EmotionPointSchema = z.object({
  time: z.number(), emotion: z.string(), intensity: z.number().min(0).max(1),
})

export const AutoApplySchema = z.object({
  enabled: z.boolean(), affects: z.array(z.string()), strength: z.number().min(0).max(1),
})

export const EmotionArcSchema = z.object({
  timeline: z.array(EmotionPointSchema), autoApply: AutoApplySchema,
})

export const AttentionEntrySchema = z.object({
  weight: z.number().min(0).max(1),
  priority: z.enum(['focus', 'maintain', 'suppress', 'ignore']),
  protectFromEffects: z.boolean().optional(),
  applyEffects: z.boolean().optional(),
})

export const MomentSchema = z.object({
  id: z.string(), start: z.number(), end: z.number(),
  purpose: z.string(), emotion: z.string(),
  energy: z.number().min(0).max(1),
  shots: z.array(z.string()), recipes: z.array(z.string()),
  aiPrompt: z.string(), focusEntity: z.string().optional(),
  attention: z.record(z.string(), AttentionEntrySchema).optional(),
  constraints: z.array(z.string()),
})

export const IntentChainsSchema = z.object({
  global: z.string(),
  perMoment: z.record(z.string(), z.object({
    purpose: z.string(), whyThisDuration: z.string().optional(),
    whyTheseEffects: z.string().optional(), emotionalGoal: z.string().optional(),
  })),
})

export const GenerativeSlotSchema = z.object({
  id: z.string(), purpose: z.string(), requirements: z.array(z.string()),
  duration: z.number(), insertAt: z.string(),
  fallbackClipId: z.string(), aiMayReplace: z.boolean(),
})

export const CreativeLayerSchema = z.object({
  entities: z.record(z.string(), EntitySchema),
  storyArc: z.array(StoryPhaseSchema),
  emotionArc: EmotionArcSchema,
  moments: z.array(MomentSchema),
  intentChains: IntentChainsSchema,
  generativeSlots: z.array(GenerativeSlotSchema),
})

export type Entity = z.infer<typeof EntitySchema>
export type StoryPhase = z.infer<typeof StoryPhaseSchema>
export type EmotionArc = z.infer<typeof EmotionArcSchema>
export type Moment = z.infer<typeof MomentSchema>
export type IntentChains = z.infer<typeof IntentChainsSchema>
export type GenerativeSlot = z.infer<typeof GenerativeSlotSchema>
export type CreativeLayer = z.infer<typeof CreativeLayerSchema>
