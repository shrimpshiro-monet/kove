import type { MonetEDL } from "../types/edl";
import type { AnalysisResult } from "../types/analysis";
import type { IntentExtractionResult } from "../types/intent";

export interface RhythmMap {
  bpm: number;
  beats: number[];
  downbeats: number[];
  onsets: { time: number; strength: number; band: string }[];
  drop_candidates: number[];
  source: string;
  duration: number;
  beat_sync_available: boolean;
}

// ============================================================================
// LEGACY SCORE (existing endpoints — keeps backward compat)
// ============================================================================

export function scoreEDL(
  edl: MonetEDL,
  _analysis: AnalysisResult,
  intent: IntentExtractionResult
): { beatSyncScore: number; pacingVariance: number; overallConfidence: number } {
  let beatSyncScore = 1.0;
  if (edl.music && Array.isArray(edl.music.beatGrid) && edl.music.beatGrid.length > 0) {
    beatSyncScore = calculateBeatSyncScore(edl, edl.music.beatGrid);
  }

  const pacingVariance = calculatePacingVariance(edl);
  const overallConfidence = beatSyncScore * 0.5 + pacingVariance * 0.3 + intent.confidence * 0.2;

  return {
    beatSyncScore: Math.round(beatSyncScore * 100) / 100,
    pacingVariance: Math.round(pacingVariance * 100) / 100,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };
}

// ============================================================================
// NEW PIPELINE SCORE (two-pass pipeline — simpler, no intent object needed)
// ============================================================================

interface NewPipelineEDL {
  shots: Array<{
    timing: { startTime: number; duration: number };
    effects: unknown[];
    beatLock?: unknown;
  }>;
  music?: { beatGrid?: number[]; bpm?: number };
}

interface NewPipelineMusic {
  onsets?: number[];
  beatGrid?: number[];
  duration?: number;
}

export interface EDLScores {
  beatSyncScore: number;
  pacingVariance: number;
  effectDensity: number;
  overallConfidence: number;
}

export function scoreNewPipelineEDL(
  edl: NewPipelineEDL,
  music: NewPipelineMusic
): EDLScores {
  const onsets =
    "onsets" in music && Array.isArray((music as any).onsets)
      ? (music as any).onsets
      : music.beatGrid ?? [];

  // Beat sync: % of shot starts within 80ms of an onset
  let snapped = 0;
  for (const shot of edl.shots) {
    const t = shot.timing.startTime;
    const nearest = onsets.reduce(
      (best: number, o: number) =>
        Math.abs(o - t) < Math.abs(best - t) ? o : best,
      onsets[0] ?? 0
    );
    if (Math.abs(nearest - t) <= 0.08) snapped++;
  }
  const beatSyncScore =
    edl.shots.length > 0 ? snapped / edl.shots.length : 0;

  // Pacing variance: stddev of shot durations (normalized)
  const durations = edl.shots.map((s) => s.timing.duration);
  const mean =
    durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);
  const variance =
    durations.reduce((a, d) => a + (d - mean) ** 2, 0) /
    Math.max(1, durations.length);
  const pacingVariance = Math.min(
    1,
    Math.sqrt(variance) / Math.max(0.5, mean)
  );

  // Effect density: avg effects per shot, normalized
  const totalEffects = edl.shots.reduce(
    (a, s) => a + (Array.isArray(s.effects) ? s.effects.length : 0),
    0
  );
  const effectDensity = Math.min(
    1,
    totalEffects / Math.max(1, edl.shots.length * 2)
  );

  const overallConfidence =
    0.5 * beatSyncScore + 0.25 * pacingVariance + 0.25 * effectDensity;

  return {
    beatSyncScore: round(beatSyncScore),
    pacingVariance: round(pacingVariance),
    effectDensity: round(effectDensity),
    overallConfidence: round(overallConfidence),
  };
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function calculateBeatSyncScore(edl: MonetEDL, beatGrid: number[]): number {
  if (!edl.shots.length || !beatGrid.length) return 1.0;

  let hits = 0;
  const threshold = 0.05;

  for (const shot of edl.shots) {
    if (!shot.beatLock) continue;
    const beatTime = beatGrid[shot.beatLock.beatIndex];
    if (!beatTime) continue;
    const offset = Math.abs(shot.timing.startTime - beatTime);
    if (offset < threshold) hits++;
  }

  const beatLockedShots = edl.shots.filter((s) => s.beatLock).length;
  if (beatLockedShots === 0) return 0;
  return hits / beatLockedShots;
}

export function ensureBeatLocksForMusic(
  edl: MonetEDL,
  rhythm?: RhythmMap,
  opts: { maxDriftMs?: number; strict?: boolean } = {},
): MonetEDL {
  if (!rhythm || rhythm.beat_sync_available === false) return edl;

  const maxDrift = (opts.maxDriftMs ?? 70) / 1000;
  const beats = rhythm.beats ?? [];
  const downbeats = rhythm.downbeats ?? [];
  const strongOnsets = (rhythm.onsets ?? [])
    .filter((o) => o.strength >= 0.4)
    .map((o) => o.time)
    .sort((a, b) => a - b);

  if (beats.length === 0 && strongOnsets.length === 0) return edl;

  const nearest = (t: number, grid: number[]): number | null => {
    if (grid.length === 0) return null;
    let best = grid[0];
    let bestD = Math.abs(grid[0] - t);
    for (const g of grid) {
      const d = Math.abs(g - t);
      if (d < bestD) {
        best = g;
        bestD = d;
      }
    }
    return bestD <= maxDrift ? best : null;
  };

  for (const shot of edl.shots) {
    const start = shot.timing.startTime;
    const isSectionStart =
      shot.isHero === true ||
      shot.sectionRole === "hook" ||
      shot.sectionRole === "setup";

    const grid =
      isSectionStart && downbeats.length > 0
        ? downbeats
        : strongOnsets.length > 0
          ? strongOnsets
          : beats;

    const snap = nearest(start, grid);
    if (snap !== null) {
      const delta = snap - start;
      shot.timing.startTime = snap;
      if (opts.strict) {
        shot.timing.duration = Math.max(0.12, shot.timing.duration - delta);
      }
      shot.timing.beatLocked = true;
    } else {
      shot.timing.beatLocked = false;
    }
  }

  // Re-sort by start time in case snapping reordered anything slightly
  edl.shots.sort((a, b) => a.timing.startTime - b.timing.startTime);
  return edl;
}

function calculatePacingVariance(edl: MonetEDL): number {
  if (edl.shots.length < 2) return 0.5;

  const durations = edl.shots.map((s) => s.timing.duration);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  if (mean === 0) return 0;

  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
    durations.length;
  const stdDev = Math.sqrt(variance);
  return Math.min(stdDev / mean / 0.5, 1.0);
}
