import { describe, it, expect } from 'vitest'
import { expandRecipe } from '../../src/resolvers/recipe-expander'
import { resolveStrength } from '../../src/resolvers/strength-resolver'
import type { Recipe, StyleTokens } from '../../src/style'

describe('RecipeExpander', () => {
  it('expands parametric recipe with style tokens', () => {
    const recipe: Recipe = {
      version: '2.0',
      description: 'Test recipe',
      applicableWhen: {},
      parametric: {
        glow: { base: 0.6, emotionScale: { awe: 1.0, calm: 0.5 }, aggressionScale: 0.4 },
        shake: { base: 0.3, emotionScale: { awe: 1.0 }, aggressionScale: 0.5 },
      },
      transition: { type: 'flash', baseDuration: 0.15 },
      camera: { movement: 'steadicam', baseIntensity: 0.5 },
    }
    const tokens: StyleTokens = {
      aggression: 0.8, cinematic: 0.7, chaos: 0.4, luxury: 0.9,
      warmth: 0.6, nostalgia: 0.3, futurism: 0.5, intimacy: 0.7,
      epicness: 0.85, playfulness: 0.2, darkness: 0.3, energy: 0.9,
    }
    const result = expandRecipe(recipe, tokens, 'awe')

    expect(result.effects).toHaveLength(2)
    expect(result.effects[0].type).toBe('glow')
    // glow: base(0.6) * emotionScale(1.0) + aggression(0.8) * aggressionScale(0.4) = 0.6 + 0.32 = 0.92
    expect(result.effects[0].targetStrength).toBeCloseTo(0.92, 1)
    expect(result.effects[1].type).toBe('shake')
    // shake: base(0.3) * emotionScale(1.0) + aggression(0.8) * aggressionScale(0.5) = 0.3 + 0.4 = 0.7
    expect(result.effects[1].targetStrength).toBeCloseTo(0.7, 1)
    expect(result.transition.type).toBe('flash')
    expect(result.transition.duration).toBe(0.15)
    expect(result.camera.movement).toBe('steadicam')
    expect(result.camera.intensity).toBe(0.5)
  })

  it('uses default emotion scale of 1.0 when emotion not in map', () => {
    const recipe: Recipe = {
      version: '2.0', description: 'Test', applicableWhen: {},
      parametric: {
        blur: { base: 0.4, emotionScale: { happy: 2.0 }, aggressionScale: 0.3 },
      },
      transition: { type: 'cut', baseDuration: 0 },
      camera: { movement: 'static', baseIntensity: 0 },
    }
    const tokens: StyleTokens = {
      aggression: 0.5, cinematic: 0.5, chaos: 0.5, luxury: 0.5,
      warmth: 0.5, nostalgia: 0.5, futurism: 0.5, intimacy: 0.5,
      epicness: 0.5, playfulness: 0.5, darkness: 0.5, energy: 0.5,
    }
    const result = expandRecipe(recipe, tokens, 'sad')

    // blur: base(0.4) * 1.0 + 0.5 * 0.3 = 0.4 + 0.15 = 0.55
    expect(result.effects[0].targetStrength).toBeCloseTo(0.55, 1)
  })

  it('clamps strength to 0-1 range', () => {
    const recipe: Recipe = {
      version: '2.0', description: 'Test', applicableWhen: {},
      parametric: {
        glow: { base: 0.9, emotionScale: { rage: 1.5 }, aggressionScale: 0.8 },
      },
      transition: { type: 'flash', baseDuration: 0.1 },
      camera: { movement: 'dolly', baseIntensity: 0.3 },
    }
    const tokens: StyleTokens = {
      aggression: 0.9, cinematic: 0.5, chaos: 0.5, luxury: 0.5,
      warmth: 0.5, nostalgia: 0.5, futurism: 0.5, intimacy: 0.5,
      epicness: 0.5, playfulness: 0.5, darkness: 0.5, energy: 0.5,
    }
    const result = expandRecipe(recipe, tokens, 'rage')

    // glow: 0.9 * 1.5 + 0.9 * 0.8 = 1.35 + 0.72 = 2.07 → clamped to 1.0
    expect(result.effects[0].targetStrength).toBe(1.0)
  })

  it('handles recipe with no parametric effects', () => {
    const recipe: Recipe = {
      version: '2.0', description: 'Empty', applicableWhen: {},
      parametric: {},
      transition: { type: 'dissolve', baseDuration: 0.5 },
      camera: { movement: 'pan', baseIntensity: 0.7 },
    }
    const tokens: StyleTokens = {
      aggression: 0.5, cinematic: 0.5, chaos: 0.5, luxury: 0.5,
      warmth: 0.5, nostalgia: 0.5, futurism: 0.5, intimacy: 0.5,
      epicness: 0.5, playfulness: 0.5, darkness: 0.5, energy: 0.5,
    }
    const result = expandRecipe(recipe, tokens, 'calm')

    expect(result.effects).toHaveLength(0)
    expect(result.transition.type).toBe('dissolve')
    expect(result.camera.movement).toBe('pan')
  })
})

describe('StrengthResolver', () => {
  it('passes through valid strength value', () => {
    expect(resolveStrength(0.5, 'editly')).toBe(0.5)
  })

  it('clamps strength above 1 to 1', () => {
    expect(resolveStrength(1.5, 'editly')).toBe(1)
  })

  it('clamps negative strength to 0', () => {
    expect(resolveStrength(-0.3, 'editly')).toBe(0)
  })

  it('preserves boundary values', () => {
    expect(resolveStrength(0, 'editly')).toBe(0)
    expect(resolveStrength(1, 'editly')).toBe(1)
  })
})
