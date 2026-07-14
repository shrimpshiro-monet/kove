import type { Recipe, StyleTokens } from '../style'
import { resolveStrength } from './strength-resolver'

export interface ExpandedEffect {
  type: string
  targetStrength: number
  params: Record<string, unknown>
}

export interface ExpandedRecipe {
  effects: ExpandedEffect[]
  transition: { type: string; duration: number }
  camera: { movement: string; intensity: number }
}

export function expandRecipe(
  recipe: Recipe,
  tokens: StyleTokens,
  emotion: string,
): ExpandedRecipe {
  const aggression = tokens.aggression ?? 0.5

  const effects: ExpandedEffect[] = Object.entries(recipe.parametric).map(([type, param]) => {
    const emotionScale = param.emotionScale?.[emotion] ?? 1.0
    const aggressionContribution = (param.aggressionScale ?? 0) * aggression
    const raw = param.base * emotionScale + aggressionContribution
    const targetStrength = resolveStrength(raw, 'default')
    return { type, targetStrength, params: {} }
  })

  return {
    effects,
    transition: { type: recipe.transition.type, duration: recipe.transition.baseDuration },
    camera: { movement: recipe.camera.movement, intensity: recipe.camera.baseIntensity },
  }
}
