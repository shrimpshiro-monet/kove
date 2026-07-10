import type { MonetEDL, Shot, Effect, TransitionType, ColorGradePreset } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";
import { loadPromptTemplate } from "../prompts";

export interface ReplicateStyleInput {
  referenceStyle: ReferenceStyle;
  analysis: any;
  sourcePlan: Array<{
    clipId: string; segmentIndex: number; startTime: number; duration: number;
    motionDir: string; semanticTags: string[]; faceCentered: boolean;
    hasVelocityRamp: boolean; score: number;
  }>;
  targetDuration: number;
  rhythmMap?: { bpm: number; beats: number[]; onsets: Array<{ time: number; strength: number }>; drop_candidates: number[]; downbeats: number[] };
  fps?: number;
  createdAt?: number;
  attemptIndex?: number;
}

interface TimingSlot {
  startTime: number;
  duration: number;
  beatIndex: number;
  energyLevel: number;
  sectionRole: "hook" | "setup" | "drop" | "montage" | "peak" | "ending";
}

function getBeatInterval(beats: number[], fallbackBpm = 120): number {
  if (beats.length >= 2) return beats[1] - beats[0];
  return 60 / fallbackBpm;
}

/**
 * Rotate source plan for retry variation.
 * Each attempt shifts the starting position, producing different segment selections.
 */
function rotateSourcePlan<T>(sourcePlan: T[], attemptIndex: number): T[] {
  if (attemptIndex === 0 || sourcePlan.length === 0) return sourcePlan;
  const offset = attemptIndex % sourcePlan.length;
  return [...sourcePlan.slice(offset), ...sourcePlan.slice(0, offset)];
}

