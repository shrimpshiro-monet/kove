// frontend/src/components/VibeEditor/api.ts
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export type SessionStatus =
  | "draft" | "planning" | "planned"
  | "rendering" | "preview_ready" | "finalized";

export interface EngineScore {
  engine: string;
  success: boolean;
  overall?: number;
  resolution_ok?: boolean;
  duration_match?: number;
  render_time_sec?: number;
  error?: string;
}

export interface SessionState {
  id: string;
  status: SessionStatus;
  prompt: string;
  actionCount: number;
  winner: string | null;
  engines: string[];
  scores: Record<string, EngineScore>;
  triptychPath: string | null;
  finalPath: string | null;
}

export const vibeApi = {
  newSession: async (): Promise<{ sessionId: string }> => {
    const res = await fetch(`${BASE}/api/vibe/session`, { method: "POST" });
    return res.json();
  },

  upload: async (sid: string, files: { raw?: File; reference?: File; music?: File }) => {
    const form = new FormData();
    if (files.raw) form.append("raw", files.raw);
    if (files.reference) form.append("reference", files.reference);
    if (files.music) form.append("music", files.music);
    const res = await fetch(`${BASE}/api/vibe/${sid}/upload`, { method: "POST", body: form });
    return res.json();
  },

  prompt: async (sid: string, prompt: string) => {
    const res = await fetch(`${BASE}/api/vibe/${sid}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    return res.json();
  },

  render: async (sid: string) => {
    const res = await fetch(`${BASE}/api/vibe/${sid}/render`, { method: "POST" });
    return res.json();
  },

  finalize: async (sid: string, engine?: string) => {
    const res = await fetch(`${BASE}/api/vibe/${sid}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine }),
    });
    return res.json();
  },

  status: async (sid: string): Promise<SessionState> => {
    const res = await fetch(`${BASE}/api/vibe/${sid}`);
    return res.json();
  },

  fileUrl: (path: string) => `${BASE}/api/vibe/file?path=${encodeURIComponent(path)}`,
};
