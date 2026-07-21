/**
 * Cut-Point Detector — finds the BEST places to cut in footage.
 *
 * Combines:
 * - Speech pauses (natural breath points)
 * - Beat grid (music rhythm)
 * - Scene changes (visual transitions)
 * - Semantic labels (content type transitions)
 *
 * Each cut point gets a score — higher = better place to cut.
 */
import type { SpeechPause } from "./transcription";
import type { SemanticSegment } from "./semantic-labeler";

// ── Types ───────────────────────────────────────────────────────────────────

export type CutReason =
  | "speech_pause"           // natural pause in speech
  | "sentence_end"           // end of a sentence
  | "beat_aligned"           // aligned to music beat
  | "scene_change"           // visual scene transition
  | "semantic_transition"    // content type changes (speech → action)
  | "energy_peak"            // high energy moment
  | "energy_valley";         // low energy moment (breathing room)

export interface CutPoint {
  time: number;
  score: number;           // 0-1, higher = better place to cut
  reason: CutReason;
  description: string;
}

// ── Detector ────────────────────────────────────────────────────────────────

/**
 * Detect all potential cut points in footage.
 *
 * @param params.speechPauses - Natural pauses from transcription
 * @param params.beatGrid - Music beat timestamps
 * @param params.sceneChanges - Scene change timestamps from FFmpeg
 * @param params.segments - Semantic segments
 * @param params.energyCurve - Energy values over time
 * @param params.duration - Total video duration
 */
export function detectCutPoints(params: {
  speechPauses: SpeechPause[];
  beatGrid: number[];
  sceneChanges: Array<{ time: number; score: number }>;
  segments: SemanticSegment[];
  energyCurve: number[];
  duration: number;
}): CutPoint[] {
  const { speechPauses, beatGrid, sceneChanges, segments, energyCurve, duration } = params;
  const allPoints: CutPoint[] = [];

  // 1. Speech pauses — natural places to cut
  for (const pause of speechPauses) {
    let score = 0.5;
    let reason: CutReason = "speech_pause";
    let description = "Pause in speech";

    if (pause.isSentenceEnd) {
      score = 0.8;
      reason = "sentence_end";
      description = "End of sentence — natural break";
    } else if (pause.isBreath) {
      score = 0.65;
      description = "Breath pause — comfortable cut point";
    }

    // Longer pauses are better cut points
    score += Math.min(0.2, pause.duration * 0.2);

    allPoints.push({ time: pause.time, score, reason, description });
  }

  // 2. Beat grid — music rhythm cut points
  for (const beatTime of beatGrid) {
    // Check if this beat is near a speech pause (double score)
    const nearSpeechPause = speechPauses.some(
      (p) => Math.abs(p.time - beatTime) < 0.15,
    );

    const score = nearSpeechPause ? 0.85 : 0.55;
    const description = nearSpeechPause
      ? "Beat + speech pause (optimal)"
      : "Music beat";

    allPoints.push({
      time: beatTime,
      score,
      reason: nearSpeechPause ? "beat_aligned" : "beat_aligned",
      description,
    });
  }

  // 3. Scene changes — visual transitions
  for (const scene of sceneChanges) {
    allPoints.push({
      time: scene.time,
      score: 0.6 + scene.score * 0.3, // stronger scene change = higher score
      reason: "scene_change",
      description: `Visual scene change (strength=${(scene.score * 100).toFixed(0)}%)`,
    });
  }

  // 4. Semantic transitions — content type changes
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];

    if (prev.label !== curr.label) {
      const time = curr.start;
      const isGoodTransition =
        (prev.label === "speech" && curr.label === "action") ||
        (prev.label === "action" && curr.label === "beauty") ||
        (prev.label === "speech" && curr.label === "beauty");

      allPoints.push({
        time,
        score: isGoodTransition ? 0.7 : 0.45,
        reason: "semantic_transition",
        description: `Transition: ${prev.label} → ${curr.label}`,
      });
    }
  }

  // 5. Energy peaks and valleys
  if (energyCurve.length > 0) {
    const bucketDuration = duration / energyCurve.length;
    for (let i = 1; i < energyCurve.length - 1; i++) {
      const prev = energyCurve[i - 1];
      const curr = energyCurve[i];
      const next = energyCurve[i + 1];

      // Peak: higher than neighbors
      if (curr > prev && curr > next && curr > 0.6) {
        allPoints.push({
          time: i * bucketDuration + bucketDuration / 2,
          score: 0.5 + curr * 0.3,
          reason: "energy_peak",
          description: `Energy peak (${(curr * 100).toFixed(0)}%)`,
        });
      }

      // Valley: lower than neighbors (breathing room)
      if (curr < prev && curr < next && curr < 0.3) {
        allPoints.push({
          time: i * bucketDuration + bucketDuration / 2,
          score: 0.4,
          reason: "energy_valley",
          description: `Breathing room (${(curr * 100).toFixed(0)}%)`,
        });
      }
    }
  }

  // Deduplicate close cut points (within 0.1s)
  const deduped = deduplicateCutPoints(allPoints, 0.1);

  // Sort by score (best first)
  deduped.sort((a, b) => b.score - a.score);

  return deduped;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function deduplicateCutPoints(points: CutPoint[], minGap: number): CutPoint[] {
  // Sort by time first
  const sorted = [...points].sort((a, b) => a.time - b.time);

  const result: CutPoint[] = [];
  for (const point of sorted) {
    const lastKept = result[result.length - 1];
    if (!lastKept || point.time - lastKept.time >= minGap) {
      result.push(point);
    } else if (point.score > lastKept.score) {
      // Replace with higher-scored point
      result[result.length - 1] = point;
    }
  }

  return result;
}

/**
 * Filter cut points to only the best N locations.
 */
export function selectBestCutPoints(
  cutPoints: CutPoint[],
  maxPoints: number,
): CutPoint[] {
  return cutPoints.slice(0, maxPoints);
}

/**
 * Find the best cut point near a given time.
 */
export function findBestCutPointNear(
  cutPoints: CutPoint[],
  targetTime: number,
  maxOffset = 1.0,
): CutPoint | null {
  let best: CutPoint | null = null;
  let bestScore = -1;

  for (const cp of cutPoints) {
    const dist = Math.abs(cp.time - targetTime);
    if (dist <= maxOffset && cp.score > bestScore) {
      bestScore = cp.score;
      best = cp;
    }
  }

  return best;
}

/**
 * Find the best cut point within a time range.
 */
export function findBestCutPointInRange(
  cutPoints: CutPoint[],
  startTime: number,
  endTime: number,
): CutPoint | null {
  let best: CutPoint | null = null;
  let bestScore = -1;

  for (const cp of cutPoints) {
    if (cp.time >= startTime && cp.time <= endTime && cp.score > bestScore) {
      bestScore = cp.score;
      best = cp;
    }
  }

  return best;
}