export function replicateStyle(input: ReplicateStyleInput): MonetEDL {
  const {
    referenceStyle: ref,
    analysis,
    targetDuration,
    rhythmMap,
    fps = 30,
    createdAt = 0,
    attemptIndex = 0,
  } = input;

  const sourcePlan = rotateSourcePlan(input.sourcePlan, attemptIndex);
  const avgShotDur = ref.rhythm.avgShotDuration;
  const climaxTs = ref.pacing.climaxPosition * targetDuration;
  const beats = rhythmMap?.beats ?? [];

  const targetShotCount = Math.max(3, Math.round(targetDuration / avgShotDur));
  let slots = planTimingSlots(targetDuration, targetShotCount, ref, beats, climaxTs, rhythmMap?.drop_candidates ?? []);
  slots = fillTimeline(slots, targetDuration);

  const availableSources = sourcePlan.slice(0, slots.length);

  const shots: Shot[] = slots.map((slot, i) => {
    const source = availableSources[i] ?? availableSources[availableSources.length - 1] ?? {
      clipId: "unknown", segmentIndex: 0, startTime: 0, duration: slot.duration,
      motionDir: "none", semanticTags: [], faceCentered: false, hasVelocityRamp: false, score: 0.5,
    };

    // Check if reference had a velocity ramp at this normalized position
    const normalizedTime = targetDuration > 0 ? slot.startTime / targetDuration : 0;
    const hasRefVelocityRamp = (ref as any)?.velocityRamps?.some((vr: any) =>
      Math.abs((vr.startTime / ((ref as any).duration ?? targetDuration)) - normalizedTime) < 0.1
    ) ?? false;

    // Check if reference had a flash frame near this position
    const hasRefFlash = (ref as any)?.flashFrames?.some((ff: any) =>
      Math.abs(ff.timestamp - slot.startTime) < 0.3
    ) ?? false;

    // Get color metrics for this shot's position in timeline
    const colorMetrics = (ref.visualStyle as any)?._colorMetrics;

    return {
      id: `shot_${String(i + 1).padStart(3, "0")}`,
      source: {
        clipId: source.clipId,
        inPoint: source.startTime,
        outPoint: source.startTime + Math.min(source.duration, slot.duration),
        motionDir: source.motionDir,
        hasVelocityRamp: source.hasVelocityRamp,
        semantic: source.semanticTags,
        faceCentered: source.faceCentered,
        motion: source.score,
      },
      timing: {
        startTime: slot.startTime,
        duration: slot.duration,
        speed: 1.0,
        beatLocked: ref.rhythm.cutAlignment !== "none",
      },
      effects: selectEffectsForShot(slot, ref, rhythmMap, i, slots.length, targetDuration, { hasRefVelocityRamp, hasRefFlash, colorMetrics, sourceHasVelocityRamp: source.hasVelocityRamp }),
      transition: selectTransition(slot, ref, i, slots.length),
      beatLock: beats.length > 0 && slot.beatIndex >= 0
        ? { beatIndex: slot.beatIndex, lockMode: "start" as const }
        : undefined,
      sectionRole: slot.sectionRole,
      isHero: slot.sectionRole === "peak" || slot.sectionRole === "drop",
      holdForImpact: slot.sectionRole === "drop",
      aiRationale: `${slot.sectionRole} at ${Math.round((slot.startTime / targetDuration) * 100)}%`,
    };
  });

  const musicId = analysis.music?.musicId ?? analysis.music?.id ?? "music_default";

  // Generate text overlays from reference text overlay trace
  const textOverlayTrace = (ref as any).textOverlayTrace ?? [];
  const refDuration = (ref as any).duration ?? targetDuration;
  const textOverlays = textOverlayTrace.map((trace: any, idx: number) => {
    // Scale timestamps from reference duration to target duration
    const timeScale = refDuration > 0 ? targetDuration / refDuration : 1;
    const startTime = Math.max(0, (trace.startTime ?? 0) * timeScale);
    const endTime = Math.min(targetDuration, (trace.endTime ?? trace.startTime + 1) * timeScale);

    // Map position to offset (-1..1 normalized)
    const bbox = trace.bbox ?? { x: 0.3, y: 0.4, w: 0.4, h: 0.1 };
    const offsetX = (bbox.x + bbox.w / 2) * 2 - 1; // Map 0-1 to -1..1
    const offsetY = (bbox.y + bbox.h / 2) * 2 - 1;

    // Map animation type
    const animMap: Record<string, "pop" | "fade" | "slide" | "glitch"> = {
      pop_scale: "pop",
      fade_in: "fade",
      slide_up: "slide",
      typewriter: "pop",
      static_caption: "fade",
    };
    const inType = animMap[trace.animation] ?? "fade";

    // Map alignment from position
    const alignment = trace.position === "center" ? "center" : trace.position === "upper_third" ? "center" : "center";

    return {
      id: `text_${String(idx + 1).padStart(3, "0")}`,
      text: trace.text ?? "",
      startTime,
      endTime,
      offset: { x: Math.round(offsetX * 100) / 100, y: Math.round(offsetY * 100) / 100 },
      style: {
        fontSize: trace.fontVibe === "bold_sans" ? 48 : 36,
        color: "#FFFFFF",
        weight: trace.fontVibe === "bold_sans" ? "bold" : "normal",
        shadow: true,
        alignment,
      },
      animation: {
        inType,
        outType: "fade",
        duration: 0.3,
        easing: "ease-out" as const,
      },
    };
  });

  return {
    version: "1.0.0",
    metadata: {
      title: "Style Replication",
      createdAt,
      aiModel: "deterministic-engine",
      prompt: `Replicate: ${ref.editingPhilosophy?.summary?.slice(0, 50) ?? "reference style"}`,
      intentId: "style-replication",
      analysisId: "deterministic",
    },
    timeline: {
      resolution: { width: 1920, height: 1080 },
      fps,
      duration: targetDuration,
    },
    music: analysis.music
      ? { id: musicId, sourceId: musicId, volume: 0.85, fadeIn: 0.3, fadeOut: 0.5, bpm: analysis.music.bpm ?? rhythmMap?.bpm ?? 120, beatGrid: beats }
      : undefined,
    shots,
    textOverlays: textOverlays.length > 0 ? textOverlays : undefined,
    globalEffects: { colorGrade: mapColorGrade(ref.visualStyle?.colorGrade ?? "cinematic") },
  };
}

