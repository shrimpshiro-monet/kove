# Frontend Unification — Complete Q&A with Code Details

## Decisions Already Made (Q1–Q7)

See previous grilling session. Key decisions:
- OpenReel is one-way (Option B)
- Chat Thread is reference implementation
- Shared orchestrator extracted from Chat Thread
- Zustand = canonical ProjectContext
- localStorage = persistence only
- 8-phase incremental migration
- Two refinement modes (full EDL primary, patch guarded)

---

## Q8: How Should Uploads Be Unified?

### Current State

**Two different upload components, zero progress tracking:**

**Simple Editor** (`apps/web/src/components/editor/simple-editor/ChatInputDock.tsx:92-155`):
```tsx
// File chips display — typed automatically
const added = files.map((file) => ({
  id: crypto.randomUUID(),
  file,
  type: (file.type.startsWith("video/") ? "footage"
    : file.type.startsWith("audio/") ? "music" : "reference"),
}));
onFilesChange?.([...uploadedFiles, ...added]);
```
- HTML `<input type="file" multiple accept="video/*,audio/*,image/*">`
- Files staged in local `UploadedFile[]` state
- No actual server upload here — happens later in SimpleEditorPage
- No progress tracking

**Chat Thread** (`src/components/chat/VideoUploader.tsx:48-64`):
```tsx
export interface UploadedFile {
  id: string; file: File;
  type: "footage" | "music" | "reference";
  preview?: string; r2FileId?: string;
  uploadProgress?: number;  // VESTIGIAL — never populated
}

const added = files.map((file) => ({
  id: crypto.randomUUID(), file,
  type: classifyFileType(file),
  preview: file.type.startsWith("video/") || file.type.startsWith("image/")
    ? URL.createObjectURL(file) : undefined,
}));
```
- Supports drag-and-drop + file picker + YouTube URL input
- Also stages files in local state, no server upload here
- `uploadProgress` field exists but is **never written to**

**Actual upload** (`src/lib/api-client.ts:349-391`):
```ts
export async function uploadFileDirect(
  file: File,
  projectId: string,
  type: "footage" | "music" | "reference",
  metadata?: { duration: number; width: number; height: number; fps?: number; codec?: string },
  signal?: AbortSignal
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectId", projectId);
  formData.append("type", type);
  if (metadata) formData.append("metadata", JSON.stringify(metadata));
  const resp = await fetch(`${API_BASE}/api/upload/direct`, {
    method: "POST", body: formData, signal,
  });
  return resp.json();
}
```
- Uses raw `fetch()` — **no progress events**
- Returns `{ success, fileId, r2Key, filename, size }`
- Both editors call this same function eventually

**Server endpoint** (`apps/api/src/api/upload-direct.ts:24-77`):
```ts
app.post("/api/upload/direct", async (request, reply) => {
  const file = await request.file();
  const assetId = createAssetId();
  const localPath = path.join(UPLOAD_DIR, `${assetId}-${safeFilename(originalName)}`);
  await pipeline(file.file, createWriteStream(localPath));
  return reply.send({
    success: true, fileId: assetId, r2Key: assetId,
    filename: originalName, size: stat.size,
    url: `/uploads/${filename}`,
  });
});
```

### Recommendation

**Extract `uploadAssets()` into the orchestrator.** Both editors call it.

```ts
// apps/web/src/lib/kove-generation-pipeline.ts

type UploadInput = {
  projectId: string;
  files: Array<{ file: File; type: "footage" | "music" | "reference" }>;
  onProgress?: (fileId: string, progress: number) => void;
  signal?: AbortSignal;
};

type UploadResult = {
  assets: Array<{
    id: string;
    fileName: string;
    type: "footage" | "music" | "reference";
    mediaUrl: string;
    size: number;
  }>;
  errors: Array<{ fileName: string; error: string }>;
};

async function uploadAssets(input: UploadInput): Promise<UploadResult> {
  // Upload each file sequentially (or parallel with limit)
  // Store results in Zustand ProjectContext
  // Return unified result
}
```

**Upload component stays in UI layer** (for drag-and-drop, file picker UI), but calls orchestrator for actual upload.

**Progress tracking:** Add `XMLHttpRequest` or `fetch` with `ReadableStream` for progress events. The `uploadProgress` field in `UploadedFile` should actually be populated.

### Answer

