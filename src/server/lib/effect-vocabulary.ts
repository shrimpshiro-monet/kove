/**
 * Effect Vocabulary Extraction
 *
 * Analyzes a reference video to extract the specific visual effects used,
 * when they appear, and what triggers them. This goes beyond Gemini's
 * high-level description to get concrete, moment-by-moment effect data.
 *
 * The output drives the EDL generation with exact effect placements,
 * not just "use effects 40% of the time."
 */

import type { SceneDetectionResult } from "./scene-detection";
import type { EnergyAnalysisResult } from "./energy-analysis";

export type EffectType =
  | "whip_transition"
  | "chromatic_aberration"
  | "speed_ramp_slow"
  | "speed_ramp_fast"
  | "flash_white"
  | "flash_black"
  | "camera_shake"
  | "push_in"
  | "pull_out"
  | "glow"
  | "vignette"
  | "color_shift"
  | "glitch"
  | "freeze_frame"
  | "text_overlay"
  | "lens_flare"
  | "motion_blur"
  | "zoom_pulse"
  | "split_screen"
  | "morph_cut";

export interface EffectInstance {
  type: EffectType;
  timestamp: number;
  normalizedTime: number;
  intensity: number;
  durationSec: number;
  trigger: EffectTrigger;
  context: string;
}

export type EffectTrigger =
  | "beat_drop"
  | "beat"
  | "scene_change"
  | "energy_peak"
  | "energy_valley"
  | "climax"
  | "breathing_moment"
  | "random"
  | "sequence_start"
  | "sequence_end";

export interface EffectVocabulary {
  effects: EffectInstance[];
  effectFrequency: Record<EffectType, number>;
  effectPairs: Array<{ a: EffectType; b: EffectType; coOccurrences: number }>;
  transitionBreakdown: {
    cuts: number;
    crossfades: number;
    whipPans: number;
    other: number;
  };
  effectTimeline: Array<{
    time: number;
    normalized: number;
    effects: EffectType[];
    intensity: number;
  }>;
  avgEffectsPerShot: number;
  totalEffects: number;
}

/**
 * Extract the complete effect vocabulary from analysis data.
 *
 * @param scenes - Scene detection results
 * @param energy - Energy analysis results
 * @param styleHint - Gemini's high-level style description (for effect type hints)
 */
export function extractEffectVocabulary(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  styleHint: {
    effectsFrequency?: number;
    commonEffects?: string[];
    pacing?: string;
    cutAlignment?: string;
  } = {}
): EffectVocabulary {
  const duration = energy.totalDuration || scenes.totalDuration;
  if (duration <= 0) return emptyVocabulary();

  const effects: EffectInstance[] = [];
  const isFast = (styleHint.pacing ?? "").includes("fast") ||
    (styleHint.pacing ?? "").includes("aggressive");

  // ─── 1. Detect transitions from scene changes ─────────────────
  const transitions = detectTransitions(scenes, energy, duration);
  effects.push(...transitions);

  // ─── 2. Detect energy-driven effects ──────────────────────────
  const energyEffects = detectEnergyEffects(energy, duration, isFast);
  effects.push(...energyEffects);

  // ─── 3. Detect timing-based effects ───────────────────────────
  const timingEffects = detectTimingEffects(scenes, energy, duration, isFast);
  effects.push(...timingEffects);

  // ─── 4. Add style-specific effects ────────────────────────────
  const styleEffects = generateStyleEffects(
    scenes,
    energy,
    duration,
    styleHint,
    isFast
  );
  effects.push(...styleEffects);

  // Sort by timestamp
  effects.sort((a, b) => a.timestamp - b.timestamp);

  // ─── Build summary statistics ─────────────────────────────────
  const effectFrequency = calculateEffectFrequency(effects);
  const effectPairs = calculateEffectPairs(effects);
  const transitionBreakdown = calculateTransitionBreakdown(effects, scenes);
  const effectTimeline = buildEffectTimeline(effects, duration);
  const avgEffectsPerShot = scenes.shotCount > 0
    ? effects.length / scenes.shotCount
    : 0;

  return {
    effects,
    effectFrequency,
    effectPairs,
    transitionBreakdown,
    effectTimeline,
    avgEffectsPerShot,
    totalEffects: effects.length,
  };
}

