# Frontend-Backend Unification & OpenReel Integration Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire ALL unwired features into the frontend, fix broken imports, register dead executors, and create a unified editing experience with OpenReel.

**Architecture:** The system has 21 high-value features that exist in code but are dead from the web app's perspective. The plan wires them in phases: core pipeline fixes first, then feature layers (shaders, spatial, audio, etc.), then OpenReel bidirectional sync.

**Tech Stack:** TanStack Start, Vite, Zustand, React Query, shadcn/ui, OpenReel (React 18 + WebGPU), Cloudflare Workers, Fastify, BullMQ, FFmpeg, WebGL shaders, MediaPipe, OpenCV

## Global Constraints

- OpenReel runs on port 5173 (Vite default)
- Main Kove app runs on port 3000 (Cloudflare Worker dev)
- Fastify API runs on port 3000 (separate process)
- Redis on port 6379 for BullMQ
- Python sidecars on ports 8101 (audio) and 8102 (Whisper)
- All API calls go through `src/lib/api-client.ts`
- EDL is the source of truth (MonetEDL format)
- No `any` types in TypeScript
- Zod validation on all API boundaries

---

## Phase 1: Fix Broken Things (Critical — Do First)

### Task 1: Fix Dead Export Engine Import

**Files:**
- Modify: `apps/web/src/lib/kove-generation-pipeline.ts`
- Create: `apps/web/src/lib/export-engine.ts` (if missing) OR fix import path

**Interfaces:**
- Consumes: Pipeline dynamic import of `@/lib/export-engine`
- Produces: Working export flow

- [ ] **Step 1: Check if export-engine exists**

```bash
find apps/web/src -name "export-engine*" -type f
```

If found, fix the import path. If not found, create a minimal wrapper.

- [ ] **Step 2: Create export-engine.ts wrapper (if needed)**

```typescript
// apps/web/src/lib/export-engine.ts
import { queueServerExport, pollExportStatus } from "@/lib/api-client";
import type { MonetEDL } from "@monet/edl";

export type ExportProgress = {
  percent: number;
  stage: string;
};

export async function exportEDLToMP4ViaServer(
  edl: MonetEDL,
  mediaUrls: Map<string, string>,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  // Queue the export
  const result = await queueServerExport(edl, Object.fromEntries(mediaUrls));
  if (!result.success || !result.jobId) {
    throw new Error(result.error || "Failed to queue export");
  }

  // Poll for completion
  let status;
  do {
    await new Promise((r) => setTimeout(r, 2000));
    status = await pollExportStatus(result.jobId);
    onProgress?.({ percent: status.progress ?? 0, stage: status.status ?? "rendering" });
  } while (status.status === "processing" || status.status === "queued");

  if (status.status === "failed") {
    throw new Error(status.error || "Export failed");
  }

  // Download the rendered file
  const downloadUrl = status.downloadUrl;
  if (!downloadUrl) throw new Error("No download URL");

  const res = await fetch(downloadUrl);
  return res.blob();
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/kove-generation-pipeline.ts apps/web/src/lib/export-engine.ts
git commit -m "fix: wire export engine import in pipeline"
```

---

### Task 2: Register MonetActionExecutor

**Files:**
- Modify: `src/routes/chat_.$threadId.tsx` (line 33)
- Modify: `apps/web/src/lib/executors/monet-action-executor.ts`

**Interfaces:**
- Consumes: `registerMonetExecutor` function
- Produces: Executor registered in store

- [ ] **Step 1: Verify registerMonetExecutor exists and works**

Read `apps/web/src/lib/executors/monet-action-executor.ts` — find the `registerMonetExecutor` function and verify it's exported.

- [ ] **Step 2: Ensure registration call is correct**

In `chat_.$threadId.tsx` line 33:
```typescript
registerMonetExecutor(useProjectStore);
```

This already exists. Verify the import path is correct and the function actually registers the executor in the store.

- [ ] **Step 3: Add executor registration to project-store**

In `apps/web/src/stores/project-store.ts`, add:
```typescript
registerActionExecutor: (name: string, executor: any) => {
  set((state) => ({
    actionExecutors: { ...state.actionExecutors, [name]: executor },
  }));
},
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/project-store.ts
git commit -m "feat: register MonetActionExecutor in project store"
```

