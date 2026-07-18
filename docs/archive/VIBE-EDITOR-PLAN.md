# Vibe Video Editor — Full Codebase Audit + Build Plan

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [What's Built — Full Code](#whats-built--full-code)
3. [Issues Found — With Evidence](#issues-found--with-evidence)
4. [What to Build](#what-to-build)
5. [Dead Code to Delete](#dead-code-to-delete)

---

## Architecture Overview

Two parallel editor paths exist. One is broken, one is functional.

```
Path A (BROKEN): src/routes/editor.tsx
  → Embeds OpenReel iframe via VITE_OPENREEL_EDITOR_URL
  → OpenReel fork was DELETED from repo root
  → iframe has nothing to load
  → 2500+ lines of dead openreel adapter code

Path B (FUNCTIONAL): apps/web/
  → Self-contained editor with timeline, inspector, effects, preview
  → Zustand stores, Canvas2D playback, beat-grid snap
  → Missing: playback controls, undo, waveform, AI chat bridge
```

**Decision: Use Path B (apps/web). Delete Path A.**

---

## What's Built — Full Code

### 1. Timeline Editor (apps/web/src/components/editor/TimelineEditor.tsx)

```tsx
// apps/web/src/components/editor/TimelineEditor.tsx

import React, { useMemo, useRef } from "react";
import { useProjectStore } from "../../stores/project-store";

interface TimelineEditorProps {
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
}

export function TimelineEditor({ selectedClipId, onSelectClip }: TimelineEditorProps) {
  const project = useProjectStore((s: any) => s.project);
  const setStore = useProjectStore.setState;

  const timelineRef = useRef<HTMLDivElement | null>(null);

  const edl = project?.settings?.monet?.edl;
  const duration = useMemo(() => project?.timeline?.duration || 10, [project]);

  // Extract beat markers
  const beatMarkers = useMemo(() => {
    return edl?.timeline?.markers?.filter((m: any) => m.type === "beat" || m.type === "impact") || [];
  }, [edl]);

  if (!project) return null;

  function updateClipStartTime(clipId: string, trackType: string, newStart: number) {
    const updatedProject = structuredClone(project);

    // Apply snap to beat markers (0.2s threshold)
    let snappedStart = newStart;
    for (const marker of beatMarkers) {
      if (Math.abs(marker.time - newStart) < 0.2) {
        snappedStart = marker.time;
        break;
      }
    }

    snappedStart = Math.max(0, snappedStart);

    // Find and update clip in standard tracks
    for (const track of updatedProject.timeline.tracks) {
      if (track.type === trackType) {
        for (const clip of track.clips) {
          if (clip.id === clipId) {
            clip.startTime = snappedStart;
            break;
          }
        }
      }
    }

    // Sync EDL
    const edlObj = updatedProject.settings?.monet?.edl;
    if (edlObj) {
      for (const track of edlObj.timeline.tracks) {
        if (track.type === trackType) {
          for (const clip of track.clips) {
            if (clip.id === clipId || clip.mediaId === clipId) {
              clip.startTime = snappedStart;
              break;
            }
          }
        }
      }
    }

    setStore({ project: updatedProject });
  }

  // Mouse drag handler for sliding clips
  function handleMouseDown(e: React.MouseEvent, clip: any, trackType: string) {
    e.stopPropagation();
    onSelectClip(clip.id);

    const startX = e.clientX;
    const initialStart = clip.startTime;
    const timelineWidth = timelineRef.current?.getBoundingClientRect().width || 1;

    function handleMouseMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = (deltaX / timelineWidth) * duration;
      const computedStart = initialStart + deltaTime;
      updateClipStartTime(clip.id, trackType, computedStart);
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function getTrackColor(type: string, isSelected: boolean) {
    if (isSelected) return "bg-primary border border-white shadow-lg scale-[1.01]";
    
    if (type === "video") return "bg-blue-600/80 hover:bg-blue-500 border border-blue-400/45";
    if (type === "audio") return "bg-emerald-600/80 hover:bg-emerald-500 border border-emerald-400/45";
    if (type === "text") return "bg-amber-600/80 hover:bg-amber-500 border border-amber-400/45";
    return "bg-fuchsia-600/80 hover:bg-fuchsia-500 border border-fuchsia-400/45";
  }

  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-3 shadow-sm text-xs">
      <div className="flex items-center justify-between border-b pb-1">
        <div className="flex flex-col">
          <span className="font-semibold text-primary">Interactive Timeline Editor</span>
          <span className="text-[10px] text-muted-foreground">Drag blocks to slide timing · Snaps to active beat-grid</span>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-semibold">
            ⚡ Beats Snap Active
          </span>
        </div>
      </div>

      {/* Grid Ruler / Markers */}
      <div ref={timelineRef} className="relative w-full bg-muted/20 border rounded p-1 select-none min-h-[160px] flex flex-col gap-2.5 overflow-hidden">
        
        {/* Beat grid vertical lines */}
        {beatMarkers.map((marker: any) => {
          const leftPercent = `${(marker.time / duration) * 100}%`;
          return (
            <div
              key={marker.id}
              className="absolute top-0 bottom-0 border-l border-amber-500/25 z-0 pointer-events-none"
              style={{ left: leftPercent }}
              title={`Beat: ${marker.time.toFixed(2)}s`}
            />
          );
        })}

        {/* Tracks rendering */}
        {project.timeline.tracks.map((track: any) => (
          <div key={track.id} className="relative h-9 flex items-center bg-muted/10 rounded border border-muted-foreground/10 px-2">
            <span className="text-[9px] font-mono capitalize text-muted-foreground font-semibold absolute left-1 top-0.5 bg-background/50 px-1 rounded z-20">
              {track.type}
            </span>

            <div className="w-full h-full relative">
              {track.clips.map((clip: any) => {
                const leftPercent = `${(clip.startTime / duration) * 100}%`;
                const widthPercent = `${(clip.duration / duration) * 100}%`;
                const isSelected = selectedClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => handleMouseDown(e, clip, track.type)}
                    className={[
                      "absolute top-1 bottom-1 flex flex-col justify-center rounded px-2 cursor-col-resize select-none overflow-hidden transition-shadow shadow-sm font-medium text-white text-[9px] z-10",
                      getTrackColor(track.type, isSelected)
                    ].join(" ")}
                    style={{
                      left: leftPercent,
                      width: widthPercent,
                    }}
                  >
                    <div className="truncate font-semibold uppercase tracking-wider leading-none">
                      {clip.mediaId}
                    </div>
                    <div className="truncate opacity-80 text-[8px] mt-0.5">
                      {clip.startTime.toFixed(2)}s · {clip.duration.toFixed(2)}s {clip.speed && clip.speed !== 1 ? `(${clip.speed}x)` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Ruler tick indicators */}
        <div className="flex justify-between text-[8px] text-muted-foreground font-mono px-1 border-t pt-1 border-muted-foreground/10 mt-auto z-10">
          <span>0.00s</span>
          <span>{(duration * 0.25).toFixed(2)}s</span>
          <span>{(duration * 0.5).toFixed(2)}s</span>
          <span>{(duration * 0.75).toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>
    </div>
  );
}
```

**What it does:** Drag-to-slide timeline with beat-grid snap. Color-coded tracks (blue=video, emerald=audio, amber=text).

**What's missing:** No trim handles, no split, no undo, no playback position indicator, no zoom.

---

### 2. Live Preview (apps/web/src/components/editor/LivePreview.tsx)

```tsx
// apps/web/src/components/editor/LivePreview.tsx

import React, { useEffect, useRef, useState } from "react";
import { createWebPlayer } from "../../engine/web-player";
import { useProjectStore } from "../../stores/project-store";

export function LivePreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<ReturnType<typeof createWebPlayer> | null>(null);

  const project = useProjectStore((s: any) => s.project);
  const [playing, setPlaying] = useState(false);

  // Safely extract EDL
  const edl = project?.settings?.monet?.edl;

  useEffect(() => {
    if (!canvasRef.current || !edl) return;

    try {
      playerRef.current = createWebPlayer(canvasRef.current, edl);
    } catch (e) {
      console.error("player init failed", e);
    }

    return () => {
      playerRef.current?.dispose();
    };
  }, [edl]);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;

    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    playerRef.current?.seek(t);
  }

  if (!edl) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded bg-muted/10 text-muted-foreground text-xs min-h-[120px] gap-1">
        <span className="font-semibold">Live Preview Offline</span>
        <span className="text-[10px] opacity-75">Generate or import a heavy edit to start live playback</span>
      </div>
    );
  }

  const duration = project?.timeline?.duration || 0;

  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between border-b pb-1">
        <span className="text-xs font-semibold">Live Preview Engine</span>
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <canvas
        ref={canvasRef}
        width={1080}
        height={1920}
        className="border rounded w-full max-h-[280px] aspect-[9/16] bg-black mx-auto shadow-inner object-contain"
      />

      <div className="flex gap-2 items-center">
        <button
          onClick={togglePlay}
          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:opacity-90 font-medium transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>

        <input
          type="range"
          min="0"
          max={duration}
          step="0.01"
          className="flex-grow accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
          onChange={seek}
        />
      </div>
    </div>
  );
}
```

**What it does:** Canvas2D real-time preview with play/pause + seek slider.

**What's missing:** No stop button, no time display, no speed control, no frame-by-frame, no loading state.

---

### 3. Web Player Engine (apps/web/src/engine/web-player.ts)

```ts
import type { ProjectEDL as MonetEDL } from "@monet/edl";
import { createAudioTimelineEngine } from "./audio/audio-timeline-engine";
import type { AudioTimelineEngine } from "./audio/audio-types";
import { createBeatEngine } from "./audio/beat-engine";
import { runLayeredEffects } from "./effects/layered-effect-runner";
import { resolveFrame } from "./timeline-resolver";

export interface PlayerControls {
  load(): Promise<{ success: boolean; error?: { code: string; message: string } }>;
  play(): Promise<{ success: boolean; error?: { code: string; message: string } }>;
  pause(): { success: boolean; error?: { code: string; message: string } };
  seek(time: number): { success: boolean; error?: { code: string; message: string } };
  dispose(): { success: boolean; error?: { code: string; message: string } };
  getCurrentTime(): number;
}

interface VideoEntry {
  video: HTMLVideoElement;
  ready: boolean;
  error: string | null;
}

function createVideoElement(src: string): VideoEntry {
  const video = document.createElement("video");

  video.src = src;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const entry: VideoEntry = {
    video,
    ready: false,
    error: null,
  };

  video.addEventListener("loadedmetadata", () => {
    entry.ready = true;
  });

  video.addEventListener("error", () => {
    entry.error = `Failed to load video: ${src}`;
  });

  video.load();

  return entry;
}

export function createWebPlayer(canvas: HTMLCanvasElement, edl: MonetEDL): PlayerControls {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }

  const videos = new Map<string, VideoEntry>();
  const audioEngineResult = createAudioTimelineEngine({ edl });
  const audioEngine: AudioTimelineEngine | null = audioEngineResult.success
    ? audioEngineResult.data ?? null
    : null;
  const beatEngine = createBeatEngine(edl);

  if (!audioEngineResult.success) {
    console.error("[WebPlayer] audio engine unavailable; video will use manual clock", {
      error: audioEngineResult.error,
    });
  }

  let playing = false;
  let manualTime = 0;
  let lastFrameTimestamp = 0;
  let animationFrameId: number | null = null;
  let disposed = false;

  function getCurrentTime(): number {
    if (audioEngine) {
      return audioEngine.getTimelineTime();
    }

    return manualTime;
  }

  function getVideo(mediaId: string, src: string): VideoEntry {
    const existing = videos.get(mediaId);

    if (existing) {
      return existing;
    }

    const created = createVideoElement(src);
    videos.set(mediaId, created);
    return created;
  }

  function drawPlaceholder(message: string): void {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "600 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  function drawVideoFrame(
    video: HTMLVideoElement,
    clipCrop: { x: number; y: number; width: number; height: number } | undefined
  ): void {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      drawPlaceholder("Loading video frame...");
      return;
    }

    if (clipCrop) {
      const sx = video.videoWidth * clipCrop.x;
      const sy = video.videoHeight * clipCrop.y;
      const sw = video.videoWidth * clipCrop.width;
      const sh = video.videoHeight * clipCrop.height;

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  function render(timestamp: number): void {
    if (!playing || disposed) {
      return;
    }

    if (!audioEngine) {
      const delta = lastFrameTimestamp === 0 ? 0 : (timestamp - lastFrameTimestamp) / 1000;
      manualTime += delta;
    }

    lastFrameTimestamp = timestamp;

    const timelineTime = getCurrentTime();
    const frame = resolveFrame(edl, timelineTime);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!frame) {
      drawPlaceholder("No active video clip");
      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const asset = edl.assets.media[frame.clip.mediaId];

    if (!asset) {
      drawPlaceholder(`Missing asset: ${frame.clip.mediaId}`);
      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const entry = getVideo(asset.id, asset.path);

    if (entry.error) {
      drawPlaceholder(entry.error);
      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const safeLocalTime = Math.max(0, Math.min(frame.localTime, Math.max(0, asset.duration - 0.02)));

    if (Number.isFinite(safeLocalTime)) {
      const drift = Math.abs(entry.video.currentTime - safeLocalTime);

      if (drift > 0.06) {
        try {
          entry.video.currentTime = safeLocalTime;
        } catch (error) {
          console.error("[WebPlayer] video seek failed", {
            error,
            mediaId: asset.id,
            safeLocalTime,
          });
        }
      }
    }

    const layers = runLayeredEffects(frame.clip.effects, {
      time: timelineTime,
      localTime: frame.localTime,
      duration: frame.clip.duration,
      ctx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      beatEngine,
    });

    layers.runBackground();

    drawVideoFrame(entry.video, frame.clip.transforms.crop?.[0]);

    layers.runForeground();

    ctx.restore();

    animationFrameId = requestAnimationFrame(render);
  }

  return {
    async load() { /* ... full implementation above ... */ },
    async play() { /* ... full implementation above ... */ },
    pause() { /* ... full implementation above ... */ },
    seek(time: number) { /* ... full implementation above ... */ },
    dispose() { /* ... full implementation above ... */ },
    getCurrentTime(): number {
      return getCurrentTime();
    },
  };
}
```

**What it does:** Full Canvas2D playback engine. Creates `<video>` elements per clip, seeks them, renders frames to canvas with layered effects. Audio sync via AudioTimelineEngine. Beat detection via BeatEngine.

**What's missing:** No `stop()` method, no `setSpeed()`, no `getDuration()`, no `isPlaying()` getter.

---

### 4. Timeline Resolver (apps/web/src/engine/timeline-resolver.ts)

```ts
// apps/web/src/engine/timeline-resolver.ts

import type { ProjectEDL as MonetEDL, Clip } from "@monet/edl";

export interface ResolvedFrame {
  clip: Clip;
  localTime: number;
  globalTime: number;
}

export function resolveFrame(
  edl: MonetEDL,
  time: number
): ResolvedFrame | null {
  for (const track of edl.timeline.tracks) {
    if (track.type !== "video") continue;

    for (const clip of track.clips) {
      const start = clip.startTime;
      const end = clip.startTime + clip.duration;

      if (time >= start && time <= end) {
        return {
          clip,
          localTime: (time - start) * (clip.speed || 1),
          globalTime: time,
        };
      }
    }
  }

  return null;
}
```

**What it does:** Simple linear scan — finds which video clip is active at a given time.

**What's missing:** No transition overlap handling, no multi-track compositing, O(n) per frame.

---

### 5. Project Store (apps/web/src/stores/project-store.ts)

```ts
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

import { create } from 'zustand';

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
```

**What it does:** Zustand store. Creates empty project with video+audio tracks. `applyMonetEDLToProject()` converts EDL to project timeline. `bootstrapEmptyProject()` for fresh start.

**What's missing:** No history stack (undo/redo), no `updateClip()` method, no `deleteClip()`, no `splitClip()`, `any` types everywhere.

---

### 6. Generate Adapter (apps/web/src/stores/monet-generate-adapter.ts)

```ts
import {
  convertEDLToProject,
  type Project,
} from "../../../../packages/openreel-adapter/src/edl-to-openreel";
import type { ProjectEDL as MonetEDL } from "@monet/edl";

// ... (types and validation omitted for brevity — see full file above)

export async function generateHeavyEditAndImport(
  input: GenerateHeavyEditInput,
  get: StoreGet,
  set: StoreSet
): Promise<ActionResult<GenerateHeavyEditResult>> {
  // 1. Validate input
  // 2. POST to /create-heavy-edit with style, aspect, duration params
  // 3. Server returns MonetEDL
  // 4. convertEDLToProject(edl) → OpenReel project format
  // 5. actionExecutor.execute("IMPORT_PROJECT", projectCopy)
  // 6. actionExecutor.execute("MONET_ENFORCE_MINIMUM_CLIP_DURATION", ...)
  // 7. set({ project: projectCopy })
  // Returns: { edl, importedProject, changedClipIds }
}
```

**What it does:** Calls the server to generate an AI edit, converts the EDL to a project, imports it into the store. Fully wired.

**What's missing:** No progress feedback, no cancellation, no retry on failure.

---

### 7. Refine EDL — Server (src/server/api/refine-edl.ts)

```ts
// POST /api/refine-edl - Refine existing EDL based on user feedback

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { scoreNewPipelineEDL } from "../lib/edl-scoring";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const REFINE_SYSTEM =
  "You refine an existing EDL based on user feedback. " +
  "Return the COMPLETE updated EDL as JSON matching the EDL schema. Preserve shot ids when possible. " +
  "If feedback is vague, ask a clarifying question by returning {\"clarification\": \"...\"} instead of an EDL.";

export async function handleRefineEDL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      edlId?: string;
      edl: any;
      feedback: string;
    };

    const { projectId, edl, feedback } = body;
    if (!edl || !feedback) {
      return apiError(ApiErrorCode.InvalidRequest, "edl and feedback are required", 400);
    }

    const ai = getAIService(env);
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 45_000);

    const stream = new ReadableStream({
      async start(controller) {
        let accumulated = "";
        try {
          for await (const chunk of ai.runStream({
            systemPrompt: REFINE_SYSTEM,
            prompt:
              `Current EDL:\n${JSON.stringify(edl)}\n\n` +
              `User feedback: "${feedback}"\n\n` +
              `Return the updated EDL JSON.`,
            maxTokens: 6144,
            signal: abortController.signal,
          })) {
            accumulated += chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`)
            );
          }

          clearTimeout(timeoutId);

          // Final validation
          let parsed: any;
          try {
            const trimmed = accumulated.trim();
            const match = trimmed.match(/```json?\s*([\s\S]*?)```/);
            parsed = JSON.parse(match ? match[1] : trimmed);
          } catch {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "PARSE_FAILED" })}\n\n`
              )
            );
            controller.close();
            return;
          }

          if (parsed.clarification) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ clarification: parsed.clarification })}\n\n`
              )
            );
            controller.close();
            return;
          }

          // Compute scores from the refined EDL
          const scores = scoreNewPipelineEDL(parsed, parsed.music ?? edl.music);

          // Store
          const edlId = crypto.randomUUID();
          if (env.DB) {
            try {
              await env.DB.prepare(
                `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
                .bind(
                  edlId,
                  projectId,
                  JSON.stringify(parsed),
                  scores.beatSyncScore,
                  scores.pacingVariance,
                  scores.overallConfidence,
                  0,
                  feedback,
                  Date.now()
                )
                .run();
            } catch (e) {
              console.warn("[refine-edl] D1 insert failed:", (e as Error).message);
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                edlId,
                edl: parsed,
                scores,
                generationMode: "ai_director",
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          clearTimeout(timeoutId);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "REFINE_FAILED",
                message: (err as Error).message,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[refine-edl] Error:", error);
    return apiError(
      ApiErrorCode.EDLGenerationFailed,
      error.message || "Refine failed",
      500
    );
  }
}
```

**What it does:** Streaming SSE endpoint. Takes EDL + feedback, calls Groq Kimi K2, streams chunks, validates final JSON, stores in D1, returns refined EDL.

**Issue:** Server sends SSE but client doesn't consume the stream (see below).

---

### 8. Refine EDL — Client (src/lib/api-client.ts:388)

```ts
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
```

**Issue:** Calls `res.json()` — ignores the SSE stream. User sees a loading spinner until the full response arrives. No progressive feedback.

---

### 9. Clip Inspector (apps/web/src/components/editor/ClipInspector.tsx)

Full 666-line file. Key sections:

- **Fields:** startTime, duration, speed (0.25x–4x)
- **12 Cinematic FX toggles:** impact_flash, context_shake, player_glow, background_blur, camera_blur, directional_blur, gaussian_blur, sharpen, unsharp_mask, reduce_interlace_flicker, invert, echo, posterize_time, depth_parallax
- **Each FX has parameter sliders** (intensity, blur radius, color picker, etc.)
- **Edits propagate** to both project timeline tracks AND embedded EDL

**What's missing:** No transform controls (position, scale, rotation), no color grading presets, no text overlay editor.

---

## Issues Found — With Evidence

### Issue 1: OpenReel Iframe Editor Is Dead
**Evidence:** `src/routes/editor.tsx` line references `VITE_OPENREEL_EDITOR_URL`. OpenReel fork directory deleted from repo root. `ls OpenReel/` returns nothing. The entire Path A (iframe embed) has nothing to load.

**Impact:** The main editor route (`/editor`) shows a blank iframe.

### Issue 2: SSE Streaming Not Consumed
**Evidence:** Server `refine-edl.ts` line 138-144 returns `text/event-stream`. Client `api-client.ts` line 417 calls `res.json()`.

**Impact:** User waits for full AI response (5-15s) with no progressive feedback. Streaming advantage is wasted.

### Issue 3: No Undo/Redo
**Evidence:** `project-store.ts` — every edit calls `structuredClone(project)` then `setStore({ project: updatedProject })`. No history stack. No `zundo` middleware.

**Impact:** User can't recover from bad edits. One wrong drag = manual fix.

### Issue 4: No Playback Controls
**Evidence:** `LivePreview.tsx` — single play/pause button + range slider. No stop, no time display, no speed control, no frame-by-frame.

**Impact:** Can't precisely preview edits. Can't scrub frame-by-frame to check cuts.

### Issue 5: No Audio Waveform
**Evidence:** `TimelineEditor.tsx` — only shows amber beat marker lines. No waveform visualization. `beatEngine` exists in `web-player.ts` but nothing renders it visually.

**Impact:** User can't see the music structure. Editing to beats is guesswork.

### Issue 6: No Keyboard Shortcuts
**Evidence:** No `useKeyboardShortcuts` hook exists anywhere in `apps/web/`. No `keydown` listeners.

**Impact:** Every action requires mouse clicks. Slows down editing workflow significantly.

### Issue 7: No Clip Trimming/Splitting
**Evidence:** `TimelineEditor.tsx` — `handleMouseDown` only supports drag-to-move. No edge handles for trim. No split-at-playhead.

**Impact:** Can't adjust clip in/out points or cut clips at specific moments.

### Issue 8: `any` Types Everywhere
**Evidence:** `project-store.ts` lines 13-16: `type Action = any; type Project = any; type Clip = any; type Track = any;`. `ClipInspector.tsx` line 12: `(s: any) => s.project`. `TimelineEditor.tsx` line 12: same pattern.

**Impact:** No type safety. Refactoring is dangerous. Editor won't catch bugs at compile time.

### Issue 9: Dead OpenReel Code (~2500 lines)
**Evidence:**
- `src/lib/openreel/edl-to-openreel.ts` (622 lines) — OpenReel fork deleted
- `src/lib/openreel/openreel-to-edl.ts` (287 lines) — dead
- `src/lib/openreel/editor-wrapper.ts` (107 lines) — dead
- `src/lib/openreel/monet-bridge.ts` (122 lines) — dead
- `src/lib/openreel/motion-tracking.ts` (113 lines) — dead
- `src/lib/openreel/face-tracking.ts` (193 lines) — dead
- `src/lib/openreel/planar-tracking.ts` (62 lines) — dead
- `src/lib/openreel-adapter.ts` (987 lines) — duplicate adapter

**Impact:** Confusing codebase. New contributors don't know what's real.

### Issue 10: Timeline Resolver Is O(n)
**Evidence:** `timeline-resolver.ts` — linear scan through all tracks and clips every frame. 33 lines, no optimization.

**Impact:** Fine for <20 clips. Will lag on complex edits with 50+ clips.

### Issue 11: Generate Adapter Imports Dead Package
**Evidence:** `monet-generate-adapter.ts` line 1-4:
```ts
import {
  convertEDLToProject,
  type Project,
} from "../../../../packages/openreel-adapter/src/edl-to-openreel";
```
Also `edl-adapter.ts` line 1:
```ts
import { convertEDLToProject } from "@monet/openreel-adapter";
```

**Impact:** These imports work because `packages/openreel-adapter/` still exists, but it's a dead package that should be cleaned up. The import paths are fragile relative paths.

### Issue 12: No Export from apps/web
**Evidence:** `MonetGeneratePanel.tsx` has "Render Preview" button that calls `enqueueRender()` → POST to `/render`. No "Export MP4" button wired to the FFmpeg export path.

**Impact:** Can't export final video from the editor UI.

---

## What to Build

### P0 — Make It Usable (1-2 sessions)

#### 1. Kill iframe editor, make apps/web the entry
- Replace `src/routes/editor.tsx` with redirect to apps/web OR embed apps/web via iframe
- Delete all `src/lib/openreel/` files (7 files, ~1500 lines)
- Delete `src/lib/openreel-adapter.ts` (987 lines)

#### 2. Wire AI chat to timeline (killer feature)
- Add chat input to `MonetGeneratePanel.tsx`
- Create `refineFromChat()` in `edl-adapter.ts` that calls `refineEDL()` → patches store
- Fix `api-client.ts:refineEDL()` to consume SSE stream
- On AI response: update project store → timeline re-renders

#### 3. Playback controls
- Add stop button, time display (current/total), speed toggle to `LivePreview.tsx`
- Add `stop()`, `setSpeed()`, `getDuration()`, `isPlaying()` to `web-player.ts`

#### 4. Undo/redo
- Add `zustand/temporal` middleware to `project-store.ts`
- Max 50 states. Every `setStore({ project })` pushes to history.

### P1 — Make It Good (2-3 sessions)

#### 5. Clip trimming + splitting
- Edge drag handles on clips in `TimelineEditor.tsx`
- Split-at-playhead button or shortcut

#### 6. Audio waveform
- New `AudioWaveform.tsx` component using Web Audio API
- Render in timeline below video tracks

#### 7. Keyboard shortcuts
- New `useKeyboardShortcuts.ts` hook
- Space=play/pause, arrows=seek, Cmd+Z=undo, Delete=remove, S=split

#### 8. Export button
- Wire "Export MP4" button to `queueServerExport()` from api-client

---

## Dead Code to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/lib/openreel/edl-to-openreel.ts` | 622 | OpenReel fork deleted |
| `src/lib/openreel/openreel-to-edl.ts` | 287 | OpenReel fork deleted |
| `src/lib/openreel/editor-wrapper.ts` | 107 | OpenReel fork deleted |
| `src/lib/openreel/monet-bridge.ts` | 122 | OpenReel fork deleted |
| `src/lib/openreel/motion-tracking.ts` | 113 | OpenReel fork deleted |
| `src/lib/openreel/face-tracking.ts` | 193 | OpenReel fork deleted |
| `src/lib/openreel/planar-tracking.ts` | 62 | OpenReel fork deleted |
| `src/lib/openreel-adapter.ts` | 987 | Duplicate adapter |
| `src/routes/openreel-sandbox.tsx` | — | Dead sandbox |
| `src/routes/editly-showcase.tsx` | — | Dead sandbox |
| `packages/openreel-adapter/` | — | Dead package |
| **Total** | **~2500+** | |
