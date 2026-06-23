// src/lib/renderer/particle-fx.ts
// Light leaks, sparks, lens flares, dust, smoke, confetti, rain — sprite-driven Canvas2D.
// Lazy-loads sprites + caches them. Falls back to procedural if assets missing.

export type ParticleKind =
  | "light_leak"
  | "sparks"
  | "lens_flare"
  | "dust"
  | "smoke"
  | "confetti"
  | "rain";

interface ParticleConfig {
  kind: ParticleKind;
  intensity: number;       // 0..1
  progress: number;        // 0..1 — local time within effect window
  centerX?: number;        // 0..1 normalized for positioning
  centerY?: number;
  hueShift?: number;       // 0..360
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Procedural sprite generators — used when asset files aren't present
function generateLightLeakSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  // Multi-layer radial gradient — warm orange/red bloom
  const colors = [
    { stops: [[0, "rgba(255, 200, 130, 1.0)"], [0.4, "rgba(255, 140, 80, 0.6)"], [1, "rgba(255, 80, 40, 0)"]] },
    { stops: [[0, "rgba(255, 100, 50, 0.7)"], [0.6, "rgba(200, 60, 30, 0.3)"], [1, "rgba(180, 30, 10, 0)"]] },
  ];
  for (const layer of colors) {
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    for (const [pos, col] of layer.stops as [number, string][]) {
      g.addColorStop(pos, col);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  return c;
}

function generateSparksSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);

