// API Client for Monet backend
// Typed fetch wrappers for all endpoints

const API_BASE = import.meta.env.VITE_API_BASE || "";

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

  return res.json();
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
    body: JSON.stringify({ projectId, fileId }),
    signal,
  });

  return res.json();
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

  return res.json();
}

/**
 * Analyze footage and music
 */
export async function analyzeMedia(
  projectId: string,
  footageIds: string[],
  musicId?: string
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, footageIds, musicId }),
  });

  return res.json();
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
  referenceMode: "strict_replication" | "inspired" = "strict_replication"
): Promise<EDLResult> {
  const res = await fetch(`${API_BASE}/api/generate-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, intentId, analysisId, referenceStyle, referenceMode }),
  });

  return res.json();
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
  signal?: AbortSignal
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectId", projectId);
  formData.append("type", type);

  const res = await fetch(`${API_BASE}/api/upload/direct`, {
    method: "POST",
    body: formData,
    signal,
  });

  return res.json();
}

/**
 * Refine an existing EDL based on natural language feedback.
 * Uses cached analysis — never re-analyzes footage.
 */
export async function refineEDL(
  projectId: string,
  edlId: string,
  edl: EDLResult["edl"],
  feedback: string,
  intentId?: string,
  analysisId?: string,
  annotations?: import("../server/types/annotation").TimelineAnnotation[],
  referenceStyle?: import("../server/types/reference-style").ReferenceStyle,
  referenceMode: "strict_replication" | "inspired" = "strict_replication",
  signal?: AbortSignal
): Promise<RefineEDLResult> {
  const res = await fetch(`${API_BASE}/api/refine-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      edlId,
      edl,
      feedback,
      intentId,
      analysisId,
      annotations,
      referenceStyle,
      referenceMode,
    }),
    signal,
  });

  return res.json();
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
  edl?: import("../server/types/edl").MonetEDL;
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
  edl: import("../server/types/edl").MonetEDL,
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
    edl: import("../server/types/edl").MonetEDL;
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
  edl: import("../server/types/edl").MonetEDL,
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
