import { describe, it, expect, afterAll } from 'vitest'
import { edlToFFmpegCommand } from '../src/edl-to-ffmpeg'
import { validateEDL } from '@monet/edl-v2'
import type { EDL } from '@monet/edl-v2'
import { execSync } from 'child_process'
import { existsSync, unlinkSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures')
const OUTPUT_PATH = resolve(FIXTURES_DIR, 'output.mp4')
const OUTPUT_EFFECTS_PATH = resolve(FIXTURES_DIR, 'output_effects.mp4')

afterAll(() => {
  for (const p of [OUTPUT_PATH, OUTPUT_EFFECTS_PATH]) {
    if (existsSync(p)) unlinkSync(p)
  }
})

describe('E2E Render', () => {
  it('renders a real MP4 from EDL', () => {
    const edl: EDL = {
      version: '5.1',
      id: 'edl_e2e_test',
      created: '2026-07-14T00:00:00Z',
      duration: 3,
      refs: { entities: {}, recipes: {}, detections: {} },
      style: {
        tokens: { aggression: 0.5, cinematic: 0.5, chaos: 0.3, luxury: 0.5, warmth: 0.5, nostalgia: 0.3, futurism: 0.5, intimacy: 0.5, epicness: 0.5, playfulness: 0.3, darkness: 0.3, energy: 0.5 },
        tokenInfluence: {},
        genre: { primary: 'test', platform: 'tiktok', styleProfile: { cutRate: 1.0, avgShotDuration: 1.0, effectDensity: 0.5, transitionStyle: 'hard_cuts', colorMood: 0.5, textFrequency: 0.0, energyCurve: 'flat' } },
        constraints: { avoidFaceOcclusion: false, maxTextCoverage: 0.0, keepSubjectVisible: false, preserveMotionDirection: false, safeArea: false, avoidOverEditing: false, maxEffectsPerShot: 5, minShotDuration: 0.3, maxTransitionDuration: 1.5, preserveAudioSync: false, maintainColorConsistency: false },
      },
      creative: {
        entities: {},
        storyArc: [{ phase: 'test', start: 0, end: 3, emotion: 'calm' }],
        emotionArc: { timeline: [{ time: 0, emotion: 'calm', intensity: 0.5 }], autoApply: { enabled: false, affects: [], strength: 0 } },
        moments: [{ id: 'm1', start: 0, end: 3, purpose: 'test', emotion: 'calm', energy: 0.3, shots: ['shot_1'], recipes: [], aiPrompt: 'test', constraints: [] }],
        intentChains: { global: 'test', perMoment: {} },
        generativeSlots: [],
      },
      editorial: { sequences: [], shotRelationships: [], rhythm: { pattern: 'flat', musicalPhraseAlignment: [] } },
      runtime: {
        timeline: { resolution: { width: 540, height: 960 }, fps: 30, duration: 3 },
        tracks: [{
          id: 'track_v1', type: 'video', name: 'Main',
          clips: [{
            id: 'shot_1',
            source: { clipId: 'test_clip', type: 'video', in: 0, out: 3 },
            timing: { start: 0, duration: 3, speed: 1.0 },
            effects: [{ id: 'fx_1', type: 'vignette', targetStrength: 0.5, params: {} }],
          }],
        }],
        colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
      },
      capabilities: {},
      dependencies: {},
      analysis: { perMoment: {}, perShot: {}, energyCurve: [] },
    }

    const errors = validateEDL(edl)
    expect(errors).toHaveLength(0)

    const cmd = edlToFFmpegCommand(
      edl.runtime,
      resolve(FIXTURES_DIR, 'test_clip.mp4'),
      OUTPUT_PATH,
    )

    execSync(cmd, { stdio: 'pipe' })

    expect(existsSync(OUTPUT_PATH)).toBe(true)

    const stats = statSync(OUTPUT_PATH)
    expect(stats.size).toBeGreaterThan(0)
  }, 30000)
})

describe('E2E Render with Effects', () => {
  it('renders MP4 with color_grade + vignette + film_grain', () => {
    const edl: EDL = {
      version: '5.1',
      id: 'edl_e2e_effects',
      created: '2026-07-14T00:00:00Z',
      duration: 3,
      refs: { entities: {}, recipes: {}, detections: {} },
      style: {
        tokens: { aggression: 0.5, cinematic: 0.5, chaos: 0.3, luxury: 0.5, warmth: 0.5, nostalgia: 0.3, futurism: 0.5, intimacy: 0.5, epicness: 0.5, playfulness: 0.3, darkness: 0.3, energy: 0.5 },
        tokenInfluence: {},
        genre: { primary: 'test', platform: 'tiktok', styleProfile: { cutRate: 1.0, avgShotDuration: 1.0, effectDensity: 0.5, transitionStyle: 'hard_cuts', colorMood: 0.5, textFrequency: 0.0, energyCurve: 'flat' } },
        constraints: { avoidFaceOcclusion: false, maxTextCoverage: 0.0, keepSubjectVisible: false, preserveMotionDirection: false, safeArea: false, avoidOverEditing: false, maxEffectsPerShot: 5, minShotDuration: 0.3, maxTransitionDuration: 1.5, preserveAudioSync: false, maintainColorConsistency: false },
      },
      creative: {
        entities: {},
        storyArc: [{ phase: 'test', start: 0, end: 3, emotion: 'calm' }],
        emotionArc: { timeline: [{ time: 0, emotion: 'calm', intensity: 0.5 }], autoApply: { enabled: false, affects: [], strength: 0 } },
        moments: [{ id: 'm1', start: 0, end: 3, purpose: 'test', emotion: 'calm', energy: 0.3, shots: ['shot_1'], recipes: [], aiPrompt: 'test', constraints: [] }],
        intentChains: { global: 'test', perMoment: {} },
        generativeSlots: [],
      },
      editorial: { sequences: [], shotRelationships: [], rhythm: { pattern: 'flat', musicalPhraseAlignment: [] } },
      runtime: {
        timeline: { resolution: { width: 540, height: 960 }, fps: 30, duration: 3 },
        tracks: [{
          id: 'track_v1', type: 'video', name: 'Main',
          clips: [{
            id: 'shot_1',
            source: { clipId: 'test_clip', type: 'video', in: 0, out: 3 },
            timing: { start: 0, duration: 3, speed: 1.0 },
            effects: [
              { id: 'fx_1', type: 'color_grade', targetStrength: 0.7, params: { preset: 'teal_orange' } },
              { id: 'fx_2', type: 'vignette', targetStrength: 0.5, params: {} },
              { id: 'fx_3', type: 'film_grain', targetStrength: 0.2, params: {} },
            ],
          }],
        }],
        colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
      },
      capabilities: {},
      dependencies: {},
      analysis: { perMoment: {}, perShot: {}, energyCurve: [] },
    }

    const errors = validateEDL(edl)
    expect(errors).toHaveLength(0)

    const cmd = edlToFFmpegCommand(
      edl.runtime,
      resolve(FIXTURES_DIR, 'test_clip.mp4'),
      OUTPUT_EFFECTS_PATH,
    )

    execSync(cmd, { stdio: 'pipe' })

    expect(existsSync(OUTPUT_EFFECTS_PATH)).toBe(true)

    const stats = statSync(OUTPUT_EFFECTS_PATH)
    expect(stats.size).toBeGreaterThan(0)
  }, 30000)
})