| Question | Answer |
|----------|--------|
| Orchestrator function vs shared component? | Orchestrator function `uploadAssets()`. UI components handle drag-drop/picker UI only. |
| UI layer vs orchestrator layer? | Upload UI in component layer. Upload execution in orchestrator layer. |
| Progress/error states? | Orchestrator owns upload state in Zustand. UI reads from Zustand for progress display. |

---

## Q9: What About API Client Duplication?

### Current State

**Two files, significant overlap:**

**Root `src/lib/api-client.ts`** (788 lines) — 17 exported functions:
| Function | Purpose |
|----------|---------|
| `compileStyle()` | Style compilation |
| `decodeIntent()` | Intent extraction |
| `analyzeReferenceStyle()` | Reference video analysis |
| `analyzeReferenceStyleByUrl()` | YouTube URL reference |
| `analyzeMedia()` | Footage+music analysis |
| `generateEDL()` | EDL generation (12 params!) |
| `uploadFileDirect()` | File upload |
| `refineEDL()` | EDL refinement (backward-compat) |
| `transcribeMedia()` | Audio transcription |
| `uploadFile()` | **Legacy alias — deprecated** |
| `generateCompositionOverlay()` | HyperFrames overlay |
| `fetchStudioProject()` | Studio project lookup |
| `persistStudioProject()` | Studio project persist |
| `queueServerExport()` | Server-side render queue |
| `pollExportStatus()` | Export status poll |
| `submitDirectorFeedback()` | Director feedback loop |
| `pollDirectorRender()` | Director render poll |

**apps/web `apps/web/src/lib/api-client.ts`** (196 lines) — 7 exported functions:
| Function | Purpose |
|----------|---------|
| `generateVibeEdit()` | Vibe generate (FormData upload) |
| `getVibeGenerateStatus()` | Vibe generate poll |
| `refineEdit()` | Vibe refine |
| `getRefineStatus()` | Refine status poll |
| `renderExport()` | Render export (vibe) |
| `getRenderStatus()` | Render status poll |
| `refineEDL()` | EDL refinement (streaming) — **DUPLICATE** |

**Duplicated function:** `refineEDL` exists in both files. The SSE streaming logic is **copy-pasted identically** (~60 lines each).

**Import patterns:**
- Simple Editor (apps/web) imports from `apps/web/src/lib/api-client.ts`
- Chat routes (src/components/chat) import from `src/lib/api-client.ts`

### Recommendation

**Consolidate into one client after orchestrator works (Phase 7).**

The root `src/lib/api-client.ts` has the complete pipeline functions. The apps/web version has vibe-specific endpoints.

**Merged API client should live at:** `apps/web/src/lib/api-client.ts` (since apps/web is the main app)

**Migration:**
1. Move all root api-client functions into apps/web api-client
2. Delete root api-client
3. Update all imports
4. Remove deprecated `uploadFile()` alias

**Do not do this before Phase 3** (orchestrator extraction). API client consolidation during active refactoring causes broad import breakage.

### Answer

| Question | Answer |
|----------|--------|
| Which file wins? | apps/web api-client吸收 root api-client functions |
| Where does consolidated client live? | `apps/web/src/lib/api-client.ts` |
| Functions only used by one editor? | `generateVibeEdit`, `getVibeGenerateStatus`, `renderExport`, `getRenderStatus` — move into orchestrator or keep as specialized endpoints |

---

## Q10: What About the OpenReel Conversion Adapter?

### Current State

**Package:** `@monet/openreel-adapter` (`packages/openreel-adapter/`)

**Forward conversion** (`edl-to-openreel.ts:124`):
```ts
export function convertEDLToOpenReelProject(
  edl: MonetEDL,
  mediaItems: Array<{
    id: string; name: string;
    type: "video"|"audio"|"image";
    duration: number; width: number; height: number;
  }> = [],
): Project  // Full OpenReel Project with tracks, clips, effects, markers
```
- Maps EDL tracks → OpenReel tracks
- Maps clips with effects, keyframes, transforms
- Populates media library from `mediaItems` parameter

**Reverse conversion** (`openreel-to-edl.ts:227`):
```ts
export function openReelProjectToMonetEDL(
  project: OpenReelProject,
  options?: { debug?: boolean },
): ConvertResult  // { edl: MonetEDL, debug: ConvertDebugLog[] }
```
- Includes `mergeKeyframeIntoTransform`, `mapEffect`, `buildTransformsFromAccumulator`
- **Round-trip validator:** `validateRoundTrip(original, reconstructed)` at line 362

