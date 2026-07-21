/**
 * Script Compiler — maps a user script to footage segments.
 *
 * For the scripted scenario: user writes "would you believe me..."
 * and Jalebi maps each line to the right moment in the footage.
 */
import type { ClipAnalysis } from "./clip-analyzer";
import type { Shot, ShotEDL } from "../../packages/edl-v3/src/schema";
import { createShot, registerAsset } from "../../packages/edl-v3/src/helpers";
import { findMatchingSegment, type SpeechSegment } from "./transcription";
import { findBestCutPointNear, type CutPoint } from "./cut-point-detector";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ScriptLine {
  text: string;
  effect?: string;
  duration?: string;
  cutTo?: string;
  type?: "direct-address" | "montage" | "motion-graphics" | "punchline" | "angle-switch";
}

export interface CompiledShot {
  scriptLine: ScriptLine;
  clipId: string;
  inPoint: number;
  outPoint: number;
  duration: number;
  effect?: string;
  transition?: string;
}

// ── Compiler ────────────────────────────────────────────────────────────────

/**
 * Compile a script into shots mapped to footage.
 *
 * @param params.script - Parsed script lines
 * @param params.clipAnalyses - Analysis results for all clips
 * @param params.musicBpm - Music BPM for timing
 */
export function compileScript(params: {
  script: ScriptLine[];
  clipAnalyses: ClipAnalysis[];
  musicBpm?: number;
}): CompiledShot[] {
  const { script, clipAnalyses, musicBpm } = params;
  const compiled: CompiledShot[] = [];

  // Flatten all speech segments and cut points from all clips
  const allSpeech: Array<SpeechSegment & { clipId: string }> = [];
  const allCutPoints: Array<CutPoint & { clipId: string }> = [];
  for (const analysis of clipAnalyses) {
    for (const seg of analysis.speechSegments) {
      allSpeech.push({ ...seg, clipId: analysis.clipId });
    }
    for (const cp of analysis.cutPoints) {
      allCutPoints.push({ ...cp, clipId: analysis.clipId });
    }
  }

  let currentTime = 0;

  for (const line of script) {
    if (line.type === "motion-graphics") {
      // No footage needed — overlay only
      compiled.push({
        scriptLine: line,
        clipId: "",
        inPoint: 0,
        outPoint: 0,
        duration: 2, // default duration for graphics
        effect: line.effect,
      });
      currentTime += 2;
      continue;
    }

    if (line.type === "montage") {
      // Montage: select multiple short moments
      const montageShots = compileMontage(line, clipAnalyses, currentTime, musicBpm);
      for (const shot of montageShots) {
        compiled.push(shot);
        currentTime += shot.duration;
      }
      continue;
    }

    // Regular line: find matching speech segment
    const match = findMatchingSegment(
      allSpeech.map((s) => ({ start: s.start, end: s.end, text: s.text, words: [] })),
      line.text,
    );

    if (match) {
      // Find the speech segment with clip info
      const speechMatch = allSpeech.find(
        (s) => Math.abs(s.start - match.start) < 0.1 && s.text === match.text,
      );
      const clipId = speechMatch?.clipId ?? clipAnalyses[0]?.clipId ?? "";
      const duration = match.end - match.start;

      compiled.push({
        scriptLine: line,
        clipId,
        inPoint: match.start,
        outPoint: match.end,
        duration,
        effect: line.effect,
        transition: line.cutTo ? "cut" : undefined,
      });
      currentTime += duration;
    } else {
      // No match found — use best available moment
      const bestClip = clipAnalyses[0];
      if (bestClip) {
        const bestSeg = bestClip.semantic.segments
          .filter((s) => s.label === "speech")
          .sort((a, b) => b.importance - a.importance)[0];

        if (bestSeg) {
          compiled.push({
            scriptLine: line,
            clipId: bestClip.clipId,
            inPoint: bestSeg.start,
            outPoint: bestSeg.end,
            duration: bestSeg.end - bestSeg.start,
            effect: line.effect,
          });
          currentTime += bestSeg.end - bestSeg.start;
        }
      }
    }
  }

  return compiled;
}

/**
 * Compile a montage line into multiple short shots.
 */
function compileMontage(
  line: ScriptLine,
  analyses: ClipAnalysis[],
  startTime: number,
  bpm?: number,
): CompiledShot[] {
  const shots: CompiledShot[] = [];
  const beatDuration = bpm ? 60 / bpm : 0.5;

  // Find all action/beauty segments
  const actionSegments: Array<{ clipId: string; start: number; end: number; score: number }> = [];
  for (const analysis of analyses) {
    for (const seg of analysis.semantic.segments) {
      if (seg.label === "action" || seg.label === "beauty") {
        actionSegments.push({
          clipId: analysis.clipId,
          start: seg.start,
          end: seg.end,
          score: seg.importance,
        });
      }
    }
  }

  // Sort by score
  actionSegments.sort((a, b) => b.score - a.score);

  // Take top N segments, each trimmed to beat duration
  const maxShots = Math.min(8, actionSegments.length);
  let t = startTime;

  for (let i = 0; i < maxShots; i++) {
    const seg = actionSegments[i];
    const duration = Math.min(beatDuration * 2, seg.end - seg.start);
    const inPoint = seg.start + (seg.end - seg.start - duration) / 2;

    shots.push({
      scriptLine: line,
      clipId: seg.clipId,
      inPoint,
      outPoint: inPoint + duration,
      duration,
      effect: i === 0 ? "impact_flash" : undefined,
      transition: "cut",
    });
    t += duration;
  }

  return shots;
}
