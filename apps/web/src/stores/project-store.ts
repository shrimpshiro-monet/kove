import type { ProjectEDL as MonetEDL, Clip, Track } from "@monet/edl";
import { validateEDL } from "@monet/edl";
import { create } from "zustand";
import { produce } from "immer";
import { convertShotEDLToProjectEDL } from "./shot-to-project-edl";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
};

// --- ProjectContext Types ---

export type AssetKind = "footage" | "music" | "reference";
export type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";
export type AnalysisStatus = "idle" | "analyzing" | "ready" | "failed" | "degraded";
export type GenerationStatus = "idle" | "generating" | "ready" | "failed";
export type StudioLoadStatus = "idle" | "loading" | "loaded" | "failed";
export type AnalysisMode = "ai_director" | "fast_planner" | "v3_director";

// --- AI Panel Context Types ---

export type EditorSection = "chat" | "clip-inspector" | "effect-inspector" | "timeline" | "history" | "preview" | "studio";

export interface AISuggestion {
  id: string;
  label: string;
  prompt: string;
  section: EditorSection;
}

export interface AIPanelContext {
  activeSection: EditorSection;
  selectedClipId: string | null;
  availableSections: EditorSection[];
  suggestions: AISuggestion[];
}

export interface FootageAsset {
  id: string;
  fileName: string;
  mediaUrl?: string;
  r2FileId?: string;
  uploadStatus: UploadStatus;
  error?: string;
  type: "footage";
}

export interface MusicAsset {
  id: string;
  fileName: string;
  mediaUrl?: string;
  r2FileId?: string;
  uploadStatus: UploadStatus;
  error?: string;
  type: "music";
  bpm?: number;
  beatGrid?: number[];
  onsetCount?: number;
  beatFallback: boolean;
  analysisStatus: AnalysisStatus;
}

export interface ReferenceAsset {
  id: string;
  fileName?: string;
  url?: string;
  mediaUrl?: string;
  r2FileId?: string;
  uploadStatus: UploadStatus;
  error?: string;
  type: "reference";
  referenceStyleId?: string;
  analysisStatus: AnalysisStatus;
  usedInGeneration?: boolean;
}

export interface ProjectAssets {
  footage: FootageAsset[];
  music?: MusicAsset;
  reference?: ReferenceAsset;
}

export interface ProjectPrompt {
  text: string;
  intentId?: string;
  intent?: unknown;
  styleDNA?: unknown;
  intensity?: number;
  tempoMode?: string;
  targetDuration?: number;
}

export interface ProjectAnalysis {
  analysisId?: string;
  footage?: unknown[];
  music?: unknown;
  status: AnalysisStatus;
  referenceStyleId?: string;
}

export interface ProjectGeneration {
  edlId?: string;
  edl?: MonetEDL;
  mode?: AnalysisMode;
  fallbackUsed?: boolean;
  status: GenerationStatus;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
}

export interface ProjectStudioPreview {
  openReelProject?: unknown;
  loadStatus: StudioLoadStatus;
  lastSentAt?: number;
}

export interface ProjectTruth {
  referenceProvided: boolean;
  referenceAnalyzed: boolean;
  referenceUsedInGeneration: boolean;
  musicProvided: boolean;
  bpm?: number;
  beatFallback: boolean;
  generationMode?: AnalysisMode;
  fallbackUsed: boolean;
}

export interface DirectorMessage {
  id: string;
  role: "user" | "kove";
  text: string;
  timestamp: number;
  metadata?: unknown;
}

// --- Existing Types ---

export interface Project {
  id: string;
  name: string;
  edl: MonetEDL;
  mediaLibrary: { items: MediaItem[] };
  settings: Record<string, unknown>;
  modifiedAt: number;
}

export interface MediaItem {
  id: string;
  path: string;
  duration: number;
  type: "video" | "audio" | "image";
}

interface ProjectStoreState {
  // Core project
  project: Project | null;
  actionExecutors: Record<string, any>;
  history: Project[];
  historyIndex: number;
  timelineDirty: boolean;
  isProcessing: boolean;

  // ProjectContext fields
  assets: ProjectAssets;
  prompt: ProjectPrompt;
  analysis: ProjectAnalysis;
  generation: ProjectGeneration;
  studioPreview: ProjectStudioPreview;
  truth: ProjectTruth;
  director: { messages: DirectorMessage[] };

  // AI Panel Context
  aiPanelContext: AIPanelContext;

  // AI Panel Context actions
  setActiveSection: (section: EditorSection) => void;
  setSelectedClipId: (clipId: string | null) => void;
  addSuggestion: (suggestion: AISuggestion) => void;
  clearSuggestions: () => void;

