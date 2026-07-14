import { z } from 'zod'
import { StyleLayerSchema } from './style'
import { CreativeLayerSchema } from './creative'
import { RuntimeLayerSchema } from './runtime'

export const EDLSchema = z.object({
  version: z.literal('5.1'),
  id: z.string(),
  created: z.string(),
  duration: z.number().positive(),
  refs: z.object({
    entities: z.record(z.any()),
    recipes: z.record(z.any()),
    detections: z.record(z.any()),
  }),
  style: StyleLayerSchema,
  creative: CreativeLayerSchema,
  editorial: z.object({
    sequences: z.array(z.any()),
    shotRelationships: z.array(z.any()),
    rhythm: z.object({ pattern: z.string(), musicalPhraseAlignment: z.array(z.any()) }),
  }),
  runtime: RuntimeLayerSchema,
  capabilities: z.record(z.any()),
  dependencies: z.record(z.any()),
  analysis: z.record(z.any()),
})

export type EDL = z.infer<typeof EDLSchema>
