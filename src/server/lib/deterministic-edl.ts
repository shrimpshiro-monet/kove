// Deterministic EDL Generator
// FALLBACK when Gemini fails - pure algorithm, no LLM dependency
// Algorithm-first, LLM-enhanced philosophy

import type { MonetEDL, Shot } from "../types/edl";
import type { IntentExtractionResult, SimplifiedIntent } from "../types/intent";
import type { AnalysisResult, ScoredSegment } from "../types/analysis";

/**
 * Generate EDL using pure algorithm (no LLM)
 *
 * This is the FALLBACK when Gemini fails.
 * Uses deterministic rules based on intent + analysis.
 *
 * Philosophy:
 * - Always returns valid EDL (never fails)
 * - Good enough quality for MVP
 * - LLM enhancement is optional, not required
 */
export function generateDeterministicEDL(
  intent: IntentExtractionResult | SimplifiedIntent,
  analysis: AnalysisResult,
  metadata: {
    intentId: string;
    analysisId: string;
    projectId: string;
  }
): MonetEDL {
  // Extract intent data
  const intentData = "intent" in intent ? intent.intent : intent;

  // Target duration from intent
  const targetDuration = intentData.structure.duration;

  // Pacing rules
  const pacingRules = getPacingRules(intentData.style.pacing);

  // Get beat grid if music available
  const beatGrid = analysis.music?.beatGrid || [];
  const bpm = analysis.music?.bpm || 120;

  // Collect all high-quality segments from footage
  const allSegments = collectSegments(analysis, intentData);

  // Generate shots aligned to beats (or evenly spaced if no music)
  const shots = generateShots(
    allSegments,
    beatGrid,
    targetDuration,
    pacingRules,
    intentData
  );

  // Build EDL
  const edl: MonetEDL = {
    version: "1.0.0",
    metadata: {
      title: `Deterministic Edit`,
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
  };

  // Add music if provided
  if (analysis.music) {
    edl.music = {
      sourceId: analysis.music.musicId,
      bpm: analysis.music.bpm,
      beatGrid: analysis.music.beatGrid,
      volume: 0.8,
      fadeIn: 0.5,
    };
  }

  // Add global effects based on genre
  edl.globalEffects = getGlobalEffects(intentData.style.genre);

  return edl;
}

/**
 * Get pacing rules based on intent
 */
function getPacingRules(pacing: string): {
  avgShotDuration: number;
  minDuration: number;
  maxDuration: number;
} {
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
      return { avgShotDuration: 2.5, minDuration: 1.5, maxDuration: 4.0 };
  }
}

/**
 * Collect high-scoring segments from all footage
 */
function collectSegments(
  analysis: AnalysisResult,
  intent: SimplifiedIntent
): Array<ScoredSegment & { clipId: string }> {
  const segments: Array<ScoredSegment & { clipId: string }> = [];

  for (const clip of analysis.footage) {
    // Only use segments with overall score > 0.6
    const goodSegments = clip.segments.filter((s) => s.scores.overall > 0.6);

    // Prefer segments matching intent preferences
    const scored = goodSegments.map((seg) => ({
      ...seg,
      clipId: clip.clipId,
      adjustedScore: scoreSegmentForIntent(seg, intent),
    }));

    segments.push(...scored);
  }

  // Sort by adjusted score (best first)
  segments.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return segments;
}

/**
 * Score segment based on how well it matches intent
 */
function scoreSegmentForIntent(
  segment: ScoredSegment,
  intent: SimplifiedIntent
): number {
  let score = segment.scores.overall;

  // Boost for motion if aggressive pacing
  if (intent.style.pacing === "aggressive" || intent.style.pacing === "fast") {
    score += segment.scores.motion * 0.2;
  }

  // Boost for emotion if emotional mood
  if (intent.style.mood.some((m) => ["emotional", "intense", "dramatic"].includes(m))) {
    score += segment.scores.emotion * 0.2;
  }

  // Boost for face closeups if preferred
  if (intent.contentPreferences.focusOn?.includes("closeup") && segment.faceDetected) {
    score += 0.15;
  }

  // Boost for action if preferred
  if (intent.contentPreferences.focusOn?.includes("action") && segment.scores.motion > 0.8) {
    score += 0.15;
  }

  return Math.min(score, 1.0);
}

