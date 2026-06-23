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

export interface EnqueueRenderInput {
  apiBaseUrl: string;
  edl: MonetEDL;
  mode: "preview" | "final";
  outputPath?: string;
  width?: number;
  height?: number;
  fps?: number;
}

export interface EnqueueRenderResult {
  jobId: string;
  queue: string;
}

interface RenderResponse {
  success: boolean;
  error?: ActionError;
  data?: {
    jobId?: unknown;
    queue?: unknown;
  };
}

function validateRenderInput(input: EnqueueRenderInput): ActionResult<null> {
  if (!input.apiBaseUrl || input.apiBaseUrl.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "API_BASE_URL_REQUIRED",
        message: "apiBaseUrl is required",
      },
    };
  }

  if (!input.edl || input.edl.version !== 1) {
    return {
      success: false,
      error: {
        code: "INVALID_EDL",
        message: "A valid MonetEDL is required",
      },
    };
  }

  return {
    success: true,
    data: null,
  };
}

export async function enqueueRender(
  input: EnqueueRenderInput
): Promise<ActionResult<EnqueueRenderResult>> {
  try {
    const validation = validateRenderInput(input);

    if (!validation.success) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        edl: input.edl,
        mode: input.mode,
        outputPath: input.outputPath,
        width: input.width,
        height: input.height,
        fps: input.fps,
      }),
    });

    const payload = (await response.json()) as RenderResponse;

    if (!response.ok || payload.success !== true) {
      return {
        success: false,
        error: payload.error ?? {
          code: "RENDER_ENQUEUE_FAILED",
          message: `Server returned HTTP ${response.status}`,
        },
      };
    }

    if (typeof payload.data?.jobId !== "string" || typeof payload.data.queue !== "string") {
      return {
        success: false,
        error: {
          code: "INVALID_RENDER_RESPONSE",
          message: "Render endpoint did not return jobId and queue",
        },
      };
    }

    return {
      success: true,
      data: {
        jobId: payload.data.jobId,
        queue: payload.data.queue,
      },
    };
  } catch (error) {
    console.error("[monet-render-adapter] enqueueRender failed", {
      error,
      mode: input.mode,
      edlId: input.edl?.id,
    });

    return {
      success: false,
      error: {
        code: "ENQUEUE_RENDER_FAILED",
        message: "Failed to enqueue render",
      },
    };
  }
}