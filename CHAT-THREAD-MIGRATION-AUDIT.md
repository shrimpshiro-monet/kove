# Chat Thread Migration Audit

## Current Chat Thread State Ownership (`src/routes/chat_.$threadId.tsx` — 1978 lines)

### A) Canonical Project State → MUST move to Zustand ProjectContext

| Field | Current Owner | Zustand Target |
|-------|--------------|----------------|
| `currentEDL` (MonetEDL) | React `useState` (line 82) | `generation.edl` |
| `currentEdlId` | React `useState` (line 83) | `generation.edlId` |
| `currentIntentId` | React `useState` (line 84) | `prompt.intentId` |
| `currentAnalysisId` | React `useState` (line 85) | `analysis.analysisId` |
| `uploadedFiles` (UploadedFile[]) | React `useState` (line 77) | `assets.footage/music/reference` |
| `mediaUrls` (Map<string,string>) | React `useState` (line 78) | Built from `assets` + `generation.edl` |
| `referenceStyle` | React `useState` (line 105) | `analysis.referenceStyleId` + settings |
| `referenceTrace` | React `useState` (line 106) | `analysis` or settings |
| `editIntensity` | React `useState` (line 147) | `prompt.intensity` |
| `tempoMode` | React `useState` (line 148) | `prompt.tempoMode` |
| `isGenerating` | React `useState` (line 81) | `generation.status` |
| `isRefining` | React `useState` (line 87) | Derived from `generation.status` |
| `isExporting` | React `useState` (line 97) | New `exportStatus` in store |
| `exportProgress` | React `useState` (line 98) | New `exportProgress` in store |
| `currentIntent` | React `useState` (line 110) | `prompt.intent` |
| `thinkingData` | React `useState` (line 80) | `generation.scores` + derived |
| `engineRouting` | React `useState` (line 112) | Derived from `generation.edl` |

### B) UI-Only State → May remain React local state

| Field | Purpose |
|-------|---------|
| `draft` (line 76) | Chat input text |
| `thinkingStage` (line 79) | UI loading indicator stage |
| `refineFeedback` (line 86) | Refinement text input |
| `annotations` (line 89) | Timeline annotations (UI feature) |
| `showTextTimeline` (line 101) | UI panel toggle |
| `previewTimeMs` (line 103) | Playback time sync |
| `seekToMs` (line 104) | Seek control |
| `isAnalyzingReference` (line 107) | Loading indicator |
| `isAutoTrackingFace` (line 108) | Loading indicator |
| `compositionHtml` (line 109) | HyperFrames overlay (disabled) |
| `directorJobId` (line 111) | Render job tracking |
| `directorRenderStatus` (line 143) | Render status display |
| `directorPreviewUrl` (line 144) | Render preview URL |
| `patchSummary` (line 145) | Last patch display |
| `upgradeCta` (line 146) | Upgrade prompt |
| `transcript` (line 99) | Transcription result |
| `isTranscribing` (line 100) | Loading indicator |
| `lastPersistedStudioSnapshotRef` (line 149) | Dedup ref |

### C) Persistence Snapshot → localStorage adapter only

| Storage Key | Content |
|-------------|---------|
| `monet.chat.threads.v1` | Thread list with messages, latestEdl, latestEdlId, latestIntentId, latestAnalysisId, latestReferenceStyle |
| `monet.chat.ui.${threadId}` | showTextTimeline, refineFeedback, annotations |

### D) Chat-Specific Features → Keep, but read/write ProjectContext where relevant

| Feature | Notes |
|---------|-------|
| Thread sidebar (create/delete/switch) | UI-only, keep as-is |
| Chat message history | UI-only, keep as-is |
| Director feedback loop (`handleDirectorFeedback`) | Must route through `refineProject()` |
| Refine EDL (`handleRefine`) | Must route through `refineProject()` |
| Export (`handleExport`) | Must route through `exportProject()` |
| Open in Studio (`handleOpenInStudio`) | Must read from Zustand |
| Tracked text / face tracking / wall text | Chat-specific, but EDL updates must go to Zustand |
| HD Export button | Server export, keep as-is |
| Flip 180° / Test Cinematic Grade | Chat-specific EDL mutations, must update Zustand |
| Transcription / Text Timeline | Chat-specific, EDL changes must update Zustand |
| YouTube URL reference analysis | Must route through shared reference path |

## API Endpoints Used by Chat Thread

| Endpoint | Function | Migration Target |
|----------|----------|-----------------|
| `uploadFileDirect` | Direct R2 upload | `uploadAssets()` in pipeline |
| `decodeIntent` | Intent extraction | `decodePromptIntent()` in pipeline |
| `analyzeMedia` | Footage/music analysis | `analyzeProject()` in pipeline |
| `generateEDL` | EDL generation | `generateProjectEDL()` in pipeline |
| `compileStyle` | StyleDNA compilation | `compileStyleDNA()` in pipeline |
| `analyzeReferenceStyle` | Reference analysis | `analyzeReference()` in pipeline |
| `analyzeReferenceStyleByUrl` | YouTube reference | Keep, but route result to store |
| `refineEDL` | Full EDL refinement | `refineProject()` in pipeline |
| `submitDirectorFeedback` | Director patch | `refineProject()` in pipeline |
| `pollDirectorRender` | Render polling | Keep as-is (UI feature) |
| `generateCompositionOverlay` | HyperFrames | Keep as-is (disabled) |
| `persistStudioProject` | Studio snapshot | Keep as-is |
| `transcribeMedia` | Transcription | Keep as-is (chat-specific) |
| `exportEDLToMP4ViaServer` | Server export | `exportProject()` in pipeline |

## Migration Strategy

### Phase 2: Collapse canonical state into Zustand
- Replace `currentEDL` useState → read from `useProjectStore(s => s.generation.edl)`
- Replace `currentEdlId` useState → read from `useProjectStore(s => s.generation.edlId)`
- Replace `uploadedFiles` useState → read from `useProjectStore(s => s.assets)`
- Replace `mediaUrls` useMemo → derive from assets + edl
- Replace `referenceStyle` useState → read from store settings
- Replace `editIntensity`/`tempoMode` useState → read from `useProjectStore(s => s.prompt)`
- Replace `isGenerating` useState → derive from `generation.status`
- Keep all UI-only state as local React state

### Phase 3: Migrate upload to uploadAssets()
- `handleFilesChange` → stage files, then call `uploadAssets()`
- `handleYouTubeUrl` → call `analyzeReferenceStyleByUrl`, store result in Zustand
- `handleChatFileSelect` → stage files, then call `uploadAssets()`

### Phase 4: Migrate generation to runGenerationPipeline()
- `sendMessage` → call `runGenerationPipeline()` instead of manual sequence
- Keep thinking panel, chat messages, UX chrome
- Store results in Zustand via pipeline

### Phase 5: Migrate refinement to refineProject()
- `handleDirectorFeedback` → call `refineProject({ mode: "patch" })`
- `handleRefine` → call `refineProject({ mode: "full-edl" })`
- Keep director render polling as UI feature

### Phase 6: Migrate export to exportProject()
- `handleExport` → call `exportProject()` from pipeline
- Keep HD Export button as separate path

### Phase 7: Shared truth states
- Both surfaces read from same Zustand selectors
- Truth states (referenceProvided, musicProvided, etc.) set by pipeline

### Phase 8: Cross-surface verification
- Generate in Chat → verify in Simple
- Generate in Simple → verify in Chat
- Both → verify in Studio Preview
