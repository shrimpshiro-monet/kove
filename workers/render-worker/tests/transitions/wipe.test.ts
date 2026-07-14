import { describe, it, expect } from 'vitest'
import { linearWipe, radialWipe, gradientWipe } from '../../src/transitions/wipe'

describe('Wipe Transitions', () => {
  it('generates linear wipe', () => {
    const result = linearWipe({ duration: 0.5, direction: 'left' })
    expect(result).toContain('xfade')
    expect(result).toContain('wipeleft')
  })

  it('generates radial wipe', () => {
    const result = radialWipe({ duration: 0.5 })
    expect(result).toContain('xfade')
    expect(result).toContain('radial')
  })

  it('generates gradient wipe', () => {
    const result = gradientWipe({ duration: 0.5, gradient: 'linear' })
    expect(result).toContain('xfade')
  })
})
