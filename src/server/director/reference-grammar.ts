/**
 * ReferenceGrammarCompiler
 *
 * Compiles a ReferenceStyle (raw analysis data) into a ReferenceGrammar
 * (structured editing DNA that the engine can execute against).
 *
 * This is the central contract for the generational engine.
 * Not raw metrics — an actual editing plan language.
 */

import type { ReferenceStyle } from "../types/reference-style";

// ─── Types ────────────────────────────────────────────────────────

export type SectionRole =
  | "hook"
  | "setup"
  | "escalation"
  | "drop"
  | "hero"
  | "payoff"
  | "ending"
  | "breathing";

export type PacingShape = "steady" | "bursty" | "crescendo" | "breathing" | "chaotic";

export type EffectRole = "emphasis" | "transition" | "texture" | "impact" | "motion";

export type TextRole = "hook" | "caption" | "emphasis" | "label";

export type TextAnimation = "pop" | "slide" | "static" | "kinetic";

export interface TimeRange {
  start: number;
  end: number;
}

export interface GrammarSection {
  role: SectionRole;
  start: number;
  end: number;
  targetEnergy: number;
  targetShotCount: number;
  targetAvgDuration: number;
}

export interface GrammarEffect {
  role: EffectRole;
  type: string;
  start: number;
  duration: number;
  intensity: number;
  attachedTo: "beat" | "cut" | "hero" | "drop" | "text";
}

export interface GrammarTextMoment {
  start: number;
  end: number;
  role: TextRole;
  animation: TextAnimation;
  text?: string;
}

export interface ReferenceGrammar {
  duration: number;

  topology: {
    referenceShotCount: number;
    minGeneratedShots: number;
    maxGeneratedShots: number;
    durationSequence: number[];
    normalizedDurationSequence: number[];
    variance: number;
    burstZones: TimeRange[];
    holdZones: Array<TimeRange & { reason: "hero" | "setup" | "breath" }>;
  };

  rhythm: {
    beatGrid: number[];
    cutOffsetsFromBeat: number[];
    syncopationMoments: number[];
    accelerationCurve: number[];
    pacingShape: PacingShape;
    avgBeatInterval: number;
  };

  sections: GrammarSection[];

  effects: GrammarEffect[];

  transitions: {
    cutRatio: number;
    crossfadeRatio: number;
    whipMoments: number[];
    flashMoments: number[];
  };

  text: {
    hasText: boolean;
    density: number;
    moments: GrammarTextMoment[];
  };

  visual: {
    colorGrade: string;
    colorKeyframes: any[];
    subjectScaleCurve: number[];
    motionCurve: number[];
    compositionBias: "centered" | "dynamic" | "wide" | "close";
  };

  metadata: {
    confidence: number;
    sourceDuration: number;
    sourceShotCount: number;
    compilationTimestamp: number;
  };
}

// ─── Compiler ─────────────────────────────────────────────────────

