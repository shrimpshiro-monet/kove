// Pass 2 of the two-pass EDL: takes a creative skeleton + real onsets, produces concrete timings.
// NO LLM. Pure deterministic TypeScript. This is where the "AI hallucinated timings" problem dies.

import type { EDLEffect } from "./effect-mapper";
import { effectMapper, type EffectIntent } from "./effect-mapper";

// ---- Types matching the new pipeline schemas ----

interface FootageSegment {
  startTime: number;
  endTime: number;
  description: string;
  subjects: string[];
  motionLevel: "static" | "low" | "medium" | "high" | "extreme";
  dominantColors: string[];
  energyScore: number;
  visualInterestScore: number;
}

interface FootageAnalysis {
  clipId: string;
  duration: number;
  segments: FootageSegment[];
}

interface MusicAnalysis {
  sourceId: string;
  duration: number;
  bpm: number;
  onsets: number[];
  beatGrid: number[];
  sections: Array<{
    startTime: number;
    endTime: number;
    type: string;
    energyScore: number;
  }>;
}

interface ShotSkeleton {
  id: string;
  source: { clipId: string; segmentIndex: number };
  intendedRole: string;
  emotionalBeat: string;
  effectIntents: EffectIntent[];
  aiRationale: string;
}

interface EDLCreativeSkeleton {
  version: string;
  emotionalArc: string[];
  shots: ShotSkeleton[];
}

interface AlignmentOptions {
  skeleton: EDLCreativeSkeleton;
  footage: FootageAnalysis[];
  music: MusicAnalysis;
  intent: { prompt: string; intentId: string; analysisId: string };
  targetDuration?: number;
  fps?: number;
  resolution?: { width: number; height: number };
}

interface EDLShot {
  id: string;
  source: { clipId: string; inPoint: number; outPoint: number };
  timing: { startTime: number; duration: number };
  effects: EDLEffect[];
  beatLock?: { onsetIndex: number; onsetTime: number; quantization: string };
  aiRationale: string;
}

interface EDL {
  version: string;
  metadata: {
    title: string;
    createdAt: number;
    aiModel: string;
    prompt: string;
    intentId: string;
    analysisId: string;
  };
  timeline: { resolution: { width: number; height: number }; fps: number; duration: number };
  shots: EDLShot[];
  music: { sourceId: string; bpm: number; beatGrid: number[] };
}

function snapToNearestOnset(
  time: number,
  onsets: number[],
  windowSeconds = 0.15
): { time: number; onsetIndex: number | null } {
  let best = { time, onsetIndex: null as number | null, dist: Infinity };
  for (let i = 0; i < onsets.length; i++) {
    const d = Math.abs(onsets[i] - time);
    if (d < best.dist && d <= windowSeconds) {
      best = { time: onsets[i], onsetIndex: i, dist: d };
    }
  }
  return { time: best.time, onsetIndex: best.onsetIndex };
}

type PacingClass = "rapid" | "medium" | "cinematic" | "dialogue";

interface PacingBounds {
  minShotDuration: number;
  maxShotDuration: number;
}

const PACING_BOUNDS: Record<PacingClass, PacingBounds> = {
  rapid:    { minShotDuration: 0.7, maxShotDuration: 2.0 },
  medium:   { minShotDuration: 1.0, maxShotDuration: 2.5 },
  cinematic:{ minShotDuration: 1.8, maxShotDuration: 4.0 },
  dialogue: { minShotDuration: 2.5, maxShotDuration: 6.0 },
};

function parsePacingClass(prompt: string): PacingClass {
  const lower = prompt.toLowerCase();
  if (/\b(rapid|hype|fast|aggressive|energy|quick|punchy)\b/.test(lower)) return "rapid";
  if (/\b(slow|moody|cinematic|restrained|emotional|reflective|gentle)\b/.test(lower)) return "cinematic";
  if (/\b(dialogue|drama|character|story|readable|conversational)\b/.test(lower)) return "dialogue";
  return "medium";
}

