// Transition Engine
// After Effects-grade transitions for shot-to-shot compositing

export class TransitionEngine {
  /**
   * Apply transition between two shots
   */
  applyTransition(
    ctx: CanvasRenderingContext2D,
    type: string,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    switch (type) {
      case "cut":
        break;
      case "crossfade":
      case "dissolve":
        this.applyCrossfade(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "dip_black":
        this.applyDipToBlack(ctx, progress, currentFrame, width, height);
        break;
      case "flash":
        this.applyFlash(ctx, progress, currentFrame, width, height);
        break;
      case "slide":
        this.applySlide(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "radial_wipe":
      case "clock_wipe":
        this.applyRadialWipe(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "linear_wipe":
        this.applyLinearWipe(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "gradient_wipe":
        this.applyGradientWipe(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "barn_doors":
        this.applyBarnDoors(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "zoom_blur":
        this.applyZoomBlurTransition(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "morph":
        this.applyMorphCut(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "iris":
        this.applyIris(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "pinwheel":
        this.applyPinwheel(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "film_burn":
        this.applyFilmBurn(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "glitch":
        this.applyGlitchTransition(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "whip_pan":
        this.applyWhipPanTransition(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "spin":
        this.applySpin(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "blur":
        this.applyBlurTransition(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      case "pixelate":
        this.applyPixelateTransition(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      default:
        break;
    }
  }

  // ─── CROSSFADE / DISSOLVE ─────────────────────────────────────────────

  private applyCrossfade(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) {
      ctx.globalAlpha = 1 - progress;
      ctx.putImageData(previousFrame, 0, 0);
    }
    if (currentFrame) {
      ctx.globalAlpha = progress;
      ctx.putImageData(currentFrame, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  // ─── DIP TO BLACK ─────────────────────────────────────────────────────

  private applyDipToBlack(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const fadePoint = 0.5;
    if (progress < fadePoint) {
      const fadeProgress = progress / fadePoint;
      if (currentFrame) {
        ctx.globalAlpha = 1 - fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "black";
      ctx.globalAlpha = fadeProgress;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } else {
      const fadeProgress = (progress - fadePoint) / fadePoint;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      if (currentFrame) {
        ctx.globalAlpha = fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── FLASH ────────────────────────────────────────────────────────────

  private applyFlash(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const fadePoint = 0.5;
    if (progress < fadePoint) {
      const fadeProgress = progress / fadePoint;
      if (currentFrame) {
        ctx.globalAlpha = 1 - fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "white";
      ctx.globalAlpha = fadeProgress;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } else {
      const fadeProgress = (progress - fadePoint) / fadePoint;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      if (currentFrame) {
        ctx.globalAlpha = fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── SLIDE ────────────────────────────────────────────────────────────

  private applySlide(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    const slideOffset = width * (1 - progress);
    if (previousFrame) {
      ctx.putImageData(previousFrame, -slideOffset, 0);
    }
    if (currentFrame) {
      ctx.putImageData(currentFrame, width - slideOffset, 0);
    }
  }

  // ─── RADIAL WIPE (Clock Wipe) ─────────────────────────────────────────

  private applyRadialWipe(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) ctx.putImageData(previousFrame, 0, 0);

    if (currentFrame) {
      const angle = progress * Math.PI * 2;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.hypot(width, height);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + angle);
      ctx.closePath();
      ctx.clip();
      ctx.putImageData(currentFrame, 0, 0);
      ctx.restore();
    }
  }

  // ─── LINEAR WIPE ──────────────────────────────────────────────────────

  private applyLinearWipe(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) ctx.putImageData(previousFrame, 0, 0);

    if (currentFrame) {
      const wipeX = width * progress;
      const feather = width * 0.08;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wipeX - feather, 0);
      ctx.lineTo(wipeX + feather, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.clip();
      ctx.putImageData(currentFrame, 0, 0);
      ctx.restore();
    }
  }

  // ─── GRADIENT WIPE ────────────────────────────────────────────────────

  private applyGradientWipe(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) ctx.putImageData(previousFrame, 0, 0);

    if (currentFrame) {
      // Use alpha channel of a gradient as the wipe mask
      const threshold = progress * 255;
      const feather = 40;

      ctx.save();
      // Create gradient mask
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `rgba(0,0,0,1)`);
      gradient.addColorStop(Math.min(1, progress + feather / width), `rgba(0,0,0,1)`);
      gradient.addColorStop(Math.min(1, progress + feather / width + 0.01), `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,0)`);

      // Draw current frame
      ctx.putImageData(currentFrame, 0, 0);

      // Use destination-in to mask with gradient
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Draw remaining previous frame underneath
      if (previousFrame) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        const invGradient = ctx.createLinearGradient(0, 0, width, height);
        invGradient.addColorStop(0, `rgba(0,0,0,0)`);
        invGradient.addColorStop(Math.max(0, progress - feather / width), `rgba(0,0,0,0)`);
        invGradient.addColorStop(Math.max(0, progress - feather / width + 0.01), `rgba(0,0,0,1)`);
        invGradient.addColorStop(1, `rgba(0,0,0,1)`);
        ctx.putImageData(previousFrame, 0, 0);
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = invGradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
  }

  // ─── BARN DOORS ───────────────────────────────────────────────────────

  private applyBarnDoors(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) ctx.putImageData(previousFrame, 0, 0);

    if (currentFrame) {
      const halfProgress = Math.min(1, progress * 1.1);
      const doorWidth = width / 2 * halfProgress;

      ctx.save();
      ctx.beginPath();
      // Left door opens from center-left
      ctx.rect(0, 0, doorWidth, height);
      // Right door opens from center-right
      ctx.rect(width - doorWidth, 0, doorWidth, height);
      ctx.clip();
      ctx.putImageData(currentFrame, 0, 0);
      ctx.restore();
    }
  }

  // ─── ZOOM BLUR TRANSITION ─────────────────────────────────────────────

  private applyZoomBlurTransition(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const mid = 0.5;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    if (progress < mid) {
      // Zoom out + blur the outgoing frame
      const t = progress / mid;
      const scale = 1 + t * 0.3;
      const blur = t * 12;
      if (previousFrame) {
        ctx.save();
        ctx.filter = `blur(${blur}px)`;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        ctx.putImageData(previousFrame, 0, 0);
        ctx.restore();
      }
      // White flash at peak
      if (t > 0.7) {
        ctx.save();
        ctx.globalAlpha = (t - 0.7) / 0.3;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    } else {
      // Zoom in + blur the incoming frame
      const t = (progress - mid) / mid;
      const scale = 1.3 - t * 0.3;
      const blur = (1 - t) * 12;
      if (currentFrame) {
        ctx.save();
        ctx.filter = `blur(${blur}px)`;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = t;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.restore();
      }
      // Fade from white
      if (t < 0.3) {
        ctx.save();
        ctx.globalAlpha = 1 - t / 0.3;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }

  // ─── MORPH CUT ────────────────────────────────────────────────────────
  // Simulated morph: crossfade with a warp distortion at the midpoint

  private applyMorphCut(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // At the midpoint, apply a bulge distortion to simulate morphing
    const mid = 0.5;
    const warpStrength = Math.sin(progress * Math.PI) * 0.15;

    ctx.clearRect(0, 0, width, height);

    if (progress < mid) {
      if (previousFrame) {
        ctx.save();
        // Slight bulge at center during transition
        const scale = 1 + warpStrength;
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);
        ctx.globalAlpha = 1 - progress;
        ctx.putImageData(previousFrame, 0, 0);
        ctx.restore();
      }
    } else {
      if (currentFrame) {
        ctx.save();
        const scale = 1 + warpStrength;
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);
        ctx.globalAlpha = progress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ─── IRIS ─────────────────────────────────────────────────────────────
  // Circular iris open/close

  private applyIris(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) ctx.putImageData(previousFrame, 0, 0);

    if (currentFrame) {
      const maxRadius = Math.hypot(width, height) / 2;
      const radius = maxRadius * progress;

      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.putImageData(currentFrame, 0, 0);
      ctx.restore();
    }
  }

  // ─── PINWHEEL ─────────────────────────────────────────────────────────
  // Rotating扇形 wipe

  private applyPinwheel(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) ctx.putImageData(previousFrame, 0, 0);

    if (currentFrame) {
      const blades = 4;
      const angle = progress * Math.PI * 2;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.hypot(width, height);

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < blades; i++) {
        const baseAngle = (i / blades) * Math.PI * 2;
        const bladeAngle = baseAngle + angle / blades;
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, bladeAngle - 0.01, bladeAngle + (angle / blades));
      }
      ctx.closePath();
      ctx.clip();
      ctx.putImageData(currentFrame, 0, 0);
      ctx.restore();
    }
  }

  // ─── FILM BURN ────────────────────────────────────────────────────────
  // Warm light leak transition

  private applyFilmBurn(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    if (previousFrame) {
      ctx.globalAlpha = 1 - progress;
      ctx.putImageData(previousFrame, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Warm burn overlay
    const burnIntensity = Math.sin(progress * Math.PI);
    const gradient = ctx.createRadialGradient(
      width * 0.3, height * 0.3, 0,
      width * 0.5, height * 0.5, width * 0.8
    );
    gradient.addColorStop(0, `rgba(255, 180, 50, ${burnIntensity * 0.8})`);
    gradient.addColorStop(0.5, `rgba(255, 100, 20, ${burnIntensity * 0.5})`);
    gradient.addColorStop(1, `rgba(200, 50, 0, ${burnIntensity * 0.2})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (currentFrame) {
      ctx.globalAlpha = progress;
      ctx.putImageData(currentFrame, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  // ─── GLITCH TRANSITION ────────────────────────────────────────────────
  // Digital glitch: RGB split + block displacement

  private applyGlitchTransition(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const intensity = Math.sin(progress * Math.PI);
    const blockHeight = height / 12;

    ctx.clearRect(0, 0, width, height);

    // Create temp canvases to handle slice drawing
    const tempCurrent = document.createElement("canvas");
    tempCurrent.width = width;
    tempCurrent.height = height;
    const tempPrev = document.createElement("canvas");
    tempPrev.width = width;
    tempPrev.height = height;

    if (currentFrame) {
      tempCurrent.getContext("2d")!.putImageData(currentFrame, 0, 0);
    }
    if (previousFrame) {
      tempPrev.getContext("2d")!.putImageData(previousFrame, 0, 0);
    }

    // Draw alternating slices from each frame with offset
    for (let i = 0; i < 12; i++) {
      const y = i * blockHeight;
      const offset = (Math.sin(i * 7.3 + progress * 20) * intensity * width * 0.15) | 0;
      const useCurrent = (i + Math.floor(progress * 6)) % 2 === 0;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, width, blockHeight);
      ctx.clip();

      if (useCurrent && currentFrame) {
        ctx.drawImage(tempCurrent, offset, 0);
      } else if (previousFrame) {
        ctx.drawImage(tempPrev, -offset, 0);
      }
      ctx.restore();
    }

    // RGB split overlay
    if (intensity > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = intensity * 0.3;
      const rgbOffset = (intensity * 15) | 0;
      if (currentFrame) {
        ctx.drawImage(tempCurrent, rgbOffset, 0);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ─── WHIP PAN TRANSITION ──────────────────────────────────────────────
  // Fast horizontal motion blur between shots

  private applyWhipPanTransition(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const mid = 0.5;
    const motionBlur = Math.sin(progress * Math.PI) * 8;

    ctx.clearRect(0, 0, width, height);

    if (progress < mid) {
      const t = progress / mid;
      const offset = -t * width * 0.5;
      if (previousFrame) {
        ctx.save();
        if (motionBlur > 0.5) {
          ctx.filter = `blur(${motionBlur}px)`;
        }
        ctx.putImageData(previousFrame, offset, 0);
        ctx.restore();
      }
    } else {
      const t = (progress - mid) / mid;
      const offset = (1 - t) * width * 0.5;
      if (currentFrame) {
        ctx.save();
        if (motionBlur > 0.5) {
          ctx.filter = `blur(${motionBlur}px)`;
        }
        ctx.globalAlpha = t;
        ctx.putImageData(currentFrame, offset, 0);
        ctx.restore();
      }
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }

  // ─── SPIN ─────────────────────────────────────────────────────────────
  // Rotating transition with blur

  private applySpin(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const mid = 0.5;
    const cx = width / 2;
    const cy = height / 2;
    const angle = progress * Math.PI * 2;
    const spinBlur = Math.sin(progress * Math.PI) * 4;

    ctx.clearRect(0, 0, width, height);

    if (progress < mid) {
      if (previousFrame) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle * 0.5);
        ctx.scale(1 - progress * 0.2, 1 - progress * 0.2);
        ctx.translate(-cx, -cy);
        if (spinBlur > 0.5) ctx.filter = `blur(${spinBlur}px)`;
        ctx.putImageData(previousFrame, 0, 0);
        ctx.restore();
      }
    } else {
      if (currentFrame) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((1 - progress) * Math.PI);
        ctx.scale(0.8 + progress * 0.2, 0.8 + progress * 0.2);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = progress;
        if (spinBlur > 0.5) ctx.filter = `blur(${spinBlur}px)`;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.restore();
      }
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }

  // ─── BLUR TRANSITION ──────────────────────────────────────────────────
  // Gaussian blur in/out

  private applyBlurTransition(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const mid = 0.5;
    const maxBlur = 20;

    ctx.clearRect(0, 0, width, height);

    if (progress < mid) {
      const t = progress / mid;
      const blur = t * maxBlur;
      if (previousFrame) {
        ctx.save();
        ctx.filter = `blur(${blur}px)`;
        ctx.globalAlpha = 1 - t * 0.5;
        ctx.putImageData(previousFrame, 0, 0);
        ctx.restore();
      }
    } else {
      const t = (progress - mid) / mid;
      const blur = (1 - t) * maxBlur;
      if (currentFrame) {
        ctx.save();
        ctx.filter = `blur(${blur}px)`;
        ctx.globalAlpha = t;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.restore();
      }
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }

  // ─── PIXELATE TRANSITION ──────────────────────────────────────────────
  // Mosaic/pixelate in/out

  private applyPixelateTransition(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    const mid = 0.5;
    ctx.clearRect(0, 0, width, height);

    if (progress < mid) {
      const t = progress / mid;
      const blockSize = Math.max(2, Math.round(t * 60));
      if (previousFrame) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // Draw small, then scale up for pixelation
        const sw = Math.max(1, Math.round(width / blockSize));
        const sh = Math.max(1, Math.round(height / blockSize));
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.putImageData(previousFrame, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.restore();
      }
    } else {
      const t = (progress - mid) / mid;
      const blockSize = Math.max(2, Math.round((1 - t) * 60));
      if (currentFrame) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const sw = Math.max(1, Math.round(width / blockSize));
        const sh = Math.max(1, Math.round(height / blockSize));
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = t;
        ctx.drawImage(tempCanvas, 0, 0, sw, sh, 0, 0, width, height);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ─── Easing ───────────────────────────────────────────────────────────

  applyEasing(progress: number, easing: string): number {
    switch (easing) {
      case "linear":
        return progress;
      case "ease-in":
        return progress * progress;
      case "ease-out":
        return 1 - (1 - progress) * (1 - progress);
      case "ease-in-out":
        return progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      default:
        return progress;
    }
  }
}
