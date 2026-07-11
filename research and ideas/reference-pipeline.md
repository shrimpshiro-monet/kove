# reference-pipeline.md

## Complete Flow: Reference Upload → EDL Generation

### Step 1: Upload
**File**: `apps/web/src/components/editor/simple-editor/SimpleEditorPage.tsx`

```
User uploads: footage + music + reference
→ All files uploaded to R2 via /api/upload/direct
→ referenceId = r2FileId of reference file
```

### Step 2: Analyze
```
callAnalyzeMedia(pid, footageIds, musicId)
→ POST /api/analyze
→ Returns: { footage: [...], music: {...} }

callAnalyzeReference(pid, referenceId)
→ POST /api/analyze-reference
→ Returns: { referenceStyleId, style: {...} }
```

### Step 3: Decode Intent
```
callDecodeIntent(pid, prompt)
→ POST /api/decode-intent
→ Returns: { intentId, intent: {...} }
```

### Step 4: Generate EDL
```
callGenerateEDL(pid, intentId, analysisId, {
  prompt, targetDuration: 30,
  analysisData: analysis.result,
  referenceStyleId,
  referenceMode: "strict_replication"
})
→ POST /api/generate-edl
→ Returns: { edl, scores, generationMode }
```

### Step 5: Server Processing
```
handleGenerateEDL:
  1. Load referenceStyle from D1 (by referenceStyleId)
  2. AI creative skeleton (simple prompt)
  3. Deterministic timing (alignToOnsets or fastPlanner)
  4. compileReferenceStyleToDirectives(referenceStyle, mode)
  5. enhanceEDLWithStyleDirectives(edl, directives)
  6. Return EDL
```

### Step 6: Frontend
```
convertShotEDLToProjectEDL(edl, mediaUrlMap)
→ Store in Zustand
→ Render via MonetRenderer
```

### What's missing
The frontend calls the skeleton pipeline (step 4-5), NOT the full v3 pipeline with reference director, moment maps, and effect vocabulary.