---

### Task 3: Fix Lottie Dependency

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `lottie-web` dynamic import in `src/lib/integrations/lottie-loader.ts`
- Produces: Lottie actually loads at runtime

- [ ] **Step 1: Add lottie-web to root package.json**

```bash
pnpm add lottie-web
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix: add missing lottie-web dependency"
```

---

### Task 4: Wire Media Hydration

**Files:**
- Modify: `apps/web/src/lib/kove-generation-pipeline.ts`
- Modify: `src/routes/chat_.$threadId.tsx`

**Interfaces:**
- Consumes: `syncUploadedFilesAndEDLToProject` from `project-media-hydration.ts`
- Produces: Media library synced with EDL

- [ ] **Step 1: Import hydration in pipeline**

In `kove-generation-pipeline.ts`, add after line 15:
```typescript
import { syncUploadedFilesAndEDLToProject } from "./media/project-media-hydration";
```

- [ ] **Step 2: Call hydration after EDL generation**

After `setGeneration()` (around line 440):
```typescript
// Sync media library with generated EDL
const mediaUrlMap = buildMediaUrlMapFromAssets(store.assets);
syncUploadedFilesAndEDLToProject(edlResult.edl as any, mediaUrlMap);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/kove-generation-pipeline.ts
git commit -m "feat: wire media hydration into generation pipeline"
```

---

## Phase 2: Core Store Features (Undo/Redo, Clip Editing)

### Task 5: Enable Undo/Redo in Chat Flow

**Files:**
- Modify: `src/routes/chat_.$threadId.tsx`

**Interfaces:**
- Consumes: `undo()`, `redo()`, `canUndo()`, `canRedo()` from project store
- Produces: Undo/Redo buttons in chat UI

- [ ] **Step 1: Add undo/redo buttons to chat preview panel**

Find the preview panel controls and add:
```tsx
<div className="flex gap-1">
  <Button
    variant="ghost"
    size="sm"
    onClick={() => useProjectStore.getState().undo()}
    disabled={!useProjectStore.getState().canUndo()}
  >
    Undo
  </Button>
  <Button
    variant="ghost"
    size="sm"
    onClick={() => useProjectStore.getState().redo()}
    disabled={!useProjectStore.getState().canRedo()}
  >
    Redo
  </Button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/chat_.\$threadId.tsx
git commit -m "feat: add undo/redo to chat preview"
```

---

### Task 6: Enable Clip Editing in Project Store

**Files:**
- Modify: `apps/web/src/stores/project-store.ts`

**Interfaces:**
- Consumes: Shot data from generation
- Produces: `updateClip`, `moveClip`, `splitClip`, `deleteClip`, `trimClip` methods

- [ ] **Step 1: Verify store methods exist**

Read `apps/web/src/stores/project-store.ts` and verify the clip editing methods are defined. If they exist but are incomplete, flesh them out.

- [ ] **Step 2: Wire clip editing to EDL mutations**

Ensure that when a clip is updated, the EDL's shots array is also updated:
```typescript
updateClip: (shotId: string, updates: Partial<Shot>) => {
  set((state) => {
    const edl = state.generation.edl;
    if (!edl) return state;
    const shots = edl.shots.map((s: Shot) =>
      s.id === shotId ? { ...s, ...updates } : s
    );
    return { generation: { ...state.generation, edl: { ...edl, shots } } };
  });
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/project-store.ts
git commit -m "feat: wire clip editing to EDL mutations"
```

---

## Phase 3: OpenReel Integration

### Task 7: Add OpenReel to Dev Scripts

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `openreel-video/apps/web/vite.config.ts`
- Produces: OpenReel dev server running alongside main app

- [ ] **Step 1: Add OpenReel dev script**

```json
{
  "dev:openreel": "cd openreel-video && pnpm install && pnpm dev",
  "dev:all": "vite dev & pnpm dev:api & pnpm dev:worker & pnpm dev:openreel & wait"
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat: add OpenReel to dev scripts"
```

---

### Task 8: Add Bidirectional OpenReel Sync

**Files:**
- Modify: `src/routes/studio_.$projectId.tsx`

**Interfaces:**
- Consumes: `monet-project-updated` postMessage from OpenReel
- Produces: EDL synced back to Kove state

