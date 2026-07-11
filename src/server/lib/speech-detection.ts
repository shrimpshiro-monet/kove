/**
 * speech-detection.ts — Detect speech/dialogue in video footage.
 *
 * Uses FFmpeg's silencedetect filter to find non-silent segments,
 * which indicates speech or dialogue in the footage.
 *
 * This drives audio ducking: lower music when speech is detected.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SpeechSegment {
  start: number;
  end: number;
  confidence: number;
}

export interface SpeechDetectionResult {
  segments: SpeechSegment[];
  hasSpeech: boolean;
  speechRatio: number; // 0-1, percentage of duration with speech
  totalDuration: number;
}

/**
 * Detect speech segments in a video file.
 *
 * Uses FFmpeg's silencedetect to find non-silent portions.
 * Silence threshold of -30dB works well for most content.
 *
 * @param videoPath - Path to the video file
 * @param silenceThreshold - Silence threshold in dB (default -30)
 * @param minSilenceDuration - Minimum silence gap to count as speech break (default 0.3s)
 */
export async function detectSpeech(
  videoPath: string,
  silenceThreshold = -30,
  minSilenceDuration = 0.3
): Promise<SpeechDetectionResult> {
  // Get video duration
  const totalDuration = await getDuration(videoPath);

  // Extract audio and detect silence
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-af", `silencedetect=noise=${silenceThreshold}dB:d=${minSilenceDuration}`,
    "-f", "null", "-",
  ], { timeout: 120_000 }).catch(err => ({
    stderr: err.stderr ?? err.stdout ?? "",
    stdout: "",
  }));

  // Parse silence intervals
  const silenceStarts: number[] = [];
  const silenceEnds: number[] = [];

  const startRegex = /silence_start:\s*([\d.]+)/g;
  const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  let match;
  while ((match = startRegex.exec(stderr)) !== null) {
    silenceStarts.push(parseFloat(match[1]));
  }
  while ((match = endRegex.exec(stderr)) !== null) {
    silenceEnds.push(parseFloat(match[1]));
  }

  // Build speech segments (inverse of silence)
  const segments: SpeechSegment[] = [];

  if (silenceStarts.length === 0 && silenceEnds.length === 0) {
    // No silence detected → entire file is speech
    if (totalDuration > 0) {
      segments.push({ start: 0, end: totalDuration, confidence: 0.6 });
    }
  } else {
    // Speech is between silence end and next silence start
    let lastSilenceEnd = 0;

    for (let i = 0; i < Math.max(silenceStarts.length, silenceEnds.length); i++) {
      const speechStart = lastSilenceEnd;
      const speechEnd = i < silenceStarts.length ? silenceStarts[i] : totalDuration;

      if (speechEnd - speechStart > 0.1) {
        segments.push({
          start: speechStart,
          end: speechEnd,
          confidence: 0.7,
        });
      }

      if (i < silenceEnds.length) {
        lastSilenceEnd = silenceEnds[i];
      }
    }

    // Final segment after last silence
    if (lastSilenceEnd < totalDuration - 0.1) {
      segments.push({
        start: lastSilenceEnd,
        end: totalDuration,
        confidence: 0.7,
      });
    }
  }

  const speechDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);

  return {
    segments,
    hasSpeech: segments.length > 0 && speechDuration > 1,
    speechRatio: totalDuration > 0 ? speechDuration / totalDuration : 0,
    totalDuration,
  };
}

/**
 * Generate a ducking envelope from speech segments.
 *
 * Returns an array of { time, volume } points that can be used
 * to automate music volume during rendering.
 *
 * Music volume drops to duckLevel during speech, ramps back up
 * after speech ends.
 */
export function generateDuckingEnvelope(
  speechResult: SpeechDetectionResult,
  duckLevel = 0.25, // Music volume during speech (0-1)
  attackTime = 0.15, // How fast to duck (seconds)
  releaseTime = 0.3, // How fast to restore (seconds)
): Array<{ time: number; volume: number }> {
  const envelope: Array<{ time: number; volume: number }> = [];

  if (!speechResult.hasSpeech) {
    envelope.push({ time: 0, volume: 1 });
    return envelope;
  }

  const { segments, totalDuration } = speechResult;

  // Start at full volume
  envelope.push({ time: 0, volume: 1 });

  for (const segment of segments) {
    // Duck before speech starts
    envelope.push({ time: Math.max(0, segment.start - attackTime), volume: 1 });
    // Duck at speech start
    envelope.push({ time: segment.start, volume: duckLevel });
    // Restore after speech ends
    envelope.push({ time: segment.end, volume: duckLevel });
    envelope.push({ time: segment.end + releaseTime, volume: 1 });
  }

  // Ensure end
  envelope.push({ time: totalDuration, volume: 1 });

  // Sort by time
  envelope.sort((a, b) => a.time - b.time);

  // Remove duplicates and clamp
  const deduped: Array<{ time: number; volume: number }> = [];
  for (const point of envelope) {
    if (deduped.length === 0 || Math.abs(point.time - deduped[deduped.length - 1].time) > 0.01) {
      deduped.push({ time: point.time, volume: Math.max(0, Math.min(1, point.volume)) });
    }
  }

  return deduped;
}

async function getDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ], { timeout: 10_000 });
    return parseFloat(stdout.trim());
  } catch {
    return 0;
  }
}