// ─── Transition Detection ─────────────────────────────────────────

function detectTransitions(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  duration: number
): EffectInstance[] {
  const effects: EffectInstance[] = [];

  for (let i = 0; i < scenes.scenes.length; i++) {
    const scene = scenes.scenes[i];
    const normalizedTime = duration > 0 ? scene.timestamp / duration : 0;
    const energyAtCut = getEnergyAtTime(energy, scene.timestamp);

    // Determine transition type based on scene change characteristics
    const transitionType = classifyTransition(scene, energyAtCut, i, scenes);

    effects.push({
      type: transitionType,
      timestamp: scene.timestamp,
      normalizedTime,
      intensity: scene.score,
      durationSec: estimateTransitionDuration(transitionType, scene.score),
      trigger: "scene_change",
      context: `Cut at ${scene.timestamp.toFixed(2)}s (energy: ${energyAtCut.toFixed(2)})`,
    });
  }

  return effects;
}

function classifyTransition(
  scene: { score: number; timestamp: number },
  energyAtCut: number,
  index: number,
  scenes: SceneDetectionResult
): EffectType {
  // High scene score + high energy = likely a whip pan or flash cut
  if (scene.score > 0.7 && energyAtCut > 0.7) {
    return "flash_white";
  }

  // Very high scene score = hard cut with possible flash
  if (scene.score > 0.85) {
    return "flash_white";
  }

  // Medium-high energy at cut = whip transition
  if (energyAtCut > 0.6) {
    return "whip_transition";
  }

  // Low energy cut = possible morph or crossfade
  if (energyAtCut < 0.3) {
    return "morph_cut";
  }

  // Default: hard cut (not in effect list, handled natively)
  return "flash_white"; // Fallback to flash for counted transitions
}

function estimateTransitionDuration(type: EffectType, score: number): number {
  switch (type) {
    case "whip_transition": return 0.12 + score * 0.08;
    case "flash_white":
    case "flash_black": return 0.05 + score * 0.05;
    case "morph_cut": return 0.2 + score * 0.3;
    case "glitch": return 0.08 + score * 0.12;
    default: return 0.1;
  }
}

// ─── Energy-Driven Effects ────────────────────────────────────────

function detectEnergyEffects(
  energy: EnergyAnalysisResult,
  duration: number,
  isFast: boolean
): EffectInstance[] {
  const effects: EffectInstance[] = [];
  const { frames, climaxPosition, breathingMoments } = energy;

  if (frames.length < 3) return effects;

  // Detect energy peaks → impact effects
  for (let i = 1; i < frames.length - 1; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    const next = frames[i + 1];

    const isPeak = curr.combined > prev.combined * 1.3 &&
      curr.combined > next.combined * 1.3 &&
      curr.combined > 0.6;

    if (isPeak) {
      const normalizedTime = duration > 0 ? curr.timestamp / duration : 0;
      const isClimax = Math.abs(normalizedTime - climaxPosition) < 0.1;

      effects.push({
        type: isClimax ? "zoom_pulse" : "camera_shake",
        timestamp: curr.timestamp,
        normalizedTime,
        intensity: Math.min(1, curr.combined * 1.2),
        durationSec: isClimax ? 0.3 : 0.15,
        trigger: isClimax ? "climax" : "energy_peak",
        context: `Energy peak at ${curr.timestamp.toFixed(2)}s (${isClimax ? "climax" : "normal"})`,
      });

      // Climax gets additional effects
      if (isClimax) {
        effects.push({
          type: "glow",
          timestamp: curr.timestamp,
          normalizedTime,
          intensity: 0.5,
          durationSec: 0.4,
          trigger: "climax",
          context: "Climax glow",
        });
      }
    }

    // Detect energy valleys → breathing effects
    const isValley = curr.combined < prev.combined * 0.7 &&
      curr.combined < next.combined * 0.7 &&
      curr.combined < 0.35;

    if (isValley) {
      effects.push({
        type: "vignette",
        timestamp: curr.timestamp,
        normalizedTime: duration > 0 ? curr.timestamp / duration : 0,
        intensity: 0.4,
        durationSec: 0.5,
        trigger: "energy_valley",
        context: `Energy valley at ${curr.timestamp.toFixed(2)}s`,
      });
    }
  }

  // Breathing moments → slow effects
  for (const bt of breathingMoments) {
    effects.push({
      type: "pull_out",
      timestamp: bt,
      normalizedTime: duration > 0 ? bt / duration : 0,
      intensity: 0.3,
      durationSec: 1.0,
      trigger: "breathing_moment",
      context: `Breathing moment at ${bt.toFixed(2)}s`,
    });
  }

  return effects;
}

