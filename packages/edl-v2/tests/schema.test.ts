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

import { CreativeLayerSchema } from '../src/creative'

describe('CreativeLayer', () => {
  it('validates entities with bounding boxes', () => {
    const result = CreativeLayerSchema.safeParse({
      entities: {
        subject_1: {
          type: 'person', role: 'hero', description: 'Young man',
          detectionFrames: [0, 30, 60],
          boundingBoxes: { '0': [400, 200, 680, 900] },
          depthMask: 'r2://masks/subject_1_depth.exr',
        },
      },
      storyArc: [{ phase: 'setup', start: 0, end: 3, emotion: 'calm' }],
      emotionArc: {
        timeline: [{ time: 0, emotion: 'calm', intensity: 0.2 }],
        autoApply: { enabled: true, affects: ['effects.strength'], strength: 0.8 },
      },
      moments: [{
        id: 'moment_setup', start: 0, end: 3, purpose: 'establish',
        emotion: 'calm', energy: 0.2, shots: ['shot_1'], recipes: [],
        aiPrompt: 'Set the scene', attention: {}, constraints: [],
      }],
      intentChains: { global: 'High-energy edit', perMoment: {} },
      generativeSlots: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects entity with invalid type', () => {
    const result = CreativeLayerSchema.safeParse({
      entities: { bad: { type: 'car', role: 'hero', description: 'test' } },
      storyArc: [], emotionArc: { timeline: [], autoApply: { enabled: false, affects: [], strength: 0 } },
      moments: [], intentChains: { global: '', perMoment: {} }, generativeSlots: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects moment with energy outside 0-1', () => {
    const result = CreativeLayerSchema.safeParse({
      entities: {},
      storyArc: [],
      emotionArc: { timeline: [], autoApply: { enabled: false, affects: [], strength: 0 } },
      moments: [{
        id: 'bad', start: 0, end: 1, purpose: 'test', emotion: 'calm',
        energy: 1.5, shots: [], recipes: [], aiPrompt: '', constraints: [],
      }],
      intentChains: { global: '', perMoment: {} },
      generativeSlots: [],
    })
    expect(result.success).toBe(false)
  })
})
