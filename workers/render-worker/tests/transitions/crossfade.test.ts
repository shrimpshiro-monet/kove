import { describe, it, expect } from 'vitest'
import { crossfade, dipBlack, flash } from '../../src/transitions/crossfade'

describe('Crossfade Transitions', () => {
  it('generates crossfade filter', () => {
    const result = crossfade({ duration: 0.5 })
    expect(result).toContain('xfade')
  })

  it('generates dip to black', () => {
    const result = dipBlack({ duration: 1.0 })
    expect(result).toContain('xfade')
    expect(result).toContain('fade')
  })

  it('generates flash', () => {
    const result = flash({ duration: 0.15, color: '#FFFFFF' })
    expect(result).toContain('fade')
  })
})