**Known gaps** documented in `KNOWN_GAPS.md`.

**How called today:**
- Forward conversion used from `packages/kove-director/src/compiler.ts` and `apps/web/src/stores/edl-adapter.ts`
- NOT directly from project-store.ts (which uses `convertShotEDLToProjectEDL` instead)
- Reverse conversion exists but is **not proven for production edit-back**

### Recommendation

**Forward conversion should be called by the Studio route**, not the orchestrator. The orchestrator produces EDL; the Studio route converts and sends to iframe.

```ts
// src/routes/studio_.$projectId.tsx (or StudioPreview component)
import { convertEDLToOpenReelProject } from "@monet/openreel-adapter";

// When ProjectContext changes:
const openReelProject = convertEDLToOpenReelProject(
  currentEdl,
  mediaItems.map(m => ({ id: m.id, name: m.fileName, type: m.type, ... }))
);
iframeRef.current?.contentWindow?.postMessage(
  { type: "kove:load-project", project: openReelProject }, "*"
);
```

**Reverse conversion** = future infrastructure. Do not use for this milestone.

### Answer

| Question | Answer |
|----------|--------|
| Is conversion tested? | Forward: yes, has types and KNOWN_GAPS.md. Reverse: exists with round-trip validator but not production-proven. |
| Who calls it? | Studio route/component, not orchestrator. |
| Orchestrator or Studio route? | Studio route owns the conversion step. |

---

## Q11: What About the Export Flow?

### Current State

**Two export paths:**

**Client-side WebCodecs** (`src/lib/export-engine.ts:247`):
```ts
export async function exportEDLToMP4(
  edl: MonetEDL, mediaUrls: Map<string, string>,
  onProgress?: (p: number) => void
): Promise<Blob> {
  // Checks WebCodecs support
  // Auto-detects H.264 profile (1080p → 720p fallback)
  // Creates offscreen canvas + MonetRenderer
  // Renders frame-by-frame → VideoEncoder → custom MP4 muxer
  // VIDEO ONLY — no audio mixing
}
```

**Server-side FFmpeg** (`src/lib/export-engine.ts:24`):
```ts
export async function exportEDLToMP4ViaServer(
  edl: MonetEDL, mediaUrls: Map<string, string>,
  onProgress?: (p: number) => void
): Promise<Blob> {
  // POSTs {edl, mediaUrls} to /api/export-mp4
  // Server renders with FFmpeg, returns MP4 blob
  // Filters out blob URLs (server can't access them)
}
```

**Server export queue** (`apps/web/src/lib/api-client.ts:89`):
```ts
export async function renderExport(edl, footagePath, musicPath?) {
  // POSTs to /api/render/vibe
  // Returns { renderJobId }
}
```

**Which is primary?**
- TanStack Start routes: client-side WebCodecs (primary) + server FFmpeg (fallback for Safari/Firefox)
- apps/web SimpleEditor: server-side via `renderExport`

### Recommendation

**Orchestrator owns export trigger.** Runtime decides WebCodecs vs FFmpeg.

```ts
// In orchestrator
async function exportProject(options?: { preferServer?: boolean }): Promise<Blob> {
  const edl = useProjectStore.getState().generation.edl;
  const mediaUrls = buildMediaUrlMap();

  if (!options?.preferServer && supportsWebCodecs()) {
    return exportEDLToMP4(edl, mediaUrls);
  }
  return exportEDLToMP4ViaServer(edl, mediaUrls);
}
```

### Answer

| Question | Answer |
|----------|--------|
| Who owns export? | Orchestrator. Both UIs call `exportProject()`. |
| Primary path? | Client-side WebCodecs when available. Server FFmpeg as fallback. |
| Needs Studio knowledge? | No. Export uses canonical EDL from Zustand, not OpenReel state. |

---

## Q12: What About the Preview/Renderer?

### Current State

**Two completely independent renderers:**