function getEnergyMultiplier(position: number, pacingClass: PacingClass): number {
  const arc = pacingClass === "rapid"
    ? 0.8 + 0.4 * Math.sin(position * Math.PI)
    : pacingClass === "cinematic"
    ? 1.2 - 0.4 * Math.sin(position * Math.PI)
    : 1.0;
  return arc;
}

function planShotTimings(
  shotCount: number,
  targetDuration: number,
  onsets: number[],
  minShotDuration = 0.4,
  maxShotDuration = 10,
  prompt = ""
): Array<{ startTime: number; duration: number; onsetIndex: number | null }> {
  const pacingClass = parsePacingClass(prompt);
  const bounds = PACING_BOUNDS[pacingClass];
  const effectiveMin = Math.max(minShotDuration, bounds.minShotDuration);
  const effectiveMax = Math.min(maxShotDuration, bounds.maxShotDuration);
  
  // Generate cut times with energy arc
  const cutTimes: number[] = [0];
  let currentTime = 0;
  
  for (let i = 0; i < shotCount; i++) {
    const position = i / shotCount;
    const energyMult = getEnergyMultiplier(position, pacingClass);
    
    // Base duration from pacing bounds, modulated by energy arc
    const baseDuration = (effectiveMin + effectiveMax) / 2;
    let shotDuration = baseDuration * energyMult;
    
    // Clamp to bounds
    shotDuration = Math.max(effectiveMin, Math.min(effectiveMax, shotDuration));
    
    // For last shot, fill remaining duration
    if (i === shotCount - 1) {
      shotDuration = targetDuration - currentTime;
    }
    
    // Snap to nearest onset if close enough
    const idealEnd = currentTime + shotDuration;
    const snapWindow = shotDuration * 0.3;
    const nearestOnset = onsets.reduce(
      (best, t) => (Math.abs(t - idealEnd) < Math.abs(best - idealEnd) && Math.abs(t - idealEnd) <= snapWindow ? t : best),
      idealEnd
    );
    
    // Ensure minimum duration
    const actualEnd = Math.max(currentTime + effectiveMin, nearestOnset);
    cutTimes.push(actualEnd);
    currentTime = actualEnd;
  }
  
  // Force last cut to exactly targetDuration
  cutTimes[cutTimes.length - 1] = targetDuration;
  
  // Ensure monotonically increasing
  for (let i = 1; i < cutTimes.length; i++) {
    if (cutTimes[i] <= cutTimes[i - 1]) {
      cutTimes[i] = cutTimes[i - 1] + effectiveMin;
    }
  }
  // Ensure total duration is correct
  if (cutTimes[cutTimes.length - 1] !== targetDuration) {
    cutTimes[cutTimes.length - 1] = targetDuration;
  }
  
  const result: Array<{
    startTime: number;
    duration: number;
    onsetIndex: number | null;
  }> = [];
  for (let i = 0; i < shotCount; i++) {
    const startTime = cutTimes[i];
    const endTime = cutTimes[i + 1];
    result.push({
      startTime,
      duration: Math.max(effectiveMin, endTime - startTime),
      onsetIndex: null, // Will be set by snap logic if applicable
    });
  }
  return result;
}

function pickSourceWindow(
  segment: FootageSegment,
  duration: number
): { inPoint: number; outPoint: number } {
  const segmentDuration = segment.endTime - segment.startTime;
  if (duration >= segmentDuration) {
    return { inPoint: segment.startTime, outPoint: segment.endTime };
  }
  const playableStart = segment.startTime + segmentDuration * 0.1;
  const playableEnd = segment.endTime - segmentDuration * 0.1;
  const playableDuration = playableEnd - playableStart;
  const offset = Math.max(0, (playableDuration - duration) / 2);
  return {
    inPoint: playableStart + offset,
    outPoint: playableStart + offset + duration,
  };
}

