import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCanvasFilter,
  applyEffect,
  drawVignette,
  applyShake,
  drawFilmGrain,
  getEffectType,
  type CanvasEffect,
} from '../apps/web/src/lib/canvas-effects'

describe('Canvas2D Effects', () => {
  describe('getCanvasFilter', () => {
    it('converts glow to canvas blur filter', () => {
      const filter = getCanvasFilter({ type: 'glow', intensity: 0.6, params: {} })
      expect(filter).toContain('blur')
    })

    it('converts blur to canvas blur filter', () => {
      const filter = getCanvasFilter({ type: 'blur', intensity: 0.4, params: {} })
      expect(filter).toContain('blur')
    })

    it('converts desaturate to grayscale filter', () => {
      const filter = getCanvasFilter({ type: 'desaturate', intensity: 0.5, params: {} })
      expect(filter).toContain('grayscale')
    })

    it('converts brightness to brightness filter', () => {
      const filter = getCanvasFilter({ type: 'brightness', intensity: 0.3, params: {} })
      expect(filter).toContain('brightness')
    })

    it('converts contrast to contrast filter', () => {
      const filter = getCanvasFilter({ type: 'contrast', intensity: 0.4, params: {} })
      expect(filter).toContain('contrast')
    })

    it('converts saturate to saturate filter', () => {
      const filter = getCanvasFilter({ type: 'saturate', intensity: 0.7, params: {} })
      expect(filter).toContain('saturate')
    })

    it('returns empty string for unknown filter-based effect', () => {
      const filter = getCanvasFilter({ type: 'unknown_effect', intensity: 0.5, params: {} })
      expect(filter).toBe('')
    })
  })

  describe('applyEffect', () => {
    it('returns "gradient" for vignette effect', () => {
      const result = applyEffect({ type: 'vignette', intensity: 0.5, params: {} }, 1920, 1080)
      expect(result).toBe('gradient')
    })

    it('returns "transform" for shake effect', () => {
      const result = applyEffect({ type: 'shake', intensity: 0.3, params: {} }, 1920, 1080)
      expect(result).toBe('transform')
    })

    it('returns "channels" for rgb_split effect', () => {
      const result = applyEffect({ type: 'rgb_split', intensity: 0.5, params: {} }, 1920, 1080)
      expect(result).toBe('channels')
    })

    it('returns "noise" for film_grain effect', () => {
      const result = applyEffect({ type: 'film_grain', intensity: 0.2, params: {} }, 1920, 1080)
      expect(result).toBe('noise')
    })

    it('returns "glitch" for glitch effect', () => {
      const result = applyEffect({ type: 'glitch', intensity: 0.5, params: {} }, 1920, 1080)
      expect(result).toBe('glitch')
    })

    it('returns "filter" for glow (CSS filter based)', () => {
      const result = applyEffect({ type: 'glow', intensity: 0.5, params: {} }, 1920, 1080)
      expect(result).toBe('filter')
    })

    it('returns "filter" for unknown effect type', () => {
      const result = applyEffect({ type: 'unknown', intensity: 0.5, params: {} }, 1920, 1080)
      expect(result).toBe('filter')
    })
  })

  describe('getEffectType', () => {
    it('classifies gradient effects', () => {
      expect(getEffectType('vignette')).toBe('gradient')
      expect(getEffectType('vignette_pro')).toBe('gradient')
      expect(getEffectType('light_leak')).toBe('gradient')
    })

    it('classifies transform effects', () => {
      expect(getEffectType('shake')).toBe('transform')
      expect(getEffectType('context_shake')).toBe('transform')
      expect(getEffectType('whip_pan')).toBe('transform')
    })

    it('classifies filter effects', () => {
      expect(getEffectType('glow')).toBe('filter')
      expect(getEffectType('blur')).toBe('filter')
      expect(getEffectType('brightness')).toBe('filter')
      expect(getEffectType('desaturate')).toBe('filter')
      expect(getEffectType('contrast')).toBe('filter')
      expect(getEffectType('saturate')).toBe('filter')
    })

    it('classifies noise effects', () => {
      expect(getEffectType('film_grain')).toBe('noise')
      expect(getEffectType('noise_grain')).toBe('noise')
    })

    it('classifies channel effects', () => {
      expect(getEffectType('rgb_split')).toBe('channels')
      expect(getEffectType('chromatic_aberration')).toBe('channels')
    })

    it('classifies glitch effects', () => {
      expect(getEffectType('glitch')).toBe('glitch')
      expect(getEffectType('chromatic_glitch')).toBe('glitch')
    })
  })

  describe('drawVignette', () => {
    it('creates radial gradient overlay', () => {
      const mockCtx = {
        createRadialGradient: vi.fn().mockReturnValue({
          addColorStop: vi.fn(),
        }),
        fillStyle: '',
        fillRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D

      drawVignette(mockCtx, 1920, 1080, 0.5)

      expect(mockCtx.createRadialGradient).toHaveBeenCalledWith(
        960, 540, 576,  // center x, y, inner radius (0.3 * 1920)
        960, 540, 1344  // center x, y, outer radius (0.7 * 1920)
      )
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080)
    })
  })

  describe('applyShake', () => {
    it('applies translate transform based on time', () => {
      const mockCtx = {
        translate: vi.fn(),
      } as unknown as CanvasRenderingContext2D

      applyShake(mockCtx, 1920, 1080, 0.5, 1.0)

      expect(mockCtx.translate).toHaveBeenCalledTimes(1)
      const [x, y] = mockCtx.translate.mock.calls[0]
      expect(typeof x).toBe('number')
      expect(typeof y).toBe('number')
    })
  })

  describe('drawFilmGrain', () => {
    it('applies noise to pixel data', () => {
      const pixelData = new Uint8ClampedArray(4 * 4) // 4 pixels
      const mockCtx = {
        getImageData: vi.fn().mockReturnValue({ data: pixelData }),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D

      drawFilmGrain(mockCtx, 2, 2, 0.3)

      expect(mockCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2)
      expect(mockCtx.putImageData).toHaveBeenCalledTimes(1)
    })
  })
})
