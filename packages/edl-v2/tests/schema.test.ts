import { describe, it, expect } from 'vitest'
import { StyleLayerSchema } from '../src/style'

describe('StyleLayer', () => {
  it('validates style tokens as numeric 0-1', () => {
    const result = StyleLayerSchema.safeParse({
      tokens: {
        aggression: 0.8, cinematic: 0.7, chaos: 0.4, luxury: 0.9,
        warmth: 0.6, nostalgia: 0.3, futurism: 0.5, intimacy: 0.7,
        epicness: 0.85, playfulness: 0.2, darkness: 0.3, energy: 0.9,
      },
      tokenInfluence: {},
      genre: {
        primary: 'tiktok_edit', platform: 'tiktok',
        styleProfile: {
          cutRate: 1.2, avgShotDuration: 1.2, effectDensity: 0.8,
          transitionStyle: 'stylized', colorMood: 0.8, textFrequency: 0.5,
          energyCurve: 'building',
        },
      },
      constraints: {
        avoidFaceOcclusion: true, maxTextCoverage: 0.12,
        keepSubjectVisible: true, preserveMotionDirection: true,
        safeArea: true, avoidOverEditing: true, maxEffectsPerShot: 5,
        minShotDuration: 0.3, maxTransitionDuration: 1.5,
        preserveAudioSync: true, maintainColorConsistency: true,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects token values outside 0-1', () => {
    const result = StyleLayerSchema.safeParse({
      tokens: { aggression: 1.5 },
      tokenInfluence: {},
      genre: { primary: 'tiktok_edit', platform: 'tiktok', styleProfile: {} },
      constraints: {},
    })
    expect(result.success).toBe(false)
  })
})
