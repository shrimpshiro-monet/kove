// Transition Engine
// Handles shot-to-shot transitions

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
        // No transition, just show current frame
        break;
      case "crossfade":
        this.applyCrossfade(
          ctx,
          progress,
          currentFrame,
          previousFrame,
          width,
          height
        );
        break;
      case "dip_black":
        this.applyDipToBlack(ctx, progress, currentFrame, width, height);
        break;
      case "slide":
        this.applySlide(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      default:
        // Unknown transition, default to cut
        break;
    }
  }

  private applyCrossfade(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw previous frame with fading opacity
    if (previousFrame) {
      ctx.globalAlpha = 1 - progress;
      ctx.putImageData(previousFrame, 0, 0);
    }

    // Draw current frame with increasing opacity
    if (currentFrame) {
      ctx.globalAlpha = progress;
      ctx.putImageData(currentFrame, 0, 0);
    }

    // Reset alpha
    ctx.globalAlpha = 1;
  }

  private applyDipToBlack(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // Fade out to black, then fade in from black
    const fadePoint = 0.5;

    if (progress < fadePoint) {
      // Fade out phase
      const fadeProgress = progress / fadePoint;
      if (currentFrame) {
        ctx.globalAlpha = 1 - fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
      // Overlay black
      ctx.fillStyle = "black";
      ctx.globalAlpha = fadeProgress;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } else {
      // Fade in phase
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

  private applySlide(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // Slide from right to left
    ctx.clearRect(0, 0, width, height);

    const slideOffset = width * (1 - progress);

    // Draw previous frame sliding out
    if (previousFrame) {
      ctx.putImageData(previousFrame, -slideOffset, 0);
    }

    // Draw current frame sliding in
    if (currentFrame) {
      ctx.putImageData(currentFrame, width - slideOffset, 0);
    }
  }

  /**
   * Easing functions for smooth transitions
   */
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
