import type { EffectBlock } from '@monet/edl'
import {
  getCanvasFilter,
  applyEffect,
  drawVignette,
  applyShake,
  drawFilmGrain,
  type CanvasEffect,
} from './canvas-effects'

export interface EffectEngineContext {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  time: number
}

export class EffectsEngine {
  private ctx: CanvasRenderingContext2D
  private width: number
  private height: number

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx
    this.width = width
    this.height = height
  }

  applyEffects(effects: EffectBlock[], time: number): void {
    for (const effect of effects) {
      this.applySingleEffect(effect, time)
    }
  }

  private applySingleEffect(effect: EffectBlock, time: number): void {
    const canvasEffect: CanvasEffect = {
      type: effect.type,
      intensity: this.extractIntensity(effect.params),
      params: effect.params,
    }

    const renderType = applyEffect(canvasEffect, this.width, this.height)

    switch (renderType) {
      case 'filter': {
        const filter = getCanvasFilter(canvasEffect)
        if (filter) {
          this.ctx.filter = filter
        }
        break
      }
      case 'gradient':
        drawVignette(this.ctx, this.width, this.height, canvasEffect.intensity)
        break
      case 'transform':
        applyShake(this.ctx, this.width, this.height, canvasEffect.intensity, time)
        break
      case 'noise':
        drawFilmGrain(this.ctx, this.width, this.height, canvasEffect.intensity)
        break
      case 'channels':
      case 'glitch':
        break
    }
  }

  private extractIntensity(params: Record<string, unknown>): number {
    if ('intensity' in params && typeof params.intensity === 'number') {
      return params.intensity
    }
    if ('amount' in params && typeof params.amount === 'number') {
      return params.amount
    }
    return 0.5
  }

  resetFilter(): void {
    this.ctx.filter = 'none'
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx
  }

  updateSize(width: number, height: number): void {
    this.width = width
    this.height = height
  }
}
