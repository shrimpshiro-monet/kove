// API Client for Monet backend
// Typed fetch wrappers for all endpoints

import type { ProjectEDL as MonetEDL } from "@monet/edl";

interface PreviewFrame {
  timestamp: number;
  imageUrl: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function handleResponse<T>(response: Response): Promise<T> {
  const url = response.url;
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";

  let rawText = "";

  try {
    rawText = await response.text();
  } catch {
    rawText = "";
  }

  let parsed: any = null;

  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  console.log(`[api-client] ${url} responded with status ${status}`);

  if (!response.ok) {
    // Handle 429 (rate limited) and 503 (model loading) — these come with upgradeCta
    if ((status === 429 || status === 503) && parsed?.upgradeCta) {
      const error: any = new Error(parsed.error || `HTTP ${status}`);
      error.upgradeCta = parsed.upgradeCta;
      error.code = parsed.code;
      error.retryAfterSec = parsed.retryAfterSec;
      error.status = status;
      error.fallbackTriggered = true;
      throw error;
    }

    const message =
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      parsed?.details ||
      rawText ||
      response.statusText ||
      `HTTP ${status}`;

    console.error("[api-client] request failed", {
      url,
      status,
      contentType,
      parsed,
      rawText,
    });

    throw new Error(
      typeof message === "string"
        ? `HTTP ${status}: ${message}`
        : `HTTP ${status}: ${JSON.stringify(message, null, 2)}`
    );
  }

  if (!rawText) {
    return undefined as T;
  }

  if (parsed !== null) {
    return parsed as T;
  }

  throw new Error(`Expected JSON from ${url}, got: ${rawText.slice(0, 500)}`);
}

export interface IntentResult {
  success: boolean;
  intentId?: string;
  result?: {
    intent: any;
    confidence: number;
    reasoning: string;
    clarifyingQuestions?: Array<{
      question: string;
      options: string[];
      affectsField: string;
    }>;
  };
  cached?: boolean;
  error?: string;
}

export interface AnalysisResult {
  success: boolean;
  analysisId?: string;
  result?: {
    version: string;
    projectId: string;
    timestamp: number;
    footage: any[];
    music?: any;
  };
  cached?: boolean;
  error?: string;
}

export interface EDLResult {
  success: boolean;
  edlId?: string;
  edl?: {
    version: string;
    metadata: any;
    timeline: any;
    music?: any;
    shots: any[];
    globalEffects?: any;
  };
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  usedFallback?: boolean;
  error?: string;
}

export interface ReferenceStyleResult {
  success: boolean;
  referenceStyleId?: string;
  style?: import("../server/types/reference-style").ReferenceStyle;
  cached?: boolean;
  error?: string;
}

export interface StyleCompileResult {
  success: boolean;
  style?: any;
  cached?: boolean;
  source?: string;
  error?: string;
}

export async function compileStyle(
  prompt: string,
  signal?: AbortSignal,
): Promise<StyleCompileResult> {
  const res = await fetch(`${API_BASE}/api/style/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });

  return handleResponse<StyleCompileResult>(res);
}

/**
 * Extract creative intent from user prompt.
 * Optionally pass a reference style to steer generation toward that visual/rhythm DNA.
 */
export async function decodeIntent(
  prompt: string,
  projectId: string,
  referenceStyle?: import("../server/types/reference-style").ReferenceStyle,
  signal?: AbortSignal
): Promise<IntentResult> {
  const body: Record<string, unknown> = { prompt, projectId };
  if (referenceStyle) {
    body.context = {
      hasReference: true,
      referenceStyle,
    };
  }
  const res = await fetch(`${API_BASE}/api/decode-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  return handleResponse<IntentResult>(res);
}

/**
 * Analyze a reference video to extract its editing DNA (ReferenceStyle).
 * The fileId must already be uploaded to R2 via uploadFileDirect().
 * Returns a ReferenceStyle with concrete values that drive EditIntent generation.
 */
export async function analyzeReferenceStyle(
  projectId: string,
  fileId: string,
  signal?: AbortSignal
): Promise<ReferenceStyleResult> {
  const res = await fetch(`${API_BASE}/api/analyze-reference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, referenceFileId: fileId }),
    signal,
  });

  return handleResponse<ReferenceStyleResult>(res);
}

/**
 * Analyze a PUBLIC YouTube video to extract its editing DNA.
 * Gemini watches the video directly from YouTube — no download required.
 * Accepts: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...
 */
export async function analyzeReferenceStyleByUrl(
  projectId: string,
  youtubeUrl: string,
  signal?: AbortSignal
): Promise<ReferenceStyleResult> {
  const res = await fetch(`${API_BASE}/api/analyze-reference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, youtubeUrl }),
    signal,
  });

  return handleResponse<ReferenceStyleResult>(res);
}

