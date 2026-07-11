export type TempoMode =
  | "beat_locked"
  | "beat_anticipated"
  | "narrative"
  | "cinematic"
  | "chill_vlog"
  | "reference_mirror";

export type EffectRole = "ramp" | "hit" | "glide";

export interface TempoProfile {
  mode: TempoMode;
  anticipationLead: number;
  impactOffset: number;
  anticipationDuration: number;
  density: number;
  rampEffects: string[];
  hitEffects: string[];
  glideEffects: string[];
}

export const TEMPO_PROFILES: Record<TempoMode, TempoProfile> = {
  beat_locked: {
    mode: "beat_locked",
    anticipationLead: 0,
    impactOffset: 0,
    anticipationDuration: 0,
    density: 0.9,
    rampEffects: [],
    hitEffects: ["impact_flash", "chromatic_burst", "beat_cut", "whip_pan"],
    glideEffects: ["color_pulse"],
  },
  beat_anticipated: {
    mode: "beat_anticipated",
    anticipationLead: 0.35,
    impactOffset: 0,
    anticipationDuration: 0.35,
    density: 0.85,
    rampEffects: ["speed_ramp", "push_in", "zoom_in", "context_shake"],
    hitEffects: ["impact_flash", "chromatic_burst", "beat_cut", "whip_pan"],
    glideEffects: ["color_pulse", "vignette_punch"],
  },
  narrative: {
    mode: "narrative",
    anticipationLead: 0,
    impactOffset: 0,
    anticipationDuration: 0,
    density: 0.35,
    rampEffects: ["push_in"],
    hitEffects: ["beat_cut"],
    glideEffects: ["color_pulse", "vignette_punch"],
  },
  cinematic: {
    mode: "cinematic",
    anticipationLead: 0.6,
    impactOffset: 0,
    anticipationDuration: 0.6,
    density: 0.25,
    rampEffects: ["push_in", "speed_ramp"],
    hitEffects: ["vignette_punch"],
    glideEffects: ["color_pulse"],
  },
  chill_vlog: {
    mode: "chill_vlog",
    anticipationLead: 0,
    impactOffset: 0,
    anticipationDuration: 0,
    density: 0.15,
    rampEffects: [],
    hitEffects: ["beat_cut"],
    glideEffects: ["color_pulse"],
  },
  reference_mirror: {
    mode: "reference_mirror",
    anticipationLead: 0.3,
    impactOffset: 0,
    anticipationDuration: 0.3,
    density: 0.8,
    rampEffects: ["speed_ramp", "push_in", "context_shake"],
    hitEffects: ["impact_flash", "chromatic_burst", "beat_cut", "whip_pan"],
    glideEffects: ["color_pulse", "vignette_punch"],
  },
};

export function pickEffect(list: string[], seed: number): string {
  if (list.length === 0) return "beat_cut";
  return list[seed % list.length];
}