  // Getters
  getDuration: () => number;
  getTracks: () => Track[];
  getClipById: (clipId: string) => { clip: Clip; trackId: string } | null;
  getCurrentMonetEDL: () => MonetEDL | null;

  // Core actions
  bootstrapEmptyProject: () => Project;
  registerActionExecutor: (id: string, executor: any) => void;
  getActionExecutor: (id: string) => any;
  applyMonetEDLToProject: (edl: any, mediaItems?: MediaItem[], mediaUrlMap?: Record<string, string>) => Promise<ActionResult>;
  loadMonetEDL: (edl: MonetEDL) => void;
  markDirty: () => void;
  resetDirtyFlag: () => void;

  // Advanced editor sync
  syncFromAdvancedEditor: (edl: unknown) => ActionResult;

  // ProjectContext actions
  setAssets: (assets: Partial<ProjectAssets>) => void;
  setPrompt: (prompt: Partial<ProjectPrompt>) => void;
  setAnalysis: (analysis: Partial<ProjectAnalysis>) => void;
  setGeneration: (generation: Partial<ProjectGeneration>) => void;
  setProcessing: (processing: boolean) => void;
  setStudioPreview: (preview: Partial<ProjectStudioPreview>) => void;
  setTruth: (truth: Partial<ProjectTruth>) => void;
  addDirectorMessage: (msg: DirectorMessage) => void;
  resetProjectContext: () => void;

