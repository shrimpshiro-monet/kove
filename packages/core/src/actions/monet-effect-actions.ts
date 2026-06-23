import {
  ActionResult,
  Project,
  RemoveClipEffectParams,
  UpdateClipTransformsParams,
  UpsertClipEffectParams,
} from "./monet-effect-types";

import {
  calculateProjectDuration,
  ensureClipMeta,
  findClipInEDL,
  findClipInProject,
  getClipMetaEffects,
  getEmbeddedEDL,
  isNonEmptyString,
  isRecord,
  isValidEffectBlock,
  isValidTransformKeyframes,
  removeEffectFromArray,
  syncEDLDuration,
  upsertEffectInArray,
} from "./monet-effect-utils";

export async function upsertClipEffectAction(
  params: Record<string, unknown>,
  project: Project
): Promise<ActionResult<UpsertClipEffectParams | { clipId: string; effectId: string; }>> {
  try {
    const parsed = parseUpsertClipEffectParams(params);

    if (!parsed.success || !parsed.data) {
      return parsed;
    }

    const { clipId, effect } = parsed.data;

    const projectLookup = findClipInProject(project, clipId);

    if (!projectLookup) {
      return {
        success: false,
        error: {
          code: "CLIP_NOT_FOUND",
          message: `Clip ${clipId} does not exist in project timeline`,
        },
      };
    }

    const edl = getEmbeddedEDL(project);

    if (!edl) {
      return {
        success: false,
        error: {
          code: "MONET_EDL_MISSING",
          message: "Project settings does not contain a valid MonetEDL",
        },
      };
    }

    const edlLookup = findClipInEDL(edl, clipId);

    if (!edlLookup) {
      return {
        success: false,
        error: {
          code: "EDL_CLIP_NOT_FOUND",
          message: `Clip ${clipId} does not exist in embedded MonetEDL`,
        },
      };
    }

    const clipMeta = ensureClipMeta(projectLookup.clip);
    const currentProjectEffects = getClipMetaEffects(projectLookup.clip);
    const nextProjectEffects = upsertEffectInArray(currentProjectEffects, effect);

    clipMeta.effects = nextProjectEffects;
    clipMeta.monetLastSyncedAt = Date.now();

    edlLookup.clip.effects = upsertEffectInArray(edlLookup.clip.effects ?? [], effect);
    edlLookup.clip.meta = {
      ...(isRecord(edlLookup.clip.meta) ? edlLookup.clip.meta : {}),
      monetLastSyncedAt: Date.now(),
    };

    syncEDLDuration(edl);

    project.timeline.duration = calculateProjectDuration(project);
    project.settings.monet = {
      ...(project.settings.monet ?? {}),
      edl,
      lastSyncedAt: Date.now(),
      syncVersion: (project.settings.monet?.syncVersion ?? 0) + 1,
    };

    return {
      success: true,
      data: {
        clipId,
        effectId: effect.id,
      },
    };
  } catch (error) {
    console.error("[monet-effect-actions] UPSERT_CLIP_EFFECT failed", error);

    return {
      success: false,
      error: {
        code: "UPSERT_CLIP_EFFECT_FAILED",
        message: "Failed to upsert clip effect",
      },
    };
  }
}

export async function removeClipEffectAction(
  params: Record<string, unknown>,
  project: Project
): Promise<ActionResult<{ clipId: string; effectId: string }>> {
  try {
    const parsed = parseRemoveClipEffectParams(params);

    if (!parsed.success || !parsed.data) {
      return parsed;
    }

    const { clipId, effectId } = parsed.data;

    const projectLookup = findClipInProject(project, clipId);

    if (!projectLookup) {
      return {
        success: false,
        error: {
          code: "CLIP_NOT_FOUND",
          message: `Clip ${clipId} does not exist in project timeline`,
        },
      };
    }

    const edl = getEmbeddedEDL(project);

    if (!edl) {
      return {
        success: false,
        error: {
          code: "MONET_EDL_MISSING",
          message: "Project settings does not contain a valid MonetEDL",
        },
      };
    }

    const edlLookup = findClipInEDL(edl, clipId);

    if (!edlLookup) {
      return {
        success: false,
        error: {
          code: "EDL_CLIP_NOT_FOUND",
          message: `Clip ${clipId} does not exist in embedded MonetEDL`,
        },
      };
    }

    const clipMeta = ensureClipMeta(projectLookup.clip);
    const currentProjectEffects = getClipMetaEffects(projectLookup.clip);
    const nextProjectEffects = removeEffectFromArray(currentProjectEffects, effectId);

    clipMeta.effects = nextProjectEffects;
    clipMeta.monetLastSyncedAt = Date.now();

    edlLookup.clip.effects = removeEffectFromArray(edlLookup.clip.effects ?? [], effectId);
    edlLookup.clip.meta = {
      ...(isRecord(edlLookup.clip.meta) ? edlLookup.clip.meta : {}),
      monetLastSyncedAt: Date.now(),
    };

    syncEDLDuration(edl);

    project.timeline.duration = calculateProjectDuration(project);
    project.settings.monet = {
      ...(project.settings.monet ?? {}),
      edl,
      lastSyncedAt: Date.now(),
      syncVersion: (project.settings.monet?.syncVersion ?? 0) + 1,
    };

    return {
      success: true,
      data: {
        clipId,
        effectId,
      },
    };
  } catch (error) {
    console.error("[monet-effect-actions] REMOVE_CLIP_EFFECT failed", error);

    return {
      success: false,
      error: {
        code: "REMOVE_CLIP_EFFECT_FAILED",
        message: "Failed to remove clip effect",
      },
    };
  }
}

