import type { EffectParams } from "./types";

export class EffectsEngine {
  hasCustomDraw(effects: EffectParams[]): boolean {
    return effects.some(e => e.type === "rgb_split" || e.type === "directional_blur" || e.type === "radial_zoom_blur");
  }

  customDraw(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    effects: EffectParams[],
    width: number,
    height: number,
    time: number
  ) {
    const specialEffects = effects.filter(e => e.type === "rgb_split" || e.type === "directional_blur" || e.type === "radial_zoom_blur");
    const normalEffects = effects.filter(e => e.type !== "rgb_split" && e.type !== "directional_blur" && e.type !== "radial_zoom_blur");
    
    ctx.save();
    this.applyEffects(ctx, normalEffects, width, height, time);

    let handled = false;
    for (const effect of specialEffects) {
      if (effect.type === "rgb_split") {
        this.drawRgbSplit(ctx, image, effect.intensity, width, height);
        handled = true;
      } else if (effect.type === "directional_blur") {
        this.drawDirectionalBlur(ctx, image, effect.intensity, width, height);
        handled = true;
      } else if (effect.type === "radial_zoom_blur") {
        this.drawRadialZoomBlur(ctx, image, effect.intensity, width, height);
        handled = true;
      }
    }

    if (!handled) {
      ctx.drawImage(image, 0, 0, width, height);
    }
    
    ctx.restore();
  }

  private drawRgbSplit(ctx: CanvasRenderingContext2D, image: CanvasImageSource, intensity: number, width: number, height: number) {
    const offset = intensity * 20; // max 20px offset
    ctx.globalCompositeOperation = "screen";
    
    ctx.save();
    ctx.fillStyle = "rgba(255,0,0,1)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(image, -offset, 0, width, height);
    ctx.fillRect(-offset, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(0,255,0,1)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(image, offset, 0, width, height);
    ctx.fillRect(offset, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(0,0,255,1)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(image, 0, offset, width, height);
    ctx.fillRect(0, offset, width, height);
    ctx.restore();
    
    // reset composite mode and redraw original to regain luma
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, 0, 0, width, height);
  }

  private drawDirectionalBlur(ctx: CanvasRenderingContext2D, image: CanvasImageSource, intensity: number, width: number, height: number) {
    const steps = 6;
    const maxOffset = intensity * 40;
    ctx.globalAlpha = 1.0 / steps;
    for (let i = 0; i < steps; i++) {
      ctx.drawImage(image, (i - steps/2) * (maxOffset/steps), 0, width, height);
    }
    ctx.globalAlpha = 1.0;
  }

  private drawRadialZoomBlur(ctx: CanvasRenderingContext2D, image: CanvasImageSource, intensity: number, width: number, height: number) {
    const steps = 6;
    const maxScale = 1 + intensity * 0.2;
    ctx.globalAlpha = 1.0 / steps;
    for (let i = 0; i < steps; i++) {
      const scale = 1 + (maxScale - 1) * (i / steps);
      ctx.save();
      ctx.translate(width/2, height/2);
      ctx.scale(scale, scale);
      ctx.translate(-width/2, -height/2);
      ctx.drawImage(image, 0, 0, width, height);
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
  }

  applyEffects(
    ctx: CanvasRenderingContext2D,
    effects: EffectParams[],
    width: number,
    height: number,
    time: number = 0
  ) {
    for (const effect of effects) {
      this.applyEffect(ctx, effect, width, height, time);
    }
  }

  private applyEffect(
    ctx: CanvasRenderingContext2D,
    effect: EffectParams,
    width: number,
    height: number,
    time: number
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
        this.applyShake(ctx, effect.intensity, width, height, time);
        break;
      case "zoom_pulse":
        this.applyZoomPulse(ctx, effect.intensity, width, height, time);
        break;
    }
  }

  private applyBlur(ctx: CanvasRenderingContext2D, intensity: number) {
    const blurAmount = Math.round(intensity * 10);
    if (blurAmount > 0) {
      const current = ctx.filter && ctx.filter !== "none" ? ctx.filter + " " : "";
      ctx.filter = current + `blur(${blurAmount}px)`;
    }
  }

  private applyBrightness(ctx: CanvasRenderingContext2D, intensity: number) {
    const brightness = 0.5 + intensity;
    ctx.filter = (ctx.filter || "") + ` brightness(${brightness})`;
  }

  private applyContrast(ctx: CanvasRenderingContext2D, intensity: number) {
    const contrast = 0.5 + intensity * 1.5;
    ctx.filter = (ctx.filter || "") + ` contrast(${contrast})`;
  }

  private applySaturation(ctx: CanvasRenderingContext2D, intensity: number) {
    const saturation = intensity * 2;
    ctx.filter = (ctx.filter || "") + ` saturate(${saturation})`;
  }

  private applyGlow(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.shadowBlur = intensity * 30;
    ctx.shadowColor = `rgba(255, 255, 255, ${intensity * 0.8})`;
  }

  private applyShake(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const maxShake = intensity * 20;
    const offsetX = Math.sin(time * 173.7 + 1.0) * maxShake;
    const offsetY = Math.sin(time * 231.1 + 2.0) * maxShake;
    ctx.translate(offsetX, offsetY);
  }

  private applyZoomPulse(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const scale = 1 + Math.sin(time * Math.PI * 2 * 5) * intensity * 0.05;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
  }

  resetEffects(ctx: CanvasRenderingContext2D) {
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
  }
}
