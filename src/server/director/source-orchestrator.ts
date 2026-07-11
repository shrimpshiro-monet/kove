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

interface SubjectTrack {
  trackId: string;
  className: string;
  avgCenter: { x: number; y: number };
  motionPath: string;
  confidence: number;
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
 * Score how well a candidate segment matches the reference's subject positioning.
 * Returns 0-3 bonus points.
 */
function scoreSubjectMatch(
  cand: CandidateSegment,
  subjectTracks: SubjectTrack[],
  slotProgress: number,
): number {
  if (subjectTracks.length === 0) return 0;

  let bonus = 0;

  for (const track of subjectTracks) {
    // Check if this track is active at this normalized timeline position
    const trackActive = slotProgress >= 0 && slotProgress <= 1;
    if (!trackActive) continue;

    // Hero subject match: if reference has a centered subject, prefer faceCentered segments
    if (track.className === "person" && track.avgCenter.x > 0.3 && track.avgCenter.x < 0.7) {
      if (cand.faceCentered) bonus += 1.5;
    }

    // Motion path match: if reference subject moves left-to-right, prefer segments with same motion
    if (track.motionPath === "left_to_right" && cand.motionDir === "right") bonus += 1;
    if (track.motionPath === "right_to_left" && cand.motionDir === "left") bonus += 1;
    if (track.motionPath === "static" && cand.motionDir === "none") bonus += 0.5;
  }

  return Math.min(3, bonus);
}

/**
 * Score how well a candidate segment matches the reference's silence/motion profile.
 * Returns 0-2 bonus points.
 */
function scoreSilenceMotionMatch(
  cand: CandidateSegment,
  silenceAnalysis: any,
  motionAnalysis: any,
): number {
  let bonus = 0;

  // If reference has silence analysis, prefer segments that are NOT silent
  if (silenceAnalysis?.silenceRatio > 0.3) {
    // Reference has significant silence — our segments should have speech/activity
    // Since we can't know if a specific segment is silent without analyzing it,
    // we give a small bonus to segments with higher motion (proxy for activity)
    if (cand.score > 0.7) bonus += 0.5;
  }

  // If reference has motion analysis, match motion levels
  if (motionAnalysis?.segments?.length > 0) {
    const avgRefMotion = motionAnalysis.avgMotion ?? 0.5;
    // High-motion reference → prefer high-motion segments
    if (avgRefMotion > 0.3 && cand.score > 0.7) bonus += 1;
    // Low-motion reference → any segment is fine (no penalty)
  }

  return Math.min(2, bonus);
}

/**
 * Build a source plan — which clip segment goes in each shot slot.
 * Deterministic: no Math.random. Uses score ranking + position-based diversity.
 * Subject-track-aware: prefers segments matching reference subject positioning.
 */
export function buildSourcePlan(
  analysis: { footage: Array<{ clipId: string; duration: number; segments: any[] }> },
  referenceStyle: ReferenceStyle,
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

  // Extract subject tracks, silence analysis, and motion analysis from reference style
  const subjectTracks: SubjectTrack[] = (referenceStyle as any).subjectTracks ?? [];
  const silenceAnalysis = (referenceStyle as any).silenceAnalysis ?? null;
  const motionAnalysis = (referenceStyle as any).motionAnalysis ?? null;

  // Pre-sort by score (deterministic)
  const sorted = [...allSegments].sort((a, b) => b.score - a.score || a.segmentIndex - b.segmentIndex);

  for (let slot = 0; slot < shotCount; slot++) {
    let bestCandidate: CandidateSegment | null = null;
    let bestScore = -Infinity;
    const slotProgress = shotCount > 0 ? slot / shotCount : 0;

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

      // Subject track matching bonus
      candidateScore += scoreSubjectMatch(cand, subjectTracks, slotProgress);

      // Silence/motion matching bonus
      candidateScore += scoreSilenceMotionMatch(cand, silenceAnalysis, motionAnalysis);

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
