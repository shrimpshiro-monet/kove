import { describe, it, expect } from 'vitest'
import { colorGrade, vignette, desaturate } from '../../src/effects/color'

describe('Color Effects', () => {
  it('generates color grade filter', () => {
    const result = colorGrade({ preset: 'teal_orange', intensity: 0.7 })
    expect(result).toContain('curves')
    expect(result).toContain('0.7')
  })

  it('generates vignette filter', () => {
    const result = vignette({ intensity: 0.5 })
    expect(result).toContain('vignette')
  })

  it('generates desaturate filter', () => {
    const result = desaturate({ intensity: 0.3, preserveSkinTones: true })
    expect(result).toContain('eq')
    expect(result).toContain('saturation')
  })
})
