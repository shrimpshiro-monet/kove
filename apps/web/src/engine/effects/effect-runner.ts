import type { EffectBlock } from "@monet/edl";
import type { BeatEngine } from "../audio/audio-types";
import { resolveAnimatedValue } from "../keyframes/interpolator";

export interface EffectContext {
  time: number;
  localTime: number;
  duration: number;
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  beatEngine?: BeatEngine;
  maskCanvas?: HTMLCanvasElement | null;
}

interface AnimatedParam {
  base: number;
  keyframes?: Array<{
    time: number;
    value: number;
    easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toAnimatedParam(value: unknown, fallback: number): AnimatedParam {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      base: value,
    };
  }

  if (!isRecord(value)) {
    return {
      base: fallback,
    };
  }

  const base = typeof value.base === "number" && Number.isFinite(value.base) ? value.base : fallback;

  if (!Array.isArray(value.keyframes)) {
    return {
      base,
    };
  }

  const keyframes: AnimatedParam["keyframes"] = [];

  for (const raw of value.keyframes) {
    if (!isRecord(raw)) {
      continue;
    }

    const time = raw.time;
    const frameValue = raw.value;

    if (
      typeof time !== "number" ||
      !Number.isFinite(time) ||
      typeof frameValue !== "number" ||
      !Number.isFinite(frameValue)
    ) {
      continue;
    }

    const easing =
      raw.easing === "linear" ||
      raw.easing === "ease-in" ||
      raw.easing === "ease-out" ||
      raw.easing === "ease-in-out"
        ? raw.easing
        : "linear";

    keyframes.push({
      time,
      value: frameValue,
      easing,
    });
  }

  keyframes.sort((a, b) => a.time - b.time);

  return {
    base,
    keyframes,
  };
}

function getAnimatedNumber(
  effect: EffectBlock,
  key: string,
  fallback: number,
  localTime: number
): number {
  return resolveAnimatedValue(toAnimatedParam(effect.params[key], fallback), localTime);
}

function activeProgress(effect: EffectBlock, time: number): number | null {
  const start = effect.start;
  const end = effect.start + effect.duration;

  if (!Number.isFinite(start) || !Number.isFinite(end) || effect.duration <= 0) {
    return null;
  }

  if (time < start || time > end) {
    return null;
  }

  return Math.max(0, Math.min(1, (time - start) / effect.duration));
}

export function runEffects(effects: EffectBlock[], context: EffectContext): void {
  for (const effect of effects) {
    const t = activeProgress(effect, context.time);

    if (t === null) {
      continue;
    }

    const effectType = effect.type as string;

    switch (effectType) {
      case "impact_flash":
        runFlash(effect, context, t);
        break;

      case "context_shake":
        runShake(effect, context, t);
        break;

      case "color_grade":
        runColorGrade(effect, context);
        break;

      case "caption_pop":
        runCaption(effect, context, t);
        break;

      case "asset_pulse":
        runPulse(effect, context, t);
        break;

      case "beat_marker":
        runBeatMarker(context);
        break;

      case "player_glow":
      case "subject_glow":
        runPlayerGlow(effect, context);
        break;

      case "background_blur":
      case "subject_blur":
        runBackgroundBlur(effect, context);
        break;

      case "depth_parallax":
      case "depthParallax":
        runDepthParallax(effect, context, t);
        break;
    }
  }
}

function runFlash(effect: EffectBlock, context: EffectContext, t: number): void {
  const baseIntensity = getAnimatedNumber(effect, "intensity", 0.5, context.localTime);
  const beatPulse = context.beatEngine?.getBeatPulse(context.time, 0.1) ?? 0;
  const transientPulse = context.beatEngine?.getTransientPulse(context.time, 0.08) ?? 0;
  const pulseBoost = Math.max(beatPulse * 0.35, transientPulse * 0.55);
  const alpha = Math.max(0, (1 - t) * Math.min(1.25, baseIntensity + pulseBoost));

  context.ctx.save();
  context.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  context.ctx.fillRect(0, 0, context.canvasWidth, context.canvasHeight);
  context.ctx.restore();
}

function runShake(effect: EffectBlock, context: EffectContext, t: number): void {
  const intensity = getAnimatedNumber(effect, "intensity", 0.4, context.localTime);
  const frequency = getAnimatedNumber(effect, "frequency", 8, context.localTime);
  const transientPulse = context.beatEngine?.getTransientPulse(context.time, 0.08) ?? 0;
  const decay = 1 - t;
  const boostedIntensity = intensity + transientPulse * 0.35;

  const dx = Math.sin(t * frequency * Math.PI * 2) * boostedIntensity * 20 * decay;
  const dy =
    Math.cos(t * frequency * Math.PI * 2 * 1.3) * boostedIntensity * 12 * decay;

  context.ctx.translate(dx, dy);
}