export function compileReferenceGrammar(style: ReferenceStyle): ReferenceGrammar {
  const duration = (style as any).duration ?? 30;
  const shotDurations = (style as any).referenceTrace?.shotDurations ?? [];
  const energyCurve = style.pacing?.energyCurve ?? [];
  const climaxPos = style.pacing?.climaxPosition ?? 0.5;
  const avgShotDur = style.rhythm?.avgShotDuration ?? 1.5;
  const variance = style.rhythm?.shotDurationVariance ?? 0.3;

  console.log(`[grammar] compileReferenceGrammar: duration=${duration}, shotDurations=${shotDurations.length}, energyCurve=${energyCurve.length}, climaxPos=${climaxPos}`);
  console.log(`[grammar] style keys: ${Object.keys(style).join(", ")}`);
  console.log(`[grammar] referenceTrace: ${JSON.stringify((style as any).referenceTrace).substring(0, 200)}`);

  // ── Topology ──
  const minShots = Math.max(1, Math.round(shotDurations.length * 0.65));
  const maxShots = Math.max(1, Math.round(shotDurations.length * 1.25));
  const burstZones = detectBurstZones(energyCurve, duration);
  const holdZones = detectHoldZones(energyCurve, duration, climaxPos);

  // ── Rhythm ──
  const beatGrid = (style as any).rhythmMap?.beats ?? [];
  const cutOffsets = computeCutOffsetsFromBeats(shotDurations, beatGrid);
  const syncopation = detectSyncopation(cutOffsets);
  const acceleration = computeAccelerationCurve(energyCurve);
  const pacingShape = classifyPacingShape(energyCurve, shotDurations);

  // ── Sections ──
  const sections = compileSections(style, duration, climaxPos);

  // ── Effects ──
  const effects = compileEffects(style, duration, climaxPos);

  // ── Transitions ──
  const transitions = {
    cutRatio: style.effects?.transitionsBreakdown?.cutPercentage ?? 0.8,
    crossfadeRatio: style.effects?.transitionsBreakdown?.crossfadePercentage ?? 0.2,
    whipMoments: detectWhipMoments(style, duration),
    flashMoments: (style as any).flashFrames?.map((f: any) => f.timestamp) ?? [],
  };

  // ── Text ──
  const textOverlayTrace = (style as any).textOverlayTrace ?? [];
  const text = {
    hasText: textOverlayTrace.length > 0,
    density: textOverlayTrace.length / Math.max(duration, 1),
    moments: textOverlayTrace.map((t: any) => ({
      start: t.startTime ?? 0,
      end: t.endTime ?? t.startTime + 1,
      role: classifyTextRole(t),
      animation: classifyTextAnimation(t),
      text: t.text,
    })),
  };

  // ── Visual ──
  const visual = {
    colorGrade: style.visualStyle?.colorGrade ?? "cinematic",
    colorKeyframes: (style as any).colorGrades ?? [],
    subjectScaleCurve: computeSubjectScaleCurve(style, duration),
    motionCurve: energyCurve,
    compositionBias: classifyCompositionBias(style),
  };

  return {
    duration,
    topology: {
      referenceShotCount: shotDurations.length,
      minGeneratedShots: minShots,
      maxGeneratedShots: maxShots,
      durationSequence: shotDurations,
      normalizedDurationSequence: shotDurations.map(d => d / Math.max(duration, 1)),
      variance,
      burstZones,
      holdZones,
    },
    rhythm: {
      beatGrid,
      cutOffsetsFromBeat: cutOffsets,
      syncopationMoments: syncopation,
      accelerationCurve: acceleration,
      pacingShape,
      avgBeatInterval: beatGrid.length >= 2 ? beatGrid[1] - beatGrid[0] : 60 / 120,
    },
    sections,
    effects,
    transitions,
    text,
    visual,
    metadata: {
      confidence: (style as any).confidence ?? 0.5,
      sourceDuration: duration,
      sourceShotCount: shotDurations.length,
      compilationTimestamp: Date.now(),
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function detectBurstZones(energyCurve: number[], duration: number): TimeRange[] {
  const zones: TimeRange[] = [];
  const bucketSize = duration / Math.max(energyCurve.length, 1);
  let inBurst = false;
  let burstStart = 0;

  for (let i = 0; i < energyCurve.length; i++) {
    const energy = energyCurve[i] ?? 0.5;
    const time = i * bucketSize;

    if (energy > 0.7 && !inBurst) {
      inBurst = true;
      burstStart = time;
    } else if (energy <= 0.5 && inBurst) {
      inBurst = false;
      zones.push({ start: burstStart, end: time });
    }
  }

  if (inBurst) {
    zones.push({ start: burstStart, end: duration });
  }

  return zones;
}

function detectHoldZones(energyCurve: number[], duration: number, climaxPos: number): Array<TimeRange & { reason: "hero" | "setup" | "breath" }> {
  const zones: Array<TimeRange & { reason: "hero" | "setup" | "breath" }> = [];
  const bucketSize = duration / Math.max(energyCurve.length, 1);

  // Setup = first 30% before climax
  const setupEnd = climaxPos * duration * 0.7;
  if (setupEnd > 1) {
    zones.push({ start: 0, end: setupEnd, reason: "setup" });
  }

  // Breathing moments (energy valleys)
  for (let i = 1; i < energyCurve.length - 1; i++) {
    const prev = energyCurve[i - 1] ?? 0.5;
    const curr = energyCurve[i] ?? 0.5;
    const next = energyCurve[i + 1] ?? 0.5;
    if (curr < prev * 0.7 && curr < next * 0.7 && curr < 0.35) {
      const time = i * bucketSize;
      zones.push({ start: Math.max(0, time - 1), end: Math.min(duration, time + 1), reason: "breath" });
    }
  }

  // Hero hold at climax
  zones.push({
    start: Math.max(0, climaxPos * duration - 1),
    end: Math.min(duration, climaxPos * duration + 2),
    reason: "hero",
  });

  return zones;
}

function computeCutOffsetsFromBeats(shotDurations: number[], beatGrid: number[]): number[] {
  if (beatGrid.length === 0 || shotDurations.length === 0) return [];

  const offsets: number[] = [];
  let currentTime = 0;

  for (const dur of shotDurations) {
    let bestBeat = 0;
    let bestDist = Infinity;
    for (const beat of beatGrid) {
      const dist = Math.abs(beat - currentTime);
      if (dist < bestDist) { bestDist = dist; bestBeat = beat; }
    }
    offsets.push(currentTime - bestBeat);
    currentTime += dur;
  }

  return offsets;
}

function detectSyncopation(offsets: number[]): number[] {
  return offsets.filter(o => Math.abs(o) > 0.05).map((_, i) => i);
}

function computeAccelerationCurve(energyCurve: number[]): number[] {
  if (energyCurve.length < 2) return [];
  const curve: number[] = [];
  for (let i = 1; i < energyCurve.length; i++) {
    curve.push((energyCurve[i] ?? 0) - (energyCurve[i - 1] ?? 0));
  }
  return curve;
}

function classifyPacingShape(energyCurve: number[], shotDurations: number[]): PacingShape {
  if (energyCurve.length < 3) return "steady";

  const first = energyCurve.slice(0, Math.floor(energyCurve.length / 3));
  const last = energyCurve.slice(Math.floor(energyCurve.length * 2 / 3));
  const firstAvg = first.reduce((a, b) => a + b, 0) / Math.max(first.length, 1);
  const lastAvg = last.reduce((a, b) => a + b, 0) / Math.max(last.length, 1);

  const variance = shotDurations.length > 1
    ? shotDurations.reduce((s, d) => s + (d - (shotDurations.reduce((a, b) => a + b, 0) / shotDurations.length)) ** 2, 0) / shotDurations.length
    : 0;

  if (lastAvg > firstAvg * 1.5 && variance < 0.3) return "crescendo";
  if (variance > 0.5) return "bursty";
  if (Math.abs(lastAvg - firstAvg) < 0.1 && variance < 0.2) return "steady";

  // Check for breathing (energy valleys)
  const valleys = energyCurve.filter((e, i) => i > 0 && i < energyCurve.length - 1 && e < (energyCurve[i - 1] ?? 0) && e < (energyCurve[i + 1] ?? 0)).length;
  if (valleys >= 2) return "breathing";

  return "chaotic";
}

function compileSections(style: ReferenceStyle, duration: number, climaxPos: number): GrammarSection[] {
  const energyCurve = style.pacing?.energyCurve ?? [];
  const avgShotDur = style.rhythm?.avgShotDuration ?? 1.5;

  const climaxTs = climaxPos * duration;
  const dropEnd = climaxTs + 1;

  return [
    { role: "hook", start: 0, end: Math.min(duration * 0.1, climaxTs * 0.5), targetEnergy: energyCurve[0] ?? 0.3, targetShotCount: 1, targetAvgDuration: avgShotDur * 1.5 },
    { role: "setup", start: Math.min(duration * 0.1, climaxTs * 0.5), end: climaxTs * 0.8, targetEnergy: 0.4, targetShotCount: Math.max(1, Math.round(climaxTs * 0.8 / avgShotDur)), targetAvgDuration: avgShotDur * 1.2 },
    { role: "escalation", start: climaxTs * 0.8, end: climaxTs, targetEnergy: 0.7, targetShotCount: Math.max(1, Math.round(climaxTs * 0.2 / (avgShotDur * 0.8))), targetAvgDuration: avgShotDur * 0.8 },
    { role: "drop", start: climaxTs, end: dropEnd, targetEnergy: 1.0, targetShotCount: 1, targetAvgDuration: 0.5 },
    { role: "hero", start: dropEnd, end: Math.min(duration * 0.85, climaxTs + duration * 0.3), targetEnergy: 0.8, targetShotCount: Math.max(1, Math.round((duration * 0.85 - dropEnd) / avgShotDur)), targetAvgDuration: avgShotDur * 0.9 },
    { role: "payoff", start: Math.min(duration * 0.85, climaxTs + duration * 0.3), end: duration * 0.95, targetEnergy: 0.5, targetShotCount: Math.max(1, Math.round(duration * 0.1 / avgShotDur)), targetAvgDuration: avgShotDur * 1.1 },
    { role: "ending", start: duration * 0.95, end: duration, targetEnergy: 0.2, targetShotCount: 1, targetAvgDuration: avgShotDur * 1.3 },
  ];
}

function compileEffects(style: ReferenceStyle, duration: number, climaxPos: number): GrammarEffect[] {
  const effects: GrammarEffect[] = [];
  const climaxTs = climaxPos * duration;

  // Velocity ramps from reference
  const velocityRamps = (style as any).velocityRamps ?? [];
  for (const vr of velocityRamps) {
    effects.push({
      role: "motion",
      type: "speed_ramp",
      start: vr.startTime ?? 0,
      duration: vr.duration ?? 1,
      intensity: 0.6,
      attachedTo: "beat",
    });
  }

  // Flash frames
  const flashFrames = (style as any).flashFrames ?? [];
  for (const ff of flashFrames) {
    effects.push({
      role: "impact",
      type: "impact_flash",
      start: ff.timestamp ?? 0,
      duration: 0.1,
      intensity: 0.8,
      attachedTo: "cut",
    });
  }

  // Climax impact
  effects.push({
    role: "impact",
    type: "push_in",
    start: climaxTs,
    duration: 1.5,
    intensity: 0.7,
    attachedTo: "hero",
  });

  // Energy-driven effects
  const energyCurve = style.pacing?.energyCurve ?? [];
  const bucketSize = duration / Math.max(energyCurve.length, 1);
  for (let i = 0; i < energyCurve.length; i++) {
    const energy = energyCurve[i] ?? 0.5;
    if (energy > 0.8 && i > 0 && (energyCurve[i - 1] ?? 0) < energy) {
      effects.push({
        role: "emphasis",
        type: "impact_flash",
        start: i * bucketSize,
        duration: 0.15,
        intensity: energy,
        attachedTo: "beat",
      });
    }
  }

  return effects;
}

function detectWhipMoments(style: ReferenceStyle, duration: number): number[] {
  // From transition detection
  const transitionDetections = (style as any).transitionDetections ?? [];
  return transitionDetections
    .filter((t: any) => t.type === "whip_pan")
    .map((t: any) => t.timestamp ?? 0);
}

function classifyTextRole(t: any): TextRole {
  const pos = t.position ?? "center";
  if (pos === "upper_third") return "hook";
  if (pos === "lower_third") return "caption";
  return "emphasis";
}

function classifyTextAnimation(t: any): TextAnimation {
  const anim = t.animation ?? "static_caption";
  if (anim === "pop_scale") return "pop";
  if (anim === "slide_up") return "slide";
  if (anim === "typewriter") return "kinetic";
  return "static";
}

function computeSubjectScaleCurve(style: ReferenceStyle, duration: number): number[] {
  const shotLanguage = style.shotLanguage ?? {};
  const closeupRatio = shotLanguage.closeupRatio ?? 0.3;
  const wideRatio = shotLanguage.wideRatio ?? 0.2;

  // Approximate scale curve from closeup/wide ratios
  const curve: number[] = [];
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    // Closeup ratio increases toward climax
    const scale = 0.5 + closeupRatio * (1 - Math.abs(t - 0.6)) + wideRatio * Math.abs(t - 0.5);
    curve.push(Math.min(1, Math.max(0, scale)));
  }
  return curve;
}

function classifyCompositionBias(style: ReferenceStyle): "centered" | "dynamic" | "wide" | "close" {
  const shotLanguage = style.shotLanguage ?? {};
  const closeupRatio = shotLanguage.closeupRatio ?? 0.3;
  const wideRatio = shotLanguage.wideRatio ?? 0.2;

  if (closeupRatio > 0.5) return "close";
  if (wideRatio > 0.5) return "wide";
  if (shotLanguage.motionPreference === "moving") return "dynamic";
  return "centered";
}
