/**
 * ShotEDL V3 Validation
 *
 * Validates an EDL against the schema AND business rules.
 * Zod handles structure; this module handles invariants.
 */
import { z } from "zod";
import type { ShotEDL, Shot } from "./schema";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a ShotEDL — structure + business rules.
 */
export async function validateShotEDL(data: unknown): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Zod schema validation
  const { ShotEDLSchema } = await import("./schema");
  const result = ShotEDLSchema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  const edl = result.data;

  // 2. Timeline duration must be positive
  if (edl.meta.duration <= 0) {
    errors.push("meta.duration must be > 0");
  }

  // 3. Shots must not overlap
  const sorted = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = prev.timing.startTime + prev.timing.duration;
    if (curr.timing.startTime < prevEnd - 0.001) {
      errors.push(
        `Shot overlap: "${prev.id}" ends at ${prevEnd.toFixed(3)}s but "${curr.id}" starts at ${curr.timing.startTime.toFixed(3)}s`
      );
    }
  }

  // 4. Shots must reference valid assets
  const assetIds = new Set(Object.keys(edl.assets.media));
  for (const shot of edl.shots) {
    if (!assetIds.has(shot.source.clipId)) {
      errors.push(
        `Shot "${shot.id}" references unknown asset "${shot.source.clipId}". Valid: ${Array.from(assetIds).join(", ")}`
      );
    }
  }

  // 5. Source in/out points must be valid
  for (const shot of edl.shots) {
    if (shot.source.outPoint <= shot.source.inPoint) {
      errors.push(
        `Shot "${shot.id}": outPoint (${shot.source.outPoint}) must be > inPoint (${shot.source.inPoint})`
      );
    }
    const asset = edl.assets.media[shot.source.clipId];
    if (asset && shot.source.outPoint > asset.duration + 0.01) {
      errors.push(
        `Shot "${shot.id}": outPoint (${shot.source.outPoint}) exceeds asset duration (${asset.duration})`
      );
    }
  }

  // 6. Effects must have valid intensity
  for (const shot of edl.shots) {
    for (const fx of shot.effects) {
      if (fx.intensity < 0 || fx.intensity > 3) {
        errors.push(
          `Shot "${shot.id}", effect "${fx.id}": intensity ${fx.intensity} out of range [0, 3]`
        );
      }
    }
  }

  // 7. Audio gain must be in range
  for (const shot of edl.shots) {
    if (shot.audio.gain < 0 || shot.audio.gain > 2) {
      errors.push(
        `Shot "${shot.id}": audio gain ${shot.audio.gain} out of range [0, 2]`
      );
    }
  }

  // 8. Warnings for common issues
  for (const shot of edl.shots) {
    if (shot.timing.duration < 0.1) {
      warnings.push(`Shot "${shot.id}": very short duration (${shot.timing.duration.toFixed(3)}s)`);
    }
    if (shot.timing.speed > 4) {
      warnings.push(`Shot "${shot.id}": very high speed (${shot.timing.speed}x)`);
    }
    if (shot.effects.length > 3) {
      warnings.push(`Shot "${shot.id}": many effects (${shot.effects.length}) — may be heavy to render`);
    }
  }

  // 9. Music consistency
  if (edl.music) {
    if (edl.music.beatGrid.length === 0 && edl.music.bpm > 0) {
      warnings.push("Music has BPM but empty beatGrid — beats may not align");
    }
    for (const shot of edl.shots) {
      if (shot.timing.beatLocked && shot.timing.beatIndex !== undefined) {
        const beatTime = edl.music.beatGrid[shot.timing.beatIndex];
        if (beatTime !== undefined && Math.abs(beatTime - shot.timing.startTime) > 0.1) {
          warnings.push(
            `Shot "${shot.id}": beatLocked to beat ${shot.timing.beatIndex} but startTime (${shot.timing.startTime.toFixed(3)}s) != beat time (${beatTime.toFixed(3)}s)`
          );
        }
      }
    }
  }

  // 10. Timeline duration should cover all shots
  const maxEnd = sorted.length > 0
    ? sorted[sorted.length - 1].timing.startTime + sorted[sorted.length - 1].timing.duration
    : 0;
  if (maxEnd > edl.meta.duration + 0.01) {
    warnings.push(
      `Timeline duration (${edl.meta.duration}s) is shorter than last shot end (${maxEnd.toFixed(3)}s)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick validation — returns true if valid, throws if not.
 */
export async function assertValidShotEDL(data: unknown): Promise<void> {
  const result = await validateShotEDL(data);
  if (!result.valid) {
    throw new Error(`Invalid ShotEDL:\n${result.errors.join("\n")}`);
  }
}