/**
 * Analyze footage and music
 */
export async function analyzeMedia(
  projectId: string,
  footageIds: string[],
  musicId?: string,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  const payload = {
    projectId,
    footageIds,
    musicId,
  };

  console.log("[api-client] analyzeMedia payload", payload);

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  return handleResponse<AnalysisResult>(res);
}

/**
 * Generate EDL from intent + analysis.
 * Pass referenceStyle to inject the reference editor's philosophy directly
 * into the EDL generation prompt — this is what makes it edit like them.
 */
export async function generateEDL(
  projectId: string,
  intentId: string,
  analysisId: string,
  referenceStyle?: import("../server/types/reference-style").ReferenceStyle,
  referenceTrace?: any,
  referenceMode: "strict_replication" | "inspired" = "strict_replication",
  prompt?: string,
  style?: string,
  durationSeconds?: number,
  styleDNA?: any,
  intensity?: number,
  tempoMode?: "beat_locked" | "beat_anticipated" | "narrative" | "cinematic" | "chill_vlog" | "reference_mirror",
  analysisData?: unknown
): Promise<EDLResult> {
  const res = await fetch(`${API_BASE}/api/generate-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      intentId,
      analysisId,
      analysisData,
      referenceStyle,
      referenceTrace,
      referenceMode,
      prompt,
      style,
      durationSeconds,
      styleDNA,
      intensity,
      tempoMode,
    }),
  });

  return handleResponse<EDLResult>(res);
}

export interface UploadResult {
  success: boolean;
  fileId: string;
  r2Key?: string;
  filename?: string;
  size?: number;
  error?: string;
}

export interface RefineEDLResult {
  success: boolean;
  edlId?: string;
  edl?: EDLResult["edl"];
  scores?: EDLResult["scores"];
  feedbackApplied?: string;
  error?: string;
}

export interface TranscribeResult {
  success: boolean;
  cached?: boolean;
  result?: {
    projectId: string;
    mediaId: string;
    words: Array<{
      text: string;
      start_ms: number;
      end_ms: number;
      confidence: number;
      intensity: number;
    }>;
    full_text: string;
    duration_ms: number;
  };
  error?: string;
}

/**
 * Upload a media file directly to R2 via the backend.
 * Streams the file as FormData — no client-side buffering.
 * 
 * @param file - The file to upload
 * @param projectId - Project this file belongs to
 * @param type - "footage" | "music" | "reference"
 * @param signal - Optional AbortController signal for cancellation
 */
export async function uploadFileDirect(
  file: File,
  projectId: string,
  type: "footage" | "music" | "reference",
  metadata?: {
    duration: number;
    width: number;
    height: number;
    fps?: number;
    codec?: string;
  },
  signal?: AbortSignal
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectId", projectId);
  formData.append("type", type);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }

  const res = await fetch(`${API_BASE}/api/upload/direct`, {
    method: "POST",
    body: formData,
    signal,
  });

  const rawText = await res.text();

  if (!res.ok) {
    console.error("[upload/direct failed]", {
      status: res.status,
      body: rawText,
    });
    throw new Error(rawText || `Upload failed with status ${res.status}`);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Upload returned invalid JSON: ${rawText}`);
  }
}

export interface RefineEDLStreamEvents {
  onChunk?: (text: string) => void;
  onClarification?: (q: string) => void;
  onDone?: (payload: { edl: any; edlId: string; scores: any }) => void;
  onError?: (err: { code: string; message: string }) => void;
}

