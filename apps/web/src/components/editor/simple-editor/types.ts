export type EditorStage = "idle" | "uploading" | "analyzing" | "generating" | "ready" | "regenerating" | "error";

export interface HistoryEntry {
  id: string;
  prompt: string;
  summary?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "kove" | "system";
  text: string;
  timestamp: number;
  reasoning?: { clip: number; text: string }[];
  metrics?: { clips: number; duration: number; onBeat: number; slowMo: number };
  scope?: { from: number; to: number };
  actions?: { label: string; variant: "primary" | "ghost" }[];
}

export interface UploadedFile {
  id: string;
  file: File;
  type: "footage" | "music" | "reference";
  preview?: string;
  r2FileId?: string;
}