**MonetRenderer** (`src/lib/renderer/monet-renderer.ts`, 1510+ lines):
```ts
class MonetRenderer {
  initialize(edl, canvas, mediaUrls?): Promise<void>;
  renderFrame(requestedTime): void;
  getDuration(): number;
  cleanup(): void;
}
```
- Canvas2D rendering
- Used by `SimpleEditorPreview` and chat `VideoPreview`
- Effects: shader-fx, webgl-blur, webgl-grade, canvas2d, particle-fx, text-engine
- Shared singleton `SHARED_MEDIA_LOADER`

**WebPlayer** (`apps/web/src/engine/web-player.ts`, 322 lines):
```ts
function createWebPlayer(canvas, edl): PlayerControls {
  // Completely independent from MonetRenderer
  // Different frame resolution logic
  // Different effects system (runLayeredEffects)
  // Has audio engine integration
}
```
- Used by apps/web `LivePreview` only
- Different effects system, different frame resolution
- **Shares zero code with MonetRenderer**

### Recommendation

**MonetRenderer is canonical.** Deprecate WebPlayer for new code.

The orchestrator should not own playback state. Each UI owns its own playback (play/pause/seek) but reads EDL from Zustand.

```ts
// Simple Editor
const renderer = new MonetRenderer();
const edl = useEDL();  // from Zustand
await renderer.initialize(edl, canvas, mediaUrls);
renderer.renderFrame(currentTime);

// Chat Thread
const renderer = new MonetRenderer();
const edl = useEDL();  // same Zustand
await renderer.initialize(edl, canvas, mediaUrls);
```

### Answer

| Question | Answer |
|----------|--------|
| Is MonetRenderer canonical? | Yes. WebPlayer is legacy/alternative. |
| Deprecate LivePreview? | Mark as legacy. New code uses MonetRenderer. |
| Who owns playback state? | Each UI owns playback controls. EDL comes from Zustand. |

---

## Q13: What About Undo/Redo?

### Current State

**File:** `apps/web/src/stores/project-store.ts`

**Implementation:**
```ts
const MAX_HISTORY = 50;

function pushHistory(state, project) {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(structuredClone(project));
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  return { history: newHistory, historyIndex: newHistory.length - 1 };
}

undo: () => {
  const { historyIndex, history } = get();
  if (historyIndex <= 0) return;
  set({ project: structuredClone(history[historyIndex - 1]), historyIndex: historyIndex - 1 });
},

redo: () => {
  const { historyIndex, history } = get();
  if (historyIndex >= history.length - 1) return;
  set({ project: structuredClone(history[historyIndex + 1]), historyIndex: historyIndex + 1 });
},
```

**What triggers snapshot:** Every mutation — `loadMonetEDL`, `applyMonetEDLToProject`, `updateClip`, `trimClip`, `splitClip`, `deleteClip`.

**What's snapshotted:** Entire `Project` object (edl, mediaLibrary, settings, modifiedAt).

**50 levels** — deep clone on every mutation.

### Recommendation

**Undo/redo stays in Zustand.** Refinement writes through it.

**Scope:** EDL + timeline state only (not asset uploads, not prompt text). Currently it snapshots everything, which is fine for now but may need scoping later.

**50 levels is reasonable** for a video editor. Keep it.

### Answer

| Question | Answer |
|----------|--------|
| Does it work today? | Yes. 50 levels, deep clone, covers all mutations. |
| Scope? | Full Project object. Could narrow to EDL+timeline later. |
| How many levels? | 50. Reasonable for video editing. |

---

## Q14: What About Style Compile / styleDNA?

### Current State

**Style compile flow:**
1. Client calls `compileStyle(prompt)` → `POST /api/style/compile`
2. Server hashes prompt, checks KV cache
3. `findStyleByTrigger()` checks static STYLE_LIBRARY for keyword matches
4. If match found → returns StyleDNA directly
5. If multiple matches or blend keywords → LLM compilation
6. Falls back to `spiderverse_action` if LLM fails
7. Returns `{ style: StyleDNA, cached, source }`

**styleDNA in generate-edl:**
- `generate-edl.ts:47` — `styleDNA?: any` destructured from request
- `generate-edl.ts:248-249` — appended to creative prompt as "Style directives"
- `generate-edl.ts:361` — passed to fast-planner
- `enhance-edl-with-style.ts:235` — reads grade from styleDNA meta
- `apply-to-edl.ts:172-173` — sets `meta.styleDNA` on generated EDL

**styleDNA is NOT the same as referenceStyle.** styleDNA = visual aesthetic spec from style compiler. referenceStyle = analysis of reference video. Both can be present.

