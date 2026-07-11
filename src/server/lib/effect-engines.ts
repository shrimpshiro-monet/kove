/**
 * Multi-Engine Effect System
 *
 * Each effect is dispatched to the best rendering engine:
 * - FFmpeg filters: blur, color, shake, zoom, speed
 * - Canvas2D: glow, chromatic aberration, vignette
 * - LUT-based: color grading, film looks
 *
 * The AI director specifies WHAT effects to apply.
 * This system decides HOW to render them.
 */

export interface EffectPlan {
  shots: ShotEffectPlan[];
  globalEffects: GlobalEffect[];
}

export interface ShotEffectPlan {
  shotId: string;
  startTime: number;
  duration: number;
  effects: PlannedEffect[];
  transitions: PlannedTransition[];
  speedRamp: SpeedRampPlan | null;
  colorGrade: ColorGradePlan | null;
}

export interface PlannedEffect {
  type: string;
  intensity: number;
  duration: number;
  startTime: number;
  engine: "ffmpeg" | "canvas" | "lut";
  params: Record<string, any>;
}

export interface PlannedTransition {
  type: "cut" | "crossfade" | "whip" | "dip_black" | "glitch";
  duration: number;
  params: Record<string, any>;
}

export interface SpeedRampPlan {
  points: Array<{ t: number; speed: number }>;
  easing: string;
}

export interface ColorGradePlan {
  temperature: number;
  tint: number;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
  grain: number;
  lut: string | null;
}

export interface GlobalEffect {
  type: string;
  params: Record<string, any>;
}

/**
 * Build a complete effect plan from the edit director's instructions.
 * This translates the AI's creative decisions into renderable operations.
 */
export function buildEffectPlan(
  shots: Array<{
    id: string;
    startTime: number;
    duration: number;
    effects: string[];
    intensity: number;
    transition?: string;
    transitionDuration?: number;
    speedRamp?: { start: number; end: number };
    colorGrade?: Partial<ColorGradePlan>;
  }>,
  musicData: {
    bpm: number;
    beatGrid: number[];
    drops: number[];
    energyCurve: number[];
  },
  referenceStyle: {
    effectsFrequency: number;
    transitionCutPercent: number;
    colorTemperature: string;
  }
): EffectPlan {
  const shotPlans: ShotEffectPlan[] = [];

  for (const shot of shots) {
    const plan: ShotEffectPlan = {
      shotId: shot.id,
      startTime: shot.startTime,
      duration: shot.duration,
      effects: [],
      transitions: [],
      speedRamp: null,
      colorGrade: null,
    };

    // ─── Effects ────────────────────────────────────────────────
    for (const effectType of shot.effects) {
      const effect = planEffect(effectType, shot, musicData);
      if (effect) plan.effects.push(effect);
    }

    // ─── Transitions ────────────────────────────────────────────
    if (shot.transition) {
      plan.transitions.push(planTransition(shot.transition, shot.transitionDuration ?? 0.1));
    }

    // ─── Speed Ramps ────────────────────────────────────────────
    if (shot.speedRamp) {
      plan.speedRamp = planSpeedRamp(shot.speedRamp, shot.duration, musicData);
    }

    // ─── Color Grade ────────────────────────────────────────────
    plan.colorGrade = planColorGrade(shot, referenceStyle);

    shotPlans.push(plan);
  }

  return {
    shots: shotPlans,
    globalEffects: [],
  };
}

// ─── Effect Planning ──────────────────────────────────────────────

