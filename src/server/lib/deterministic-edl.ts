// Deterministic EDL Generator
// Fallback path with temporal + emotional graph planning.

import type { MonetEDL, Shot } from "../types/edl";
import type { IntentExtractionResult, SimplifiedIntent } from "../types/intent";
import type { AnalysisResult, ScoredSegment } from "../types/analysis";

type PacingRules = {
  avgShotDuration: number;
  minDuration: number;
  maxDuration: number;
};

type SegmentNode = {
  id: string;
  clipId: string;
  segment: ScoredSegment;
  adjustedScore: number;
  usedCount: number;
};

type PlanContext = {
  targetDuration: number;
  pacingRules: PacingRules;
  beatGrid: number[];
  bpm: number;
  syncToBeat: boolean;
};

export function generateDeterministicEDL(
  intent: IntentExtractionResult | SimplifiedIntent,
  analysis: AnalysisResult,
  metadata: {
    intentId: string;
    analysisId: string;
    projectId: string;
  }
): MonetEDL {
  const intentData = normalizeIntent(intent);
  const targetDuration = intentData.structure.duration;
  const pacingRules = getPacingRules(intentData.style.pacing);
  const beatGrid = analysis.music?.beatGrid || [];
  const bpm = analysis.music?.bpm || 120;
  const syncToBeat = intentData.technical.syncToBeat && beatGrid.length > 0;

  const nodes = buildSegmentNodes(analysis, intentData);
  const initialShots = planTemporalEmotionalPath(nodes, intentData, {
    targetDuration,
    pacingRules,
    beatGrid,
    bpm,
    syncToBeat,
  });

  const shots = applyQualityCorrection(initialShots, intentData, {
    targetDuration,
    pacingRules,
    beatGrid,
    bpm,
    syncToBeat,
  });

  const edl: MonetEDL = {
    version: "1.0.0",
    metadata: {
      title: "Deterministic Edit",
      createdAt: Date.now(),
      aiModel: "deterministic-fallback",
      prompt: intentData.goal.primary,
      intentId: metadata.intentId,
      analysisId: metadata.analysisId,
    },
    timeline: {
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      duration: targetDuration,
    },
    shots,
    globalEffects: getGlobalEffects(intentData.style.genre),
  };

  if (analysis.music) {
    edl.music = {
      sourceId: analysis.music.musicId,
      bpm: analysis.music.bpm,
      beatGrid: analysis.music.beatGrid,
      volume: 0.8,
      fadeIn: 0.5,
    };
  }

  return edl;
}

function normalizeIntent(intent: IntentExtractionResult | SimplifiedIntent): SimplifiedIntent {
  if (!("intent" in intent)) {
    return intent;
  }

  const full = intent.intent;

  return {
    version: full.version,
    goal: {
      primary: full.goal.primary,
    },
    style: {
      genre: full.style.genre,
      pacing: normalizePacing(full.style.pacing),
      mood: full.style.mood,
    },
    structure: {
      duration: full.structure.duration,
      energyCurve:
        full.structure.energyCurve && full.structure.energyCurve.length > 0
          ? full.structure.energyCurve
          : [0.5, 0.6, 0.7, 0.8, 0.6],
    },
    technical: {
      syncToBeat: full.technical.syncToBeat,
      beatSyncStrength: full.technical.beatSyncStrength ?? 0.8,
      transitionStyle: normalizeTransitionStyle(full.technical.transitionStyle),
      colorTreatment: full.technical.colorTreatment,
      effectsIntensity: full.technical.effectsIntensity,
    },
    contentPreferences: {
      focusOn: full.contentPreferences.focusOn ?? [],
    },
  };
}

function normalizePacing(
  pacing: "slow" | "medium" | "fast" | "aggressive" | "varied"
): "slow" | "medium" | "fast" | "aggressive" {
  return pacing === "varied" ? "medium" : pacing;
}

function normalizeTransitionStyle(
  style: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed"
): "cut" | "smooth" | "dynamic" {
  if (style === "aggressive") return "dynamic";
  if (style === "mixed") return "dynamic";
  return style;
}