// ─── Timing-Based Effects ─────────────────────────────────────────

function detectTimingEffects(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  duration: number,
  isFast: boolean
): EffectInstance[] {
  const effects: EffectInstance[] = [];

  // Push-in on every Nth shot (frequency based on pacing)
  const pushInInterval = isFast ? 2 : 4;
  for (let i = 0; i < scenes.scenes.length; i += pushInInterval) {
    const scene = scenes.scenes[i];
    effects.push({
      type: "push_in",
      timestamp: scene.timestamp,
      normalizedTime: duration > 0 ? scene.timestamp / duration : 0,
      intensity: 0.3,
      durationSec: scenes.shotDurations[i] || 1.0,
      trigger: "scene_change",
      context: `Push-in on shot ${i + 1}`,
    });
  }

  // Speed ramps at energy transitions
  const frames = energy.frames;
  for (let i = 2; i < frames.length - 2; i++) {
    const before = frames.slice(i - 2, i).reduce((s, f) => s + f.combined, 0) / 2;
    const after = frames.slice(i + 1, i + 3).reduce((s, f) => s + f.combined, 0) / 2;
    const current = frames[i].combined;

    // Rising energy → speed ramp fast
    if (current > before * 1.4 && current > 0.5) {
      effects.push({
        type: "speed_ramp_fast",
        timestamp: frames[i].timestamp,
        normalizedTime: duration > 0 ? frames[i].timestamp / duration : 0,
        intensity: Math.min(1, current),
        durationSec: 0.5,
        trigger: "energy_peak",
        context: "Speed ramp into energy peak",
      });
    }

    // Falling energy → speed ramp slow
    if (current < before * 0.6 && before > 0.5) {
      effects.push({
        type: "speed_ramp_slow",
        timestamp: frames[i].timestamp,
        normalizedTime: duration > 0 ? frames[i].timestamp / duration : 0,
        intensity: Math.min(1, before),
        durationSec: 0.8,
        trigger: "energy_valley",
        context: "Speed ramp out of energy peak",
      });
    }
  }

  return effects;
}

// ─── Style-Specific Effects ───────────────────────────────────────

function generateStyleEffects(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  duration: number,
  styleHint: { commonEffects?: string[]; effectsFrequency?: number; cutAlignment?: string },
  isFast: boolean
): EffectInstance[] {
  const effects: EffectInstance[] = [];
  const freq = styleHint.effectsFrequency ?? 0.3;
  const commonEffects = styleHint.commonEffects ?? [];

  // Map common effect strings to our EffectType
  const effectMap: Record<string, EffectType> = {
    "glitch": "glitch",
    "chromatic_aberration": "chromatic_aberration",
    "lens_flare": "lens_flare",
    "motion_blur": "motion_blur",
    "freeze_frame": "freeze_frame",
    "text_overlay": "text_overlay",
    "split_screen": "split_screen",
    "glow": "glow",
    "vignette": "vignette",
  };

  // Add effects from common effects list
  for (const effectName of commonEffects) {
    const mappedType = effectMap[effectName.toLowerCase()];
    if (!mappedType) continue;

    // Place at regular intervals based on frequency
    const interval = Math.max(1, Math.round(1 / Math.max(0.1, freq)));
    for (let i = 0; i < scenes.scenes.length; i += interval) {
      const scene = scenes.scenes[i];
      effects.push({
        type: mappedType,
        timestamp: scene.timestamp,
        normalizedTime: duration > 0 ? scene.timestamp / duration : 0,
        intensity: 0.4 + freq * 0.3,
        durationSec: estimateEffectDuration(mappedType),
        trigger: "scene_change",
        context: `${effectName} on shot ${i + 1}`,
      });
    }
  }

  // Add glitch effects for fast pacing
  if (isFast && freq > 0.3) {
    const glitchInterval = Math.max(3, Math.round(scenes.scenes.length / 5));
    for (let i = glitchInterval; i < scenes.scenes.length; i += glitchInterval) {
      effects.push({
        type: "glitch",
        timestamp: scenes.scenes[i].timestamp,
        normalizedTime: duration > 0 ? scenes.scenes[i].timestamp / duration : 0,
        intensity: 0.6,
        durationSec: 0.1,
        trigger: "scene_change",
        context: "Glitch on transition",
      });
    }
  }

  return effects;
}

