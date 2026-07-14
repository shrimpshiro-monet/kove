import { describe, it, expect } from 'vitest'
import { shake, rgbSplit, glitch } from '../../src/effects/distortion'

describe('Distortion Effects', () => {
  it('generates shake filter', () => {
    const result = shake({ frequency: 30, amplitude: 5 })
    expect(result).toContain('crop')
  })

  it('generates rgb split filter', () => {
    const result = rgbSplit({ offset: 3, angle: 45 })
    expect(result).toContain('rgbashift')
  })

  it('generates glitch filter', () => {
    const result = glitch({ intensity: 0.5, blockWidth: 10 })
    expect(result).toContain('rgbashift')
    expect(result).toContain('noise')
  })

  it('amplitude affects crop dimensions in shake', () => {
    const small = shake({ frequency: 30, amplitude: 2 })
    const large = shake({ frequency: 30, amplitude: 10 })
    expect(small).toContain('iw-4')
    expect(small).toContain('ih-4')
    expect(large).toContain('iw-20')
    expect(large).toContain('ih-20')
    expect(small).not.toContain('1920')
    expect(small).not.toContain('1080')
  })
})