function planTimingSlots(targetDuration: number, targetShotCount: number, ref: ReferenceStyle, beats: number[], climaxTs: number, dropCandidates: number[]): TimingSlot[] {
  const slots: TimingSlot[] = [];
  const avgDur = ref.rhythm.avgShotDuration;
  const variance = ref.rhythm.shotDurationVariance;
  const energyCurve = ref.pacing.energyCurve;
  let currentTime = 0;

  for (let i = 0; i < targetShotCount; i++) {
    const progress = currentTime / targetDuration;
    const energyIdx = Math.min(energyCurve.length - 1, Math.floor(progress * energyCurve.length));
    const energy = energyCurve[energyIdx] ?? 0.5;

    let sectionRole: TimingSlot["sectionRole"] = "montage";
    if (progress < 0.1) sectionRole = "hook";
    else if (currentTime < climaxTs - 1) sectionRole = "setup";
    else if (Math.abs(currentTime - climaxTs) < 1.5) sectionRole = "drop";
    else if (currentTime > climaxTs && currentTime < targetDuration * 0.85) sectionRole = "peak";
    else sectionRole = "ending";

    let duration = avgDur;
    if (sectionRole === "hook" || sectionRole === "setup") duration = avgDur * (1.0 + variance);
    else if (sectionRole === "drop") duration = Math.max(0.3, avgDur * 0.4);
    else if (sectionRole === "peak") duration = Math.max(0.4, avgDur * (0.8 - energy * 0.3));
    else if (sectionRole === "ending") duration = avgDur * 1.2;
    duration = Math.max(0.25, Math.min(4.0, duration));

    let beatIndex = -1;
    if (beats.length > 0) {
      let bestBeat = 0;
      let bestDist = Infinity;
      for (let b = 0; b < beats.length; b++) {
        const dist = Math.abs(beats[b] - currentTime);
        if (dist < bestDist) { bestDist = dist; bestBeat = b; }
      }
      const beatInterval = getBeatInterval(beats, ref.rhythm.avgShotDuration > 0 ? 60 / ref.rhythm.avgShotDuration : 120);
      const snapTolerance = beatInterval * 0.3;
      if (bestDist <= snapTolerance) {
        currentTime = beats[bestBeat];
        beatIndex = bestBeat;
      }
    }

    if (currentTime + duration > targetDuration) {
      duration = targetDuration - currentTime;
      if (duration <= 0) break;
    }

    slots.push({ startTime: currentTime, duration, beatIndex, energyLevel: energy, sectionRole });
    currentTime += duration;
  }
  return slots;
}

function fillTimeline(slots: TimingSlot[], targetDuration: number): TimingSlot[] {
  if (slots.length === 0) return slots;
  const filled = slots.map(s => ({ ...s }));
  const last = filled[filled.length - 1];
  const end = last.startTime + last.duration;
  const gap = targetDuration - end;
  if (gap > 0.05) {
    last.duration += gap;
  }
  if (gap < -0.05) {
    last.duration = Math.max(0.25, last.duration + gap);
  }
  return filled;
}

