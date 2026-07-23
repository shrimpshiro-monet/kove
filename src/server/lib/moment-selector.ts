/**
 * Moment Selector — picks the best moments from footage when there's no script.
 *
 * For the "create an amazingly appealing video" scenario.
 * Uses semantic labels, CV scores, face detection, and speech to rank segments.
 */
import type { ClipAnalysis } from "./clip-analyzer";
import type { Shot, ShotEDL } from "@monet/edl-v3";
import { createShot, registerAsset } from "@monet/edl-v3";

// ── Types ───────────────────────────────────────────────────────────────────

export interface MomentSelection {
  shot: Shot;
  sourceClipId: string;
  reason: string;
  role: string;
}

export interface MomentSelectorResult {
  hook: MomentSelection | null;
  body: MomentSelection[];
  reveal: MomentSelection | null;
  cta: MomentSelection | null;
  totalDuration: number;
}

// ── Selector ────────────────────────────────────────────────────────────────

/**
 * Select the best moments from analyzed clips for a montage.
 *
 * @param params.clipAnalyses - Analysis results for all clips
 * @param params.targetDuration - Desired output duration (seconds)
 * @param params.musicBpm - Music BPM for timing
 */
export function selectBestMoments(params: {
  clipAnalyses: ClipAnalysis[];
  targetDuration: number;
  musicBpm?: number;
}): MomentSelectorResult {
  const { clipAnalyses, targetDuration, musicBpm } = params;

  // Rank ALL segments across ALL clips
  const ranked = rankAllSegments(clipAnalyses);

  // Select by role
  const hook = ranked.find((r) => r.role === "hook") ?? null;
  const body = ranked.filter((r) => r.role === "body").slice(0, Math.ceil(targetDuration / 2));
  const reveal = ranked.find((r) => r.role === "reveal") ?? null;
  const cta = ranked.find((r) => r.role === "cta") ?? null;

  return {
    hook,
    body,
    reveal,
    cta,
    totalDuration: targetDuration,
  };
}

// ── Ranking ─────────────────────────────────────────────────────────────────

interface RankedSegment {
  clipId: string;
  start: number;
  end: number;
  score: number;
  role: string;
  reason: string;
  faceVisible: boolean;
  hasSpeech: boolean;
  motionScore: number;
}

function rankAllSegments(analyses: ClipAnalysis[]): MomentSelection[] {
  const ranked: RankedSegment[] = [];

  for (const analysis of analyses) {
    for (const seg of analysis.semantic.segments) {
      const duration = seg.end - seg.start;
      if (duration < 0.5 || duration > 10) continue; // skip too short/long

      let score = seg.importance * 0.4;
      let role = "body";
      let reason = seg.description;

      // Boost for face visibility
      if (seg.faceVisible) {
        score += 0.2;
      }

      // Boost for speech coverage (narration is important)
      if (seg.speechCoverage > 0.5) {
        score += 0.15;
      }

      // Boost for high motion (action is engaging)
      const cvSeg = analysis.cvMetrics.find(
        (cv) => cv.startTime >= seg.start - 0.1 && cv.endTime <= seg.end + 0.1,
      );
      if (cvSeg) {
        score += cvSeg.motionScore * 0.15;
        score += cvSeg.overallQuality * 0.1;
      }

      // Classify role
      if (seg.label === "speech" && seg.faceVisible && seg.speechCoverage > 0.7) {
        // Good candidate for hook or CTA
        const textMatch = analysis.speechSegments.find(
          (s) => s.start >= seg.start - 0.5 && s.end <= seg.end + 0.5,
        );
        const text = textMatch?.text?.toLowerCase() ?? "";
        if (/^(hey|welcome|hello|look|watch|check)/.test(text)) {
          role = "hook";
          score += 0.3;
          reason = `Opening line: "${textMatch?.text?.slice(0, 40)}"`;
        } else if (/(visit|subscribe|follow|check out|buy|order)/.test(text)) {
          role = "cta";
          score += 0.25;
          reason = `Call to action: "${textMatch?.text?.slice(0, 40)}"`;
        }
      } else if (seg.label === "beauty" || (seg.label === "action" && cvSeg && cvSeg.motionScore > 0.6)) {
        // Good candidate for reveal
        role = "reveal";
        score += 0.2;
        reason = `Visually striking moment (motion=${(cvSeg?.motionScore ?? 0.5 * 100).toFixed(0)}%)`;
      } else if (seg.label === "transition") {
        score -= 0.2; // penalize transitions
      }

      ranked.push({
        clipId: analysis.clipId,
        start: seg.start,
        end: seg.end,
        score,
        role,
        reason,
        faceVisible: seg.faceVisible,
        hasSpeech: seg.speechCoverage > 0.5,
        motionScore: cvSeg?.motionScore ?? 0.5,
      });
    }
  }

  // Sort by score
  ranked.sort((a, b) => b.score - a.score);

  // Convert to MomentSelection
  return ranked.map((r) => ({
    shot: createShot({
      clipId: r.clipId,
      inPoint: r.start,
      outPoint: r.end,
      startTime: 0, // will be set when building timeline
      meta: {
        narrativeRole: r.role as any,
        importance: r.score,
        faceVisible: r.faceVisible,
        speechCoverage: r.hasSpeech ? 0.8 : 0,
      },
    }),
    sourceClipId: r.clipId,
    reason: r.reason,
    role: r.role,
  }));
}