- [ ] **Step 1: Add message listener for OpenReel edits**

In the `onMessage` handler (after line 195):
```typescript
if (payload.type === "monet-project-updated") {
  const { openReelProjectToMonetEDL } = await import("@monet/openreel-adapter");
  const { edl } = openReelProjectToMonetEDL(payload.project);
  
  if (sourceThread?.id) {
    updateThread(sourceThread.id, { latestEdl: edl });
  }
  
  await persistStudioProject(projectId, edl);
  setHasUnsavedEdits(false);
}
```

- [ ] **Step 2: Add save button**

```tsx
{hasUnsavedEdits && (
  <div className="absolute top-4 right-4 z-30">
    <Button onClick={saveOpenReelEdits} size="sm">
      Save Edits to Kove
    </Button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/studio_.\$projectId.tsx
git commit -m "feat: add bidirectional OpenReel sync"
```

---

### Task 9: Add "Open in Studio" Button to Chat

**Files:**
- Modify: `src/routes/chat_.$threadId.tsx`

**Interfaces:**
- Consumes: Current EDL from project store
- Produces: Navigation to `/studio/$projectId`

- [ ] **Step 1: Add button to preview panel**

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    if (currentEdl) {
      persistStudioProject(projectId, currentEdl);
      navigate({ to: "/studio/$projectId", params: { projectId } });
    }
  }}
  disabled={!currentEdl}
>
  <Film className="h-4 w-4 mr-1" />
  Open in Studio
</Button>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/chat_.\$threadId.tsx
git commit -m "feat: add Open in Studio button to chat"
```

---

## Phase 4: Missing API Client Functions

### Task 10: Add All Missing API Client Functions

**Files:**
- Modify: `src/lib/api-client.ts`

**Interfaces:**
- Consumes: Backend routes from `src/server.ts`
- Produces: Typed functions for all missing endpoints

- [ ] **Step 1: Add specialist endpoints**

```typescript
export async function isolateSubject(projectId: string, mediaId: string, frameTime: number, signal?: AbortSignal) {
  const res = await apiFetch("/api/specialist/isolate", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, frameTime }), signal,
  });
  return res.json();
}

export async function generateDepthMap(projectId: string, mediaId: string, frameTime: number, signal?: AbortSignal) {
  const res = await apiFetch("/api/specialist/depth", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, frameTime }), signal,
  });
  return res.json();
}

export async function generateSlowMotion(projectId: string, mediaId: string, startTime: number, endTime: number, factor: number, signal?: AbortSignal) {
  const res = await apiFetch("/api/specialist/slowmo", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, startTime, endTime, factor }), signal,
  });
  return res.json();
}
```

- [ ] **Step 2: Add LUT endpoints**

```typescript
export async function generateLUT(projectId: string, mediaId: string, frameTime: number, signal?: AbortSignal) {
  const res = await apiFetch("/api/lut/generate", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, frameTime }), signal,
  });
  return res.json();
}

export async function applyLUT(projectId: string, mediaId: string, lutId: string, signal?: AbortSignal) {
  const res = await apiFetch("/api/lut/apply", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, lutId }), signal,
  });
  return res.json();
}
```

- [ ] **Step 3: Add subject/text endpoints**

```typescript
export async function generateSubjectMask(projectId: string, mediaId: string, frameTime: number, signal?: AbortSignal) {
  const res = await apiFetch("/api/subject/mask", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, frameTime }), signal,
  });
  return res.json();
}

export async function applySubjectBlur(projectId: string, mediaId: string, maskId: string, blurRadius: number, signal?: AbortSignal) {
  const res = await apiFetch("/api/subject/blur", {
    method: "POST", body: JSON.stringify({ projectId, mediaId, maskId, blurRadius }), signal,
  });
  return res.json();
}

export async function generateASS(projectId: string, text: string, style: Record<string, unknown>, signal?: AbortSignal) {
  const res = await apiFetch("/api/text/ass", {
    method: "POST", body: JSON.stringify({ projectId, text, style }), signal,
  });
  return res.json();
}