async function refineEDLStream(
  params: {
    projectId: string;
    edlId?: string;
    edl: any;
    feedback: string;
    intentId?: string;
    analysisId?: string;
    annotations?: any;
    referenceStyle?: any;
    referenceMode?: "strict_replication" | "inspired";
  },
  events: RefineEDLStreamEvents = {},
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/refine-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referenceMode: "strict_replication",
      ...params,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    events.onError?.({
      code: "HTTP_ERROR",
      message: `Server returned ${res.status}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const obj = JSON.parse(payload);
            if (obj.chunk) events.onChunk?.(obj.chunk);
            else if (obj.clarification) events.onClarification?.(obj.clarification);
            else if (obj.error)
              events.onError?.({ code: obj.error, message: obj.message ?? "" });
            else if (obj.done)
              events.onDone?.({ edl: obj.edl, edlId: obj.edlId, scores: obj.scores });
          } catch {
            // ignore parse errors on partial frames
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      events.onError?.({ code: "ABORTED", message: "User cancelled" });
    } else {
      events.onError?.({ code: "STREAM_ERROR", message: String(err) });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Backward-compatible refineEDL — accepts old positional args or new params object.
 * Used by chat_.$threadId.tsx (old) and useRefineEDL hook (new).
 */
export async function refineEDL(
  ...args: any[]
): Promise<any> {
  // New signature: (params, events?, signal?)
  if (args.length >= 1 && typeof args[0] === "object" && !Array.isArray(args[0]) && "projectId" in args[0] && "edl" in args[0] && "feedback" in args[0]) {
    return refineEDLStream(args[0], args[1], args[2]);
  }

  // Old signature: (projectId, edlId, edl, feedback, intentId?, analysisId?, annotations?, referenceStyle?, referenceMode?)
  const [projectId, edlId, edl, feedback, intentId, analysisId, annotations, referenceStyle, referenceMode] = args;
  let result: RefineEDLResult = { success: false };

  await refineEDLStream(
    { projectId, edlId, edl, feedback, intentId, analysisId, annotations, referenceStyle, referenceMode },
    {
      onDone: ({ edl, edlId, scores }) => {
        result = { success: true, edl, edlId, scores };
      },
      onError: (err) => {
        result = { success: false, error: err.message || err.code };
      },
      onClarification: (q) => {
        result = { success: false, error: `Clarification needed: ${q}` };
      },
    }
  );

  return result;
}

/**
 * Transcribe audio/video media for Aesthetic Dissection (Phase 7B).
 * Returns word-level timestamps with intensity scores.
 * Results are cached for 24h — safe to call multiple times.
 */
export async function transcribeMedia(
  projectId: string,
  mediaId: string,
  mediaType: "footage" | "music",
  signal?: AbortSignal
): Promise<TranscribeResult> {
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, mediaId, mediaType }),
    signal,
  });

  return res.json();
}

/**
 * Legacy alias: kept for compatibility, redirects to uploadFileDirect.
 * @deprecated Use uploadFileDirect instead.
 */
export async function uploadFile(file: File): Promise<{ fileId: string }> {
  return uploadFileDirect(file, "legacy", "footage").then((r) => ({ fileId: r.fileId }));
}

export interface CompositionResult {
  success: boolean;
  html?: string;
  source?: "gemini" | "fallback";
  error?: string;
}

export interface StudioProjectLookupResult {
  success: boolean;
  projectId?: string;
  edlId?: string;
  projectName?: string;
  edl?: any;
  source?: "db";
  error?: string;
}

export interface StudioProjectPersistResult {
  success: boolean;
  source?: "db" | "local";
  error?: string;
}

/**
 * Ask Gemini to generate a HyperFrames HTML overlay composition for the video.
 * Gemini creates a completely custom visual treatment based on the user's prompt
 * and EDL data — any genre, any style, any VFX.
 * Falls back to static templates if Gemini fails.
 */
export async function generateCompositionOverlay(
  prompt: string,
  edl: any,
  intent?: unknown,
  signal?: AbortSignal
): Promise<CompositionResult> {
  const res = await fetch(`${API_BASE}/api/generate-composition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, edl, intent }),
    signal,
  });
  return res.json();
}

/**
 * Fetch a Studio timeline from the backend so direct links work across
 * browsers/ports even when local storage is empty.
 */
