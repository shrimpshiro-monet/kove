# Simple Editor Orchestrator Verification

## Status: ✅ VERIFIED (code-level)

## Simple Editor Pipeline Flow

1. `SimpleEditorPage.tsx` calls `runGenerationPipeline()` from `kove-generation-pipeline.ts`
2. Pipeline writes to Zustand: `assets`, `prompt`, `analysis`, `generation`, `truth`
3. After generation, `applyMonetEDLToProject()` converts shot EDL → ProjectEDL and stores in `project.edl`
4. Refinement uses `useRefineEDL` hook which calls `refineEdit()` → polls → `loadMonetEDL()`

## Verified Code Paths

### Upload → Pipeline
- `SimpleEditorPage.tsx:100-105`: Calls `runGenerationPipeline({ projectId, files, prompt })`
- Pipeline internally calls `uploadAssets()` → `analyzeProject()` → `decodePromptIntent()` → `compileStyleDNA()` → `generateProjectEDL()`
- Pipeline writes results to Zustand via `setAssets()`, `setPrompt()`, `setAnalysis()`, `setGeneration()`, `setTruth()`

### EDL Application
- `SimpleEditorPage.tsx:122`: Calls `applyEDL(generatedEdl, mediaItems, pipelineResult.mediaUrlMap)`
- `project-store.ts:345-399`: `applyMonetEDLToProject()` auto-detects shot EDL, converts via `convertShotEDLToProjectEDL()`, stores in `project.edl`

### Refinement
- `SimpleEditorPage.tsx:167`: Calls `startRefine({ projectId, edl, feedback })`
- `useRefineEDL.ts:41-46`: Calls `refineEdit()` → polls → `loadEDL()` which writes to Zustand

### Export
- `kove-generation-pipeline.ts:536-562`: `exportProject()` reads `store.generation.edl`, calls `exportEDLToMP4ViaServer()`

## Key Store Shape

```typescript
interface ProjectStoreState {
  project: Project | null;           // Contains edl (MonetEDL), mediaLibrary
  assets: ProjectAssets;             // footage[], music?, reference?
  prompt: ProjectPrompt;             // text, intentId, styleDNA, intensity, tempoMode
  analysis: ProjectAnalysis;         // analysisId, footage[], music, status
  generation: ProjectGeneration;     // edlId, edl, mode, fallbackUsed, status, scores
  truth: ProjectTruth;               // referenceProvided, musicProvided, bpm, etc.
  director: { messages: DirectorMessage[] };
}
```

## Notes
- Dev servers start on ports 3000 (API) and 8787 (Vite)
- Typecheck root script is a no-op echo; individual packages have their own typecheck
- The pipeline already exists and is working for Simple Editor
- Chat Thread needs to be migrated to use the same pipeline
