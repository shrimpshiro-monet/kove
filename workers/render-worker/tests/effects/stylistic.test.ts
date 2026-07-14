import { describe, it, expect } from 'vitest'
import { glow, bloom, filmGrain, halftone } from '../../src/effects/stylistic'
import { lightLeak, lensFlare, particle } from '../../src/effects/overlay'

describe('Stylistic Effects', () => {
  it('generates glow', () => {
    const result = glow({ radius: 20, threshold: 0.7, color: '#FFD700' })
    expect(result).toContain('gblur')
    expect(result).toContain('colorbalance')
    expect(result).not.toContain('blend=all_mode')
  })

  it('generates bloom', () => {
    const result = bloom({ threshold: 0.6, radius: 15 })
    expect(result).toContain('gblur')
    expect(result).toContain('curves')
  })

  it('generates film grain', () => {
    const result = filmGrain({ type: 'kodak_5219', size: 'medium' })
    expect(result).toContain('noise')
  })

  it('generates halftone', () => {
    const result = halftone({ dotSize: 4, angle: 45 })
    expect(result).toContain('edgedetect')
  })
})

describe('Overlay Effects', () => {
  it('generates light leak', () => {
    const result = lightLeak({ position: 'left', color: '#FF6B35', intensity: 0.6 })
    expect(result).toContain('colorize')
    expect(result).not.toContain('blend=all_mode')
  })

  it('generates lens flare', () => {
    const result = lensFlare({ position: [0.3, 0.4], size: 0.5 })
    expect(result).toContain('overlay')
  })

  it('generates particle', () => {
    const result = particle({ count: 50, size: 3, speed: 1.0 })
    expect(result).toContain('drawbox')
  })
})