export async function updateClipTransformsAction(
  params: Record<string, unknown>,
  project: Project
): Promise<ActionResult<{ clipId: string }>> {
  try {
    const parsed = parseUpdateClipTransformsParams(params);

    if (!parsed.success || !parsed.data) {
      return parsed;
    }

    const { clipId, transforms } = parsed.data;

    const projectLookup = findClipInProject(project, clipId);

    if (!projectLookup) {
      return {
        success: false,
        error: {
          code: "CLIP_NOT_FOUND",
          message: `Clip ${clipId} does not exist in project timeline`,
        },
      };
    }

    const edl = getEmbeddedEDL(project);

    if (!edl) {
      return {
        success: false,
        error: {
          code: "MONET_EDL_MISSING",
          message: "Project settings does not contain a valid MonetEDL",
        },
      };
    }

    const edlLookup = findClipInEDL(edl, clipId);

    if (!edlLookup) {
      return {
        success: false,
        error: {
          code: "EDL_CLIP_NOT_FOUND",
          message: `Clip ${clipId} does not exist in embedded MonetEDL`,
        },
      };
    }

    const clipMeta = ensureClipMeta(projectLookup.clip);
    clipMeta.transforms = transforms;
    clipMeta.monetLastSyncedAt = Date.now();

    edlLookup.clip.transforms = transforms;
    edlLookup.clip.meta = {
      ...(isRecord(edlLookup.clip.meta) ? edlLookup.clip.meta : {}),
      monetLastSyncedAt: Date.now(),
    };

    syncEDLDuration(edl);

    project.settings.monet = {
      ...(project.settings.monet ?? {}),
      edl,
      lastSyncedAt: Date.now(),
      syncVersion: (project.settings.monet?.syncVersion ?? 0) + 1,
    };

    return {
      success: true,
      data: {
        clipId,
      },
    };
  } catch (error) {
    console.error("[monet-effect-actions] UPDATE_CLIP_TRANSFORMS failed", error);

    return {
      success: false,
      error: {
        code: "UPDATE_CLIP_TRANSFORMS_FAILED",
        message: "Failed to update clip transforms",
      },
    };
  }
}

function parseUpsertClipEffectParams(
  params: Record<string, unknown>
): ActionResult<UpsertClipEffectParams> {
  const clipId = params.clipId;
  const effect = params.effect;

  if (!isNonEmptyString(clipId)) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_ID",
        message: "clipId must be a non-empty string",
      },
    };
  }

  if (!isValidEffectBlock(effect)) {
    return {
      success: false,
      error: {
        code: "INVALID_EFFECT",
        message: "effect must be a valid MonetEffectBlock",
      },
    };
  }

  return {
    success: true,
    data: {
      clipId,
      effect,
    },
  };
}

function parseRemoveClipEffectParams(
  params: Record<string, unknown>
): ActionResult<RemoveClipEffectParams> {
  const clipId = params.clipId;
  const effectId = params.effectId;

  if (!isNonEmptyString(clipId)) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_ID",
        message: "clipId must be a non-empty string",
      },
    };
  }

  if (!isNonEmptyString(effectId)) {
    return {
      success: false,
      error: {
        code: "INVALID_EFFECT_ID",
        message: "effectId must be a non-empty string",
      },
    };
  }

  return {
    success: true,
    data: {
      clipId,
      effectId,
    },
  };
}

function parseUpdateClipTransformsParams(
  params: Record<string, unknown>
): ActionResult<UpdateClipTransformsParams> {
  const clipId = params.clipId;
  const transforms = params.transforms;

  if (!isNonEmptyString(clipId)) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_ID",
        message: "clipId must be a non-empty string",
      },
    };
  }

  if (!isValidTransformKeyframes(transforms)) {
    return {
      success: false,
      error: {
        code: "INVALID_TRANSFORMS",
        message: "transforms must be valid Monet transform keyframes",
      },
    };
  }

  return {
    success: true,
    data: {
      clipId,
      transforms,
    },
  };
}
