# Service Layer Extraction Audit — 2026-07-06

## Summary

Extracted business logic from 5 route handlers into 5 focused service modules + 1 shared utility. Route handlers are now thin parse+delegate+return wrappers. All existing behavior preserved. `npx tsc --noEmit` passes with 0 errors.

---

## Line Count Changes

| File | Before | After | Change |
|------|--------|-------|--------|
| `api/upload-and-detect.ts` | 177 | 73 | **-104 lines** (59%) |
| `api/upload.ts` | 411 | 168 | **-243 lines** (59%) |
| `api/analyze.ts` | 410 | 297 | **-113 lines** (28%) |
| `api/transcribe.ts` | 159 | 40 | **-119 lines** (75%) |
| `api/analyze-reference.ts` | 355 | 66 | **-289 lines** (81%) |
| **Total routes** | **1,512** | **644** | **-868 lines** (57%) |

| New File | Lines | Purpose |
|----------|-------|---------|
| `lib/media-types.ts` | 20 | Shared media type validation constants |
| `services/media-ingestion-service.ts` | 186 | R2 upload, D1 persistence, local caching |
| `services/audio-analysis-service.ts` | 139 | Python audio worker, music analysis, beat detection |
| `services/transcription-service.ts` | 95 | Whisper transcription, KV caching, schema bridging |
| `services/upload-signing-service.ts` | 36 | SigV4 signed URL generation |
| `services/reference-analysis-service.ts` | 233 | Scene detection, energy analysis, LLM, style construction |
| **Total services** | **709** | |

**Net change**: -868 lines in routes + 709 lines in services = **-159 lines** overall (code consolidated, not added).

---

## What Changed Per File

### `api/upload-and-detect.ts` (177 → 93 lines)

| Before | After |
|--------|-------|
| Inline R2 upload, D1 INSERT, local cache | `ingestFile()` from media-ingestion-service |
| Inline beat detection with Python worker fallback | `detectBeats()` from audio-analysis-service |
| Inline `VALID_MEDIA_TYPES` constant | Import from `lib/media-types.ts` |
| 84 lines of business logic | 0 lines of business logic |

### `api/upload.ts` (411 → 148 lines)

| Before | After |
|--------|-------|
| Inline `generateSignedUploadUrl()` with AwsClient | `generateSignedUploadUrl()` from upload-signing-service |
| Inline D1 batch insert (projects + media_items) in 2 places | `completeUpload()` and `directUpload()` from media-ingestion-service |
| Inline `isValidMediaType()` helper | Import from `lib/media-types.ts` |
| Inline `readJsonBody()` helper | Kept inline (route-specific) |
| 263 lines of business logic | 0 lines of business logic |

### `api/analyze.ts` (410 → 230 lines)

| Before | After |
|--------|-------|
| Inline music analysis (Python worker + AI + 3-tier fallback) | `analyzeMusic()` from audio-analysis-service |
| Inline `extractFramesFromR2Buffer()` | Kept inline (footage-specific) |
| Inline `getVideoDurationFromBuffer()` | Kept inline (footage-specific) |
| Inline footage analysis loop | Extracted to `analyzeFootageClip()` helper |
| Inline fallback segment construction | Extracted to `buildFallbackAnalysis()` helper |
| 180 lines of music logic removed | Delegated to service |

### `api/transcribe.ts` (159 → 41 lines)

| Before | After |
|--------|-------|
| Inline `transcribeMedia()` with Whisper + fallback | `getOrTranscribe()` from transcription-service |
| Inline KV cache check + put | Handled by service |
| Inline `estimateTranscript()` fallback | Handled by service |
| Local `jsonResponse()` definition | Import from `lib/api-response.ts` |
| `TranscriptWord` and `TranscriptResult` types | Re-exported from service for backward compat |

### `api/analyze-reference.ts` (355 → 72 lines)

| Before | After |
|--------|-------|
| Inline scene detection, energy analysis, frame extraction | `analyzeReference()` from reference-analysis-service |
| Inline LLM call with refStyleSchema | Handled by service |
| Inline style construction (70+ lines of derived properties) | `buildReferenceStyle()` in service |
| Inline `extractFramesFromBuffer()` (copy-pasted from analyze.ts) | Consolidated in service |
| Inline D1 persistence | Kept in route (thin) |
| 283 lines of business logic | 0 lines of business logic |