/**
 * Generate shots from segments
 */
function generateShots(
  segments: Array<ScoredSegment & { clipId: string }>,
  beatGrid: number[],
  targetDuration: number,
  pacingRules: { avgShotDuration: number; minDuration: number; maxDuration: number },
  intent: SimplifiedIntent
): Shot[] {
  const shots: Shot[] = [];
  let currentTime = 0;
  let segmentIndex = 0;

  // If no beats, use evenly spaced cuts
  const useBeats = beatGrid.length > 0 && intent.technical.syncToBeat;

  while (currentTime < targetDuration && segmentIndex < segments.length) {
    const segment = segments[segmentIndex % segments.length];

    // Determine shot duration
    let shotDuration: number;

    if (useBeats) {
      // Align to beats - find next beat that gives reasonable duration
      const currentBeatIndex = findNearestBeatIndex(currentTime, beatGrid);
      const beatsToUse = Math.max(2, Math.round(pacingRules.avgShotDuration / (60 / (analysis.music?.bpm || 120))));
      const nextBeatTime = beatGrid[currentBeatIndex + beatsToUse] || currentTime + pacingRules.avgShotDuration;
      shotDuration = Math.min(
        Math.max(nextBeatTime - currentTime, pacingRules.minDuration),
        pacingRules.maxDuration
      );
    } else {
      // Add variance: ±30% of avg duration
      const variance = (Math.random() - 0.5) * 0.6;
      shotDuration = pacingRules.avgShotDuration * (1 + variance);
      shotDuration = Math.min(Math.max(shotDuration, pacingRules.minDuration), pacingRules.maxDuration);
    }

    // Don't exceed target duration
    if (currentTime + shotDuration > targetDuration) {
      shotDuration = targetDuration - currentTime;
      if (shotDuration < pacingRules.minDuration) break;
    }

    // Create shot
    const shot: Shot = {
      id: `shot-${shots.length + 1}`,
      source: {
        clipId: segment.clipId,
        inPoint: segment.start,
        outPoint: Math.min(segment.start + shotDuration, segment.end),
      },
      timing: {
        startTime: currentTime,
        duration: shotDuration,
      },
      transition: {
        type: "cut",
        duration: 0,
      },
      aiRationale: `Deterministic: ${segment.description} (score: ${segment.scores.overall.toFixed(2)})`,
    };

    // Add beat lock if using beats
    if (useBeats) {
      const beatIndex = findNearestBeatIndex(currentTime, beatGrid);
      shot.beatLock = {
        beatIndex,
        lockMode: "start",
      };
    }

    // Add effects for high-emotion segments
    if (segment.scores.emotion > 0.8) {
      shot.effects = [{ type: "glow", intensity: 0.5 }];
    }

    shots.push(shot);
    currentTime += shotDuration;
    segmentIndex++;
  }

  return shots;
}

/**
 * Find nearest beat index to given time
 */
function findNearestBeatIndex(time: number, beatGrid: number[]): number {
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

/**
 * Get global effects based on genre
 */
function getGlobalEffects(genre: string): MonetEDL["globalEffects"] {
  switch (genre) {
    case "anime_amv":
      return { colorGrade: "anime", vignette: 0.3 };
    case "sports_highlight":
      return { colorGrade: "vibrant", vignette: 0.2 };
    case "wedding":
      return { colorGrade: "cinematic", vignette: 0.4 };
    case "cinematic_trailer":
      return { colorGrade: "cinematic", vignette: 0.5, grain: 0.15 };
    default:
      return { colorGrade: "raw" };
  }
}
