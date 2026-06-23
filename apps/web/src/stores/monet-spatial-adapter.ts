import type { Project } from "../../../../packages/openreel-adapter/src/edl-to-openreel";

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

export interface RunSpatialAnalysisInput {
  apiBaseUrl: string;
  filePath: string;
  clipId: string;
  mediaId: string;
  includeMask: boolean;
  includeDepth: boolean;
  includePointTracking: boolean;
  commercialTrackingVerified: boolean;
  outputDir?: string;
}

export interface RunSpatialAnalysisResult {
  clipId: string;
  attached: string[];
  maskManifest?: unknown;
  depthManifest?: unknown;
  pointTrackManifest?: unknown;
}

interface SpatialAnalyzeResponse {
  success: boolean;
  error?: ActionError;
  data?: {
    mask?: unknown;
    depth?: unknown;
    pointTracks?: unknown;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateInput(input: RunSpatialAnalysisInput): ActionResult<null> {
  if (!isNonEmptyString(input.apiBaseUrl)) {
    return {
      success: false,
      error: {
        code: "API_BASE_URL_REQUIRED",
        message: "apiBaseUrl is required",
      },
    };
  }

  if (!isNonEmptyString(input.filePath)) {
    return {
      success: false,
      error: {
        code: "FILE_PATH_REQUIRED",
        message: "filePath is required",
      },
    };
  }

  if (!isNonEmptyString(input.clipId)) {
    return {
      success: false,
      error: {
        code: "CLIP_ID_REQUIRED",
        message: "clipId is required",
      },
    };
  }

  if (!isNonEmptyString(input.mediaId)) {
    return {
      success: false,
      error: {
        code: "MEDIA_ID_REQUIRED",
        message: "mediaId is required",
      },
    };
  }

  if (!input.includeMask && !input.includeDepth && !input.includePointTracking) {
    return {
      success: false,
      error: {
        code: "NO_SPATIAL_FEATURE_SELECTED",
        message: "At least one spatial feature must be selected",
      },
    };
  }

  return {
    success: true,
    data: null,
  };
}

export async function runSpatialAnalysisAndAttach(
  input: RunSpatialAnalysisInput,
  get: StoreGet,
  set: StoreSet
): Promise<ActionResult<RunSpatialAnalysisResult>> {
  try {
    const validation = validateInput(input);

    if (!validation.success) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/spatial/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        filePath: input.filePath,
        clipId: input.clipId,
        mediaId: input.mediaId,
        includeMask: input.includeMask,
        includeDepth: input.includeDepth,
        includePointTracking: input.includePointTracking,
        commercialTrackingVerified: input.commercialTrackingVerified,
        outputDir: input.outputDir,
      }),
    });

    const payload = (await response.json()) as SpatialAnalyzeResponse;

    if (!response.ok || payload.success !== true) {
      return {
        success: false,
        error: payload.error ?? {
          code: "SPATIAL_ANALYZE_FAILED",
          message: `Spatial analyze returned HTTP ${response.status}`,
        },
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

    const projectCopy = structuredClone(project);

    const action: Action = {
      type: "MONET_ATTACH_SPATIAL_ANALYSIS",
      id: `action-spatial-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        maskManifest: payload.data?.mask,
        depthManifest: payload.data?.depth,
        pointTrackManifest: payload.data?.pointTracks,
      },
    };

    const result = await actionExecutor.execute(action, projectCopy);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? {
          code: "ATTACH_SPATIAL_ANALYSIS_FAILED",
          message: "ActionExecutor failed to attach spatial analysis",
        },
      };
    }

    const attached =
      result.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data) &&
      Array.isArray((result.data as { attached?: unknown }).attached)
        ? (result.data as { attached: unknown[] }).attached.filter(
            (value): value is string => typeof value === "string"
          )
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
        clipId: input.clipId,
        attached,
        maskManifest: payload.data?.mask,
        depthManifest: payload.data?.depth,
        pointTrackManifest: payload.data?.pointTracks,
      },
    };
  } catch (error) {
    console.error("[monet-spatial-adapter] runSpatialAnalysisAndAttach failed", {
      error,
      clipId: input.clipId,
      mediaId: input.mediaId,
    });

    return {
      success: false,
      error: {
        code: "RUN_SPATIAL_ANALYSIS_ATTACH_FAILED",
        message: "Failed to run and attach spatial analysis",
      },
    };
  }
}
