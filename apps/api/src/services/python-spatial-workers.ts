import type {
  ActionResult,
  DepthManifest,
  PointTrackManifest,
  SubjectMaskManifest,
} from "@monet/edl";

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: "PYTHON_WORKER_HTTP_ERROR",
          message: `Python worker returned HTTP ${response.status}`,
        },
      };
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        success: false,
        error: {
          code: "INVALID_PYTHON_RESPONSE",
          message: "Python worker returned invalid response",
        },
      };
    }

    const record = payload as { success?: unknown; data?: unknown; error?: unknown };

    if (record.success !== true) {
      return {
        success: false,
        error: {
          code: "PYTHON_WORKER_FAILED",
          message: "Python worker reported failure",
        },
      };
    }

    return {
      success: true,
      data: record.data as T,
    };
  } catch (error) {
    console.error("[python-spatial-workers] request failed", { url, error });

    return {
      success: false,
      error: {
        code: "PYTHON_SPATIAL_REQUEST_FAILED",
        message: "Failed to call Python spatial worker",
      },
    };
  }
}

export interface SpatialClipRequest {
  filePath: string;
  clipId: string;
  mediaId: string;
  outputDir?: string;
  sampleEveryNFrames?: number;
  maxFrames?: number;
}

export async function segmentSubjectWithPython(
  input: SpatialClipRequest
): Promise<ActionResult<SubjectMaskManifest>> {
  const baseUrl = getEnv("PYTHON_AI_URL", "http://127.0.0.1:8102");

  return postJson<SubjectMaskManifest>(`${baseUrl}/spatial/segment-subject`, {
    filePath: input.filePath,
    clipId: input.clipId,
    mediaId: input.mediaId,
    outputDir: input.outputDir ?? ".monet-artifacts/spatial",
    sampleEveryNFrames: input.sampleEveryNFrames ?? 8,
    maxFrames: input.maxFrames ?? 240,
  });
}

export async function estimateDepthWithPython(
  input: SpatialClipRequest & { encoder?: "vits" | "vitb" | "vitl" }
): Promise<ActionResult<DepthManifest>> {
  const baseUrl = getEnv("PYTHON_AI_URL", "http://127.0.0.1:8102");

  return postJson<DepthManifest>(`${baseUrl}/spatial/estimate-depth`, {
    filePath: input.filePath,
    clipId: input.clipId,
    mediaId: input.mediaId,
    outputDir: input.outputDir ?? ".monet-artifacts/spatial",
    encoder: input.encoder ?? "vits",
    sampleEveryNFrames: input.sampleEveryNFrames ?? 8,
    maxFrames: input.maxFrames ?? 240,
  });
}

export async function trackPointsWithPython(
  input: SpatialClipRequest & {
    gridSize?: number;
    commercialVerified?: boolean;
  }
): Promise<ActionResult<PointTrackManifest>> {
  const baseUrl = getEnv("PYTHON_AI_URL", "http://127.0.0.1:8102");

  return postJson<PointTrackManifest>(`${baseUrl}/spatial/track-points`, {
    filePath: input.filePath,
    clipId: input.clipId,
    mediaId: input.mediaId,
    outputDir: input.outputDir ?? ".monet-artifacts/spatial",
    gridSize: input.gridSize ?? 10,
    maxFrames: input.maxFrames ?? 120,
    commercialVerified: input.commercialVerified ?? false,
  });
}
