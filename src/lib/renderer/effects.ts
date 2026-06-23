import type { EffectParams } from "./types";

export class EffectsEngine {
  private appendFilter(ctx: CanvasRenderingContext2D, value: string) {
    const current = ctx.filter && ctx.filter !== "none" ? ctx.filter + " " : "";
    ctx.filter = current + value;
  }

  private isDirectionalBlur(type: string): boolean {
    return type === "directional_blur" || type === "directionalBlur" || type === "directional-blur";
  }

  private isRgbSplit(type: string): boolean {
    return type === "rgb_split" || type === "rgbSplit" || type === "rgb-split";
  }

  private isRadialZoomBlur(type: string): boolean {
    return type === "radial_zoom_blur" || type === "radialZoomBlur" || type === "radial-zoom-blur";
  }

  private echoCanvas: HTMLCanvasElement | null = null;
  private echoCtx: CanvasRenderingContext2D | null = null;

  hasCustomDraw(effects: EffectParams[]): boolean {
    return effects.some(e => this.isRgbSplit(e.type) || this.isDirectionalBlur(e.type) || this.isRadialZoomBlur(e.type) || e.type === "echo");
  }

  customDraw(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    effects: EffectParams[],
    width: number,
    height: number,
    time: number
  ) {
    const specialEffects = effects.filter(e => this.isRgbSplit(e.type) || this.isDirectionalBlur(e.type) || this.isRadialZoomBlur(e.type) || e.type === "echo");
    const normalEffects = effects.filter(e => !this.isRgbSplit(e.type) && !this.isDirectionalBlur(e.type) && !this.isRadialZoomBlur(e.type) && e.type !== "echo");
    
    ctx.save();
    this.applyEffects(ctx, normalEffects, width, height, time);

    let handled = false;
    for (const effect of specialEffects) {
      if (this.isRgbSplit(effect.type)) {
        this.drawRgbSplit(ctx, image, effect.intensity, width, height);
        handled = true;
      } else if (this.isDirectionalBlur(effect.type)) {
        this.drawDirectionalBlur(ctx, image, effect.intensity, width, height, effect.params);
        handled = true;
      } else if (this.isRadialZoomBlur(effect.type)) {
        this.drawRadialZoomBlur(ctx, image, effect.intensity, width, height);
        handled = true;
      } else if (effect.type === "echo") {
        // Echo: Draw the trailing buffer first with decay
        this.applyEchoPre(ctx, width, height, effect.intensity, effect.params);
        ctx.drawImage(image, 0, 0, width, height);
        this.applyEchoPost(ctx, width, height);
        handled = true;
      }
    }

    if (!handled) {
      ctx.drawImage(image, 0, 0, width, height);
    }
    
    ctx.restore();
  }

  private applyEchoPre(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number,
    params?: Record<string, number>
  ) {
    if (!this.echoCanvas) {
      this.echoCanvas = document.createElement("canvas");
      this.echoCanvas.width = width;
      this.echoCanvas.height = height;
      this.echoCtx = this.echoCanvas.getContext("2d");
    }

    const decay = params?.decay ?? intensity * 0.8;
    if (this.echoCanvas) {
      ctx.save();
      ctx.globalAlpha = decay;
      ctx.drawImage(this.echoCanvas, 0, 0, width, height);
      ctx.restore();
    }
  }

  private applyEchoPost(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.echoCtx && this.echoCanvas) {
      this.echoCtx.clearRect(0, 0, width, height);
      this.echoCtx.drawImage(ctx.canvas, 0, 0, width, height);
    }
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

