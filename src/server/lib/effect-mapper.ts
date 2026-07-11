// Translates abstract EffectIntent into concrete effects with params.
// This is the "taste" layer — same intent produces different concrete output
// based on shot color, motion, and beat position.

export interface EffectIntent {
  type:
    | "energy_boost"
    | "tension_build"
    | "release"
    | "impact_hit"
    | "dreamy_soft"
    | "glitch_chaos"
    | "speed_emphasis"
    | "subject_focus"
    | "color_pop"
    | "transition_smooth"
    | "transition_hard";
  intensity: number; // 0-1
  trigger: "beat_drop" | "beat_normal" | "cut_in" | "cut_out" | "sustained" | "one_shot";
}

export interface EDLEffect {
  id: string;
  type: string;
  params: Record<string, string | number | boolean>;
  startTime: number;
  endTime: number;
  intent?: EffectIntent;
}

interface MappingContext {
  intent: EffectIntent;
  shotStartTime: number;
  shotDuration: number;
  shotMotionLevel: "static" | "low" | "medium" | "high" | "extreme";
  shotColors: string[];
  beatLockOnsetTime: number | null;
}

let effectIdCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${++effectIdCounter}`;

function pickAccentColor(palette?: string[]): string {
  return palette?.[0] ?? "#ffffff";
}

function impactHit(ctx: MappingContext): EDLEffect[] {
  const triggerTime = ctx.beatLockOnsetTime ?? ctx.shotStartTime;
  const flashDuration = 0.12 * ctx.intent.intensity;
  return [
    {
      id: nextId("impact_flash"),
      type: "flash_white",
      params: { color: "#ffffff", opacity: 0.6 * ctx.intent.intensity, curve: "exponential-out" },
      startTime: triggerTime,
      endTime: triggerTime + flashDuration,
      intent: ctx.intent,
    },
    {
      id: nextId("impact_shake"),
      type: "shake",
      params: {
        amplitude: 6 + 18 * ctx.intent.intensity,
        frequency: 22,
        decayCurve: "exponential",
      },
      startTime: triggerTime,
      endTime: triggerTime + 0.25,
      intent: ctx.intent,
    },
  ];
}

function energyBoost(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("eb_glow"),
      type: "glow",
      params: {
        intensity: 0.3 + 0.5 * ctx.intent.intensity,
        radius: 12 + 18 * ctx.intent.intensity,
        color: pickAccentColor(ctx.shotColors),
        blendMode: "screen",
      },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
    {
      id: nextId("eb_sat"),
      type: "saturation",
      params: { delta: 0.15 + 0.25 * ctx.intent.intensity },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
  ];
}

function tensionBuild(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("tb_zoom"),
      type: "zoom_pulse",
      params: { startScale: 1.0, endScale: 1.0 + 0.08 * ctx.intent.intensity, curve: "linear" },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
    {
      id: nextId("tb_desat"),
      type: "saturation",
      params: { delta: -0.1 * ctx.intent.intensity },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
  ];
}

function release(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("rel_softglow"),
      type: "glow",
      params: { intensity: 0.2 * ctx.intent.intensity, radius: 20, color: "#fff4e6", blendMode: "screen" },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
  ];
}

function dreamySoft(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("dr_chroma"),
      type: "chromatic_aberration",
      params: { offset: 1 + 3 * ctx.intent.intensity, angleDegrees: 12 },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
  ];
}

function glitchChaos(ctx: MappingContext): EDLEffect[] {
  const triggerTime = ctx.beatLockOnsetTime ?? ctx.shotStartTime;
  return [
    {
      id: nextId("gc_glitch"),
      type: "glitch",
      params: { offset: 4 + 12 * ctx.intent.intensity, animation: "jitter" },
      startTime: triggerTime,
      endTime: triggerTime + 0.4,
      intent: ctx.intent,
    },
  ];
}

function speedEmphasis(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("sp_remap"),
      type: "posterize_time",
      params: {
        frameRate: ctx.shotMotionLevel === "high" || ctx.shotMotionLevel === "extreme" ? 15 : 48,
      },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    },
  ];
}

function subjectFocus(ctx: MappingContext): EDLEffect[] {
  // Vary the effect based on shot context for more visual interest
  const effects: EDLEffect[] = [];
  
  // Always include vignette for subject focus
  effects.push({
    id: nextId("sf_vignette"),
    type: "vignette_pro",
    params: { intensity: 0.3 + 0.4 * ctx.intent.intensity, falloff: "smooth", shape: "circular" },
    startTime: ctx.shotStartTime,
    endTime: ctx.shotStartTime + ctx.shotDuration,
    intent: ctx.intent,
  });
  
  // Add subtle zoom for longer shots (cinematic feel)
  if (ctx.shotDuration > 2.0) {
    effects.push({
      id: nextId("sf_zoom"),
      type: "zoom_pulse",
      params: { startScale: 1.0, endScale: 1.0 + 0.03 * ctx.intent.intensity, curve: "linear" },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    });
  }
  
  return effects;
}

function colorPop(ctx: MappingContext): EDLEffect[] {
  // Vary the color pop effect based on shot context
  const effects: EDLEffect[] = [];
  
  // Primary effect: saturation boost
  effects.push({
    id: nextId("cp_sat"),
    type: "saturation",
    params: { delta: 0.25 + 0.35 * ctx.intent.intensity },
    startTime: ctx.shotStartTime,
    endTime: ctx.shotStartTime + ctx.shotDuration,
    intent: ctx.intent,
  });
  
  // Add contrast for shorter, punchier shots
  if (ctx.shotDuration < 2.0) {
    effects.push({
      id: nextId("cp_contrast"),
      type: "contrast",
      params: { delta: 0.1 + 0.25 * ctx.intent.intensity },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    });
  } else {
    // For longer shots, add subtle brightness instead
    effects.push({
      id: nextId("cp_bright"),
      type: "brightness",
      params: { delta: 0.05 + 0.1 * ctx.intent.intensity },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + ctx.shotDuration,
      intent: ctx.intent,
    });
  }
  
  return effects;
}

function transitionSmooth(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("ts_crossfade"),
      type: "echo",
      params: { echoTime: 0.033, numberOfEchoes: 2, decay: 0.6 },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + Math.min(0.5, ctx.shotDuration * 0.2),
      intent: ctx.intent,
    },
  ];
}

function transitionHard(ctx: MappingContext): EDLEffect[] {
  return [
    {
      id: nextId("th_flash"),
      type: "flash_white",
      params: { color: "#ffffff", opacity: 0.4 + 0.4 * ctx.intent.intensity, curve: "instant" },
      startTime: ctx.shotStartTime,
      endTime: ctx.shotStartTime + 0.08,
      intent: ctx.intent,
    },
  ];
}

const MAP: Record<EffectIntent["type"], (ctx: MappingContext) => EDLEffect[]> = {
  impact_hit: impactHit,
  energy_boost: energyBoost,
  tension_build: tensionBuild,
  release,
  dreamy_soft: dreamySoft,
  glitch_chaos: glitchChaos,
  speed_emphasis: speedEmphasis,
  subject_focus: subjectFocus,
  color_pop: colorPop,
  transition_smooth: transitionSmooth,
  transition_hard: transitionHard,
};

export const effectMapper = {
  toEffects(ctx: MappingContext): EDLEffect[] {
    const fn = MAP[ctx.intent.type];
    if (!fn) {
      console.warn(`[effectMapper] Unknown intent type: ${ctx.intent.type}`);
      return [];
    }
    return fn(ctx);
  },
};