function planTemporalEmotionalPath(
  nodes: SegmentNode[],
  intent: SimplifiedIntent,
  ctx: PlanContext
): Shot[] {
  const shots: Shot[] = [];
  const clipCursor = new Map<string, number>();

  if (nodes.length === 0) {
    return [];
  }

  let currentTime = 0;
  let previousNode: SegmentNode | null = null;
  const maxShots = Math.max(1, Math.ceil(ctx.targetDuration / 0.5));

  while (currentTime < ctx.targetDuration && shots.length < maxShots) {
    const progress = currentTime / Math.max(0.001, ctx.targetDuration);
    const targetEnergy = getTargetEnergy(intent, progress);
    const targetDuration = getTargetShotDuration(intent, ctx, targetEnergy, shots.length);

    const node = selectBestNode(nodes, previousNode, intent, targetEnergy, shots.length);
    if (!node) break;

    const availableDuration = Math.max(0, node.segment.end - node.segment.start);
    let duration = Math.min(targetDuration, availableDuration);
    duration = Math.max(0.5, Math.min(duration, ctx.pacingRules.maxDuration));

    if (currentTime + duration > ctx.targetDuration) {
      duration = Math.max(0.5, ctx.targetDuration - currentTime);
    }

    if (duration < 0.5) break;

    const inPoint = selectInPoint(node, duration, clipCursor, shots.length);
    const outPoint = Math.min(node.segment.end, inPoint + duration);
    duration = Math.max(0.5, outPoint - inPoint);

    const transitionType = chooseTransition(intent, targetEnergy, shots.length, maxShots);

    const shot: Shot = {
      id: `shot-${shots.length + 1}`,
      source: {
        clipId: node.clipId,
        inPoint,
        outPoint,
      },
      timing: {
        startTime: currentTime,
        duration,
      },
      transition: {
        type: transitionType,
        duration: transitionType === "crossfade" ? 0.2 : 0,
      },
      aiRationale: buildShotRationale(node, targetEnergy, shots.length),
    };

    if (ctx.syncToBeat) {
      shot.beatLock = {
        beatIndex: findNearestBeatIndex(currentTime, ctx.beatGrid),
        lockMode: targetEnergy > 0.72 ? "start" : "center",
      };
    }

    shot.effects = maybeAddEffect(node, intent, targetEnergy, shots.length, maxShots);

    shots.push(shot);
    node.usedCount += 1;
    previousNode = node;
    currentTime += duration;
  }

  return shots;
}

function applyQualityCorrection(
  shots: Shot[],
  intent: SimplifiedIntent,
  ctx: PlanContext
): Shot[] {
  if (shots.length === 0) return shots;

  const maxDuration = intent.style.pacing === "slow" ? 8 : 6;
  const corrected = shots
    .map((shot, idx) => {
      const duration = Math.min(maxDuration, Math.max(0.5, shot.timing.duration));
      return {
        ...shot,
        id: `shot-${idx + 1}`,
        timing: {
          ...shot.timing,
          duration,
        },
      };
    })
    .filter((shot) => shot.timing.duration >= 0.5);

  let cursor = 0;
  for (let i = 0; i < corrected.length; i++) {
    corrected[i].timing.startTime = cursor;
    cursor += corrected[i].timing.duration;

    if (ctx.syncToBeat) {
      corrected[i].beatLock = {
        beatIndex: findNearestBeatIndex(corrected[i].timing.startTime, ctx.beatGrid),
        lockMode: corrected[i].beatLock?.lockMode ?? "start",
      };
    }
  }

  const delta = ctx.targetDuration - cursor;
  if (Math.abs(delta) > 0.001) {
    const last = corrected[corrected.length - 1];
    if (last) {
      const maxLast = intent.style.pacing === "slow" ? 8 : 6;
      const nextDuration = Math.max(0.5, Math.min(maxLast, last.timing.duration + delta));
      last.timing.duration = nextDuration;
      last.source.outPoint = last.source.inPoint + nextDuration;
    }
  }

  cursor = 0;
  for (let i = 0; i < corrected.length; i++) {
    corrected[i].timing.startTime = cursor;
    cursor += corrected[i].timing.duration;
  }

  enforceEffectBudget(corrected);
  enforceTransitionBudget(corrected, intent);

  return corrected;
}

function buildSegmentNodes(
  analysis: AnalysisResult,
  intent: SimplifiedIntent
): SegmentNode[] {
  const nodes: SegmentNode[] = [];

  for (const clip of analysis.footage) {
    const preferred = clip.segments.filter((segment) => segment.scores.overall > 0.6);
    const candidates =
      preferred.length > 0
        ? preferred
        : [...clip.segments]
            .sort((a, b) => b.scores.overall - a.scores.overall)
            .slice(0, 3);

    for (let i = 0; i < candidates.length; i++) {
      const seg = candidates[i];
      nodes.push({
        id: `${clip.clipId}:${seg.start.toFixed(2)}:${seg.end.toFixed(2)}:${i}`,
        clipId: clip.clipId,
        segment: seg,
        adjustedScore: scoreSegmentForIntent(seg, intent),
        usedCount: 0,
      });
    }
  }

  nodes.sort((a, b) => b.adjustedScore - a.adjustedScore);
  return nodes;
}

