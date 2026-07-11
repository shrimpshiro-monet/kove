// Re-export refineEDL from root api-client with local type resolution
import type { ProjectEDL as MonetEDL } from "@monet/edl";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// ─── Vibe Generate ───────────────────────────────────────────

export interface VibeGenerateStatus {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "rendering" | "complete" | "failed";
  progress: number;
  message: string;
  result?: {
    projectId: string;
    openReelProject: unknown;
    edl: MonetEDL;
    dnaPath: string;
  };
  error?: string;
}

export async function generateVibeEdit(
  files: { footage: File; reference: File; music?: File },
  projectName: string
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("footage", files.footage);
  formData.append("reference", files.reference);
  if (files.music) formData.append("music", files.music);
  formData.append("projectName", projectName);

  const res = await fetch(`${API_BASE}/api/vibe-generate`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
  return res.json();
}

export async function getVibeGenerateStatus(jobId: string): Promise<VibeGenerateStatus> {
  const res = await fetch(`${API_BASE}/api/vibe-generate/status/${jobId}`);
  if (!res.ok) throw new Error(`Status failed: ${res.status}`);
  return res.json();
}

// ─── Vibe Refine ────────────────────────────────────────────

export interface RefineJobStatus {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "complete" | "failed";
  progress: number;
  message: string;
  result?: { edl: MonetEDL };
  error?: string;
}

export async function refineEdit(
  currentEdl: MonetEDL,
  prompt: string,
  scopeClipIds: string[] | undefined,
  projectName: string,
  referenceDnaPath?: string
): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/api/vibe-refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentEdl, prompt, scopeClipIds, projectName, referenceDnaPath }),
  });
  if (!res.ok) throw new Error(`Refine failed: ${res.status}`);
  return res.json();
}

export async function getRefineStatus(jobId: string): Promise<RefineJobStatus> {
  const res = await fetch(`${API_BASE}/api/vibe-refine/status/${jobId}`);
  if (!res.ok) throw new Error(`Refine status failed: ${res.status}`);
  return res.json();
}

// ─── Render Export ───────────────────────────────────────────

export interface RenderStatus {
  renderJobId: string;
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  renderUrl?: string;
  error?: string;
}

export async function renderExport(
  edl: MonetEDL,
  footagePath: string,
  musicPath?: string
): Promise<{ renderJobId: string }> {
  const res = await fetch(`${API_BASE}/api/render/vibe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edl, footagePath, musicPath }),
  });
  if (!res.ok) throw new Error(`Render failed: ${res.status}`);
  return res.json();
}

export async function getRenderStatus(renderJobId: string): Promise<RenderStatus> {
  const res = await fetch(`${API_BASE}/api/render/vibe/status/${renderJobId}`);
  if (!res.ok) throw new Error(`Render status failed: ${res.status}`);
  return res.json();
}

interface PreviewFrame {
  timestamp: number;
  imageUrl: string;
}

export interface RefineEDLStreamEvents {
  onChunk?: (text: string) => void;
  onClarification?: (q: string) => void;
  onDone?: (payload: { edl: any; edlId: string; scores: any }) => void;
  onError?: (err: { code: string; message: string }) => void;
}

export async function refineEDL(
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
