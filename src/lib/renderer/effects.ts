// Canvas Effects Engine
// Applies visual effects to canvas context

import type { EffectParams } from "./types";

export class EffectsEngine {
  /**
   * Apply effects to the current canvas context
   */
  applyEffects(
    ctx: CanvasRenderingContext2D,
    effects: EffectParams[],
    width: number,
    height: number
  ) {
    for (const effect of effects) {
      this.applyEffect(ctx, effect, width, height);
    }
  }

  private applyEffect(
    ctx: CanvasRenderingContext2D,
    effect: EffectParams,
    width: number,
    height: number
  ) {
    switch (effect.type) {
      case "blur":
        this.applyBlur(ctx, effect.intensity);
        break;
      case "brightness":
        this.applyBrightness(ctx, effect.intensity);
        break;
      case "contrast":
        this.applyContrast(ctx, effect.intensity);
        break;
      case "saturation":
        this.applySaturation(ctx, effect.intensity);
        break;
      case "glow":
        this.applyGlow(ctx, effect.intensity, width, height);
        break;
      case "shake":
        this.applyShake(ctx, effect.intensity, width, height);
        break;
      case "zoom_pulse":
        this.applyZoomPulse(ctx, effect.intensity, width, height);
        break;
    }
  }

  private applyBlur(ctx: CanvasRenderingContext2D, intensity: number) {
    const blurAmount = Math.round(intensity * 10);
    if (blurAmount > 0) {
      ctx.filter = `blur(${blurAmount}px)`;
    }
  }

  private applyBrightness(ctx: CanvasRenderingContext2D, intensity: number) {
    // intensity: 0 = dark, 0.5 = normal, 1 = bright
    const brightness = 0.5 + intensity;
    ctx.filter = (ctx.filter || "") + ` brightness(${brightness})`;
  }

  private applyContrast(ctx: CanvasRenderingContext2D, intensity: number) {
    // intensity: 0 = low contrast, 0.5 = normal, 1 = high contrast
    const contrast = 0.5 + intensity * 1.5;
    ctx.filter = (ctx.filter || "") + ` contrast(${contrast})`;
  }

  private applySaturation(ctx: CanvasRenderingContext2D, intensity: number) {
    // intensity: 0 = grayscale, 0.5 = normal, 1 = oversaturated
    const saturation = intensity * 2;
    ctx.filter = (ctx.filter || "") + ` saturate(${saturation})`;
  }

  private applyGlow(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    // Glow effect using shadow
    ctx.shadowBlur = intensity * 30;
    ctx.shadowColor = `rgba(255, 255, 255, ${intensity * 0.8})`;
  }

  private applyShake(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    // Random shake offset
    const maxShake = intensity * 20;
    const offsetX = (Math.random() - 0.5) * maxShake;
    const offsetY = (Math.random() - 0.5) * maxShake;
    ctx.translate(offsetX, offsetY);
  }

  private applyZoomPulse(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    // Pulse zoom effect (subtle scale)
    const scale = 1 + Math.sin(Date.now() / 200) * intensity * 0.05;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
  }

  /**
   * Reset all effects
   */
  resetEffects(ctx: CanvasRenderingContext2D) {
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }
}
