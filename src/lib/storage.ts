import { useEffect, useState, useCallback } from "react";

// ---------- Chat threads ----------
export type ChatRole = "user" | "assistant";
export interface ChatAttachment {
  id: string;
  type: "footage" | "music" | "reference";
  name: string;
  sizeBytes: number;
  r2FileId?: string;
}
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  attachments?: ChatAttachment[];
}
export interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  /** Latest generated EDL — stored for Studio import */
  latestEdl?: unknown;
  latestEdlId?: string;
  /** Latest analyzed reference editing DNA for replication mode */
  latestReferenceStyle?: unknown;
  projectId?: string;
}

const THREADS_KEY = "monet.chat.threads.v1";

function readThreads(): ChatThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatThread[];
  } catch {
    return [];
  }
}

function writeThreads(threads: ChatThread[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
}

export function useChatThreads() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setThreads(readThreads());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: ChatThread[]) => {
    setThreads(next);
    writeThreads(next);
  }, []);

  const createThread = useCallback((): ChatThread => {
    const thread: ChatThread = {
      id: cryptoId(),
      title: "New conversation",
      updatedAt: Date.now(),
      messages: [],
    };
    const current = readThreads();
    const next = [thread, ...current];
    persist(next);
    return thread;
  }, [persist]);

  const deleteThread = useCallback(
    (id: string) => {
      const next = readThreads().filter((t) => t.id !== id);
      persist(next);
    },
    [persist],
  );

  const updateThread = useCallback(
    (id: string, updater: (t: ChatThread) => ChatThread) => {
      const next = readThreads().map((t) => (t.id === id ? updater(t) : t));
      persist(next);
    },
    [persist],
  );

  return { threads, hydrated, createThread, deleteThread, updateThread };
}

// ---------- Studio projects ----------
export interface Clip {
  id: string;
  name: string;
  start: number; // seconds in timeline
  duration: number;
  track: number;
  color: string;
}
export interface StudioProject {
  id: string;
  name: string;
  updatedAt: number;
  clips: Clip[];
  /** Source chat thread this project was imported from */
  sourceThreadId?: string;
  /** Latest imported/generated EDL for advanced rendering/editing */
  latestEdl?: unknown;
  latestEdlId?: string;
}

const PROJECTS_KEY = "monet.studio.projects.v1";

function readProjects(): StudioProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StudioProject[];
  } catch {
    return [];
  }
}
function writeProjects(p: StudioProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(p));
}

export function useStudioProjects() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProjects(readProjects());
    setHydrated(true);
  }, []);

  const persist = (next: StudioProject[]) => {
    setProjects(next);
    writeProjects(next);
  };

  const createProject = (): StudioProject => {
    const p: StudioProject = {
      id: cryptoId(),
      name: "Untitled project",
      updatedAt: Date.now(),
      clips: sampleClips(),
    };
    const next = [p, ...readProjects()];
    persist(next);
    return p;
  };

  const updateProject = (id: string, updater: (p: StudioProject) => StudioProject) => {
    const next = readProjects().map((p) => (p.id === id ? updater(p) : p));
    persist(next);
  };

  return { projects, hydrated, createProject, updateProject };
}

function sampleClips(): Clip[] {
  return [
    { id: cryptoId(), name: "Opening cut", start: 0, duration: 4, track: 0, color: "#d4a574" },
    { id: cryptoId(), name: "B-roll", start: 4, duration: 3, track: 0, color: "#a3c4a8" },
    { id: cryptoId(), name: "Hero shot", start: 7, duration: 5, track: 0, color: "#b89ec9" },
    { id: cryptoId(), name: "Score", start: 0, duration: 12, track: 1, color: "#7aa8c4" },
    { id: cryptoId(), name: "VO", start: 2, duration: 6, track: 2, color: "#c47a7a" },
  ];
}

export function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}