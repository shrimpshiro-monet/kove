import { z } from 'zod'

export const StyleTokensSchema = z.record(
  z.enum([
    'aggression', 'cinematic', 'chaos', 'luxury', 'warmth',
    'nostalgia', 'futurism', 'intimacy', 'epicness', 'playfulness',
    'darkness', 'energy',
  ]),
  z.number().min(0).max(1)
)

export const TokenInfluenceSchema = z.record(
  z.string(),
  z.object({
    affects: z.array(z.string()),
    multiplier: z.enum(['linear', 'exponential', 'logarithmic']),
  })
)

export const GenreProfileSchema = z.object({
  primary: z.string(),
  subgenre: z.string().optional(),
  platform: z.enum(['tiktok', 'instagram_reels', 'youtube', 'youtube_shorts', 'cinema', 'broadcast']),
  styleProfile: z.object({
    cutRate: z.number(),
    avgShotDuration: z.number(),
    effectDensity: z.number().min(0).max(1),
    transitionStyle: z.enum(['hard_cuts', 'smooth', 'stylized', 'mixed']),
    colorMood: z.number().min(0).max(1),
    textFrequency: z.number().min(0).max(1),
    energyCurve: z.enum(['flat', 'building', 'peaking', 'variable', 'wave']),
  }),
})

export const ConstraintsSchema = z.object({
  avoidFaceOcclusion: z.boolean(),
  maxTextCoverage: z.number().min(0).max(1),
  keepSubjectVisible: z.boolean(),
  preserveMotionDirection: z.boolean(),
  safeArea: z.boolean(),
  avoidOverEditing: z.boolean(),
  maxEffectsPerShot: z.number().int().positive(),
  minShotDuration: z.number().positive(),
  maxTransitionDuration: z.number().positive(),
  preserveAudioSync: z.boolean(),
  maintainColorConsistency: z.boolean(),
})

export const ParametricValueSchema = z.object({
  base: z.number(),
  emotionScale: z.record(z.string(), z.number()).optional(),
  aggressionScale: z.number().optional(),
})

export const RecipeSchema = z.object({
  version: z.string(),
  description: z.string(),
  applicableWhen: z.object({
    emotion: z.string().optional(),
    energy: z.number().optional(),
    genre: z.array(z.string()).optional(),
  }),
  parametric: z.record(z.string(), ParametricValueSchema),
  transition: z.object({
    type: z.string(),
    baseDuration: z.number(),
  }),
  camera: z.object({
    movement: z.string(),
    baseIntensity: z.number(),
  }),
})

export const StyleLayerSchema = z.object({
  tokens: StyleTokensSchema,
  tokenInfluence: TokenInfluenceSchema,
  genre: GenreProfileSchema,
  constraints: ConstraintsSchema,
})

export type StyleTokens = z.infer<typeof StyleTokensSchema>
export type TokenInfluence = z.infer<typeof TokenInfluenceSchema>
export type GenreProfile = z.infer<typeof GenreProfileSchema>
export type Constraints = z.infer<typeof ConstraintsSchema>
export type Recipe = z.infer<typeof RecipeSchema>
export type StyleLayer = z.infer<typeof StyleLayerSchema>
