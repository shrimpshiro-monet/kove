/**
 * Semantic Labeler — uses Gemini to understand WHAT each segment is.
 *
 * Takes footage analysis + transcription + frame data and labels
 * every segment with its content type and importance.
 * This is what makes Jalebi "understand" footage.
 */
import type { Env } from "../types/env";
import type { SegmentQuality } from "./cv-metrics";
import type { SpeechSegment } from "./transcription";

// ── Types ───────────────────────────────────────────────────────────────────

export type SemanticLabel =
  | "speech"         // person talking to camera
  | "action"         // physical activity (cooking, sports, walking)
  | "b-roll"         // supplementary footage (establishing shots, details)
  | "beauty"         // visually stunning shot (product, landscape, slow-mo)
  | "reaction"       // emotional response (smile, laugh, shock)
  | "establishing"   // setting the scene (wide shot, location)
  | "transition"     // movement between scenes (walking, panning)
  | "graphics";      // text overlays, logos, animations

export interface SemanticSegment {
  start: number;
  end: number;
  label: SemanticLabel;
  importance: number;    // 0-1, how important is this segment
  confidence: number;    // 0-1, how confident is the label
  description: string;   // human-readable description
  faceVisible: boolean;
  speechCoverage: number; // 0-1, how much of this segment has speech
}

export interface SemanticAnalysisResult {
  segments: SemanticSegment[];
  summary: {
    speechRatio: number;
    actionRatio: number;
    brollRatio: number;
    beautyRatio: number;
    avgImportance: number;
    hasNarration: boolean;
    hasBroll: boolean;
  };
}

// ── Labeler ─────────────────────────────────────────────────────────────────

/**
 * Label footage segments with semantic meaning.
 *
 * Combines:
 * - CV metrics (motion, brightness, sharpness)
 * - Speech segments (when someone is talking)
 * - Frame analysis (Gemini vision)
 *
 * @param params.segments - CV-scored segments from footage analysis
 * @param params.speechSegments - Transcription speech segments
 * @param params.frames - Extracted frames for Gemini analysis
 * @param params.duration - Total video duration
 */