function selectEffectsForShot(slot: TimingSlot, ref: ReferenceStyle, rhythmMap: any, _shotIndex: number, _totalShots: number, targetDuration: number, refData?: { hasRefVelocityRamp: boolean; hasRefFlash: boolean; colorMetrics?: any; sourceHasVelocityRamp?: boolean }): Effect[] {
  const effects: Effect[] = [];
  const climaxTs = ref.pacing.climaxPosition * targetDuration;
  const shotEnd = slot.startTime + slot.duration;
  const isPreClimax = shotEnd <= climaxTs;
  const isDrop = slot.sectionRole === "drop" || (rhythmMap?.drop_candidates ?? []).some((d: number) => Math.abs(d - slot.startTime) < 0.2);
  const isHero = slot.sectionRole === "peak" || isDrop;

  if (isPreClimax && !isDrop) {
    if (slot.energyLevel > 0.5) {
      effects.push({ id: `fx_${slot.startTime.toFixed(2)}_push`, type: "push_in", intensity: 0.3, params: { startScale: 1.0, endScale: 1.05 } });
    }
    return effects;
  }

  const shouldHaveEffect = isDrop || isHero || slot.energyLevel > 0.6 || slot.sectionRole === "peak";
  if (!shouldHaveEffect && Math.floor(slot.startTime * 10) % Math.max(1, Math.round(1 / Math.max(0.1, ref.effects.effectsFrequency))) !== 0) return effects;

  // Flash from reference detection
  if (refData?.hasRefFlash || isDrop) {
    effects.push({ id: `fx_${slot.startTime.toFixed(2)}_flash`, type: "impact_flash", intensity: 0.8, startTime: 0, duration: 0.08, params: { peakBrightness: 0.9, flashFrameCount: 2 } });
  }
  if (isHero) {
    effects.push({ id: `fx_${slot.startTime.toFixed(2)}_push`, type: "push_in", intensity: 0.5, params: { startScale: 1.0, endScale: 1.1 } });
  }
  // Speed ramp from reference detection or source flag
  if ((refData?.hasRefVelocityRamp || refData?.sourceHasVelocityRamp || ref.effects.commonEffects.includes("speed_ramp")) && slot.energyLevel > 0.5) {
    effects.push({ id: `fx_${slot.startTime.toFixed(2)}_ramp`, type: "speed_ramp", intensity: 0.6, params: { entrySpeed: 1.0, anchorSpeed: 0.45, exitSpeed: 1.0, anchorAt: 0.5 } });
  }
  if (ref.effects.commonEffects.includes("context_shake") && slot.energyLevel > 0.7) {
    effects.push({ id: `fx_${slot.startTime.toFixed(2)}_shake`, type: "context_shake", intensity: 0.5, params: { amplitude: 0.015, decay: 0.75 } });
  }
  if (slot.sectionRole === "peak" && ref.effects.commonEffects.includes("color_pulse")) {
    effects.push({ id: `fx_${slot.startTime.toFixed(2)}_color`, type: "color_pulse", intensity: 0.4, startTime: 0, duration: 0.3, params: { saturation: 1.3, brightness: 1.1 } });
  }

  // Color grade intensity from real metrics
  if (refData?.colorMetrics && slot.sectionRole === "peak") {
    const satBoost = refData.colorMetrics.avgSaturation > 0.6 ? 0.2 : 0;
    if (satBoost > 0 && !effects.some(e => e.type === "color_pulse")) {
      effects.push({ id: `fx_${slot.startTime.toFixed(2)}_sat`, type: "color_pulse", intensity: satBoost, startTime: 0, duration: 0.5, params: { saturation: 1 + satBoost, brightness: 1.0 } });
    }
  }

  return effects.slice(0, 2);
}

function selectTransition(slot: TimingSlot, ref: ReferenceStyle, shotIndex: number, totalShots: number): { type: TransitionType; duration: number } {
  if (slot.sectionRole === "montage" || slot.sectionRole === "drop") return { type: "cut", duration: 0 };
  const progressSlot = shotIndex / totalShots;
  if (progressSlot < ref.effects.transitionsBreakdown.crossfadePercentage && (slot.sectionRole === "hook" || slot.sectionRole === "setup")) {
    return { type: "crossfade", duration: 0.3 };
  }
  return { type: "cut", duration: 0 };
}

function mapColorGrade(grade: string): ColorGradePreset {
  const valid: ColorGradePreset[] = ["cinematic", "vibrant", "vintage", "monochrome", "anime", "raw", "cool_desaturated", "warm_dark", "vivid_red", "neutral_desaturated", "bright_warm", "vibrant_warm", "hyper_neon", "cool_dark", "warm_cinematic", "desaturated_natural"];
  return valid.includes(grade as ColorGradePreset) ? (grade as ColorGradePreset) : "cinematic";
}