  // Timeline actions
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  moveClip: (clipId: string, newStart: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  deleteClip: (clipId: string) => void;
  trimClip: (clipId: string, edge: "start" | "end", newTime: number) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export function createEmptyEDL(): MonetEDL {
  return {
    version: 1,
    id: `edl-${Date.now()}`,
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: "9:16",
      fps: 30,
      sampleRate: 44100,
    },
    assets: { media: {}, audio: {}, overlays: {} },
    timeline: {
      duration: 0,
      tracks: [
        { id: "video-main", type: "video", clips: [], order: 0, locked: false, hidden: false },
        { id: "audio-main", type: "audio", clips: [], order: 1, locked: false, hidden: false },
      ],
      markers: [],
    },
  } as MonetEDL;
}

export function createEmptyProject(): Project {
  return {
    id: `project-${Date.now()}`,
    name: "New Kove Project",
    edl: createEmptyEDL(),
    mediaLibrary: { items: [] },
    settings: {},
    modifiedAt: Date.now(),
  };
}

function recomputeDuration(edl: MonetEDL): number {
  let max = 0;
  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

const MAX_HISTORY = 50;

function pushHistory(state: ProjectStoreState, project: Project): Partial<ProjectStoreState> {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(structuredClone(project));
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  return { history: newHistory, historyIndex: newHistory.length - 1 };
}

const defaultAssets: ProjectAssets = { footage: [], music: undefined, reference: undefined };
const defaultPrompt: ProjectPrompt = { text: "" };
const defaultAnalysis: ProjectAnalysis = { status: "idle" };
const defaultGeneration: ProjectGeneration = { status: "idle" };
const defaultStudioPreview: ProjectStudioPreview = { loadStatus: "idle" };
const defaultTruth: ProjectTruth = {
  referenceProvided: false, referenceAnalyzed: false, referenceUsedInGeneration: false,
  musicProvided: false, beatFallback: false, fallbackUsed: false,
};

export const useProjectStore = create<ProjectStoreState>()((set, get) => ({
  project: null,
  actionExecutors: {},
  history: [],
  historyIndex: -1,
  timelineDirty: false,
  isProcessing: false,

  assets: { ...defaultAssets },
  prompt: { ...defaultPrompt },
  analysis: { ...defaultAnalysis },
  generation: { ...defaultGeneration },
  studioPreview: { ...defaultStudioPreview },
  truth: { ...defaultTruth },
  director: { messages: [] },

  aiPanelContext: {
    activeSection: "chat",
    selectedClipId: null,
    availableSections: ["chat", "timeline", "preview"],
    suggestions: [],
  },

  getDuration: () => get().project?.edl.timeline.duration ?? 0,
  getTracks: () => get().project?.edl.timeline.tracks ?? [],
  getClipById: (clipId) => {
    const tracks = get().project?.edl.timeline.tracks ?? [];
    for (const t of tracks) {
      const c = t.clips.find((cl) => cl.id === clipId);
      if (c) return { clip: c, trackId: t.id };
    }
    return null;
  },

  getCurrentMonetEDL: () => get().project?.edl ?? null,

  loadMonetEDL: (edl) =>
    set((state) => {
      const project = state.project ?? createEmptyProject();
      const updated = { ...project, edl, modifiedAt: Date.now() };
      return { project: updated, timelineDirty: false, ...pushHistory(state, updated) };
    }),

  syncFromAdvancedEditor: (edl: unknown) => {
    try {
      const validated = validateEDL(edl);
      const project = get().project;
      if (!project) {
        return { success: false, error: { code: "NO_PROJECT", message: "No active project to sync into" } };
      }
      const updated = { ...project, edl: validated, modifiedAt: Date.now() };
      set({ project: updated, timelineDirty: true, ...pushHistory(get(), updated) });
      return { success: true, data: { trackCount: validated.timeline.tracks.length } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown validation error";
      console.error("[syncFromAdvancedEditor] Failed:", message);
      return { success: false, error: { code: "VALIDATION_FAILED", message, details: err } };
    }
  },

  markDirty: () => set({ timelineDirty: true }),
  resetDirtyFlag: () => set({ timelineDirty: false }),

  // --- ProjectContext actions ---

  setAssets: (assets) =>
    set((s) => ({ assets: { ...s.assets, ...assets } })),

  setPrompt: (prompt) =>
    set((s) => ({ prompt: { ...s.prompt, ...prompt } })),

  setAnalysis: (analysis) =>
    set((s) => ({ analysis: { ...s.analysis, ...analysis } })),

  setGeneration: (generation) =>
    set((s) => {
      const status = generation.status ?? s.generation.status;
      const isProcessing = status === "generating";
      return {
        generation: { ...s.generation, ...generation },
        isProcessing,
      };
    }),

  setProcessing: (processing) =>
    set({ isProcessing: processing }),

  setStudioPreview: (preview) =>
    set((s) => ({ studioPreview: { ...s.studioPreview, ...preview } })),

  setTruth: (truth) =>
    set((s) => ({ truth: { ...s.truth, ...truth } })),

  addDirectorMessage: (msg) =>
    set((s) => ({ director: { messages: [...s.director.messages, msg] } })),

  setActiveSection: (section) =>
    set((s) => ({ aiPanelContext: { ...s.aiPanelContext, activeSection: section } })),

  setSelectedClipId: (clipId) =>
    set((s) => ({ aiPanelContext: { ...s.aiPanelContext, selectedClipId: clipId } })),

  addSuggestion: (suggestion) =>
    set((s) => ({ aiPanelContext: { ...s.aiPanelContext, suggestions: [...s.aiPanelContext.suggestions, suggestion] } })),

  clearSuggestions: () =>
    set((s) => ({ aiPanelContext: { ...s.aiPanelContext, suggestions: [] } })),

  resetProjectContext: () =>
    set({
      assets: { ...defaultAssets },
      prompt: { ...defaultPrompt },
      analysis: { ...defaultAnalysis },
      generation: { ...defaultGeneration },
      studioPreview: { ...defaultStudioPreview },
      truth: { ...defaultTruth },
      director: { messages: [] },
      aiPanelContext: {
        activeSection: "chat",
        selectedClipId: null,
        availableSections: ["chat", "timeline", "preview"],
        suggestions: [],
      },
    }),

  // --- Core actions ---

  bootstrapEmptyProject: () => {
    const empty = createEmptyProject();
    set({ project: empty, history: [structuredClone(empty)], historyIndex: 0 });
    return empty;
  },

  registerActionExecutor: (id, executor) =>
    set((s) => ({ actionExecutors: { ...s.actionExecutors, [id]: executor } })),

  getActionExecutor: (id) => get().actionExecutors[id],

  applyMonetEDLToProject: async (edlInput, mediaItems?, mediaUrlMap?) => {
    const project = get().project ?? createEmptyProject();

    // [DEBUG-ROOTCAUSE] Stage 3: Before conversion
    const inputShotCount = edlInput?.shots?.length ?? 0;
    const inputTrackClips = edlInput?.timeline?.tracks?.flatMap((t: any) => t.clips ?? []).length ?? 0;
    const inputAssetCount = Object.keys(edlInput?.assets?.media ?? {}).length;
    const inputDuration = edlInput?.timeline?.duration ?? 0;
    const needsConversion = edlInput?.shots && Array.isArray(edlInput.shots) && !edlInput.timeline?.tracks;
    console.log("[DEBUG-ROOTCAUSE] STAGE3_BEFORE_CONVERSION", JSON.stringify({
      inputShotCount,
      inputTrackClips,
      inputAssetCount,
      inputDuration,
      needsConversion: !!needsConversion,
      hasMediaUrlMap: !!mediaUrlMap && Object.keys(mediaUrlMap).length > 0,
      mediaUrlMapSize: Object.keys(mediaUrlMap ?? {}).length,
    }));

    // Auto-detect shot-based EDL and convert to ProjectEDL format
    let edl = edlInput;
    if (edlInput?.shots && Array.isArray(edlInput.shots) && !edlInput.timeline?.tracks) {
      edl = convertShotEDLToProjectEDL(edlInput, mediaUrlMap ?? {});
    }

    const updated = {
      ...project,
      edl,
      ...(mediaItems ? { mediaLibrary: { items: mediaItems } } : {}),
      modifiedAt: Date.now(),
    };

    // [DEBUG-ROOTCAUSE] Stage 5: Pre-store assignment
    const finalClipCount = edl?.timeline?.tracks?.flatMap((t: any) => t.clips ?? []).length ?? 0;
    const finalAssetCount = Object.keys(edl?.assets?.media ?? {}).length;
    const finalDuration = edl?.timeline?.duration ?? 0;
    console.log("[DEBUG-ROOTCAUSE] STAGE5_PRE_STORE_ASSIGNMENT", JSON.stringify({
      finalClipCount,
      finalAssetCount,
      finalDuration,
      trackCount: edl?.timeline?.tracks?.length ?? 0,
    }));

    if (finalClipCount === 0) {
      console.error("[DEBUG-ROOTCAUSE] CRITICAL: EDL has 0 clips before store write!", {
        inputShotCount,
        inputTrackClips,
        needsConversion: !!needsConversion,
        edlKeys: Object.keys(edlInput ?? {}),
        convertedKeys: edl !== edlInput ? Object.keys(edl ?? {}) : "NOT_CONVERTED",
      });
    }

    set({ project: updated, ...pushHistory(get(), updated) });
    return { success: true, data: { appliedShots: edl.timeline?.tracks?.length ?? 0, duration: edl.timeline?.duration ?? 0 } };
  },

  updateClip: (clipId, patch) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            Object.assign(clip, patch);
            break;
          }
        }
        draft.edl.timeline.duration = recomputeDuration(draft.edl);
        draft.modifiedAt = Date.now();
      });
      return { project: updated, timelineDirty: true, ...pushHistory(state, updated) };
    }),

  moveClip: (clipId, newStart) =>
    get().updateClip(clipId, { startTime: Math.max(0, newStart) }),

  trimClip: (clipId, edge, newTime) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) continue;
          if (edge === "start") {
            const delta = newTime - clip.startTime;
            const newDur = clip.duration - delta;
            if (newDur < 0.05) return;
            clip.startTime = newTime;
            clip.duration = newDur;
          } else {
            const newDur = newTime - clip.startTime;
            if (newDur < 0.05) return;
            clip.duration = newDur;
          }
          break;
        }
        draft.edl.timeline.duration = recomputeDuration(draft.edl);
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  splitClip: (clipId, atTime) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx === -1) continue;
          const clip = track.clips[idx];
          const localSplit = atTime - clip.startTime;
          if (localSplit <= 0.05 || localSplit >= clip.duration - 0.05) return;
          const right: Clip = {
            ...structuredClone(clip),
            id: `${clip.id}-r-${crypto.randomUUID().slice(0, 6)}`,
            startTime: atTime,
            duration: clip.duration - localSplit,
          };
          clip.duration = localSplit;
          track.clips.splice(idx + 1, 0, right);
          break;
        }
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  deleteClip: (clipId) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx !== -1) {
            const removedClip = track.clips[idx];
            const removedDuration = removedClip.duration;
            track.clips.splice(idx, 1);
            // Ripple delete: shift subsequent clips earlier to close the gap
            for (let i = idx; i < track.clips.length; i++) {
              track.clips[i].startTime = Math.max(0, track.clips[i].startTime - removedDuration);
            }
            break;
          }
        }
        draft.edl.timeline.duration = recomputeDuration(draft.edl);
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({ project: structuredClone(prev), historyIndex: historyIndex - 1 });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({ project: structuredClone(next), historyIndex: historyIndex + 1 });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}));

export const useEDL = () => useProjectStore((s) => s.project?.edl);
export const useTracks = () => useProjectStore((s) => s.project?.edl.timeline.tracks ?? []);
export const useDuration = () => useProjectStore((s) => s.project?.edl.timeline.duration ?? 0);

// ProjectContext selectors
export const useIsProcessing = () => useProjectStore((s) => s.isProcessing);

export const useAssets = () => useProjectStore((s) => s.assets);
export const usePrompt = () => useProjectStore((s) => s.prompt);
export const useAnalysis = () => useProjectStore((s) => s.analysis);
export const useGeneration = () => useProjectStore((s) => s.generation);
export const useStudioPreview = () => useProjectStore((s) => s.studioPreview);
export const useTruth = () => useProjectStore((s) => s.truth);
export const useDirector = () => useProjectStore((s) => s.director);

// AI Panel Context selectors
export const useAIPanelContext = () => useProjectStore((s) => s.aiPanelContext);
export const useActiveSection = () => useProjectStore((s) => s.aiPanelContext.activeSection);
export const useSuggestions = () => useProjectStore((s) => s.aiPanelContext.suggestions);
