/**
 * Lottie integration — load After Effects JSON animations
 * Massive unlock: any AE template online becomes a usable effect.
 */

let _lottiePromise: Promise<any> | null = null;

async function loadLottie() {
  if (!_lottiePromise) {
    _lottiePromise = import("lottie-web").then((m) => m.default);
  }
  return _lottiePromise;
}

export interface LottieRenderSpec {
  url: string;
  width: number;
  height: number;
  loop?: boolean;
}

const _animCache = new Map<string, any>();

/**
 * Render a Lottie animation frame onto a canvas at a specific time.
 * Caches the loaded animation by URL.
 */
export async function renderLottieFrame(
  ctx: CanvasRenderingContext2D,
  spec: LottieRenderSpec,
  currentTime: number,
): Promise<void> {
  const lottie = await loadLottie();

  let anim = _animCache.get(spec.url);
  if (!anim) {
    const container = document.createElement("div");
    container.style.width = spec.width + "px";
    container.style.height = spec.height + "px";
    container.style.position = "absolute";
    container.style.left = "-9999px";
    document.body.appendChild(container);

    anim = lottie.loadAnimation({
      container,
      renderer: "canvas",
      loop: spec.loop ?? false,
      autoplay: false,
      path: spec.url,
    });

    await new Promise<void>((resolve) => {
      anim.addEventListener("data_ready", () => resolve());
    });

    _animCache.set(spec.url, anim);
  }

  const fps = anim.frameRate || 30;
  const frame = Math.floor(currentTime * fps) % anim.totalFrames;
  anim.goToAndStop(frame, true);

  const lottieCanvas = anim.renderer.canvasContext.canvas as HTMLCanvasElement;
  ctx.drawImage(lottieCanvas, 0, 0, spec.width, spec.height);
}

export function clearLottieCache() {
  for (const anim of _animCache.values()) anim.destroy();
  _animCache.clear();
}