export async function fetchStudioProject(
  projectId: string,
  threadId?: string,
  signal?: AbortSignal
): Promise<StudioProjectLookupResult> {
  const params = new URLSearchParams({ projectId });
  if (threadId) params.set("threadId", threadId);

  const res = await fetch(`${API_BASE}/api/studio-project?${params.toString()}`, {
    method: "GET",
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      success: false,
      error: body?.error?.message ?? `Studio lookup failed (${res.status})`,
    };
  }

  return res.json();
}

/**
 * Persist a Studio snapshot so direct links can recover even when DB bindings
 * are absent in local dev.
 */
export async function persistStudioProject(
  payload: {
    projectId: string;
    threadId?: string;
    projectName?: string;
    edlId?: string;
    edl: any;
  },
  signal?: AbortSignal
): Promise<StudioProjectPersistResult> {
  const res = await fetch(`${API_BASE}/api/studio-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  return res.json();
}

// ─── Server-side export (WebCodecs fallback for Safari/Firefox) ───────────────

export interface ServerExportQueueResult {
  success: boolean;
  jobId?: string;
  error?: string;
  code?: string;
}

export interface ServerExportStatusResult {
  jobId: string;
  status: "queued" | "processing" | "done" | "error";
  downloadUrl?: string;
  error?: string;
}

/**
 * Enqueue a server-side render job. Returns a jobId immediately.
 * Use when WebCodecs is unavailable (Safari, Firefox).
 */
export async function queueServerExport(
  edl: any,
  projectId?: string,
  signal?: AbortSignal
): Promise<ServerExportQueueResult> {
  const res = await fetch(`${API_BASE}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edl, projectId }),
    signal,
  });
  return res.json();
}

/**
 * Poll render job status. When status === "done", downloadUrl is set.
 */
export async function pollExportStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<ServerExportStatusResult> {
  const res = await fetch(`${API_BASE}/api/export?jobId=${encodeURIComponent(jobId)}`, {
    signal,
  });
  return res.json();
}

export interface DirectorFeedbackResult {
  success: boolean;
  newEDL?: any;
  patchSummary?: string;
  versionId?: string;
  jobId?: string;
  action?: string;
  error?: string;
}

/**
 * Interactive Director feedback loop (Phase 9B).
 */
export async function submitDirectorFeedback(
  projectId: string,
  feedback: string,
  currentEDL?: any,
  keyframes?: PreviewFrame[],
  intentId?: string,
  analysisId?: string,
  signal?: AbortSignal
): Promise<DirectorFeedbackResult> {
  const res = await fetch(`${API_BASE}/api/director/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, feedback, currentEDL, keyframes, intentId, analysisId }),
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      success: false,
      error: body?.error?.message ?? `Director feedback failed (${res.status})`,
    };
  }

  try {
    return (await res.json()) as DirectorFeedbackResult;
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to parse response: ${err.message}`,
    };
  }
}

/**
 * Poll Interactive Director render status.
 */
export async function pollDirectorRender(
  jobId: string,
  signal?: AbortSignal
): Promise<ServerExportStatusResult> {
  const res = await fetch(`${API_BASE}/api/director/render/${encodeURIComponent(jobId)}`, {
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string | { message?: string } }
      | null;
    const errorMsg = typeof body?.error === "object" ? body.error.message : body?.error;
    return {
      jobId,
      status: "error",
      error: errorMsg ?? `Director render poll failed (${res.status})`,
    };
  }

  try {
    return (await res.json()) as ServerExportStatusResult;
  } catch (err: any) {
    return {
      jobId,
      status: "error",
      error: `Failed to parse response: ${err.message}`,
    };
  }
}

/**
 * Wrapper around any specialist API call.
 * Gracefully handles HF rate limits by returning a `fallbackTriggered` flag
 * instead of throwing — the renderer uses MediaPipe browser fallback in that case.
 */
export async function callSpecialistWithFallback<T>(
  fetchFn: () => Promise<T>,
): Promise<{ result?: T; upgradeCta?: any; usedFallback: boolean }> {
  try {
    const result = await fetchFn();
    return { result, usedFallback: false };
  } catch (err: any) {
    if (err.fallbackTriggered) {
      return {
        upgradeCta: err.upgradeCta,
        usedFallback: true,
      };
    }
    throw err;
  }
}
