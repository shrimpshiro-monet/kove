import { crossfade, dipBlack, flash } from './crossfade'
import { linearWipe, radialWipe, gradientWipe } from './wipe'

export type TransitionFilter = string

export interface TransitionParams {
  type: string
  duration: number
  [key: string]: unknown
}

export function transitionToFilter(params: TransitionParams): TransitionFilter | null {
  switch (params.type) {
    case 'crossfade':
      return crossfade({ duration: params.duration })
    case 'dip_black':
      return dipBlack({ duration: params.duration })
    case 'flash':
      return flash({ duration: params.duration, color: (params.color as string) || '#FFFFFF' })
    case 'linear_wipe':
      return linearWipe({ duration: params.duration, direction: (params.direction as string) || 'left' })
    case 'radial_wipe':
      return radialWipe({ duration: params.duration })
    case 'gradient_wipe':
      return gradientWipe({ duration: params.duration, gradient: (params.gradient as string) || 'linear' })
    default:
      return null
  }
}

export { crossfade, dipBlack, flash } from './crossfade'
export { linearWipe, radialWipe, gradientWipe } from './wipe'