export async function labelSegments(params: {
  env: Env;
  segments: SegmentQuality[];
  speechSegments: SpeechSegment[];
  frames: Uint8Array[];
  duration: number;
}): Promise<SemanticAnalysisResult> {
  const { env, segments, speechSegments, frames, duration } = params;

  // Step 1: Label segments based on CV metrics + speech data
  const labeled = segments.map((seg) => {
    const midTime = (seg.startTime + seg.endTime) / 2;
    const speechOverlap = calculateSpeechOverlap(seg.startTime, seg.endTime, speechSegments);

    // Label based on data
    let label: SemanticLabel;
    let importance: number;

    if (speechOverlap > 0.5) {
      // Mostly speech → "speech" segment
      label = "speech";
      importance = 0.7 + speechOverlap * 0.2; // speech is usually important
    } else if (seg.motionScore > 0.6 && seg.sceneChangeScore > 0.5) {
      // High motion + scene changes → "action"
      label = "action";
      importance = 0.5 + seg.motionScore * 0.3;
    } else if (seg.isBlackFrame) {
      // Black frame → "transition"
      label = "transition";
      importance = 0.1;
    } else if (seg.isStaticFrame) {
      // Static frame → "b-roll" or "beauty"
      label = seg.brightnessScore > 0.6 ? "beauty" : "b-roll";
      importance = seg.brightnessScore > 0.6 ? 0.6 : 0.3;
    } else if (seg.motionScore < 0.2 && seg.blurScore > 0.7) {
      // Low motion, sharp → "beauty" or "establishing"
      label = "beauty";
      importance = 0.5;
    } else if (seg.blurScore < 0.3) {
      // Blurry → "transition" (camera movement)
      label = "transition";
      importance = 0.2;
    } else {
      // Default → "b-roll"
      label = "b-roll";
      importance = 0.3 + seg.overallQuality * 0.2;
    }

    return {
      start: seg.startTime,
      end: seg.endTime,
      label,
      importance: Math.min(1, Math.max(0, importance)),
      confidence: seg.overallQuality * 0.5 + (1 - Math.abs(speechOverlap - (label === "speech" ? 1 : 0))) * 0.5,
      description: generateDescription(label, seg, speechOverlap),
      faceVisible: seg.motionScore > 0.3 && seg.motionScore < 0.8, // rough heuristic
      speechCoverage: speechOverlap,
    };
  });

  // Step 2: Use Gemini to refine labels (if frames available)
  let refined = labeled;
  if (frames.length > 0) {
    try {
      refined = await refineWithGemini(env, labeled, frames, duration);
    } catch (e) {
      console.warn(`[semantic-labeler] Gemini refinement failed, using CV-only labels: ${(e as Error).message}`);
    }
  }

  // Step 3: Compute summary
  const totalDur = duration || 1;
  const summary = {
    speechRatio: refined.filter((s) => s.label === "speech").reduce((sum, s) => sum + (s.end - s.start), 0) / totalDur,
    actionRatio: refined.filter((s) => s.label === "action").reduce((sum, s) => sum + (s.end - s.start), 0) / totalDur,
    brollRatio: refined.filter((s) => s.label === "b-roll").reduce((sum, s) => sum + (s.end - s.start), 0) / totalDur,
    beautyRatio: refined.filter((s) => s.label === "beauty").reduce((sum, s) => sum + (s.end - s.start), 0) / totalDur,
    avgImportance: refined.reduce((sum, s) => sum + s.importance, 0) / Math.max(1, refined.length),
    hasNarration: refined.some((s) => s.label === "speech" && s.speechCoverage > 0.7),
    hasBroll: refined.some((s) => s.label === "b-roll" || s.label === "beauty"),
  };

  return { segments: refined, summary };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function calculateSpeechOverlap(
  segStart: number,
  segEnd: number,
  speechSegments: SpeechSegment[],
): number {
  const segDuration = segEnd - segStart;
  if (segDuration <= 0) return 0;

  let overlapDuration = 0;
  for (const speech of speechSegments) {
    const overlapStart = Math.max(segStart, speech.start);
    const overlapEnd = Math.min(segEnd, speech.end);
    if (overlapEnd > overlapStart) {
      overlapDuration += overlapEnd - overlapStart;
    }
  }

  return Math.min(1, overlapDuration / segDuration);
}

function generateDescription(
  label: SemanticLabel,
  seg: SegmentQuality,
  speechOverlap: number,
): string {
  switch (label) {
    case "speech":
      return speechOverlap > 0.8
        ? `Speaking (clear audio, ${(speechOverlap * 100).toFixed(0)}% coverage)`
        : `Partially speaking (${(speechOverlap * 100).toFixed(0)}% coverage)`;
    case "action":
      return `Active movement (motion=${(seg.motionScore * 100).toFixed(0)}%)`;
    case "beauty":
      return `Visually striking (sharp=${(seg.blurScore * 100).toFixed(0)}%, bright=${(seg.brightnessScore * 100).toFixed(0)}%)`;
    case "b-roll":
      return `Supplementary footage (quality=${(seg.overallQuality * 100).toFixed(0)}%)`;
    case "transition":
      return seg.isBlackFrame ? "Black frame" : "Camera movement";
    default:
      return `${label} segment`;
  }
}

// ── Gemini Refinement ───────────────────────────────────────────────────────

const SEMANTIC_SYSTEM =
  "You are a video content analyst. Given frames and segment data, " +
  "label each segment with its content type and importance. " +
  "Be precise — these labels drive an AI video editor.";

async function refineWithGemini(
  env: Env,
  segments: SemanticSegment[],
  frames: Uint8Array[],
  duration: number,
): Promise<SemanticSegment[]> {
  const { getAIService } = await import("../services/ai-service");
  const ai = getAIService(env);

  // Build prompt with segment data
  const segmentSummary = segments.map((s, i) =>
    `[${i}] ${s.start.toFixed(1)}-${s.end.toFixed(1)}s: ${s.label} (importance=${s.importance.toFixed(2)}, speech=${s.speechCoverage.toFixed(2)})`
  ).join("\n");

  const prompt =
    `Analyze these video frames and refine the segment labels.\n\n` +
    `SEGMENTS (from automated analysis):\n${segmentSummary}\n\n` +
    `Duration: ${duration.toFixed(1)}s\n` +
    `Frames: ${frames.length} extracted at regular intervals\n\n` +
    `For each frame, tell me:\n` +
    `1. What's happening (speech, action, b-roll, beauty, reaction, establishing)\n` +
    `2. How important is this moment (0-1)\n` +
    `3. Is a face visible?\n` +
    `4. Is someone speaking?\n\n` +
    `Return JSON array: [{ index, label, importance, faceVisible, description }]\n` +
    `Labels must be one of: speech, action, b-roll, beauty, reaction, establishing, transition, graphics`;

  const result = await ai.run("semantic-label", {
    systemPrompt: SEMANTIC_SYSTEM,
    prompt,
    images: frames.slice(0, 8),
    maxTokens: 4096,
  });

  if (!result.data || !Array.isArray(result.data)) {
    return segments;
  }

  // Merge Gemini labels with CV-based labels
  const refined = [...segments];
  for (const item of result.data) {
    const idx = item.index;
    if (idx >= 0 && idx < refined.length) {
      refined[idx] = {
        ...refined[idx],
        label: item.label ?? refined[idx].label,
        importance: item.importance ?? refined[idx].importance,
        faceVisible: item.faceVisible ?? refined[idx].faceVisible,
        description: item.description ?? refined[idx].description,
        confidence: Math.min(1, refined[idx].confidence + 0.2), // boost confidence
      };
    }
  }

  return refined;
}