function estimateEffectDuration(type: EffectType): number {
  switch (type) {
    case "glitch": return 0.08;
    case "chromatic_aberration": return 0.15;
    case "lens_flare": return 0.3;
    case "motion_blur": return 0.2;
    case "freeze_frame": return 0.5;
    case "text_overlay": return 1.0;
    case "split_screen": return 1.5;
    case "glow": return 0.4;
    case "vignette": return 0.5;
    default: return 0.2;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function getEnergyAtTime(energy: EnergyAnalysisResult, time: number): number {
  const frames = energy.frames;
  if (frames.length === 0) return 0.5;

  // Find closest frame
  let closest = frames[0];
  let minDist = Math.abs(frames[0].timestamp - time);
  for (const f of frames) {
    const dist = Math.abs(f.timestamp - time);
    if (dist < minDist) {
      minDist = dist;
      closest = f;
    }
  }
  return closest.combined;
}

function calculateEffectFrequency(
  effects: EffectInstance[]
): Record<EffectType, number> {
  const freq: Record<string, number> = {};
  for (const e of effects) {
    freq[e.type] = (freq[e.type] || 0) + 1;
  }
  return freq as Record<EffectType, number>;
}

function calculateEffectPairs(
  effects: EffectInstance[]
): Array<{ a: EffectType; b: EffectType; coOccurrences: number }> {
  const pairs: Record<string, number> = {};

  for (let i = 0; i < effects.length - 1; i++) {
    if (effects[i + 1].timestamp - effects[i].timestamp < 0.5) {
      const key = [effects[i].type, effects[i + 1].type].sort().join("+");
      pairs[key] = (pairs[key] || 0) + 1;
    }
  }

  return Object.entries(pairs)
    .map(([key, count]) => {
      const [a, b] = key.split("+");
      return { a: a as EffectType, b: b as EffectType, coOccurrences: count };
    })
    .sort((a, b) => b.coOccurrences - a.coOccurrences)
    .slice(0, 10);
}

function calculateTransitionBreakdown(
  effects: EffectInstance[],
  scenes: SceneDetectionResult
): { cuts: number; crossfades: number; whipPans: number; other: number } {
  let cuts = 0, crossfades = 0, whipPans = 0, other = 0;

  for (const e of effects) {
    if (e.type === "whip_transition") whipPans++;
    else if (e.type === "morph_cut") crossfades++;
    else if (e.type === "flash_white" || e.type === "flash_black") cuts++;
    else other++;
  }

  return { cuts, crossfades, whipPans, other };
}

function buildEffectTimeline(
  effects: EffectInstance[],
  duration: number
): Array<{ time: number; normalized: number; effects: EffectType[]; intensity: number }> {
  // Group effects into 1-second buckets
  const bucketSize = 1;
  const numBuckets = Math.ceil(duration / bucketSize);
  const timeline: Array<{ time: number; normalized: number; effects: EffectType[]; intensity: number }> = [];

  for (let i = 0; i < numBuckets; i++) {
    const start = i * bucketSize;
    const end = start + bucketSize;
    const bucketEffects = effects.filter(e => e.timestamp >= start && e.timestamp < end);

    timeline.push({
      time: start,
      normalized: duration > 0 ? start / duration : 0,
      effects: bucketEffects.map(e => e.type),
      intensity: bucketEffects.length > 0
        ? bucketEffects.reduce((s, e) => s + e.intensity, 0) / bucketEffects.length
        : 0,
    });
  }

  return timeline;
}

function emptyVocabulary(): EffectVocabulary {
  return {
    effects: [],
    effectFrequency: {} as Record<EffectType, number>,
    effectPairs: [],
    transitionBreakdown: { cuts: 0, crossfades: 0, whipPans: 0, other: 0 },
    effectTimeline: [],
    avgEffectsPerShot: 0,
    totalEffects: 0,
  };
}
