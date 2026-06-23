/**
 * GSAP-powered text animations — broadcast-quality kinetic typography
 * Lazy-loaded. Used by text-engine for advanced presets.
 */

let _gsapPromise: Promise<any> | null = null;

async function loadGsap() {
  if (!_gsapPromise) {
    _gsapPromise = import("gsap");
  }
  return _gsapPromise;
}

export interface GsapTextAnimSpec {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  duration: number;
  preset: "pop" | "explode" | "wave" | "type" | "split" | "shake" | "slide";
}

/**
 * Render an animated text frame to a canvas at a specific time.
 * Uses GSAP internally for tweening math, draws via Canvas2D.
 */
export async function renderGsapTextFrame(
  ctx: CanvasRenderingContext2D,
  spec: GsapTextAnimSpec,
  currentTime: number,
): Promise<void> {
  const gsapModule = await loadGsap();
  const gsap = gsapModule.gsap;

  const progress = Math.max(0, Math.min(1, currentTime / spec.duration));

  ctx.save();
  ctx.font = `bold ${spec.fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = spec.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const ease = gsap.parseEase("power3.out");

  switch (spec.preset) {
    case "pop": {
      const eased = ease(progress);
      const scale = eased < 0.5
        ? 0.3 + eased * 2 * 1.4
        : 1.7 - (eased - 0.5) * 2 * 0.7;
      ctx.translate(spec.x, spec.y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.min(1, progress * 4);
      ctx.fillText(spec.text, 0, 0);
      break;
    }

    case "shake": {
      const shake = (1 - progress) * 8;
      ctx.translate(
        spec.x + (Math.random() - 0.5) * shake,
        spec.y + (Math.random() - 0.5) * shake,
      );
      ctx.fillText(spec.text, 0, 0);
      break;
    }

    case "slide": {
      const eased = ease(progress);
      ctx.translate(spec.x, spec.y + (1 - eased) * 100);
      ctx.globalAlpha = eased;
      ctx.fillText(spec.text, 0, 0);
      break;
    }

    case "type": {
      const chars = Math.floor(spec.text.length * progress);
      ctx.translate(spec.x, spec.y);
      ctx.fillText(spec.text.slice(0, chars), 0, 0);
      break;
    }

    case "wave":
    case "split":
    case "explode":
    default: {
      const eased = ease(progress);
      ctx.translate(spec.x, spec.y);
      ctx.globalAlpha = eased;
      ctx.fillText(spec.text, 0, 0);
      break;
    }
  }

  ctx.restore();
}
