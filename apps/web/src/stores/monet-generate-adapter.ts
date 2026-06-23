import {
  convertEDLToProject,
  type Project,
} from "../../../../packages/openreel-adapter/src/edl-to-openreel";
import type { ProjectEDL as MonetEDL } from "@monet/edl";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export interface Action {
  type: string;
  id: string;
  timestamp: number;
  params: Record<string, unknown>;
}

interface ActionExecutorLike {
  execute(action: Action, project: Project): Promise<ActionResult>;
}

interface StoreState {
  project: Project;
  actionExecutor: ActionExecutorLike;
}

interface StoreGet {
  (): StoreState;
}

interface StoreSet {
  (next: { project: Project }): void;
}

export interface GenerateHeavyEditInput {
  apiBaseUrl: string;
  projectId: string;
  filePath: string;
  mediaId: string;
  duration: number;
  width: number;
  height: number;
  style: "heavy-tiktok" | "cinematic" | "sports" | "anime" | "clean-captions" | "auto";
  aspectRatio: "16:9" | "9:16" | "1:1";
  targetDuration: number;
  includeTranscript: boolean;
  includeSubjectTrack: boolean;
  minClipDuration: number;
}

export interface GenerateHeavyEditResult {
  edl: MonetEDL;
  importedProject: Project;
  changedClipIds: string[];
}

interface CreateHeavyEditResponse {
  success: boolean;
  error?: ActionError;
  data?: {
    edl?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMonetEDL(value: unknown): value is MonetEDL {
  return isRecord(value) && value.version === 1 && isRecord(value.timeline);
}

function validateInput(input: GenerateHeavyEditInput): ActionResult<null> {
  if (!input.apiBaseUrl || input.apiBaseUrl.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "API_BASE_URL_REQUIRED",
        message: "apiBaseUrl is required",
      },
    };
  }

  if (!input.filePath || input.filePath.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "FILE_PATH_REQUIRED",
        message: "filePath is required",
      },
    };
  }

  if (!Number.isFinite(input.duration) || input.duration <= 0) {
    return {
      success: false,
      error: {
        code: "VALID_DURATION_REQUIRED",
        message: "duration must be a positive number",
      },
    };
  }

  if (
    !Number.isFinite(input.width) ||
    !Number.isFinite(input.height) ||
    input.width <= 0 ||
    input.height <= 0
  ) {
    return {
      success: false,
      error: {
        code: "VALID_DIMENSIONS_REQUIRED",
        message: "width and height must be positive numbers",
      },
    };
  }

  if (
    !Number.isFinite(input.minClipDuration) ||
    input.minClipDuration < 0.1 ||
    input.minClipDuration > 3
  ) {
    return {
      success: false,
      error: {
        code: "INVALID_MIN_CLIP_DURATION",
        message: "minClipDuration must be between 0.1 and 3 seconds",
      },
    };
  }

  return {
    success: true,
    data: null,
  };
}

export async function generateHeavyEditAndImport(
  input: GenerateHeavyEditInput,
  get: StoreGet,
  set: StoreSet
): Promise<ActionResult<GenerateHeavyEditResult>> {
  try {
    const validation = validateInput(input);

    if (!validation.success) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const { project, actionExecutor } = get();

    if (!project || !actionExecutor) {
      return {
        success: false,
        error: {
          code: "STORE_NOT_READY",
          message: "Project store or ActionExecutor is not ready",
        },
      };
    }

    const referenceStyle = (project?.settings as any)?.monet?.referenceStyle;

    const createResponse = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/create-heavy-edit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: input.projectId,
        filePath: input.filePath,
        mediaId: input.mediaId,
        duration: input.duration,
        width: input.width,
        height: input.height,
        style: input.style,
        aspectRatio: input.aspectRatio,
        targetDuration: input.targetDuration,
        includeTranscript: input.includeTranscript,
        includeSubjectTrack: input.includeSubjectTrack,
        referenceStyle,
      }),
    });

    const payload = (await createResponse.json()) as CreateHeavyEditResponse;

    if (!createResponse.ok || payload.success !== true) {
      return {
        success: false,
        error: payload.error ?? {
          code: "CREATE_HEAVY_EDIT_FAILED",
          message: `Server returned HTTP ${createResponse.status}`,
        },
      };
    }

    if (!isMonetEDL(payload.data?.edl)) {
      return {
        success: false,
        error: {
          code: "INVALID_EDL_RESPONSE",
          message: "Server did not return a valid MonetEDL",
        },
      };
    }

    const projectResult = convertEDLToProject(payload.data.edl);

    if (!projectResult.success || !projectResult.data) {
      return {
        success: false,
        error: projectResult.error ?? {
          code: "EDL_IMPORT_CONVERSION_FAILED",
          message: "Failed to convert EDL to project",
        },
      };
    }

    const projectCopy = structuredClone(project);

    const importAction: Action = {
      type: "IMPORT_PROJECT",
      id: `action-import-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      params: {
        project: projectResult.data,
      },
    };

    const importResult = await actionExecutor.execute(importAction, projectCopy);

    if (!importResult.success) {
      return {
        success: false,
        error: importResult.error ?? {
          code: "IMPORT_PROJECT_FAILED",
          message: "ActionExecutor failed to import project",
        },
      };
    }

    const guardAction: Action = {
      type: "MONET_ENFORCE_MINIMUM_CLIP_DURATION",
      id: `action-min-duration-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      params: {
        minDuration: input.minClipDuration,
      },
    };

    const guardResult = await actionExecutor.execute(guardAction, projectCopy);

    if (!guardResult.success) {
      return {
        success: false,
        error: guardResult.error ?? {
          code: "MIN_DURATION_GUARD_FAILED",
          message: "Failed to enforce minimum clip duration",
        },
      };
    }

    const guardData = isRecord(guardResult.data)
      ? guardResult.data
      : { changedClipIds: [] };

    const changedClipIds = Array.isArray(guardData.changedClipIds)
      ? guardData.changedClipIds.filter((value): value is string => typeof value === "string")
      : [];

    set({
      project: {
        ...projectCopy,
        modifiedAt: Date.now(),
      },
    });

    return {
      success: true,
      data: {
        edl: payload.data.edl,
        importedProject: projectCopy,
        changedClipIds,
      },
    };
  } catch (error) {
    console.error("[monet-generate-adapter] generateHeavyEditAndImport failed", {
      error,
      projectId: input.projectId,
      filePath: input.filePath,
    });

    return {
      success: false,
      error: {
        code: "GENERATE_HEAVY_EDIT_IMPORT_FAILED",
        message: "Failed to generate and import heavy edit",
      },
    };
  }
}