function planEffect(
  type: string,
  shot: { startTime: number; duration: number; intensity: number },
  musicData: { bpm: number; beatGrid: number[] }
): PlannedEffect | null {
  const intensity = shot.intensity;

  switch (type) {
    case "shake":
      return {
        type: "shake",
        intensity: intensity * 0.6,
        duration: Math.min(0.2, shot.duration * 0.3),
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `shake=${Math.round(intensity * 8)}:${Math.round(intensity * 5)}:0.15`,
        },
      };

    case "zoom_pulse":
      return {
        type: "zoom_pulse",
        intensity,
        duration: shot.duration * 0.5,
        startTime: shot.duration * 0.25,
        engine: "ffmpeg",
        params: {
          filter: `zoompan=z='min(zoom+${0.002 * intensity},1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(shot.duration * 15)}:s=1280x720:fps=30`,
        },
      };

    case "glow":
      return {
        type: "glow",
        intensity: intensity * 0.4,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `boxblur=${Math.round(intensity * 5)}:${Math.round(intensity * 3)},blend=all_mode=screen:all_opacity=${intensity * 0.3}`,
        },
      };

    case "chromatic_aberration":
    case "rgb_split":
      return {
        type: "rgb_split",
        intensity: intensity * 0.5,
        duration: Math.min(0.3, shot.duration),
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `rgbashift=rh=${Math.round(intensity * 4)}:bh=-${Math.round(intensity * 4)}`,
        },
      };

    case "blur":
    case "gaussian_blur":
      return {
        type: "blur",
        intensity,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `boxblur=${Math.round(intensity * 15)}:${Math.round(intensity * 10)}`,
        },
      };

    case "flash":
    case "flash_white":
      return {
        type: "flash",
        intensity,
        duration: 0.08,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `eq=brightness=${intensity * 0.8}`,
        },
      };

    case "glitch":
      return {
        type: "glitch",
        intensity: intensity * 0.7,
        duration: 0.1,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `rgbashift=rh=${Math.round(intensity * 6)}:gh=-${Math.round(intensity * 3)}`,
        },
      };

    case "push_in":
      return {
        type: "push_in",
        intensity: intensity * 0.3,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `zoompan=z='1+${0.001 * intensity}*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(shot.duration * 15)}:s=1280x720:fps=30`,
        },
      };

    case "vignette":
      return {
        type: "vignette",
        intensity: intensity * 0.4,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `vignette=PI/${4 + intensity * 2}`,
        },
      };

    case "speed_ramp":
      return {
        type: "speed_ramp",
        intensity,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {},
      };

    default:
      return null;
  }
}

function planTransition(type: string, duration: number): PlannedTransition {
  switch (type) {
    case "crossfade":
    case "dissolve":
      return { type: "crossfade", duration, params: {} };
    case "whip":
    case "whip_pan":
      return { type: "whip", duration: Math.min(0.15, duration), params: { direction: "right" } };
    case "glitch":
      return { type: "glitch", duration: 0.1, params: {} };
    case "dip_black":
      return { type: "dip_black", duration, params: {} };
    default:
      return { type: "cut", duration: 0, params: {} };
  }
}

function planSpeedRamp(
  ramp: { start: number; end: number },
  duration: number,
  _musicData: { bpm: number }
): SpeedRampPlan {
  return {
    points: [
      { t: 0, speed: ramp.start },
      { t: 0.35, speed: ramp.start * 0.7 },
      { t: 0.65, speed: ramp.end * 1.2 },
      { t: 1, speed: ramp.end },
    ],
    easing: "bezier_punchy",
  };
}

function planColorGrade(
  shot: { intensity: number; colorGrade?: Partial<ColorGradePlan> },
  referenceStyle: { colorTemperature: string }
): ColorGradePlan {
  const base: ColorGradePlan = {
    temperature: referenceStyle.colorTemperature === "warm" ? 0.15 :
      referenceStyle.colorTemperature === "cool" ? -0.15 : 0,
    tint: 0,
    saturation: 1.1,
    contrast: 1.05,
    brightness: 0,
    vignette: 0.2,
    grain: 0.05,
    lut: null,
  };

  // Apply shot-level overrides
  if (shot.colorGrade) {
    return { ...base, ...shot.colorGrade };
  }

  // Intensity affects saturation and contrast
  base.saturation = 1 + shot.intensity * 0.3;
  base.contrast = 1 + shot.intensity * 0.15;

  return base;
}