/**
 * Main entrypoint: skeleton + onsets → fully timed, fully effect-mapped EDL.
 */
export function alignToOnsets(opts: AlignmentOptions): EDL {
  const {
    skeleton,
    footage,
    music,
    intent,
    targetDuration = Math.min(music?.duration ?? 30, 30),
    fps = 30,
    resolution = { width: 1920, height: 1080 },
  } = opts;

  const onsets = music?.onsets ?? [];
  if (onsets.length === 0) {
    throw new Error("Cannot align: music has no onsets. Run real onset detection first.");
  }

  const shotPlan = planShotTimings(skeleton.shots.length, targetDuration, onsets, 0.4, 10, intent.prompt);

  const shots: EDLShot[] = skeleton.shots.map((sk, i) => {
    const plan = shotPlan[i];
    const clip = footage.find((f) => f.clipId === sk.source.clipId);
    if (!clip) throw new Error(`Footage clip not found: ${sk.source.clipId}`);

    const rawSegment = clip.segments[Math.min(sk.source.segmentIndex, clip.segments.length - 1)];
    if (!rawSegment) throw new Error(`Segment ${sk.source.segmentIndex} not found for clip ${sk.source.clipId}`);

    // Normalize field names: analysis uses start/end, pipeline expects startTime/endTime
    const segment: FootageSegment = {
      startTime: (rawSegment as any).startTime ?? (rawSegment as any).start ?? 0,
      endTime: (rawSegment as any).endTime ?? (rawSegment as any).end ?? (rawSegment as any).duration ?? 10,
      description: rawSegment.description ?? "",
      subjects: (rawSegment as any).subjects ?? (rawSegment as any).salientSubjects ?? [],
      motionLevel: rawSegment.motionLevel ?? (
        ((rawSegment as any)?.scores?.motion ?? 0.5) > 0.7 ? "high" :
        ((rawSegment as any)?.scores?.motion ?? 0.5) > 0.4 ? "medium" :
        ((rawSegment as any)?.scores?.motion ?? 0.5) > 0.2 ? "low" : "static"
      ) as "static" | "low" | "medium" | "high" | "extreme",
      dominantColors: rawSegment.dominantColors ?? [],
      energyScore: rawSegment.energyScore ?? (rawSegment as any)?.scores?.overall ?? 0.5,
      visualInterestScore: rawSegment.visualInterestScore ?? (rawSegment as any)?.scores?.interest ?? 0.5,
    };
    const { inPoint, outPoint } = pickSourceWindow(segment, plan.duration);

    const effects = sk.effectIntents.flatMap((intentObj) =>
      effectMapper.toEffects({
        intent: intentObj,
        shotStartTime: plan.startTime,
        shotDuration: plan.duration,
        shotMotionLevel: segment.motionLevel,
        shotColors: segment.dominantColors,
        beatLockOnsetTime:
          plan.onsetIndex != null ? onsets[plan.onsetIndex] : null,
      })
    );

    return {
      id: sk.id,
      source: { clipId: sk.source.clipId, inPoint, outPoint },
      timing: { startTime: plan.startTime, duration: plan.duration },
      effects,
      beatLock:
        plan.onsetIndex != null
          ? {
              onsetIndex: plan.onsetIndex,
              onsetTime: onsets[plan.onsetIndex],
              quantization: "soft",
            }
          : undefined,
      aiRationale: sk.aiRationale,
    };
  });

  return {
    version: "1.0.0",
    metadata: {
      title: "Monet Edit",
      createdAt: Date.now(),
      aiModel: "monet-two-pass-v1",
      prompt: intent.prompt,
      intentId: intent.intentId,
      analysisId: intent.analysisId,
    },
    timeline: { resolution, fps, duration: targetDuration },
    shots,
    music: { sourceId: music?.sourceId ?? "", bpm: music?.bpm ?? 120, beatGrid: music?.beatGrid ?? [] },
  };
}
