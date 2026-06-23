import type { MonetEDL } from "../types/edl";
import type { AnalysisResult } from "../types/analysis";
import type { NormalizedIntent } from "./intent-normalization";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates generated EDL against 5 hard quality mandates.
 */
export function validateEDL(params: {
  edl: MonetEDL;
  intent: NormalizedIntent;
  analysis: AnalysisResult;
}): ValidationResult {
  const { edl, intent, analysis } = params;
  const errors: string[] = [];

  const targetDuration = intent.durationSeconds;
  const timelineDuration = edl.timeline?.duration ?? targetDuration;

  // 1. Duration must match intent (±2s)
  // Check the reported timeline duration
  if (Math.abs(timelineDuration - targetDuration) > 2.0) {
    errors.push(
      `Timeline duration (${timelineDuration.toFixed(2)}s) deviates from target intent duration (${targetDuration.toFixed(2)}s) by more than 2 seconds.`
    );
  }

  // Also check actual calculated duration based on final shot end point
  if (edl.shots.length > 0) {
    const sortedShots = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
    const lastShot = sortedShots[sortedShots.length - 1];
    const actualEnd = lastShot.timing.startTime + lastShot.timing.duration;
    if (Math.abs(actualEnd - targetDuration) > 2.0) {
      errors.push(
        `Actual end of last shot (${actualEnd.toFixed(2)}s) deviates from target intent duration (${targetDuration.toFixed(2)}s) by more than 2 seconds.`
      );
    }
  } else {
    errors.push("EDL has no shots.");
  }

  // 2. No shot longer than 30% of total target duration (ceiling clamp)
  const maxShotAllowedDuration = 0.3 * targetDuration;
  for (const shot of edl.shots) {
    if (shot.timing.duration > maxShotAllowedDuration) {
      errors.push(
        `Shot ${shot.id} duration (${shot.timing.duration.toFixed(2)}s) exceeds maximum allowed duration (30% of total: ${maxShotAllowedDuration.toFixed(2)}s).`
      );
    }
  }

  // 3. If syncToBeat=true, all shots must have beatLock
  const syncToBeat = intent.technical?.syncToBeat === true;
  if (syncToBeat) {
    for (const shot of edl.shots) {
      if (!shot.beatLock || typeof shot.beatLock.beatIndex !== "number") {
        errors.push(`Shot ${shot.id} is missing beatLock metadata despite syncToBeat being enabled.`);
      }
    }
  }

  // 4. No overlapping shots on the timeline
  if (edl.shots.length > 1) {
    const sortedShots = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
    for (let i = 1; i < sortedShots.length; i++) {
      const prev = sortedShots[i - 1];
      const curr = sortedShots[i];
      const prevEnd = prev.timing.startTime + prev.timing.duration;
      // Use 1ms epsilon for tiny floating point inaccuracies
      if (curr.timing.startTime < prevEnd - 0.001) {
        errors.push(
          `Shot overlap detected: Shot ${curr.id} starts at ${curr.timing.startTime.toFixed(3)}s, which is before previous shot ${prev.id} ends at ${prevEnd.toFixed(3)}s.`
        );
      }
    }
  }

  // 5. Referential integrity (every shot references a real clip ID in the analysis)
  const validClipIds = new Set((analysis.footage || []).map((f) => f.clipId));
  for (const shot of edl.shots) {
    if (!validClipIds.has(shot.source.clipId)) {
      errors.push(
        `Shot ${shot.id} references non-existent clip ID: "${shot.source.clipId}". Valid clips: ${Array.from(validClipIds).join(", ")}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
