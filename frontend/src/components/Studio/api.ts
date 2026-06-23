// frontend/src/components/Studio/api.ts
const BASE = import.meta.env.VITE_API_BASE || "";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  previewPath?: string;
  error?: string;
}

export interface SessionState {
  id: string;
  version: number;
  actions: any[];
  duration: number;
  segments?: any[];
  captions?: any[];
  chat: ChatMsg[];
  styleProfile?: any;
  styleSummary?: string;
  currentPreview?: string;
  assets: string[];
  lastStats?: any;
}

export const sessionApi = {
  create: async (): Promise<{ sessionId: string }> =>
    (await fetch(`${BASE}/api/session`, { method: "POST" })).json(),

  upload: async (sid: string, files: { raw?: File; reference?: File; music?: File }) => {
    const fd = new FormData();
    if (files.raw) fd.append("raw", files.raw);
    if (files.reference) fd.append("reference", files.reference);
    if (files.music) fd.append("music", files.music);
    return (await fetch(`${BASE}/api/session/${sid}/upload`, { method: "POST", body: fd })).json();
  },

  message: async (sid: string, text: string) =>
    (await fetch(`${BASE}/api/session/${sid}/message`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })).json(),

  patch: async (sid: string, patch: any) =>
    (await fetch(`${BASE}/api/session/${sid}/patch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).json(),

  fileUrl: (sid: string, path: string) =>
    `${BASE}/api/session/${sid}/file?path=${encodeURIComponent(path)}`,
};
