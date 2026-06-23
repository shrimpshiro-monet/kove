// packages/engine-freecut/src/executor/planValidator.ts
import { Action } from "./types";
import { AssetResolver } from "./assetResolver";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  mediaIds: string[];
}

export async function validatePlan(
  actions: Action[],
  resolver: AssetResolver
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mediaIds: string[] = [];

  if (!Array.isArray(actions)) {
    return { ok: false, errors: ["Plan is not an array"], warnings, mediaIds };
  }

  const declaredClips = new Map<string, string>(); // clipId -> trackId

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const where = `actions[${i}] (${a?.type ?? "unknown"})`;

    switch (a.type) {
      case "addMedia": {
        if (!a.mediaId) errors.push(`${where}: missing mediaId`);
        if (!a.clipId) errors.push(`${where}: missing clipId`);
        if (typeof a.startTime !== "number")
          errors.push(`${where}: startTime must be a number`);
        if (declaredClips.has(a.clipId))
          warnings.push(`${where}: duplicate clipId "${a.clipId}"`);
        declaredClips.set(a.clipId, a.trackId);
        mediaIds.push(a.mediaId);
        break;
      }
      case "split": {
        if (!declaredClips.has(a.clipId))
          errors.push(`${where}: split references unknown clipId "${a.clipId}"`);
        if (typeof a.time !== "number" || a.time <= 0)
          errors.push(`${where}: split time must be > 0`);
        // After split, segment_2 will be addressable as `${clipId}_segment_2`
        declaredClips.set(`${a.clipId}_segment_1`, a.trackId);
        declaredClips.set(`${a.clipId}_segment_2`, a.trackId);
        break;
      }
      case "updateClip": {
        if (!declaredClips.has(a.clipId))
          errors.push(`${where}: updateClip references unknown clipId "${a.clipId}"`);
        const speed = a.properties?.playbackSpeed;
        if (speed !== undefined && (speed < 0.1 || speed > 4.0))
          errors.push(`${where}: playbackSpeed ${speed} out of range [0.1, 4.0]`);
        break;
      }
      case "addCaption": {
        if (!a.text) errors.push(`${where}: caption text required`);
        if (typeof a.duration !== "number" || a.duration <= 0)
          errors.push(`${where}: caption duration must be > 0`);
        break;
      }
      case "removeClip": {
        if (!declaredClips.has(a.clipId))
          warnings.push(`${where}: removeClip references unknown clipId "${a.clipId}"`);
        break;
      }
      default:
        errors.push(`${where}: unknown action type`);
    }
  }

  // verify all media exist
  const { unresolved } = await resolver.assertAllExist([...new Set(mediaIds)]);
  for (const u of unresolved) errors.push(`unresolved media: ${u}`);

  return { ok: errors.length === 0, errors, warnings, mediaIds };
}
