# Frontend Migration Audit

## Current State Summary

### Editor Surfaces

| Surface | Route | Component | State Management |
|---------|-------|-----------|-----------------|
| Simple Editor | `/simple-editor` | `SimpleEditorPage.tsx` | Local React state + Zustand (EDL only) |
| Chat Thread | `/chat/$threadId` | `chat_.$threadId.tsx` | Local React state (all canonical) + Zustand (secondary) + localStorage |
| Studio Preview | `/editor` or `/studio/$projectId` | `AdvancedEditor.tsx` / `studio_.$projectId.tsx` | iframe postMessage (one-way Kove→OpenReel) |

### State Ownership Table

| State | Simple Editor | Chat Thread | Zustand Store |
|-------|--------------|-------------|---------------|
| uploaded footage | Local `UploadedFile[]` | Local `UploadedFile[]` | Not stored |
| uploaded music | Local `UploadedFile[]` | Local `UploadedFile[]` | Not stored |
| uploaded reference | Local `UploadedFile[]` | Local `UploadedFile[]` | Not stored |
| prompt text | Local `chatInput` | Local `draft` | Not stored |
| intentId | Generated in pipeline | Local `currentIntentId` | Not stored |
| analysisId | Generated in pipeline | Local `currentAnalysisId` | Not stored |
| referenceStyle | N/A | Local `referenceStyle` | Not stored |
| editIntensity | N/A | Local `editIntensity` | Not stored |
| tempoMode | N/A | Local `tempoMode` | Not stored |
| generated EDL | Zustand `project.edl` | Local `currentEDL` + Zustand | `project.edl` |
| edlId | N/A | Local `currentEdlId` | Not stored |
| mediaUrlMap | Built in pipeline | Local `mediaUrls` | Not stored |
| generation status | Local `stage` | Local `thinkingStage` | Not stored |
| undo/redo history | Zustand `history` | N/A (localStorage) | `history[]` |

### Duplicate Logic

| Logic | Simple Editor | Chat Thread | Same Endpoint? |
|-------|--------------|-------------|----------------|
| File upload | `uploadToR2()` | `uploadFileDirect()` | Yes |
| Analyze media | `callAnalyzeMedia()` | `analyzeMedia()` | Yes |
| Decode intent | `callDecodeIntent()` | `decodeIntent()` | Yes |
| Generate EDL | `callGenerateEDL()` | `generateEDL()` | Yes |
| Analyze reference | `callAnalyzeReference()` | `analyzeReferenceStyle()` | Yes |
| Refine EDL | `useRefineEDL` (vibe-refine) | `handleDirectorFeedback()` (director/feedback) | Different endpoints |
| EDL storage | `applyMonetEDLToProject()` | `applyGeneratedEDLToProject()` | Same Zustand action |
| localStorage | N/A | `updateThread()` | Chat-only |

### API Client Files

| File | Lines | Functions | Used By |
|------|-------|-----------|---------|
| `src/lib/api-client.ts` | 788 | 17 functions (upload, analyze, generate, refine, export, etc.) | Chat Thread, root routes |
| `apps/web/src/lib/api-client.ts` | 196 | 7 functions (vibe generate/refine/render + duplicate refineEDL) | Simple Editor, apps/web |

### Upload Components

| Component | File | Features | Uploads directly? |
|-----------|------|----------|-------------------|
| `ChatInputDock` | `apps/web/.../simple-editor/ChatInputDock.tsx` | File input, drag-drop, type auto-classify, file chips | No — stages only |
| `VideoUploader` | `src/components/chat/VideoUploader.tsx` | File input, drag-drop, type auto-classify, YouTube URL, previews | No — stages only |

Both components stage files locally. Actual upload happens in the parent via `uploadFileDirect()` → `POST /api/upload/direct`.

### Refinement Backends

| Backend | Endpoint | Transport | Used By |
|---------|----------|-----------|---------|
| Vibe Refine | `POST /api/vibe-refine` + poll | JSON + polling | `useRefineEDL` hook (Simple Editor) |
| Director Feedback | `POST /api/director/feedback` + poll | JSON + polling | Chat Thread |
| Refine EDL (SSE) | `POST /api/refine-edl` | Server-Sent Events | Chat Thread + root api-client |

### Export Paths

| Path | Function | Primary? |
|------|----------|----------|
| Client WebCodecs | `exportEDLToMP4()` | Video-only drafts |
| Server FFmpeg | `exportEDLToMP4ViaServer()` → `POST /api/export-mp4` | Primary when audio present |
| Server queue | `renderExport()` → `POST /api/render/vibe` | Alternative |

### Preview Renderers

| Renderer | File | Canonical? |
|----------|------|------------|
| MonetRenderer (Canvas2D) | `src/lib/renderer/monet-renderer.ts` | Yes |
| WebPlayer | `apps/web/src/engine/web-player.ts` | Legacy |

### OpenReel Integration

| Path | Direction | Conversion |
|------|-----------|------------|
| `AdvancedEditor.tsx` | Kove → OpenReel | Direct EDL postMessage |
| `studio_.$projectId.tsx` | Kove → OpenReel | `convertEDLToOpenReelProject()` |

---

## Migration Checklist

- [ ] Phase 0: This audit document
- [ ] Phase 1: Normalize Zustand ProjectContext
- [ ] Phase 2: Collapse Chat Thread state into Zustand
- [ ] Phase 3: Extract shared generation orchestrator
- [ ] Phase 4: Migrate Chat Thread to orchestrator
- [ ] Phase 5: Migrate Simple Editor to orchestrator
- [ ] Phase 6: Wire Studio Preview as one-way consumer
- [ ] Phase 7: localStorage cleanup
- [ ] Phase 8: API client consolidation