  // 80 sparks emanating from center
  for (let i = 0; i < 80; i++) {
    const angle = (i / 80) * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    const x = 256 + Math.cos(angle) * dist;
    const y = 256 + Math.sin(angle) * dist;
    const len = 30 + Math.random() * 60;
    const w = 1 + Math.random() * 2;

    const g = ctx.createLinearGradient(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    g.addColorStop(0, "rgba(255, 220, 130, 1)");
    g.addColorStop(0.5, "rgba(255, 160, 60, 0.8)");
    g.addColorStop(1, "rgba(255, 80, 20, 0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  return c;
}

function generateLensFlareSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  // Bright core
  const core = ctx.createRadialGradient(256, 256, 0, 256, 256, 60);
  core.addColorStop(0, "rgba(255, 255, 240, 1)");
  core.addColorStop(0.4, "rgba(255, 220, 180, 0.7)");
  core.addColorStop(1, "rgba(255, 180, 100, 0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 512, 512);

  // Rays
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI;
    const g = ctx.createLinearGradient(256, 256, 256 + Math.cos(angle) * 250, 256 + Math.sin(angle) * 250);
    g.addColorStop(0, "rgba(255, 255, 200, 0.6)");
    g.addColorStop(1, "rgba(255, 200, 100, 0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256 - Math.cos(angle) * 250, 256 - Math.sin(angle) * 250);
    ctx.lineTo(256 + Math.cos(angle) * 250, 256 + Math.sin(angle) * 250);
    ctx.stroke();
  }
  return c;
}

export class ParticleFXRenderer {
  private sprites: Map<ParticleKind, HTMLCanvasElement> = new Map();
  private dustParticles: Array<{ x: number; y: number; r: number; vx: number; vy: number }> = [];

  constructor() {
    // Pre-generate procedural sprites
    this.sprites.set("light_leak", generateLightLeakSprite());
    this.sprites.set("sparks", generateSparksSprite());
    this.sprites.set("lens_flare", generateLensFlareSprite());

    // Init dust particles (reused across renders)
    for (let i = 0; i < 60; i++) {
      this.dustParticles.push({
        x: Math.random(),
        y: Math.random(),
        r: 1 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 0.0008,
        vy: -Math.random() * 0.0005 - 0.0002,
      });
    }
  }

  /** Composite particle effect onto ctx */
  apply(
    ctx: CanvasRenderingContext2D,
    config: ParticleConfig,
    width: number,
    height: number,
  ) {
    const { kind, intensity, progress } = config;
    if (intensity <= 0 || progress < 0 || progress > 1) return;

    switch (kind) {
      case "light_leak": return this.drawLightLeak(ctx, intensity, progress, width, height);
      case "sparks":     return this.drawSparks(ctx, intensity, progress, width, height, config);
      case "lens_flare": return this.drawLensFlare(ctx, intensity, progress, width, height, config);
      case "dust":       return this.drawDust(ctx, intensity, width, height);
      case "smoke":      return this.drawSmoke(ctx, intensity, progress, width, height);
      case "confetti":   return this.drawConfetti(ctx, intensity, progress, width, height);
      case "rain":       return this.drawRain(ctx, intensity, width, height);
    }
  }

  private drawLightLeak(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
  ) {
    const sprite = this.sprites.get("light_leak")!;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Bell curve fade in/out
    const envelope = Math.sin(progress * Math.PI);
    ctx.globalAlpha = Math.min(1, intensity * envelope * 0.95);

    // Pan across the frame
    const panX = (progress - 0.5) * width * 0.8;
    const scale = 1.4 + intensity * 0.3;
    const sw = width * scale;
    const sh = height * scale;
    ctx.drawImage(sprite, panX + (width - sw) / 2, (height - sh) / 2, sw, sh);

    ctx.restore();
  }

  private drawSparks(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
    config: ParticleConfig,
  ) {
    const sprite = this.sprites.get("sparks")!;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = intensity * (1 - progress);

    const cx = (config.centerX ?? 0.5) * width;
    const cy = (config.centerY ?? 0.5) * height;
    const size = 220 + 380 * progress;
    ctx.translate(cx, cy);
    ctx.rotate(progress * Math.PI * 0.3);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private drawLensFlare(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
    config: ParticleConfig,
  ) {
    const sprite = this.sprites.get("lens_flare")!;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const envelope = Math.sin(progress * Math.PI);
    ctx.globalAlpha = intensity * envelope;

    const cx = (config.centerX ?? 0.5) * width;
    const cy = (config.centerY ?? 0.5) * height;
    const size = Math.max(width, height) * 0.7;
    ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }

  private drawDust(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = rgba(255, 240, 200, 0.4 * intensity);

    for (const p of this.dustParticles) {
      // Animate
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y = 1;

      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSmoke(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
  ) {
    // Procedural radial smoke clouds
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 6; i++) {
      const baseX = (i / 6) * width + Math.sin(progress * 4 + i) * 50;
      const baseY = height - progress * height * 0.6 - i * 40;
      const r = 80 + 60 * Math.sin(progress * 2 + i);
      const g = ctx.createRadialGradient(baseX, baseY, 0, baseX, baseY, r);
      const alpha = 0.18 * intensity * (1 - progress * 0.4);
      g.addColorStop(0, rgba(220, 220, 220, alpha));
      g.addColorStop(1, rgba(160, 160, 160, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(baseX, baseY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawConfetti(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    const count = Math.floor(40 * intensity);
    const colors = ["#ff5252", "#ffeb3b", "#4caf50", "#2196f3", "#e91e63", "#ff9800"];
    for (let i = 0; i < count; i++) {
      const x = (Math.sin(i * 1.7) * 0.5 + 0.5) * width;
      const y = (i / count + progress) % 1 * height;
      const rotation = (i + progress * 4) * Math.PI;
      ctx.fillStyle = colors[i % colors.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillRect(-4, -8, 8, 16);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawRain(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.strokeStyle = rgba(180, 200, 240, 0.4 * intensity);
    ctx.lineWidth = 1.5;
    const count = Math.floor(120 * intensity);
    const t = performance.now() / 100;
    for (let i = 0; i < count; i++) {
      const x = (Math.sin(i * 7.3) * 0.5 + 0.5) * width;
      const y = ((i / count) * height + t * 8) % height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 20);
      ctx.stroke();
    }
    ctx.restore();
  }
}