### Recommendation

**styleDNA is still active and valuable.** Keep in orchestrator input model.

**Orchestrator should:**
1. Accept optional `styleDNA` in input
2. If not provided but reference is provided, compile style from prompt
3. Pass to generate-edl

**Simple Editor:** Pass defaults (no styleDNA unless reference provided).
**Chat Thread:** Expose style controls if user wants them.

### Answer

| Question | Answer |
|----------|--------|
| Still valuable or legacy? | Active and valuable. Different from referenceStyle. |
| Always compile or only with reference? | Compile when reference is provided, or when prompt triggers style keywords. |
| Expose in Simple Editor? | Pass defaults. Don't expose controls unless user uploads reference. |

---

## Q15: What About Reference Analysis Flow?

### Current State

**Endpoint:** `POST /api/analyze-reference` (`src/server/api/analyze-reference.ts`)

**Flow:**
1. Receives `{ projectId, referenceFileId }`
2. Fetches video from R2
3. Calls `analyzeReference(env, referenceFileId, buffer, mimeType)` → returns `{ style, totalDuration }`
4. Validates: totalDuration > 0, warns if confidence < 0.3
5. Stores in D1: `INSERT INTO analysis_results`
6. Returns `{ success, referenceStyleId, style }`

**Flow to generate-edl:**
1. Client calls `analyzeReferenceStyle(projectId, fileId)` → gets `{ referenceStyleId, style }`
2. Client sends `referenceStyleId` in `generateEDL()` call
3. Server resolves referenceStyle from D1 or client-provided object
4. If `referenceStyle && referenceMode` → routes through V3 pipeline

**referenceMode:** `"strict_replication"` | `"inspired"`

**Strict vs inspired tolerances** (`reference-director.ts:143-163`):
```ts
const strict = referenceMode === "strict_replication";
// strict: avg shot duration ±15%, transitions ±8pp, effects ±8pp
// inspired: avg shot duration ±30%, transitions ±15pp, effects ±15pp
```

**Client defaults to `"strict_replication"`** in both api-clients.

### Recommendation

**Reference analysis = synchronous orchestrator step.** If reference provided, analyze before generating.

```ts
// In orchestrator
if (input.referenceFile) {
  const refResult = await analyzeReference(projectId, referenceFile.id);
  projectContext.assets.reference.analysisStatus = "ready";
  projectContext.assets.reference.referenceStyleId = refResult.referenceStyleId;
}

// Then in generation:
await generateEDL({
  ...input,
  referenceStyleId: projectContext.assets.reference.referenceStyleId,
  referenceMode: input.referenceMode ?? "inspired", // default to inspired for less rigid
});
```

**UI truth states needed:**
- "Reference analyzed" / "Reference not analyzed" / "Reference failed"
- "Used in generation: yes/no"

### Answer

| Question | Answer |
|----------|--------|
| Working reliably? | Yes, endpoint exists and has been used by Chat Thread. |
| Sync or async? | Synchronous — analyze before generating. |
| UI status needed? | Yes. Show analyzed/not-analyzed/failed. |
| referenceMode exposure? | Default to "inspired" in Simple. Expose in Chat if user wants control. |

---

## Summary: All Answers

| Q | Topic | Answer |
|---|-------|--------|
| Q8 | Upload unification | Orchestrator function `uploadAssets()`. UI handles drag-drop only. Progress via XHR/ReadableStream. |
| Q9 | API client duplication | Consolidate into `apps/web/src/lib/api-client.ts` after Phase 3. Root api-client absorbed. |
| Q10 | OpenReel conversion | Forward conversion called by Studio route. Reverse = future. Not orchestrator's job. |
| Q11 | Export flow | Orchestrator owns export trigger. WebCodecs primary, FFmpeg fallback. No Studio dependency. |
| Q12 | Preview/renderer | MonetRenderer canonical. WebPlayer deprecated. Each UI owns playback, EDL from Zustand. |
| Q13 | Undo/redo | Zustand, 50 levels, snapshots full Project. Refinement pushes history before overwrite. |
| Q14 | StyleDNA | Active and valuable. Different from referenceStyle. Compile when reference provided or prompt triggers. |
| Q15 | Reference analysis | Synchronous orchestrator step. Analyze before generate. Show status in UI. Default to "inspired" mode. |
