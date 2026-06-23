import type { MonetEDL } from "@monet/edl";
import { monetActionExecutor } from "../lib/executors/monet-action-executor";
type ActionResult = {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
};
// Use any for missing OpenReel types temporarily to fix TS errors
type Action = any;
type Project = any;
type Clip = any;
type Track = any;
import { normalizeEDLForPreview } from "../../../../src/lib/renderer/monet-edl-preview-normalizer";
import { hydrateProjectMediaFromEDL, resolveMediaItem } from "../lib/media/project-media-hydration";

export function createEmptyProject(): Project {
  return {
    id: `project-${Date.now()}`,
    name: "New Monet Project",
    timeline: {
      tracks: [
        {
          id: "video-main",
          type: "video",
          clips: [],
          transitions: [],
          locked: false,
          hidden: false,
        },
        {
          id: "audio-main",
          type: "audio",
          clips: [],
          transitions: [],
          locked: false,
          hidden: false,
        },
      ],
      duration: 0,
      markers: [],
    },
    mediaLibrary: {
      items: [],
    },
    settings: {},
    modifiedAt: Date.now(),
  };
}

function calculateTimelineDuration(project: Project): number {
  return project.timeline.tracks.reduce((max: number, track: Track) => {
    return track.clips.reduce(
      (trackMax: number, clip: Clip) => Math.max(trackMax, clip.startTime + clip.duration),
      max
    );
  }, 0);
}

function findClipByMediaAndStart(
  project: Project,
  mediaId: string,
  startTime: number
): Clip | null {
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (
        clip.mediaId === mediaId &&
        Math.abs(clip.startTime - startTime) < 0.001
      ) {
        return clip;
      }
    }
  }
  return null;
}

function getOrCreateVideoTrack(project: Project): Track {
  const existing = project.timeline.tracks.find(
    (track: Track) => track.type === "video" && !track.locked
  );

  if (existing) {
    return existing;
  }

  const track: Track = {
    id: `track-video-${crypto.randomUUID()}`,
    type: "video",
    clips: [],
    transitions: [],
    locked: false,
    hidden: false,
  };

  project.timeline.tracks.push(track);
  return track;
}

function makeAction(type: string, params: Record<string, unknown>): Action {
  return {
    type,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    params,
  };
}

// Add this into your store slice initialization mapping:
export const projectStoreSlice = (set: any, get: any) => {
  // Register active store globally in the browser context so the standalone projectStore can delegate to it
  if (typeof window !== "undefined") {
    (window as any).__activeProjectStore = { set, get };
  }

  return {
    bootstrapEmptyProject: () => {
      const empty = createEmptyProject();
      set({ project: empty });
      return empty;
    },
    applyMonetEDLToProject: async (edlInput: MonetEDL): Promise<ActionResult> => {
      let { project } = get();

      if (!project) {
        console.warn("[applyMonetEDLToProject] No project found, bootstrapping empty project inside store.");
        project = createEmptyProject();
        set({ project });
      }

      const executor = get().getActionExecutor?.("monet/v1") || monetActionExecutor;

      if (!get().getActionExecutor?.("monet/v1")) {
        console.warn(
          "[applyMonetEDLToProject] No actionExecutor registered; " +
          "using direct singleton (call registerMonetExecutor at boot to silence this)"
        );
      }

      const { project: updatedProject, result } = executor.apply(project, edlInput as any);

      set({
        project: {
          ...updatedProject,
          modifiedAt: Date.now(),
        },
      });

      console.log("[applyMonetEDLToProject] applied", result);
      return {
        success: true,
        data: result,
      };
    }
  };
};

import { create } from 'zustand'; // You may need to `npm install zustand` or `bun add zustand` in the root workspace if it's missing.

export const useProjectStore = create<any>((set: any, get: any) => ({
  // Initialize state
  project: null,
  actionExecutor: null,
  actionExecutors: {},
  
  registerActionExecutor: (id: string, executor: any) => {
    set((state: any) => ({
      actionExecutors: {
        ...state.actionExecutors,
        [id]: executor
      }
    }));
  },
  getActionExecutor: (id: string) => {
    return get().actionExecutors?.[id];
  },
  
  // Spread all methods from the slice
  ...projectStoreSlice(set, get)
}));



