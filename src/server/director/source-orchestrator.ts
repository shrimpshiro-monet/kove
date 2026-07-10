import type { ReferenceStyle } from "../types/reference-style";

export interface SourcePlan {
  clipId: string;
  segmentIndex: number;
  startTime: number;
  duration: number;
  motionDir: string;
  semanticTags: string[];
  faceCentered: boolean;
  hasVelocityRamp: boolean;
  score: number;
}

interface CandidateSegment {
  clipId: string;
  segmentIndex: number;
  start: number;
  end: number;
  duration: number;
  score: number;
  motionDir: string;
  semanticTags: string[];
  faceCentered: boolean;
  hasVelocityRamp: boolean;
}

/**
 * Calculate max shots per clip. Strict 40% cap when multiple clips exist.
 * Relaxed when only 1 clip available (must fill all shots from it).
 */
function getMaxPerClip(shotCount: number, clipCount: number): number {
  if (clipCount <= 1) return shotCount;
  return Math.max(1, Math.floor(shotCount * 0.4));
}

/**
 * Build a source plan — which clip segment goes in each shot slot.
 * Deterministic: no Math.random. Uses score ranking + position-based diversity.
 */
export function buildSourcePlan(
  analysis: { footage: Array<{ clipId: string; duration: number; segments: any[] }> },
  _referenceStyle: ReferenceStyle,
  shotCount: number,
): SourcePlan[] {
  const allSegments: CandidateSegment[] = [];
  for (const clip of analysis.footage ?? []) {
    for (let i = 0; i < (clip.segments?.length ?? 0); i++) {
      const seg = clip.segments[i];
      if (!seg || seg.duration <= 0) continue;
      allSegments.push({
        clipId: clip.clipId,
        segmentIndex: i,
        start: seg.start ?? 0,
        end: seg.end ?? seg.start + seg.duration,
        duration: seg.duration,
        score: seg.scores?.overall ?? 0.5,
        motionDir: seg.motionDir ?? "none",
        semanticTags: seg.semantic ?? seg.tags ?? [],
        faceCentered: seg.faceCentered ?? false,
        hasVelocityRamp: seg.hasVelocityRamp ?? false,
      });
    }
  }

  if (allSegments.length === 0) return [];

  const clipCount = new Set(allSegments.map(s => s.clipId)).size;
  const maxPerClip = getMaxPerClip(shotCount, clipCount);
  const clipUsage: Record<string, number> = {};
  const recentKeys: string[] = [];
  const windowSize = 3;
  const plan: SourcePlan[] = [];

  // Pre-sort by score (deterministic)
  const sorted = [...allSegments].sort((a, b) => b.score - a.score || a.segmentIndex - b.segmentIndex);

  for (let slot = 0; slot < shotCount; slot++) {
    let bestCandidate: CandidateSegment | null = null;
    let bestScore = -Infinity;

    for (const cand of sorted) {
      if ((clipUsage[cand.clipId] ?? 0) >= maxPerClip) continue;

      const key = `${cand.clipId}:${cand.segmentIndex}`;
      if (recentKeys.slice(-windowSize).includes(key)) continue;

      let candidateScore = cand.score * 10;

      // Motion continuity bonus (deterministic based on last picked)
      if (recentKeys.length > 0) {
        const lastKey = recentKeys[recentKeys.length - 1];
        const lastSeg = allSegments.find(s => `${s.clipId}:${s.segmentIndex}` === lastKey);
        if (lastSeg && (lastSeg.motionDir === cand.motionDir || lastSeg.motionDir === "none" || cand.motionDir === "none")) {
          candidateScore += 2;
        }
      }

      if (cand.faceCentered) candidateScore += 1;
      if (cand.hasVelocityRamp && slot >= shotCount * 0.5) candidateScore += 1.5;

      // Variety penalty for same semantic tags
      if (plan.length > 0) {
        const prevTags = plan[plan.length - 1].semanticTags.join(",");
        const currTags = cand.semanticTags.join(",");
        if (prevTags === currTags && currTags !== "") candidateScore -= 1;
      }

      // Deterministic tiebreaker: prefer lower segment index
      if (candidateScore === bestScore && bestCandidate) {
        if (cand.segmentIndex < bestCandidate.segmentIndex) {
          bestScore = candidateScore;
          bestCandidate = cand;
        }
        continue;
      }

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestCandidate = cand;
      }
    }

    // Fallback: relax constraints if strict allocation is impossible
    if (!bestCandidate) {
      for (const cand of sorted) {
        const key = `${cand.clipId}:${cand.segmentIndex}`;
        if (recentKeys.slice(-windowSize).includes(key)) continue;
        bestCandidate = cand;
        break;
      }
    }

    if (bestCandidate) {
      clipUsage[bestCandidate.clipId] = (clipUsage[bestCandidate.clipId] ?? 0) + 1;
      recentKeys.push(`${bestCandidate.clipId}:${bestCandidate.segmentIndex}`);
      plan.push({
        clipId: bestCandidate.clipId,
        segmentIndex: bestCandidate.segmentIndex,
        startTime: bestCandidate.start,
        duration: bestCandidate.duration,
        motionDir: bestCandidate.motionDir,
        semanticTags: bestCandidate.semanticTags,
        faceCentered: bestCandidate.faceCentered,
        hasVelocityRamp: bestCandidate.hasVelocityRamp,
        score: bestCandidate.score,
      });
    }
  }

  return plan;
}