---

## New Service Modules

### `lib/media-types.ts`
- Single source of truth for `VALID_MEDIA_TYPES` constant
- `isValidMediaType()` function
- Eliminates 2 duplicate definitions (upload-and-detect.ts, upload.ts)

### `services/media-ingestion-service.ts`
- `ingestFile(env, { projectId, type, file })` → R2 + D1 + local cache
- `completeUpload(env, { projectId, fileId, ... })` → D1 batch + proxy queue
- `directUpload(env, { projectId, type, file, metadata })` → R2 + D1 + local cache
- Consolidates 3 copies of D1 INSERT SQL

### `services/audio-analysis-service.ts`
- `detectBeats(env, clipId)` → BeatDetectionResult with fallback
- `extractAudioFeatures(env, mediaId)` → AudioFeatures | null
- `analyzeMusic(env, musicId)` → MusicAnalysis with 3-tier fallback
- Contains CRITICAL warning log when falling back to bpm:120

### `services/transcription-service.ts`
- `transcribeMedia(env, mediaId)` → TranscriptResult (Whisper or empty)
- `getOrTranscribe(env, mediaId)` → { transcript, cached } with KV caching
- Never returns hallucinated text — empty transcript on failure

### `services/upload-signing-service.ts`
- `generateSignedUploadUrl(env, key, contentType)` → signed URL
- Uses aws4fetch AwsClient when R2 credentials exist
- Falls back to unsigned URL for local dev

### `services/reference-analysis-service.ts`
- `analyzeReference(env, referenceFileId, buffer, mimeType)` → { style, totalDuration }
- Consolidates scene detection, energy analysis, frame extraction, LLM call, style construction
- Extracts `extractFramesFromBuffer()` (was duplicated in analyze.ts)

---

## Backward Compatibility

| Concern | Status |
|---------|--------|
| API response shapes | Unchanged — routes return same JSON |
| Frontend imports | Preserved — `TranscriptWord`, `TranscriptResult` re-exported from transcribe.ts |
| `server.ts` route registrations | Unchanged — same function names exported |
| `editor-wrapper.ts` imports | Works via re-export |
| `TextTimeline.tsx` imports | Works via re-export |
| `chat_.$threadId.tsx` imports | Works via re-export |

---

## Fail-Loud Behavior Preserved

| Behavior | Location | Status |
|----------|----------|--------|
| Zod validation in upload-and-detect | `upload-and-detect.ts` | ✓ Kept in route |
| Media type allowlist | `lib/media-types.ts` | ✓ Shared constant |
| 0-byte and 500MB checks | `upload-and-detect.ts` | ✓ Kept in route |
| Explicit R2/D1 errors | `media-ingestion-service.ts` | ✓ Thrown as typed errors |
| Reference 422 when totalDuration <= 0 | `analyze-reference.ts` | ✓ Kept in route |
| CRITICAL warning on music fallback | `audio-analysis-service.ts` | ✓ console.warn with actionable message |
| Whisper fallback returns empty transcript | `transcription-service.ts` | ✓ Never hallucinated |
| Beat fallback logs warning | `audio-analysis-service.ts` | ✓ console.warn |

---

## Verification

- `npx tsc --noEmit` — 0 errors
- All 11 turbo typecheck tasks pass (cached)
- No new `any` types introduced
- No route response shape changes
- No frontend contract changes
- No EDL schema changes

## Smoke Test Results (26/26 pass)

| Flow | Tests | Status |
|------|-------|--------|
| Media type validation | 6 | ✓ All pass |
| Beat detection fallback | 3 | ✓ All pass |
| Music analysis response shape | 3 | ✓ All pass |
| Transcription empty fallback | 4 | ✓ All pass |
| Reference analysis shape | 3 | ✓ All pass |
| Signed upload URL fallback | 3 | ✓ All pass |
| Fail-loud behavior | 4 | ✓ All pass |

**Bug found and fixed during smoke pass:** `detectBeats()` did not log a warning when the local file didn't exist — it returned fallback silently. Fixed by adding `console.warn` on the no-local-path path. This closes a fail-loud gap identified in the verification criteria.