export async function generateWordHighlightASS(projectId: string, transcript: Array<{ word: string; start: number; end: number }>, highlightColor: string, signal?: AbortSignal) {
  const res = await apiFetch("/api/text/word-ass", {
    method: "POST", body: JSON.stringify({ projectId, transcript, highlightColor }), signal,
  });
  return res.json();
}
```

- [ ] **Step 4: Add vibe refine endpoints**

```typescript
export async function vibeRefine(projectId: string, edl: any, feedback: string, signal?: AbortSignal) {
  const res = await apiFetch("/api/vibe-refine", {
    method: "POST", body: JSON.stringify({ projectId, edl, feedback }), signal,
  });
  return res.json();
}

export async function pollVibeRefineStatus(jobId: string, signal?: AbortSignal) {
  const res = await apiFetch(`/api/vibe-refine/status/${jobId}`, { signal });
  return res.json();
}
```

- [ ] **Step 5: Add composition/transcribe endpoints**

```typescript
export async function generateComposition(projectId: string, edl: any, genre: string, signal?: AbortSignal) {
  const res = await apiFetch("/api/generate-composition", {
    method: "POST", body: JSON.stringify({ projectId, edl, genre }), signal,
  });
  return res.json();
}

export async function detectScenes(projectId: string, mediaId: string, signal?: AbortSignal) {
  const res = await apiFetch("/api/detect-scenes", {
    method: "POST", body: JSON.stringify({ projectId, mediaId }), signal,
  });
  return res.json();
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add all missing API client functions"
```

---

## Phase 5: Style DNA System

### Task 11: Wire Style DNA to Frontend

**Files:**
- Modify: `apps/web/src/lib/kove-generation-pipeline.ts`
- Modify: `src/routes/chat_.$threadId.tsx`

**Interfaces:**
- Consumes: `src/lib/style-dna/library/index.ts`
- Produces: Style DNA presets selectable in UI

- [ ] **Step 1: Import style library**

```typescript
import { stylePresets, type StylePreset } from "@/lib/style-dna/library";
```

- [ ] **Step 2: Add style selector to chat UI**

Create a style picker component or dropdown that lets users select a style preset.

- [ ] **Step 3: Apply style DNA to EDL after generation**

```typescript
import { applyStyleDNA } from "@/lib/style-dna/apply-to-edl";

// After EDL generation:
if (selectedStyle) {
  const styledEdl = applyStyleDNA(edlResult.edl, selectedStyle);
  setGeneration({ edl: styledEdl, status: "ready" });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/kove-generation-pipeline.ts src/routes/chat_.\$threadId.tsx
git commit -m "feat: wire style DNA system to frontend"
```

---

## Phase 6: WebGL Shaders & Effects

### Task 12: Wire Shader Effects to Preview

**Files:**
- Modify: `src/lib/renderer/monet-renderer.ts`

**Interfaces:**
- Consumes: `src/lib/shaders/` modules
- Produces: Shader effects rendered in Canvas2D preview

- [ ] **Step 1: Import shader modules**

```typescript
import { applyShaderEffect } from "./shader-fx";
import { applyWebGLGrade } from "./webgl-grade-renderer";
```

- [ ] **Step 2: Add shader pass to render loop**

In `renderFrameInternal()`, after the main canvas draw:
```typescript
// Apply WebGL effects
if (shot.effects?.some((fx: any) => isShaderEffect(fx.type))) {
  applyShaderEffect(canvas, shot.effects);
}

// Apply color grading
applyWebGLGrade(canvas, shot.effects);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/renderer/monet-renderer.ts
git commit -m "feat: wire WebGL shader effects to preview"
```

---

## Phase 7: Spatial & VFX Features

### Task 13: Wire Spatial Compositor

**Files:**
- Modify: `apps/web/src/engine/web-player.ts`

**Interfaces:**
- Consumes: `apps/web/src/engine/spatial/spatial-compositor.ts`
- Produces: Text-behind-subject, subject aura rendered

- [ ] **Step 1: Import spatial compositor**

```typescript
import { compositeSpatial } from "./spatial/spatial-compositor";
```

- [ ] **Step 2: Add spatial pass to player render loop**

After main effect rendering:
```typescript
if (hasSpatialData(shot)) {
  await compositeSpatial(ctx, video, shot, currentTime, width, height);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/engine/web-player.ts
git commit -m "feat: wire spatial compositor to web player"
```

---

### Task 14: Wire MediaPipe Integrations

**Files:**
- Modify: `src/lib/engines/specialist-compositor.ts`

**Interfaces:**
- Consumes: `src/lib/integrations/mediapipe-segmentation.ts`, `mediapipe-face.ts`
- Produces: Subject isolation, face tracking in browser

- [ ] **Step 1: Import MediaPipe modules**

```typescript
import { browserSubjectPop } from "../integrations/mediapipe-segmentation";
import { detectFaceLandmarks } from "../integrations/mediapipe-face";
```

- [ ] **Step 2: Add MediaPipe fallback**

When SAM mask is unavailable, fall back to MediaPipe:
```typescript
if (!maskUrl) {
  const mask = await browserSubjectPop(video, time);
  // Use mask for compositing
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/engines/specialist-compositor.ts
git commit -m "feat: wire MediaPipe integrations to specialist compositor"
```

---

## Phase 8: Audio Engine

### Task 15: Wire Audio Engine

**Files:**
- Modify: `apps/web/src/engine/audio/audio-engine.ts`
- Modify: `apps/web/src/engine/web-player.ts`

**Interfaces:**
- Consumes: Web Audio API
- Produces: SFX synthesis, ducking, sidechain compression

- [ ] **Step 1: Import audio engine**

```typescript
import { AudioEngine } from "./audio/audio-engine";
```

- [ ] **Step 2: Initialize audio engine in player**

```typescript
const audioEngine = new AudioEngine();
// Wire audio tracks from EDL
for (const track of edl.timeline.tracks.filter(t => t.type === "audio")) {
  audioEngine.addTrack(track);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/engine/web-player.ts
git commit -m "feat: wire audio engine to web player"
```

---

## Phase 9: Velocity & HyperFrames

### Task 16: Wire Velocity System

**Files:**
- Modify: `apps/web/src/engine/effects/effect-runner.ts`

**Interfaces:**
- Consumes: `src/lib/velocity.ts`
- Produces: Bezier time-remapping in effects

- [ ] **Step 1: Import velocity**

```typescript
import { generateVelocityFrameMap } from "@/lib/velocity";
```

- [ ] **Step 2: Apply velocity to speed ramp effects**

```typescript
if (effect.type === "speed_ramp") {
  const velocityMap = generateVelocityFrameMap({
    totalDurationFrames: clip.duration * fps,
    beatFrame: effect.params.beatFrame ?? 0,
    curves: effect.params.curves ?? DEFAULT_VELOCITY_CURVES,
  });
  // Apply velocity map to frame rendering
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/engine/effects/effect-runner.ts
git commit -m "feat: wire velocity system to effects"
```

---

### Task 17: Wire HyperFrames Compositions

**Files:**
- Modify: `src/routes/chat_.$threadId.tsx`

**Interfaces:**
- Consumes: `src/lib/composition-generator.ts`
- Produces: Genre-aware overlay compositions

- [ ] **Step 1: Import composition generator**

```typescript
import { generateComposition, type CompositionGenre } from "@/lib/composition-generator";
```

- [ ] **Step 2: Add composition generation to pipeline**

After EDL generation:
```typescript
const compositionHtml = generateComposition({
  genre: inferGenre(prompt),
  title: edl.metadata?.title ?? "AI Edit",
  subtitle: "MONET · AI-DIRECTED",
  edl: edlResult.edl,
});
setCompositionHtml(compositionHtml);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/chat_.\$threadId.tsx
git commit -m "feat: wire HyperFrames compositions to chat"
```

---

## Phase 10: Specialist Controls in UI

### Task 18: Add Specialist Controls to Video Preview

**Files:**
- Modify: `src/components/chat/VideoPreview.tsx`

**Interfaces:**
- Consumes: `isolateSubject`, `generateDepthMap`, `generateSlowMotion` from api-client
- Produces: UI controls for advanced features

- [ ] **Step 1: Add advanced tools section**

```tsx
const [showAdvanced, setShowAdvanced] = useState(false);

<div className="mt-2">
  <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
    Advanced Tools {showAdvanced ? "▲" : "▼"}
  </Button>
  
  {showAdvanced && (
    <div className="mt-2 p-2 border rounded space-y-2">
      <Button size="sm" variant="outline" onClick={handleIsolateSubject}>
        Isolate Subject
      </Button>
      <Button size="sm" variant="outline" onClick={handleGenerateDepth}>
        Generate Depth Map
      </Button>
      <Button size="sm" variant="outline" onClick={handleSlowMotion}>
        Slow Motion (2x)
      </Button>
      <Button size="sm" variant="outline" onClick={handleGenerateLUT}>
        Generate LUT
      </Button>
    </div>
  )}
</div>
```

- [ ] **Step 2: Implement handlers**

```typescript
const handleIsolateSubject = async () => {
  if (!currentShot || !mediaId) return;
  setIsProcessing(true);
  try {
    const result = await isolateSubject(projectId, mediaId, currentTime);
    if (result.success) console.log("Subject isolated:", result.maskId);
  } finally {
    setIsProcessing(false);
  }
};

const handleGenerateDepth = async () => {
  if (!currentShot || !mediaId) return;
  setIsProcessing(true);
  try {
    const result = await generateDepthMap(projectId, mediaId, currentTime);
    if (result.success) console.log("Depth map generated:", result.depthId);
  } finally {
    setIsProcessing(false);
  }
};

const handleSlowMotion = async () => {
  if (!currentShot || !mediaId) return;
  setIsProcessing(true);
  try {
    const result = await generateSlowMotion(projectId, mediaId, currentShot.source.inPoint, currentShot.source.outPoint, 2);
    if (result.success) console.log("Slow motion generated:", result.outputId);
  } finally {
    setIsProcessing(false);
  }
};

const handleGenerateLUT = async () => {
  if (!mediaId) return;
  setIsProcessing(true);
  try {
    const result = await generateLUT(projectId, mediaId, currentTime);
    if (result.success) setCurrentLutId(result.lutId);
  } finally {
    setIsProcessing(false);
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/VideoPreview.tsx
git commit -m "feat: add specialist controls to video preview"
```

---

## Phase 11: Testing & Verification

### Task 19: Test Full Pipeline End-to-End

**Files:**
- None (testing only)

- [ ] **Step 1: Start all services**

```bash
# Terminal 1: Infrastructure
pnpm infra:up

# Terminal 2: Main app + API + Worker
bun run dev

# Terminal 3: OpenReel
pnpm dev:openreel
```

- [ ] **Step 2: Test chat flow**

1. Open http://localhost:3000
2. Navigate to `/chat`
3. Upload a video file
4. Type a prompt
5. Verify: Intent decoded, analysis runs, EDL generated, preview renders with shaders

- [ ] **Step 3: Test OpenReel integration**

1. Click "Open in Studio"
2. Verify: OpenReel loads with EDL
3. Make edits, click "Save Edits to Kove"
4. Verify: EDL syncs back

- [ ] **Step 4: Test specialist endpoints**

1. Click "Advanced Tools" in video preview
2. Test isolate, depth, slow-mo, LUT

- [ ] **Step 5: Test undo/redo**

1. Generate an EDL
2. Make a refinement
3. Click "Undo" → verify previous state restored
4. Click "Redo" → verify refinement restored

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Run tests**

```bash
pnpm test
```

---

## Summary

| Phase | Tasks | What It Does |
|-------|-------|--------------|
| 1 | 1-4 | Fix broken imports, register executor, fix deps, wire hydration |
| 2 | 5-6 | Enable undo/redo, clip editing |
| 3 | 7-9 | OpenReel dev + bidirectional sync + Studio button |
| 4 | 10 | All 27 missing API client functions |
| 5 | 11 | Style DNA system (18 presets) |
| 6 | 12 | WebGL shaders (50+ effects) |
| 7 | 13-14 | Spatial compositor, MediaPipe integrations |
| 8 | 15 | Audio engine (SFX, ducking, sidechain) |
| 9 | 16-17 | Velocity system, HyperFrames compositions |
| 10 | 18 | Specialist controls UI |
| 11 | 19 | End-to-end testing |

**Total: 19 tasks, ~100+ steps**

**Estimated time: 8-12 hours for a skilled developer**

**Key risks:**
1. OpenReel postMessage protocol may need adjustments
2. WebGL context sharing between canvas layers
3. MediaPipe WASM loading in browser
4. Lottie animation performance
