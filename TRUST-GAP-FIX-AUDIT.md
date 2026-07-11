# Trust Gap Fix Audit — 2026-07-06

## Summary

Fixed 4 of 6 trust gaps identified in FULL-STACK-AUDIT.md. The Python workers for beat detection and transcription already existed but were unwired from the TypeScript server. The core fix was connecting them.

---

## 1. Real Beat Detection

### Problem
`upload-and-detect.ts` returned hardcoded `bpm:120` with fake beats at `i * 0.5` intervals. `analyze.ts` called a sidecar at port 5005 that doesn't exist in the repo.

### What Changed

| File | Before | After |
|------|--------|-------|
| `src/server/api/upload-and-detect.ts:72-79` | Hardcoded `bpm:120, confidence:0.5, beats: Array.from({length:10}, (_,i)=>({time:i*0.5,...}))` | Calls Python audio worker via `analyzeAudioWithPython()`, returns real BPM/beats/transients from librosa |
| `src/server/api/analyze.ts:293-298` | `extractAudioFeatures(env, musicId)` → calls sidecar at port 5005 (doesn't exist) | `analyzeAudioWithPython(env, localPath)` → calls Python worker at port 8101 |
| `src/server/api/analyze.ts:343-356` | Silent fallback to `bpm:120` stub | Explicit `console.warn("CRITICAL: No audio features...")` when falling back |
| `src/server/lib/local-media-cache.ts` | No path accessor | Added `getLocalMediaPath(fileId)` returning disk path for worker consumption |

### New Files

| File | Purpose |
|------|---------|
| `src/server/lib/python-audio-client.ts` | HTTP client for Python audio worker (port 8101). Exports `analyzeAudioWithPython()`, `pythonAnalysisToAudioFeatures()`, `isPythonAIWorkerAvailable()`. |

### Data Flow (Before → After)

**Before:**
```
Upload → putLocalMedia() → return { bpm: 120, beats: [0, 0.5, 1.0, ...] }
Analyze → extractAudioFeatures(env, musicId) → fetch localhost:5005 → FAIL → return { bpm: 120 }
```

**After:**
```
Upload → putLocalMedia() → getLocalMediaPath(clipId) → fetch localhost:8101/analyze-audio → return { bpm: 128.3, beats: [0.47, 0.94, 1.41, ...] }
Analyze → getLocalMediaPath(musicId) → fetch localhost:8101/analyze-audio → pythonAnalysisToAudioFeatures() → return { bpm: 128.3, beatGrid: [...] }
```

### Fallback Behavior
If Python worker is unreachable, both paths fall back to `bpm:120` with a logged warning. No silent failure.

---

## 2. Real Transcription

### Problem
`transcribe.ts` asked Gemini to hallucinate transcripts ("If no actual media is available, generate a realistic mock transcript"). The Python AI worker at port 8102 had a complete faster-whisper implementation that was never called from the Cloudflare Worker path.

### What Changed

| File | Before | After |
|------|--------|-------|
| `src/server/api/transcribe.ts` (entire file) | Gemini `generateContentJSON()` with prompt "generate a realistic mock transcript" | Calls Python AI worker via `transcribeWithWhisper()`, bridges seconds→milliseconds for frontend |
| `src/server/api/transcribe.ts:101-175` | `transcribeWithAI()` — 75 lines of Gemini mock prompt | `transcribeMedia()` — calls Whisper, falls back to empty transcript |
| `src/server/api/transcribe.ts:13` | Imported `getAIService` | Removed — no longer using Gemini for transcription |

### New Files

| File | Purpose |
|------|---------|
| `src/server/lib/python-ai-client.ts` | HTTP client for Python AI worker (port 8102). Exports `transcribeWithWhisper()`, `isPythonAIWorkerAvailable()`. |

### Schema Bridging

The Python worker returns seconds, the frontend expects milliseconds:

```typescript
// Python worker output:
{ word: "hello", start: 1.23, end: 1.67, probability: 0.95 }

// Frontend expects:
{ text: "hello", start_ms: 1230, end_ms: 1670, confidence: 0.95, intensity: 0.5 }
```

The `transcribeMedia()` function handles this conversion.

### Fallback Behavior
If Python worker is unreachable or local file doesn't exist, returns `{ words: [], fullText: "", duration_ms: 0 }` with a logged warning. No hallucinated data.

---

## 3. Fail-Loud Validation

### Problem
`upload-and-detect.ts` had minimal validation (no Zod, no media type check). Reference analyzer could return low-quality data without warning. Music analysis silently fell back to bpm:120.

### What Changed

| File | Line(s) | Before | After |
|------|---------|--------|-------|
| `src/server/api/upload-and-detect.ts:18-54` | Validation | No Zod schema, no media type check, no file size check | Zod schema (`UploadAndDetectSchema`), media type validation against allowlist, 0-byte check, 500MB limit |
| `src/server/api/upload-and-detect.ts:46-70` | R2/D1 errors | Errors thrown and caught by outer try/catch (generic 500) | Explicit `apiError(ApiErrorCode.UploadFailed)` for R2, `apiError(ApiErrorCode.DatabaseInsertFailed)` for D1 |
| `src/server/api/analyze-reference.ts:295-304` | Reference quality | Logged style JSON, no quality gate | Rejects with 422 if `totalDuration <= 0`, warns if `confidence < 0.3` |
| `src/server/api/analyze.ts:343-356` | Music fallback | Silent fallback to bpm:120 | `console.warn("CRITICAL: ...")` with actionable message |

### Validation Added to upload-and-detect.ts

```typescript
// Zod schema
const UploadAndDetectSchema = z.object({
  projectId: z.string().min(1).default("default-project"),
  type: z.enum(["footage", "music", "reference"]).default("footage"),
});

// Media type allowlist
const VALID_MEDIA_TYPES = {
  footage: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
  music: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"],
  reference: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
};

// Checks: file exists, Zod valid, media type allowed, not empty, not >500MB
```

---

## 4. SigV4 Signed Upload URLs

### Problem
`generateSignedUploadUrl()` returned a hardcoded dev URL, ignoring all parameters. Client uploads to unsigned R2 URLs would fail in production.

### What Changed

| File | Before | After |
|------|--------|-------|
| `src/server/api/upload.ts:227-235` | `return \`https://monet-media-dev.r2.cloudflarestorage.com/${key}\`` | Uses `aws4fetch` AwsClient to sign PUT requests when R2 credentials are configured |
| `src/server/api/upload.ts:1-11` | No aws4fetch import | `import { AwsClient } from "aws4fetch"` |
| `src/server/types/env.ts:32-33` | No R2 API credentials | Added `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

### Signing Implementation

```typescript
async function generateSignedUploadUrl(env, key, contentType) {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      region: "auto",
    });
    const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/monet-media-dev/${key}`;
    const signed = await aws.sign(url, { method: "PUT", headers: { "Content-Type": contentType } });
    return signed.url;
  }
  // Fallback for local dev without credentials
  return `https://monet-media-dev.r2.cloudflarestorage.com/${key}`;
}
```

### Environment Variables Required (Production)

```
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_api_token_access_key
R2_SECRET_ACCESS_KEY=your_r2_api_token_secret_key
```

---

## Files Modified (Complete List)

| File | Change Type |
|------|-------------|
| `src/server/api/upload-and-detect.ts` | Modified — real beat detection + validation |
| `src/server/api/analyze.ts` | Modified — Python audio worker for music |
| `src/server/api/transcribe.ts` | Rewritten — real Whisper transcription |
| `src/server/api/upload.ts` | Modified — SigV4 signed URLs |
| `src/server/api/analyze-reference.ts` | Modified — fail-loud validation |
| `src/server/lib/local-media-cache.ts` | Modified — added `getLocalMediaPath()` |
| `src/server/types/env.ts` | Modified — added R2 creds + worker URLs |
| `src/server/lib/python-audio-client.ts` | **New** — Python audio worker HTTP client |
| `src/server/lib/python-ai-client.ts` | **New** — Python AI worker HTTP client |

## Verification

- `npx turbo typecheck` — 11/11 tasks pass, 0 errors
- No new dependencies added to package.json (aws4fetch was already a transitive dep, now explicit)

## Not Yet Fixed (Remaining Trust Gaps)

| Gap | Status | Notes |
|-----|--------|-------|
| Export quality parity | Not started | Requires unifying Canvas2D preview with Editly/FFmpeg export effects |
| Visual style transfer (IPAdapter) | Not started | P2 differentiator, per audit |
