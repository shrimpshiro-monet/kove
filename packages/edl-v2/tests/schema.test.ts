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

import { RuntimeLayerSchema } from '../src/runtime'

describe('RuntimeLayer', () => {
  it('validates a complete clip with effects and transitions', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 15 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1', momentId: 'moment_setup',
          source: { clipId: 'clip_a', type: 'video', in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 1.0,
            speedRamp: { keyframes: [{ time: 0, speed: 1.0, easing: 'linear' }] },
          },
          transform: {
            position: { keyframes: [{ time: 0, value: [0, 0] }] },
            scale: { keyframes: [{ time: 0, value: [1, 1] }] },
            opacity: { keyframes: [{ time: 0, value: 1.0 }] },
            anchor: [0.5, 0.5],
          },
          camera: { movement: 'dolly_in', intensity: 0.3 },
          effects: [{ id: 'fx_1', type: 'glow', targetStrength: 0.6, params: { radius: 20 } }],
          transition: { type: 'flash', duration: 0.15 },
        }],
      }],
      colorScience: {
        workingSpace: 'ACES2065-1',
        inputTransform: { source: 'camera_log', cameraProfile: 'Sony_SLog3' },
        outputTransform: { target: 'Rec709', toneMapping: 'aces_filmic' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('validates minimal clip without optional fields', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 540, height: 960 }, fps: 24, duration: 5 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { type: 'video' },
          timing: { start: 0, duration: 5, speed: 1.0 },
        }],
      }],
      colorScience: {
        workingSpace: 'sRGB',
        inputTransform: { source: 'srgb', cameraProfile: 'sRGB' },
        outputTransform: { target: 'sRGB', toneMapping: 'none' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid track type', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 10 },
      tracks: [{
        id: 'track_v1', type: 'image', name: 'Bad',
        clips: [{
          id: 'shot_1',
          source: { type: 'video' },
          timing: { start: 0, duration: 5, speed: 1.0 },
        }],
      }],
      colorScience: {
        workingSpace: 'sRGB',
        inputTransform: { source: 'srgb', cameraProfile: 'sRGB' },
        outputTransform: { target: 'sRGB', toneMapping: 'none' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects effect with strength outside 0-1', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 5 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { type: 'video' },
          timing: { start: 0, duration: 5, speed: 1.0 },
          effects: [{ id: 'fx_1', type: 'glow', targetStrength: 1.5, params: {} }],
        }],
      }],
      colorScience: {
        workingSpace: 'sRGB',
        inputTransform: { source: 'srgb', cameraProfile: 'sRGB' },
        outputTransform: { target: 'sRGB', toneMapping: 'none' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects camera intensity outside 0-1', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 5 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { type: 'video' },
          timing: { start: 0, duration: 5, speed: 1.0 },
          camera: { movement: 'shake', intensity: -0.5 },
        }],
      }],
      colorScience: {
        workingSpace: 'sRGB',
        inputTransform: { source: 'srgb', cameraProfile: 'sRGB' },
        outputTransform: { target: 'sRGB', toneMapping: 'none' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('validates audio track type', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 10 },
      tracks: [{
        id: 'track_a1', type: 'audio', name: 'Music',
        clips: [{
          id: 'music_1',
          source: { clipId: 'song_1', type: 'video' },
          timing: { start: 0, duration: 10, speed: 1.0 },
        }],
      }],
      colorScience: {
        workingSpace: 'sRGB',
        inputTransform: { source: 'srgb', cameraProfile: 'sRGB' },
        outputTransform: { target: 'sRGB', toneMapping: 'none' },
      },
    })
    expect(result.success).toBe(true)
  })
})

import { EDLSchema } from '../src/schema'
import { validateEDL } from '../src/validators'

describe('EDL v5.1', () => {
  const validEDL = {
    version: '5.1' as const,
    id: 'edl_test_001',
    created: '2026-07-14T00:00:00Z',
    duration: 3,
    refs: { entities: {}, recipes: {}, detections: {} },
    style: {
      tokens: { aggression: 0.8, cinematic: 0.7, chaos: 0.4, luxury: 0.9, warmth: 0.6, nostalgia: 0.3, futurism: 0.5, intimacy: 0.7, epicness: 0.85, playfulness: 0.2, darkness: 0.3, energy: 0.9 },
      tokenInfluence: {},
      genre: { primary: 'tiktok_edit', platform: 'tiktok', styleProfile: { cutRate: 1.2, avgShotDuration: 1.2, effectDensity: 0.8, transitionStyle: 'stylized', colorMood: 0.8, textFrequency: 0.5, energyCurve: 'building' } },
      constraints: { avoidFaceOcclusion: true, maxTextCoverage: 0.12, keepSubjectVisible: true, preserveMotionDirection: true, safeArea: true, avoidOverEditing: true, maxEffectsPerShot: 5, minShotDuration: 0.3, maxTransitionDuration: 1.5, preserveAudioSync: true, maintainColorConsistency: true },
    },
    creative: {
      entities: {},
      storyArc: [{ phase: 'setup', start: 0, end: 3, emotion: 'calm' }],
      emotionArc: { timeline: [{ time: 0, emotion: 'calm', intensity: 0.2 }], autoApply: { enabled: false, affects: [], strength: 0 } },
      moments: [{ id: 'm1', start: 0, end: 3, purpose: 'test', emotion: 'calm', energy: 0.2, shots: ['shot_1'], recipes: [], aiPrompt: 'test', constraints: [] }],
      intentChains: { global: '', perMoment: {} },
      generativeSlots: [],
    },
    editorial: { sequences: [], shotRelationships: [], rhythm: { pattern: 'building', musicalPhraseAlignment: [] } },
    runtime: {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video' as const, name: 'Main',
        clips: [{
          id: 'shot_1', momentId: 'm1',
          source: { clipId: 'clip_a', type: 'video' as const, in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 1 },
        }],
      }],
      colorScience: { workingSpace: 'ACES2065-1', inputTransform: { source: 'camera_log', cameraProfile: 'Sony_SLog3' }, outputTransform: { target: 'Rec709', toneMapping: 'aces_filmic' } },
    },
    capabilities: { engines: {}, runtime: {}, renderNode: {} },
    dependencies: {},
    analysis: { perMoment: {}, perShot: {}, energyCurve: [] },
  }

  it('validates a complete EDL v5.1', () => {
    const result = EDLSchema.safeParse(validEDL)
    expect(result.success).toBe(true)
  })

  it('passes business rule validation', () => {
    const errors = validateEDL(validEDL)
    expect(errors).toHaveLength(0)
  })

  it('rejects overlapping shots', () => {
    const edl = {
      ...validEDL,
      runtime: {
        ...validEDL.runtime,
        tracks: [{
          id: 'track_v1', type: 'video' as const, name: 'Main',
          clips: [
            { id: 'shot_1', source: { type: 'video' as const }, timing: { start: 0, duration: 3, speed: 1 } },
            { id: 'shot_2', source: { type: 'video' as const }, timing: { start: 2, duration: 3, speed: 1 } },
          ],
        }],
      },
    }
    const errors = validateEDL(edl)
    expect(errors.some(e => e.includes('overlap'))).toBe(true)
  })
})