  private drawDirectionalBlur(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    intensity: number,
    width: number,
    height: number,
    params?: Record<string, number>
  ) {
    const steps = 6;
    const angle = params?.direction ?? 90;
    const length = params?.blurLength ?? intensity * 40;
    const rad = (angle * Math.PI) / 180;
    const offsetX = Math.cos(rad) * length;
    const offsetY = Math.sin(rad) * length;

    ctx.globalAlpha = 1.0 / steps;
    for (let i = 0; i < steps; i++) {
      const factor = (i - steps / 2) / steps;
      ctx.drawImage(image, factor * offsetX, factor * offsetY, width, height);
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
      case "gaussian-blur":
      case "gaussianBlur":
      case "gaussian_blur":
        const blurriness = effect.params?.blurriness ?? effect.intensity * 10;
        this.applyBlur(ctx, blurriness / 10);
        break;
      case "camera-blur":
      case "camera_blur":
      case "cameraBlur":
        const camBlur = effect.params?.blurRadius ?? effect.intensity * 15;
        this.applyBlur(ctx, camBlur / 10);
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
      case "invert":
        this.applyInvert(ctx, effect.intensity, effect.params);
        break;
      case "sharpen":
        const sharpAmount = effect.params?.amount ?? effect.intensity * 100;
        this.applySharpen(ctx, sharpAmount / 100);
        break;
      case "unsharp-mask":
      case "unsharp_mask":
      case "unsharpMask":
        const unsharpAmount = effect.params?.amount ?? effect.intensity * 100;
        this.applySharpen(ctx, (unsharpAmount / 100) * 1.3);
        break;
      case "reduce-interlace-flicker":
      case "reduce_interlace_flicker":
      case "reduceInterlaceFlicker":
        const softness = effect.params?.softness ?? effect.intensity;
        this.applyVerticalBlur(ctx, softness);
        break;
      case "corner_pin":
      case "cornerPin":
      case "corner-pin":
      case "lens_distortion":
      case "lensDistortion":
      case "lens-distortion":
      case "alpha_glow":
      case "alphaGlow":
      case "alpha-glow":
      case "brush_strokes":
      case "brushStrokes":
      case "brush-strokes":
      case "color_emboss":
      case "colorEmboss":
      case "color-emboss":
      case "replicate":
      case "roughen_edges":
      case "roughenEdges":
      case "roughen-edges":
        // Graceful fallback / no-op
        break;
      case "magnify": {
        const cx = effect.params?.centerX ?? 0.5;
        const cy = effect.params?.centerY ?? 0.5;
        const mag = effect.params?.magnification ?? 1.5;
        const sz = (effect.params?.size ?? 0.2) * width;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx * width, cy * height, sz, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          ctx.canvas,
          cx * width - sz / mag,
          cy * height - sz / mag,
          (sz * 2) / mag,
          (sz * 2) / mag,
          cx * width - sz,
          cy * height - sz,
          sz * 2,
          sz * 2
        );
        ctx.restore();
        break;
      }
      case "mirror": {
        const angle = effect.params?.reflectionAngle ?? 90;
        ctx.save();
        if (angle === 90 || angle === 270) {
          ctx.drawImage(ctx.canvas, 0, 0, width / 2, height, 0, 0, width / 2, height);
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(ctx.canvas, 0, 0, width / 2, height, width / 2, 0, width / 2, height);
        } else {
          ctx.drawImage(ctx.canvas, 0, 0, width, height / 2, 0, 0, width, height / 2);
          ctx.translate(0, height);
          ctx.scale(1, -1);
          ctx.drawImage(ctx.canvas, 0, 0, width, height / 2, 0, height / 2, width, height / 2);
        }
        ctx.restore();
        break;
      }
      case "mosaic": {
        const hBlk = effect.params?.horizontalBlocks ?? 20;
        const vBlk = effect.params?.verticalBlocks ?? 20;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, hBlk, vBlk);
        ctx.drawImage(ctx.canvas, 0, 0, hBlk, vBlk, 0, 0, width, height);
        ctx.restore();
        break;
      }
      case "find_edges":
      case "findEdges":
      case "find-edges":
        this.appendFilter(ctx, "contrast(300%) grayscale(100%) invert(100%)");
        break;
      case "posterize":
        this.appendFilter(ctx, "contrast(200%) saturate(150%)");
        break;
      case "strobe_light":
      case "strobeLight":
      case "strobe-light": {
        const stPeriod = effect.params?.period ?? 1.0;
        const stDur = effect.params?.duration ?? 0.1;
        if (time % stPeriod < stDur) {
          if ((effect.params?.strobeType ?? 0) === 1) {
            this.appendFilter(ctx, "invert(100%)");
          } else {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
          }
        }
        break;
      }
      case "noise_grain":
      case "noiseGrain":
      case "noise-grain": {
        const grainIntensity = effect.params?.intensity ?? effect.intensity ?? 0.15;
        this.applyNoiseGrain(ctx, grainIntensity, width, height, time);
        break;
      }
      case "scanlines": {
        const scanIntensity = effect.params?.intensity ?? effect.intensity ?? 0.2;
        this.applyScanlines(ctx, scanIntensity, width, height);
        break;
      }
      case "vhs_tracking":
      case "vhsTracking":
      case "vhs-tracking": {
        const vhsIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyVHSTracking(ctx, vhsIntensity, width, height, time);
        break;
      }
      case "halftone_benday":
      case "halftoneBenday":
      case "halftone-benday": {
        const halftoneIntensity = effect.params?.intensity ?? effect.intensity ?? 0.4;
        this.applyHalftone(ctx, halftoneIntensity, width, height);
        break;
      }
      case "chromatic_glitch":
      case "chromaticGlitch":
      case "chromatic-glitch": {
        const glitchIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyChromaticGlitch(ctx, glitchIntensity, width, height, time);
        break;
      }
      case "flash_white":
      case "flashWhite":
      case "flash-white": {
        const flashIntensity = effect.params?.intensity ?? effect.intensity ?? 0.8;
        this.applyFlashWhite(ctx, flashIntensity, width, height);
        break;
      }
      case "light_leak":
      case "lightLeak":
      case "light-leak": {
        const leakIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyLightLeak(ctx, leakIntensity, width, height, time);
        break;
      }
      case "bloom": {
        const bloomIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyBloom(ctx, bloomIntensity, width, height);
        break;
      }
      case "context_shake":
      case "contextShake":
      case "context-shake": {
        const shakeIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyShake(ctx, shakeIntensity, width, height, time);
        break;
      }
      case "whip_pan":
      case "whipPan":
      case "whip-pan": {
        const whipIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyWhipPan(ctx, whipIntensity, width, height, time);
        break;
      }
      case "comic_ink_edges":
      case "comicInkEdges":
      case "comic-ink-edges": {
        const edgeIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyComicInkEdges(ctx, edgeIntensity, width, height);
        break;
      }
      case "frame_stutter_anime":
      case "frameStutterAnime":
      case "frame-stutter-anime": {
        const stutterIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyFrameStutterAnime(ctx, stutterIntensity, width, height, time);
        break;
      }
      case "lens_flare":
      case "lensFlare":
      case "lens-flare": {
        const flareIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyLensFlare(ctx, flareIntensity, width, height, time);
        break;
      }
      case "particle_system":
      case "particleSystem":
      case "particle-system": {
        const particleIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyParticleSystem(ctx, particleIntensity, width, height, time);
        break;
      }
      case "overlay": {
        const overlayIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyOverlay(ctx, overlayIntensity, width, height);
        break;
      }
    }
  }

  private applyVerticalBlur(ctx: CanvasRenderingContext2D, intensity: number) {
    // Standard canvas blur handles basic lowpass feel
    const blurAmount = Math.max(1, Math.round(intensity * 4));
    this.appendFilter(ctx, `blur(${blurAmount}px)`);
  }

  private applySharpen(ctx: CanvasRenderingContext2D, intensity: number) {
    // Approx sharpen by boosting contrast and lowering brightness slightly
    const contrast = 1 + intensity * 0.4;
    const brightness = 1 - intensity * 0.05;
    this.appendFilter(ctx, `contrast(${contrast}) brightness(${brightness})`);
  }

  private applyInvert(ctx: CanvasRenderingContext2D, intensity: number, params?: Record<string, number>) {
    const blend = params?.blend ?? 0; // 0-100%, where 0 is fully inverted and 100 is original
    const amount = (100 - blend) / 100;
    this.appendFilter(ctx, `invert(${amount.toFixed(2)})`);
  }

  private applyBlur(ctx: CanvasRenderingContext2D, intensity: number) {
    const blurAmount = Math.round(intensity * 10);
    if (blurAmount > 0) {
      this.appendFilter(ctx, `blur(${blurAmount}px)`);
    }
  }

  private applyBrightness(ctx: CanvasRenderingContext2D, intensity: number) {
    const brightness = 0.5 + intensity;
    this.appendFilter(ctx, `brightness(${brightness})`);
  }

  private applyContrast(ctx: CanvasRenderingContext2D, intensity: number) {
    const contrast = 0.5 + intensity * 1.5;
    this.appendFilter(ctx, `contrast(${contrast})`);
  }

  private applySaturation(ctx: CanvasRenderingContext2D, intensity: number) {
    const saturation = intensity * 2;
    this.appendFilter(ctx, `saturate(${saturation})`);
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

  private applyNoiseGrain(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const noiseAmount = intensity * 50;
    
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  private applyScanlines(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 2);
    }
    
    ctx.restore();
  }

  private applyVHSTracking(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const offset = Math.sin(time * 3) * intensity * 20;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, offset, 0, width, height, 0, 0, width, height);
    ctx.restore();
    
    this.appendFilter(ctx, `saturate(120%) contrast(110%)`);
  }

  private applyHalftone(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    const dotSize = Math.max(2, intensity * 8);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    ctx.save();
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "black";
    
    for (let y = 0; y < height; y += dotSize) {
      for (let x = 0; x < width; x += dotSize) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const radius = (1 - brightness / 255) * dotSize * 0.5;
        
        if (radius > 0.5) {
          ctx.beginPath();
          ctx.arc(x + dotSize / 2, y + dotSize / 2, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    ctx.restore();
  }

  private applyChromaticGlitch(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const offset = intensity * 10;
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
    ctx.drawImage(ctx.canvas, -offset, 0, width, height);
    
    ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
    ctx.drawImage(ctx.canvas, 0, 0, width, height);
    
    ctx.fillStyle = "rgba(0, 0, 255, 0.3)";
    ctx.drawImage(ctx.canvas, offset, 0, width, height);
    
    ctx.restore();
  }

  private applyFlashWhite(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyLightLeak(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const gradient = ctx.createRadialGradient(
      width * 0.3, height * 0.3, 0,
      width * 0.3, height * 0.3, width * 0.5
    );
    
    gradient.addColorStop(0, `rgba(255, 200, 100, ${intensity})`);
    gradient.addColorStop(0.5, `rgba(255, 150, 50, ${intensity * 0.5})`);
    gradient.addColorStop(1, "rgba(255, 100, 0, 0)");
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyBloom(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = intensity * 0.5;
    ctx.filter = `blur(${intensity * 20}px) brightness(150%)`;
    ctx.drawImage(ctx.canvas, 0, 0, width, height);
    ctx.restore();
  }

  private applyWhipPan(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const offset = Math.sin(time * 10) * intensity * width * 0.3;
    ctx.translate(offset, 0);
    this.appendFilter(ctx, `blur(${intensity * 10}px)`);
  }

  private applyComicInkEdges(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const threshold = 30 * (1 - intensity);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const idxLeft = (y * width + (x - 1)) * 4;
        const idxRight = (y * width + (x + 1)) * 4;
        const idxUp = ((y - 1) * width + x) * 4;
        const idxDown = ((y + 1) * width + x) * 4;
        
        const gx = Math.abs(data[idxRight] - data[idxLeft]);
        const gy = Math.abs(data[idxDown] - data[idxUp]);
        const edge = Math.sqrt(gx * gx + gy * gy);
        
        if (edge > threshold) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  private applyFrameStutterAnime(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const holdFrames = Math.floor(intensity * 4) + 2;
    const frameIndex = Math.floor(time * 30);
    const shouldHold = frameIndex % holdFrames === 0;
    
    if (shouldHold) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }
  }

  private applyLensFlare(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const flareX = width * 0.3;
    const flareY = height * 0.3;
    const flareSize = intensity * 100;
    
    const gradient = ctx.createRadialGradient(
      flareX, flareY, 0,
      flareX, flareY, flareSize
    );
    
    gradient.addColorStop(0, `rgba(255, 255, 200, ${intensity})`);
    gradient.addColorStop(0.3, `rgba(255, 200, 100, ${intensity * 0.5})`);
    gradient.addColorStop(1, "rgba(255, 150, 50, 0)");
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyParticleSystem(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const particleCount = Math.floor(intensity * 50);
    const particleSize = 2;
    
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.5})`;
    
    for (let i = 0; i < particleCount; i++) {
      const x = (Math.sin(time * 0.5 + i * 0.1) * 0.5 + 0.5) * width;
      const y = (Math.cos(time * 0.3 + i * 0.2) * 0.5 + 0.5) * height;
      
      ctx.beginPath();
      ctx.arc(x, y, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  private applyOverlay(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalAlpha = intensity * 0.3;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  resetEffects(ctx: CanvasRenderingContext2D) {
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
  }
}
