import { describe, it, expect } from 'vitest'
import { gaussianBlur, radialBlur, directionalBlur } from '../../src/effects/blur'

describe('Blur Effects', () => {
  it('generates gaussian blur filter', () => {
    const result = gaussianBlur({ radius: 10, quality: 'high' })
    expect(result).toContain('gblur')
    expect(result).toContain('sigma=10')
  })

  it('generates radial blur filter', () => {
    const result = radialBlur({ center: [0.5, 0.5], strength: 15 })
    expect(result).toContain('zoompan')
  })

  it('generates directional blur filter', () => {
    const result = directionalBlur({ angle: 45, length: 20 })
    expect(result).toContain('convolution')
  })

  it('scales gaussian blur with radius', () => {
    const small = gaussianBlur({ radius: 2, quality: 'low' })
    const large = gaussianBlur({ radius: 20, quality: 'high' })
    expect(small).toContain('sigma=2')
    expect(large).toContain('sigma=20')
  })
})
