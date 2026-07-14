import { describe, it, expect } from 'vitest'
import { effectToFilter } from '../../src/effects/index'

describe('Effect Registry', () => {
  it('handles color_grade effect', () => {
    const result = effectToFilter({ type: 'color_grade', targetStrength: 0.7, params: { preset: 'teal_orange' } })
    expect(result).toContain('curves')
  })

  it('handles vignette effect', () => {
    const result = effectToFilter({ type: 'vignette', targetStrength: 0.5, params: {} })
    expect(result).toContain('vignette')
  })

  it('handles desaturate effect', () => {
    const result = effectToFilter({ type: 'desaturate', targetStrength: 0.3, params: {} })
    expect(result).toContain('eq')
    expect(result).toContain('saturation')
  })

  it('handles blur effect', () => {
    const result = effectToFilter({ type: 'blur', targetStrength: 0.5, params: {} })
    expect(result).toContain('gblur')
  })

  it('handles gaussian_blur alias', () => {
    const result = effectToFilter({ type: 'gaussian_blur', targetStrength: 0.5, params: {} })
    expect(result).toContain('gblur')
  })

  it('handles glow effect', () => {
    const result = effectToFilter({ type: 'glow', targetStrength: 0.6, params: {} })
    expect(result).toContain('gblur')
  })

  it('handles bloom effect', () => {
    const result = effectToFilter({ type: 'bloom', targetStrength: 0.4, params: {} })
    expect(result).toContain('gblur')
  })

  it('handles shake effect', () => {
    const result = effectToFilter({ type: 'shake', targetStrength: 0.3, params: {} })
    expect(result).toContain('crop')
  })

  it('handles rgb_split effect', () => {
    const result = effectToFilter({ type: 'rgb_split', targetStrength: 0.2, params: {} })
    expect(result).toContain('rgbashift')
  })

  it('handles glitch effect', () => {
    const result = effectToFilter({ type: 'glitch', targetStrength: 0.5, params: {} })
    expect(result).toContain('rgbashift')
  })

  it('handles film_grain effect', () => {
    const result = effectToFilter({ type: 'film_grain', targetStrength: 0.2, params: {} })
    expect(result).toContain('noise')
  })

  it('handles halftone effect', () => {
    const result = effectToFilter({ type: 'halftone', targetStrength: 0.4, params: {} })
    expect(result).toContain('edgedetect')
  })

  it('handles radial_zoom_blur effect', () => {
    const result = effectToFilter({ type: 'radial_zoom_blur', targetStrength: 0.5, params: {} })
    expect(result).toContain('zoompan')
  })

  it('handles directional_blur effect', () => {
    const result = effectToFilter({ type: 'directional_blur', targetStrength: 0.5, params: {} })
    expect(result).toContain('convolution')
  })

  it('handles light_leak effect', () => {
    const result = effectToFilter({ type: 'light_leak', targetStrength: 0.3, params: {} })
    expect(result).toContain('colorize')
  })

  it('returns null for unknown effects', () => {
    expect(effectToFilter({ type: 'unknown_effect', targetStrength: 0.5, params: {} })).toBeNull()
  })

  it('handles color_grade default preset', () => {
    const result = effectToFilter({ type: 'color_grade', targetStrength: 0.5, params: {} })
    expect(result).toContain('eq')
  })
})
