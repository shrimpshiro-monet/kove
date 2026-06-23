import {
  ActionResult,
  MonetEDL,
  MonetEffectBlock,
  Project,
} from "../../../packages/core/src/actions/monet-effect-types";

function isEffectBlock(value: unknown): value is MonetEffectBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.type === "string" &&
    typeof record.start === "number" &&
    Number.isFinite(record.start) &&
    typeof record.duration === "number" &&
    Number.isFinite(record.duration) &&
    Boolean(record.params) &&
    typeof record.params === "object" &&
    !Array.isArray(record.params)
  );
}

export function syncOpenReelEffectsToEmbeddedEDL(
  project: Project
): ActionResult<{ edl: MonetEDL; syncedClips: number }> {
  try {
    const edl = project.settings.monet?.edl;

    if (!edl || edl.version !== 1) {
      return {
        success: false,
        error: {
          code: "MONET_EDL_MISSING",
          message: "Project does not contain an embedded MonetEDL",
        },
      };
    }

    const projectClipEffects = new Map<string, MonetEffectBlock[]>();

    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const rawEffects = clip.meta?.effects;

        if (rawEffects === undefined) {
          projectClipEffects.set(clip.id, []);
          continue;
        }

        if (!Array.isArray(rawEffects)) {
          return {
            success: false,
            error: {
              code: "INVALID_CLIP_EFFECTS",
              message: `Clip ${clip.id} has invalid meta.effects`,
            },
          };
        }

        const effects: MonetEffectBlock[] = [];

        for (const effect of rawEffects) {
          if (!isEffectBlock(effect)) {
            return {
              success: false,
              error: {
                code: "INVALID_EFFECT_BLOCK",
                message: `Clip ${clip.id} contains invalid effect block`,
              },
            };
          }

          effects.push(effect);
        }

        projectClipEffects.set(clip.id, effects);
      }
    }

    let syncedClips = 0;

    for (const track of edl.timeline.tracks) {
      for (const clip of track.clips) {
        const effects = projectClipEffects.get(clip.id);

        if (effects === undefined) {
          return {
            success: false,
            error: {
              code: "EDL_PROJECT_DESYNC",
              message: `EDL clip ${clip.id} does not exist in project timeline`,
            },
          };
        }

        clip.effects = effects;
        clip.meta = {
          ...(clip.meta ?? {}),
          monetLastSyncedAt: Date.now(),
        };

        syncedClips += 1;
      }
    }

    edl.meta.updatedAt = Date.now();

    project.settings.monet = {
      ...(project.settings.monet ?? {}),
      edl,
      lastSyncedAt: Date.now(),
      syncVersion: (project.settings.monet?.syncVersion ?? 0) + 1,
    };

    return {
      success: true,
      data: {
        edl,
        syncedClips,
      },
    };
  } catch (error) {
    console.error("[openreel-to-edl-sync] sync failed", error);

    return {
      success: false,
      error: {
        code: "OPENREEL_TO_EDL_SYNC_FAILED",
        message: "Failed to sync OpenReel effects to embedded MonetEDL",
      },
    };
  }
}