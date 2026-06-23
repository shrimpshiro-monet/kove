// src/lib/renderer/text-engine.ts
// Kinetic captions: pop, type, slide_up, slide_down, shake, wave, split, glitch, scale_pulse, none

export interface KineticTextSpec {
  text: string;
  startTime: number;       // shot-local seconds
  duration: number;
  animation:
    | "pop"        // scale 0 → 1.1 → 1
    | "type"       // typewriter
    | "slide_up"   // from below
    | "slide_down" // from above
    | "shake"      // jitter while visible
    | "wave"       // letters bob in sine
    | "split"      // letters drop from random heights
    | "glitch"     // RGB-split + jitter
    | "scale_pulse" // rhythmic pulse
    | "none";

  style: {
    fontSize: number;
    fontFamily?: string;
    color: string;
    strokeColor?: string;
    strokeWidth?: number;
    backgroundColor?: string;  // box behind text
    fontWeight?: string;
    position: { x: number; y: number };  // 0..100 percent
    align?: "left" | "center" | "right";
  };
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export class KineticTextEngine {
  /** Draw kinetic text on ctx at currentTime (shot-local seconds) */
  draw(
    ctx: CanvasRenderingContext2D,
    spec: KineticTextSpec,
    currentTime: number,
    width: number,
    height: number,
  ) {
    const localT = (currentTime - spec.startTime) / spec.duration;
    if (localT < 0 || localT > 1) return;

    ctx.save();
    const fontFamily = spec.style.fontFamily ?? "Impact, Arial Black, sans-serif";
    const weight = spec.style.fontWeight ?? "900";
    ctx.font = `${weight} ${spec.style.fontSize}px ${fontFamily}`;
    ctx.textAlign = (spec.style.align ?? "center") as CanvasTextAlign;
    ctx.textBaseline = "middle";

    const px = (spec.style.position.x / 100) * width;
    const py = (spec.style.position.y / 100) * height;

    // Common opacity envelope: fade in fast, hold, fade out
    const fadeIn = 0.12;
    const fadeOut = 0.15;
    let alpha = 1;
    if (localT < fadeIn) alpha = localT / fadeIn;
    else if (localT > 1 - fadeOut) alpha = (1 - localT) / fadeOut;
    ctx.globalAlpha = Math.max(0, alpha);

    switch (spec.animation) {
      case "pop":       this.drawPop(ctx, spec, localT, px, py); break;
      case "type":      this.drawType(ctx, spec, localT, px, py, currentTime); break;
      case "slide_up":  this.drawSlide(ctx, spec, localT, px, py, "up"); break;
      case "slide_down": this.drawSlide(ctx, spec, localT, px, py, "down"); break;
      case "shake":     this.drawShake(ctx, spec, localT, px, py, currentTime); break;
      case "wave":      this.drawWave(ctx, spec, localT, px, py, currentTime); break;
      case "split":     this.drawSplit(ctx, spec, localT, px, py); break;
      case "glitch":    this.drawGlitch(ctx, spec, localT, px, py); break;
      case "scale_pulse": this.drawPulse(ctx, spec, localT, px, py, currentTime); break;
      default:          this.drawStatic(ctx, spec, px, py); break;
    }
    ctx.restore();
  }

  private fillBg(
    ctx: CanvasRenderingContext2D,
    spec: KineticTextSpec,
    x: number, y: number, w: number, h: number,
  ) {
    if (!spec.style.backgroundColor) return;
    ctx.fillStyle = spec.style.backgroundColor;
    const pad = 16;
    ctx.fillRect(x - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2);
  }

  private strokeAndFill(
    ctx: CanvasRenderingContext2D,
    spec: KineticTextSpec,
    text: string,
    x: number, y: number,
  ) {
    if (spec.style.strokeColor && spec.style.strokeWidth) {
      ctx.strokeStyle = spec.style.strokeColor;
      ctx.lineWidth = spec.style.strokeWidth;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = spec.style.color;
    ctx.fillText(text, x, y);
  }

  private drawStatic(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, px: number, py: number) {
    const m = ctx.measureText(spec.text);
    this.fillBg(ctx, spec, px, py, m.width, spec.style.fontSize);
    this.strokeAndFill(ctx, spec, spec.text, px, py);
  }

  private drawPop(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number, px: number, py: number) {
    let scale: number;
    if (t < 0.15) scale = (t / 0.15) * 1.25;
    else if (t < 0.3) scale = 1.25 - ((t - 0.15) / 0.15) * 0.25;
    else scale = 1.0;

    ctx.translate(px, py);
    ctx.scale(scale, scale);
    const m = ctx.measureText(spec.text);
    this.fillBg(ctx, spec, 0, 0, m.width, spec.style.fontSize);
    this.strokeAndFill(ctx, spec, spec.text, 0, 0);
  }

  private drawType(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const typeT = Math.min(1, t * 1.4);
    const chars = Math.floor(spec.text.length * typeT);
    const visible = spec.text.slice(0, chars);
    this.strokeAndFill(ctx, spec, visible, px, py);

    if (chars < spec.text.length && Math.floor(currentTime * 4) % 2 === 0) {
      const m = ctx.measureText(visible);
      const cursorX = (spec.style.align ?? "center") === "center"
        ? px + m.width / 2
        : px + m.width;
      ctx.fillStyle = spec.style.color;
      ctx.fillRect(cursorX + 4, py - spec.style.fontSize / 2.5, 4, spec.style.fontSize);
    }
  }

  private drawSlide(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, dir: "up" | "down",
  ) {
    const slideT = Math.min(1, t * 3);  // arrive at 1/3 through
    const sign = dir === "up" ? 1 : -1;
    const ease = 1 - Math.pow(1 - slideT, 3);
    const dy = (1 - ease) * 120 * sign;
    this.strokeAndFill(ctx, spec, spec.text, px, py + dy);
  }

  private drawShake(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const decay = Math.max(0, 1 - t * 1.3);
    const sx = Math.sin(currentTime * 80) * 10 * decay;
    const sy = Math.cos(currentTime * 70) * 6 * decay;
    this.strokeAndFill(ctx, spec, spec.text, px + sx, py + sy);
  }

  private drawWave(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const letters = spec.text.split("");
    const totalW = ctx.measureText(spec.text).width;
    let cursorX = px - totalW / 2;
    ctx.textAlign = "left";
    for (let i = 0; i < letters.length; i++) {
      const wave = Math.sin(currentTime * 6 + i * 0.5) * 12;
      this.strokeAndFill(ctx, spec, letters[i], cursorX, py + wave);
      cursorX += ctx.measureText(letters[i]).width;
    }
  }

  private drawSplit(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number, px: number, py: number) {
    const letters = spec.text.split("");
    const totalW = ctx.measureText(spec.text).width;
    let cursorX = px - totalW / 2;
    ctx.textAlign = "left";
    const arriveT = t * 1.5;
    for (let i = 0; i < letters.length; i++) {
      const charT = Math.max(0, Math.min(1, arriveT - i * 0.05));
      const ease = 1 - Math.pow(1 - charT, 3);
      const dy = (1 - ease) * 80;
      const oldAlpha = ctx.globalAlpha;
      ctx.globalAlpha = oldAlpha * charT;
      this.strokeAndFill(ctx, spec, letters[i], cursorX, py + dy);
      ctx.globalAlpha = oldAlpha;
      cursorX += ctx.measureText(letters[i]).width;
    }
  }

  private drawGlitch(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number, px: number, py: number) {
    const shakeX = (Math.random() - 0.5) * 8;
    // R/B split copies
    ctx.fillStyle = "rgba(255, 60, 60, 0.7)";
    ctx.fillText(spec.text, px - 6 + shakeX, py);
    ctx.fillStyle = "rgba(60, 200, 255, 0.7)";
    ctx.fillText(spec.text, px + 6 + shakeX, py);
    this.strokeAndFill(ctx, spec, spec.text, px + shakeX, py);
  }

  private drawPulse(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const scale = 1 + Math.sin(currentTime * 6) * 0.08;
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    this.strokeAndFill(ctx, spec, spec.text, 0, 0);
  }
}
