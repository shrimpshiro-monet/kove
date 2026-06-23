import {
  Action,
  ActionResult,
  MonetEffectBlock,
  MonetTransformKeyframes,
  Project,
} from "../../../../packages/core/src/actions/monet-effect-types";

interface ActionExecutorLike {
  execute(action: Action, project: Project): Promise<ActionResult>;
}

interface StoreGet {
  (): {
    project: Project;
    actionExecutor: ActionExecutorLike;
  };
}

interface StoreSet {
  (next: { project: Project }): void;
}

export interface UpsertClipEffectInput {
  clipId: string;
  effect: MonetEffectBlock;
}

export interface RemoveClipEffectInput {
  clipId: string;
  effectId: string;
}

export interface UpdateClipTransformsInput {
  clipId: string;
  transforms: MonetTransformKeyframes;
}

export async function applyClipEffectEdit(
  input: UpsertClipEffectInput,
  get: StoreGet,
  set: StoreSet
): Promise<ActionResult<{ clipId: string; effectId: string }>> {
  try {
    if (!input.clipId || input.clipId.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_CLIP_ID",
          message: "clipId is required",
        },
      };
    }

    const { project, actionExecutor } = get();

    if (!project) {
      return {
        success: false,
        error: {
          code: "PROJECT_MISSING",
          message: "Project is missing",
        },
      };
    }

    if (!actionExecutor) {
      return {
        success: false,
        error: {
          code: "ACTION_EXECUTOR_MISSING",
          message: "ActionExecutor is missing from store",
        },
      };
    }

    const projectCopy = structuredClone(project);

    const action: Action = {
      type: "MONET_UPSERT_CLIP_EFFECT",
      id: `action-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        effect: input.effect,
      },
    };

    const result = await actionExecutor.execute(action, projectCopy);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? {
          code: "ACTION_FAILED",
          message: "Effect edit action failed",
        },
      };
    }

    set({
      project: {
        ...projectCopy,
        modifiedAt: Date.now(),
      },
    });

    return {
      success: true,
      data: {
        clipId: input.clipId,
        effectId: input.effect.id,
      },
    };
  } catch (error) {
    console.error("[monet-effect-store-adapter] applyClipEffectEdit failed", error);

    return {
      success: false,
      error: {
        code: "APPLY_CLIP_EFFECT_EDIT_FAILED",
        message: "Failed to apply clip effect edit",
      },
    };
  }
}

export async function removeClipEffectEdit(
  input: RemoveClipEffectInput,
  get: StoreGet,
  set: StoreSet
): Promise<ActionResult<{ clipId: string; effectId: string }>> {
  try {
    if (!input.clipId || input.clipId.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_CLIP_ID",
          message: "clipId is required",
        },
      };
    }

    if (!input.effectId || input.effectId.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_EFFECT_ID",
          message: "effectId is required",
        },
      };
    }

    const { project, actionExecutor } = get();

    if (!project) {
      return {
        success: false,
        error: {
          code: "PROJECT_MISSING",
          message: "Project is missing",
        },
      };
    }

    if (!actionExecutor) {
      return {
        success: false,
        error: {
          code: "ACTION_EXECUTOR_MISSING",
          message: "ActionExecutor is missing from store",
        },
      };
    }

    const projectCopy = structuredClone(project);

    const action: Action = {
      type: "MONET_REMOVE_CLIP_EFFECT",
      id: `action-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        effectId: input.effectId,
      },
    };

    const result = await actionExecutor.execute(action, projectCopy);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? {
          code: "ACTION_FAILED",
          message: "Remove effect action failed",
        },
      };
    }

    set({
      project: {
        ...projectCopy,
        modifiedAt: Date.now(),
      },
    });

    return {
      success: true,
      data: {
        clipId: input.clipId,
        effectId: input.effectId,
      },
    };
  } catch (error) {
    console.error("[monet-effect-store-adapter] removeClipEffectEdit failed", error);

    return {
      success: false,
      error: {
        code: "REMOVE_CLIP_EFFECT_EDIT_FAILED",
        message: "Failed to remove clip effect edit",
      },
    };
  }
}

export async function applyClipTransformEdit(
  input: UpdateClipTransformsInput,
  get: StoreGet,
  set: StoreSet
): Promise<ActionResult<{ clipId: string }>> {
  try {
    if (!input.clipId || input.clipId.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_CLIP_ID",
          message: "clipId is required",
        },
      };
    }

    const { project, actionExecutor } = get();

    if (!project) {
      return {
        success: false,
        error: {
          code: "PROJECT_MISSING",
          message: "Project is missing",
        },
      };
    }

    if (!actionExecutor) {
      return {
        success: false,
        error: {
          code: "ACTION_EXECUTOR_MISSING",
          message: "ActionExecutor is missing from store",
        },
      };
    }

    const projectCopy = structuredClone(project);

    const action: Action = {
      type: "MONET_UPDATE_CLIP_TRANSFORMS",
      id: `action-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        transforms: input.transforms,
      },
    };

    const result = await actionExecutor.execute(action, projectCopy);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? {
          code: "ACTION_FAILED",
          message: "Transform edit action failed",
        },
      };
    }

    set({
      project: {
        ...projectCopy,
        modifiedAt: Date.now(),
      },
    });

    return {
      success: true,
      data: {
        clipId: input.clipId,
      },
    };
  } catch (error) {
    console.error("[monet-effect-store-adapter] applyClipTransformEdit failed", error);

    return {
      success: false,
      error: {
        code: "APPLY_CLIP_TRANSFORM_EDIT_FAILED",
        message: "Failed to apply clip transform edit",
      },
    };
  }
}