function selectBestNode(
  nodes: SegmentNode[],
  previousNode: SegmentNode | null,
  intent: SimplifiedIntent,
  targetEnergy: number,
  shotIndex: number
): SegmentNode | null {
  let best: SegmentNode | null = null;
  let bestScore = -Infinity;

  for (const node of nodes) {
    const quality = node.adjustedScore;
    const emotionFit = 1 - Math.abs(node.segment.scores.emotion - targetEnergy);
    const motionTarget = intent.style.pacing === "slow" ? 0.35 : 0.75;
    const motionFit = 1 - Math.abs(node.segment.scores.motion - motionTarget);

    let transitionScore = 0;
    if (previousNode) {
      transitionScore += previousNode.clipId === node.clipId ? -0.18 : 0.06;
      transitionScore += previousNode.segment.tags.some((tag) => node.segment.tags.includes(tag))
        ? 0.05
        : 0;
    }

    const noveltyPenalty = node.usedCount * 0.09;
    const deterministicJitter = seededNoise(`${node.id}:${shotIndex}`) * 0.025;

    const score =
      quality * 0.45 +
      emotionFit * 0.22 +
      motionFit * 0.17 +
      transitionScore -
      noveltyPenalty +
      deterministicJitter;

    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
}

function selectInPoint(
  node: SegmentNode,
  duration: number,
  clipCursor: Map<string, number>,
  shotIndex: number
): number {
  const segment = node.segment;
  const minStart = segment.start;
  const maxStart = Math.max(segment.start, segment.end - duration);
  const currentCursor = clipCursor.get(node.clipId) ?? minStart;

  const nudged = clamp(currentCursor, minStart, maxStart);
  const jitter = seededNoise(`${node.id}:in:${shotIndex}`) * 0.15;
  const start = clamp(nudged + jitter, minStart, maxStart);

  clipCursor.set(node.clipId, clamp(start + duration * 0.65, minStart, maxStart));
  return start;
}

function getTargetShotDuration(
  intent: SimplifiedIntent,
  ctx: PlanContext,
  targetEnergy: number,
  shotIndex: number
): number {
  const variance = (seededNoise(`${intent.goal.primary}:${shotIndex}`) - 0.5) * 0.6;
  const energyModifier = 1 + (0.55 - targetEnergy) * 0.9;
  let duration = ctx.pacingRules.avgShotDuration * (1 + variance) * energyModifier;

  if (ctx.syncToBeat) {
    const beatsPerCut = Math.max(1, Math.round((duration * ctx.bpm) / 60));
    duration = (beatsPerCut * 60) / Math.max(1, ctx.bpm);
  }

  return clamp(duration, ctx.pacingRules.minDuration, ctx.pacingRules.maxDuration);
}

function getTargetEnergy(intent: SimplifiedIntent, progress: number): number {
  const curve = intent.structure.energyCurve;
  if (!curve || curve.length === 0) {
    return intent.style.pacing === "slow" ? 0.35 : 0.7;
  }
  const idx = Math.floor(progress * (curve.length - 1));
  return clamp(curve[idx], 0, 1);
}

function maybeAddEffect(
  node: SegmentNode,
  intent: SimplifiedIntent,
  targetEnergy: number,
  shotIndex: number,
  totalShots: number
): Shot["effects"] {
  const effectBudgetRatio = shotIndex / Math.max(1, totalShots);
  if (effectBudgetRatio > 0.28) return undefined;
  if (node.segment.scores.emotion < 0.72 && targetEnergy < 0.7) return undefined;
  if (intent.technical.effectsIntensity < 0.2) return undefined;

  if (targetEnergy > 0.82) {
    return [{ type: "shake", intensity: clamp(intent.technical.effectsIntensity, 0.25, 0.75) }];
  }

  return [{ type: "glow", intensity: clamp(intent.technical.effectsIntensity * 0.85, 0.2, 0.65) }];
}

function chooseTransition(
  intent: SimplifiedIntent,
  targetEnergy: number,
  shotIndex: number,
  totalShots: number
): "cut" | "crossfade" {
  const isFinalPhase = shotIndex > totalShots * 0.82;
  const allowSmooth = intent.style.pacing === "slow" || intent.technical.transitionStyle === "smooth";
  if (allowSmooth && (targetEnergy < 0.45 || isFinalPhase) && shotIndex % 7 === 0) {
    return "crossfade";
  }
  return "cut";
}

function buildShotRationale(node: SegmentNode, targetEnergy: number, shotIndex: number): string {
  const mode = targetEnergy > 0.75
    ? "the track's peak energy"
    : targetEnergy < 0.4
      ? "a breathing pocket"
      : "the groove";

  if (shotIndex === 0) {
    return `Open with ${node.segment.description.toLowerCase()} to establish tone before momentum ramps.`;
  }

  return `Use ${node.segment.description.toLowerCase()} to match ${mode} while keeping the visual story progressing.`;
}

function enforceEffectBudget(shots: Shot[]): void {
  const maxEffectShots = Math.floor(shots.length * 0.3);
  let count = 0;
  for (let i = 0; i < shots.length; i++) {
    const effects = shots[i].effects;
    if (!effects || effects.length === 0) continue;
    if (count >= maxEffectShots) {
      shots[i].effects = undefined;
      continue;
    }
    shots[i].effects = [effects[0]];
    count += 1;
  }
}

function enforceTransitionBudget(shots: Shot[], intent: SimplifiedIntent): void {
  let nonCut = 0;
  const maxNonCut = Math.max(0, Math.floor(shots.length * 0.2));
  for (const shot of shots) {
    if (!shot.transition) {
      shot.transition = { type: "cut", duration: 0 };
      continue;
    }
    if (shot.transition.type !== "cut") {
      nonCut += 1;
      if (nonCut > maxNonCut || intent.style.pacing === "aggressive") {
        shot.transition = { type: "cut", duration: 0 };
      }
    }
  }
}

function scoreSegmentForIntent(segment: ScoredSegment, intent: SimplifiedIntent): number {
  let score = segment.scores.overall;

  if (intent.style.pacing === "aggressive" || intent.style.pacing === "fast") {
    score += segment.scores.motion * 0.2;
  }

  if (intent.style.mood.some((m) => ["emotional", "melancholic", "intense", "dramatic"].includes(m))) {
    score += segment.scores.emotion * 0.2;
  }

  const focusOn = intent.contentPreferences.focusOn || [];
  if (focusOn.some((f) => ["face_closeups", "closeup", "faces"].includes(f)) && segment.faceDetected) {
    score += 0.15;
  }

  if (focusOn.some((f) => ["action_scenes", "action", "impact"].includes(f)) && segment.scores.motion > 0.8) {
    score += 0.15;
  }

  return clamp(score, 0, 1);
}

function getPacingRules(pacing: string): PacingRules {
  switch (pacing) {
    case "aggressive":
      return { avgShotDuration: 1.8, minDuration: 1.0, maxDuration: 3.0 };
    case "fast":
      return { avgShotDuration: 2.5, minDuration: 1.5, maxDuration: 4.0 };
    case "medium":
      return { avgShotDuration: 3.5, minDuration: 2.0, maxDuration: 5.0 };
    case "slow":
      return { avgShotDuration: 5.0, minDuration: 3.0, maxDuration: 8.0 };
    default:
      return { avgShotDuration: 3.0, minDuration: 1.5, maxDuration: 4.5 };
  }
}

function findNearestBeatIndex(time: number, beatGrid: number[]): number {
  if (beatGrid.length === 0) return 0;

  let closest = 0;
  let minDiff = Infinity;

  for (let i = 0; i < beatGrid.length; i++) {
    const diff = Math.abs(beatGrid[i] - time);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }

  return closest;
}

function seededNoise(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getGlobalEffects(genre: string): MonetEDL["globalEffects"] {
  switch (genre) {
    case "anime_amv":
      return { colorGrade: "anime", vignette: 0.3 };
    case "sports_highlight":
      return { colorGrade: "vibrant", vignette: 0.2 };
    case "wedding":
      return { colorGrade: "cinematic", vignette: 0.4, grain: 0.1 };
    case "cinematic_trailer":
      return { colorGrade: "cinematic", vignette: 0.5, grain: 0.15 };
    case "music_video":
      return { colorGrade: "vibrant", vignette: 0.2 };
    default:
      return { colorGrade: "raw" };
  }
}