/**
 * Apply deterministic humanization (no AI, no Math.random).
 * Deep clones the EDL — original is never mutated.
 * Syncopation is done via duration edits, not startTime shifts (survives reflow).
 */
export function applyDeterministicHumanization(edl: MonetEDL, ref: ReferenceStyle): MonetEDL {
  const cloned: MonetEDL = JSON.parse(JSON.stringify(edl));
  const shots = cloned.shots;
  const fps = cloned.timeline?.fps ?? 30;

  if (shots.length < 3) return cloned;

  // 1. Extend two hero/setup shots
  let extended = 0;
  for (const shot of shots) {
    if (extended >= 2) break;
    if (shot.isHero || shot.sectionRole === "setup") {
      shot.timing.duration += 0.2;
      extended++;
    }
  }

  // 2. Shorten one montage shot
  for (const shot of shots) {
    if (shot.sectionRole === "montage" && !shot.isHero) {
      shot.timing.duration = Math.max(0.25, shot.timing.duration - 0.15);
      break;
    }
  }

  // 3. Syncopate one beat-locked cut by shortening the previous shot
  const frameShift = 2 / fps;
  const syncIndex = shots.findIndex((s, i) => i > 0 && s.beatLock);
  if (syncIndex > 0) {
    const prev = shots[syncIndex - 1];
    if (prev.timing.duration - frameShift >= 0.25) {
      prev.timing.duration -= frameShift;
    }
  }

  // 4. Boost hero effect, reduce closing effect
  const hero = shots.find(s => s.isHero && (s.effects?.length ?? 0) > 0);
  if (hero?.effects?.[0]) {
    hero.effects[0].intensity = Math.min(1, hero.effects[0].intensity + 0.15);
  }
  const closing = shots[shots.length - 1];
  if (closing.effects?.length) {
    closing.effects = closing.effects.map(e => ({
      ...e,
      intensity: Math.max(0, e.intensity - 0.2),
    }));
  }

  // 5. Reflow after duration edits
  let t = 0;
  for (const shot of shots) {
    shot.timing.startTime = t;
    t += shot.timing.duration;
  }

  // 6. Preserve approximate total duration
  const last = shots[shots.length - 1];
  const end = last.timing.startTime + last.timing.duration;
  const gap = cloned.timeline.duration - end;
  if (Math.abs(gap) > 0.05) {
    last.timing.duration = Math.max(0.25, last.timing.duration + gap);
  }

  return cloned;
}

export async function humanizeSkeleton(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle,
  aiService: any,
): Promise<MonetEDL> {
  const cloned: MonetEDL = JSON.parse(JSON.stringify(edl));

  try {
    const promptTemplate = loadPromptTemplate("humanize-skeleton.txt");
    const result = await aiService.generateContentJSON({
      prompt: `${promptTemplate}\n\nEDL to humanize:\n${JSON.stringify(cloned)}`,
      systemInstruction: "You are a senior editor. Output ONLY valid JSON matching the input EDL structure.",
      temperature: 0.35,
      maxOutputTokens: 8192,
    });

    if (result?.shots?.length === cloned.shots.length) {
      for (let i = 0; i < cloned.shots.length; i++) {
        const h = result.shots[i];
        if (h?.timing?.startTime !== undefined) cloned.shots[i].timing.startTime = h.timing.startTime;
        if (h?.timing?.duration !== undefined) cloned.shots[i].timing.duration = h.timing.duration;
        if (h?.effects) cloned.shots[i].effects = h.effects;
      }
      return cloned;
    }
  } catch (e) {
    console.warn("[humanizer] AI humanization failed:", (e as Error).message);
  }

  return applyDeterministicHumanization(cloned, referenceStyle);
}
