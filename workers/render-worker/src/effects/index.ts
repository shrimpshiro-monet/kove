import { colorGrade, vignette, desaturate } from './color'
import { gaussianBlur, radialBlur, directionalBlur } from './blur'
import { shake, rgbSplit, glitch } from './distortion'
import { glow, bloom, filmGrain, halftone } from './stylistic'
import { lightLeak } from './overlay'

export type EffectFilter = string

export interface EffectParams {
  type: string
  targetStrength: number
  params: Record<string, unknown>
}

export type EffectFn = (params: EffectParams) => EffectFilter

export function effectToFilter(effect: EffectParams): string | null {
  const { type, targetStrength, params } = effect

  switch (type) {
    case 'color_grade':
      return colorGrade({ preset: (params.preset as string) || 'teal_orange', intensity: targetStrength })
    case 'vignette':
      return vignette({ intensity: targetStrength })
    case 'desaturate':
      return desaturate({ intensity: targetStrength, preserveSkinTones: (params.preserveSkinTones as boolean) || false })

    case 'blur':
    case 'gaussian_blur':
      return gaussianBlur({ radius: targetStrength * 20, quality: 'medium' })
    case 'glow':
      return glow({ radius: (params.radius as number) || 20, threshold: targetStrength })
    case 'bloom':
      return bloom({ threshold: targetStrength, radius: (params.radius as number) || 15 })

    case 'shake':
      return shake({ frequency: 30, amplitude: targetStrength * 10 })
    case 'rgb_split':
      return rgbSplit({ offset: targetStrength * 5, angle: 45 })
    case 'glitch':
      return glitch({ intensity: targetStrength, blockWidth: 10 })

    case 'film_grain':
      return filmGrain({ type: (params.filmType as string) || 'kodak_5219', size: 'medium' })
    case 'halftone':
      return halftone({ dotSize: 4, angle: 45 })

    case 'radial_zoom_blur':
      return radialBlur({ center: [0.5, 0.5], strength: targetStrength * 20 })
    case 'directional_blur':
      return directionalBlur({ angle: 90, length: targetStrength * 30 })

    case 'light_leak':
      return lightLeak({ position: (params.position as string) || 'left', color: (params.color as string) || '#FF6B00', intensity: targetStrength })

    default:
      console.warn(`[effects] Unhandled effect type "${type}" — skipping`)
      return null
  }
}