function runColorGrade(effect: EffectBlock, context: EffectContext): void {
  const strength = getAnimatedNumber(effect, "strength", 0.5, context.localTime);
  const beatPulse = context.beatEngine?.getBeatPulse(context.time, 0.14) ?? 0;
  const alpha = Math.min(0.13, strength * 0.045 + beatPulse * 0.035);

  context.ctx.save();
  context.ctx.fillStyle = `rgba(255,140,0,${alpha})`;
  context.ctx.fillRect(0, 0, context.canvasWidth, context.canvasHeight);
  context.ctx.restore();
}

function runCaption(effect: EffectBlock, context: EffectContext, t: number): void {
  const textValue = effect.params.text;
  const text = typeof textValue === "string" ? textValue : "";

  if (text.trim().length === 0) {
    return;
  }

  const pop = t < 0.18 ? 0.92 + (t / 0.18) * 0.08 : 1;
  const beatPulse = context.beatEngine?.getBeatPulse(context.time, 0.1) ?? 0;
  const scale = pop + beatPulse * 0.025;
  const fontSize = Math.round(context.canvasHeight * 0.052 * scale);
  const maxWidth = context.canvasWidth * 0.9;
  const y = context.canvasHeight * 0.78;

  context.ctx.save();
  context.ctx.font = `900 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.ctx.textAlign = "center";
  context.ctx.textBaseline = "middle";
  context.ctx.lineJoin = "round";
  context.ctx.strokeStyle = "rgba(0,0,0,0.92)";
  context.ctx.fillStyle = "white";
  context.ctx.lineWidth = Math.max(5, fontSize * 0.12);

  const lines = wrapText(context.ctx, text.toUpperCase(), maxWidth);

  const lineHeight = fontSize * 1.08;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line === undefined) {
      return;
    }

    const lineY = startY + index * lineHeight;
    context.ctx.strokeText(line, context.canvasWidth / 2, lineY);
    context.ctx.fillText(line, context.canvasWidth / 2, lineY);
  }

  context.ctx.restore();
}

function runPulse(effect: EffectBlock, context: EffectContext, t: number): void {
  const intensity = getAnimatedNumber(effect, "intensity", 0.7, context.localTime);
  const transientPulse = context.beatEngine?.getTransientPulse(context.time, 0.08) ?? 0;
  const alpha = Math.sin(t * Math.PI) * Math.min(0.32, intensity * 0.16 + transientPulse * 0.12);

  context.ctx.save();
  context.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  context.ctx.fillRect(0, 0, context.canvasWidth, context.canvasHeight);
  context.ctx.restore();
}

function runBeatMarker(context: EffectContext): void {
  const pulse = Math.max(
    context.beatEngine?.getBeatPulse(context.time, 0.08) ?? 0,
    context.beatEngine?.getTransientPulse(context.time, 0.06) ?? 0
  );

  if (pulse <= 0) {
    return;
  }

  context.ctx.save();
  context.ctx.strokeStyle = `rgba(255,255,255,${pulse * 0.65})`;
  context.ctx.lineWidth = Math.max(2, context.canvasWidth * 0.004);
  context.ctx.strokeRect(
    context.canvasWidth * 0.025,
    context.canvasHeight * 0.025,
    context.canvasWidth * 0.95,
    context.canvasHeight * 0.95
  );
  context.ctx.restore();
}

// ---------------- GLOW / AURA
function runPlayerGlow(effect: EffectBlock, context: EffectContext) {
  if (!context.maskCanvas) return;
  const intensity = getAnimatedNumber(effect, "intensity", 0.8, context.localTime);
  const color = String(effect.params.color ?? "#00ffff");
  const blur = getAnimatedNumber(effect, "blur", 25, context.localTime);

  context.ctx.save();
  context.ctx.shadowColor = color;
  context.ctx.shadowBlur = blur * intensity;
  context.ctx.shadowOffsetX = 0;
  context.ctx.shadowOffsetY = 0;

  context.ctx.drawImage(context.maskCanvas, 0, 0, context.canvasWidth, context.canvasHeight);
  context.ctx.restore();
}

// ---------------- BACKGROUND BLUR
function runBackgroundBlur(effect: EffectBlock, context: EffectContext) {
  const amount = getAnimatedNumber(effect, "blur", 12, context.localTime);

  context.ctx.save();
  context.ctx.filter = `blur(${amount}px)`;
  context.ctx.restore();
}

// ---------------- DEPTH PARALLAX
function runDepthParallax(effect: EffectBlock, context: EffectContext, t: number) {
  const intensity = getAnimatedNumber(effect, "intensity", 0.04, context.localTime);
  const freq = getAnimatedNumber(effect, "frequency", 1.2, context.localTime);

  const dx = Math.sin(t * freq * Math.PI * 2) * intensity * 50;
  const dy = Math.cos(t * freq * Math.PI * 2 * 0.8) * intensity * 25;

  context.ctx.translate(dx, dy);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    const width = ctx.measureText(candidate).width;

    if (width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [text];
}
