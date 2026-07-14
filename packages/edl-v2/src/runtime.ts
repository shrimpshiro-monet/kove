import { z } from 'zod'

export const KeyframeValueSchema = z.object({
  time: z.number(),
  value: z.union([z.number(), z.array(z.number()), z.tuple([z.number(), z.number()])]),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).optional(),
})

export const KeyframeArraySchema = z.object({ keyframes: z.array(KeyframeValueSchema) })

export const SpeedRampSchema = z.object({
  keyframes: z.array(z.object({
    time: z.number(), speed: z.number(),
    easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).optional(),
  })),
})

export const TransformSchema = z.object({
  position: KeyframeArraySchema, scale: KeyframeArraySchema,
  rotation: KeyframeArraySchema.optional(), opacity: KeyframeArraySchema,
  anchor: z.tuple([z.number(), z.number()]),
})

export const CameraSchema = z.object({
  movement: z.string(), intensity: z.number().min(0).max(1),
  shake: z.object({ frequency: z.number(), amplitude: z.number(), decay: z.number() }).optional(),
  motionBlur: z.object({ shutterAngle: z.number(), samples: z.number().int() }).optional(),
})

export const EffectSchema = z.object({
  id: z.string(), type: z.string(),
  targetStrength: z.number().min(0).max(1),
  targetEmotion: z.string().optional(),
  duration: z.string().optional(),
  params: z.record(z.any()),
})

export const TransitionSchema = z.object({
  type: z.string(), duration: z.number().min(0),
  params: z.record(z.any()).optional(),
})

export const ClipSourceSchema = z.object({
  clipId: z.string().optional(),
  type: z.enum(['video', 'image', 'color', 'gradient', 'generated']),
  in: z.number().optional(), out: z.number().optional(),
})

export const ClipTimingSchema = z.object({
  start: z.number(), duration: z.number(), speed: z.number(),
  speedRamp: SpeedRampSchema.optional(),
})

export const ClipSchema = z.object({
  id: z.string(), momentId: z.string().optional(),
  source: ClipSourceSchema, timing: ClipTimingSchema,
  transform: TransformSchema.optional(), camera: CameraSchema.optional(),
  effects: z.array(EffectSchema).optional(),
  transition: TransitionSchema.optional(),
})

export const TrackSchema = z.object({
  id: z.string(), type: z.enum(['video', 'audio']), name: z.string(),
  clips: z.array(ClipSchema),
})

export const ColorScienceSchema = z.object({
  workingSpace: z.string(),
  inputTransform: z.object({ source: z.string(), cameraProfile: z.string() }),
  outputTransform: z.object({ target: z.string(), toneMapping: z.string() }),
})

export const RuntimeLayerSchema = z.object({
  timeline: z.object({
    resolution: z.object({ width: z.number().int(), height: z.number().int() }),
    fps: z.number().int(), duration: z.number(),
  }),
  tracks: z.array(TrackSchema),
  colorScience: ColorScienceSchema,
})

export type KeyframeValue = z.infer<typeof KeyframeValueSchema>
export type KeyframeArray = z.infer<typeof KeyframeArraySchema>
export type SpeedRamp = z.infer<typeof SpeedRampSchema>
export type Transform = z.infer<typeof TransformSchema>
export type Camera = z.infer<typeof CameraSchema>
export type Effect = z.infer<typeof EffectSchema>
export type Transition = z.infer<typeof TransitionSchema>
export type ClipSource = z.infer<typeof ClipSourceSchema>
export type ClipTiming = z.infer<typeof ClipTimingSchema>
export type Clip = z.infer<typeof ClipSchema>
export type Track = z.infer<typeof TrackSchema>
export type ColorScience = z.infer<typeof ColorScienceSchema>
export type RuntimeLayer = z.infer<typeof RuntimeLayerSchema>
