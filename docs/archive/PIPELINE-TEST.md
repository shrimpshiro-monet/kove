# Monet Pipeline — Full End-to-End Test Guide

## Prerequisites

1. Dev servers running: `bash start-studio.sh`
2. Vite frontend on `http://127.0.0.1:8787`
3. AI provider: NVIDIA NIM (Kimi K2.6) — primary. Gemini — fallback.

## Test Files

```
test/MikeRoss.mp4                              (footage)
test/High Quality Steph Curry Clips....mp4     (footage)
test/Outfit (with 21 Savage).mp3               (music)
test/bbf.mp3                                   (music)
```

---

## Pipeline (5 Steps)

### Step 1: Upload Footage + Music

```bash
# Upload footage
curl -s -X POST http://127.0.0.1:8787/api/upload/direct \
  -F "file=@test/MikeRoss.mp4;type=video/mp4" \
  -F "type=footage" \
  -F "projectId=pipe-test-1"

# Upload music
curl -s -X POST http://127.0.0.1:8787/api/upload/direct \
  -F "file=@test/Outfit (with 21 Savage).mp3;type=audio/mpeg" \
  -F "type=music" \
  -F "projectId=pipe-test-1"
```

**Expected:** Returns `{"success":true, "fileId":"<uuid>", "r2Key":"...", ...}`

**If it fails:** Check MIME type. Must be `video/mp4` or `audio/mpeg` explicitly in the `-F` flag.

---

### Step 2: Analyze Media

```bash
curl -s -X POST http://127.0.0.1:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "pipe-test-1",
    "footageIds": ["<footage-fileId-from-step-1>"],
    "musicId": "<music-fileId-from-step-1>"
  }'
```

**Expected:**
```json
{
  "success": true,
  "analysisId": "<uuid>",
  "result": {
    "footage": [{ "clipId": "...", "duration": ..., "segments": [...], ... }],
    "music": { "bpm": 130, "beatGrid": [...], "duration": ..., ... }
  }
}
```

**If it fails:** Check `.logs/vite.log` for the actual error. Common issues:
- `INVALID_ANALYSIS_RESPONSE` — AI returned fields that don't match the schema. Check the `raw` field in the error for what AI actually returned.
- `GEMINI_ANALYSIS_FAILED` — AI provider is down or key is invalid. Check NIM key in `.dev.vars`.

**Important:** This calls NIM (Kimi) for footage + music analysis. The analysis fills in missing fields with defaults if the AI doesn't return them.

---

### Step 3: Decode Intent

```bash
curl -s -X POST http://127.0.0.1:8787/api/decode-intent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make a hype sports-style edit of Mike Ross from Suits. Fast cuts, beat-synced to the music, cinematic color grade. Like a TikTok highlight reel.",
    "projectId": "pipe-test-1",
    "threadId": "pipe-test-1"
  }'
```

**Expected:**
```json
{
  "success": true,
  "intentId": "<uuid>",
  "intent": { "version": "...", "goal": {...}, "style": {...}, ... }
}
```

**If it fails:** Check that the prompt is non-empty and under 10000 chars.

---

### Step 4: Generate EDL

```bash
curl -s -X POST http://127.0.0.1:8787/api/generate-edl \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "pipe-test-1",
    "threadId": "pipe-test-1",
    "intentId": "<intentId-from-step-3>",
    "analysisId": "<analysisId-from-step-2>",
    "prompt": "Make a hype sports-style edit of Mike Ross from Suits. Fast cuts, beat-synced to the music, cinematic color grade."
  }'
```

**Expected:**
```json
{
  "success": true,
  "edlId": "<uuid>",
  "edl": {
    "version": "1.0.0",
    "shots": [
      { "id": "shot_001", "source": {...}, "timing": {...}, "effects": [...], "beatLock": {...} },
      ...
    ],
    "music": { "sourceId": "...", "bpm": 130, "beatGrid": [...] },
    "timeline": { "resolution": {...}, "fps": 30, "duration": ... }
  },
  "scores": { "beatSyncScore": ..., "pacingVariance": ..., "overallConfidence": ... }
}
```

**If it fails:** `Intent not found` means the intentId from step 3 doesn't exist in D1. Try passing `prompt` directly instead of `intentId` — the endpoint will resolve it.

**Check:** How many shots? Are effects populated? Is beatLock present? What's the total duration?

---

### Step 5: Refine EDL (Conversational Chat)

```bash
curl -s -X POST http://127.0.0.1:8787/api/refine-edl \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "pipe-test-1",
    "edlId": "current",
    "edl": <paste the full "edl" object from step 4>,
    "feedback": "make it faster and add glow and shake"
  }'
```

**Expected:**
```json
{
  "success": true,
  "edlId": "...",
  "edl": { ...modified EDL... },
  "scores": {...},
  "generationMode": "ai_director"   // or "fast_planner" if AI failed
}
```

**Check:**
- `generationMode: "ai_director"` = Kimi NIM worked
- `generationMode: "fast_planner"` = AI failed, used deterministic fallback
- Shot durations should be reduced (~30-50%)
- Effects should include glow, shake
- Each shot should have `aiRationale` if AI mode

---

## Quick Smoke Test (One Shot)

```bash
# Minimal refine test (no upload/analyze needed)
curl -s -X POST http://127.0.0.1:8787/api/refine-edl \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "smoke",
    "edlId": "current",
    "edl": {
      "version":"1.0.0",
      "metadata":{"title":"T","createdAt":1,"aiModel":"t","prompt":"t","intentId":"t","analysisId":"t"},
      "timeline":{"resolution":{"width":1920,"height":1080},"fps":30,"duration":10},
      "shots":[
        {"id":"s1","source":{"clipId":"c1","inPoint":0,"outPoint":2},"timing":{"startTime":0,"duration":2}},
        {"id":"s2","source":{"clipId":"c1","inPoint":2,"outPoint":5},"timing":{"startTime":2,"duration":3}}
      ]
    },
    "feedback": "make it faster and add glow"
  }'
```

**Check:** `generationMode: "ai_director"` and durations reduced.

---

## What Each Failure Means

| Error | Cause | Fix |
|-------|-------|-----|
| `INVALID_MEDIA_TYPE` | MIME type not set in upload | Add `;type=video/mp4` to `-F file=@...` |
| `GEMINI_ANALYSIS_FAILED` | NIM/Gemini can't analyze | Check API key in `.dev.vars` |
| `INVALID_ANALYSIS_RESPONSE` | AI output doesn't match schema | Check `raw` in error for what AI returned |
| `Intent not found` | intentId not in D1 | Pass `prompt` directly instead of `intentId` |
| `Analysis not found` | analysisId not in D1/memory | Check step 2 succeeded |
| `EDL refinement timed out` | AI took >180s | Increase `REFINE_TIMEOUT_MS` or use faster model |
| `generationMode: fast_planner` | AI failed, deterministic fallback used | Check `.logs/vite.log` for NIM error |

---

## File Locations

- **Server code:** `src/server/`
- **API routes:** `src/server.ts` (line 443+)
- **AI service factory:** `src/server/services/ai-service.ts`
- **NIM service:** `src/server/services/nim.ts`
- **Refine endpoint:** `src/server/api/refine-edl.ts`
- **EDL generation:** `src/server/api/generate-edl.ts` + `src/server/lib/edl-generation.ts`
- **Analysis:** `src/server/api/analyze.ts` + `src/server/services/footage-analysis.ts`
- **Logs:** `.logs/vite.log`

---

## Current State (What Works / What's Broken)

| Step | Status | Notes |
|------|--------|-------|
| Upload | ✅ Works | Direct upload with MIME type |
| Analyze (footage) | ⚠️ Works with defaults | NIM returns partial data, defaults fill gaps |
| Analyze (music) | ⚠️ Works with defaults | NIM returns partial data, beat grid generated from BPM |
| Decode Intent | ✅ Works | |
| Generate EDL | ⚠️ Intent resolution broken | `intentId` lookup fails, `prompt` fallback fails |
| Refine EDL (AI) | ✅ Works | Kimi K2.6 via NIM, `ai_director` mode |
| Refine EDL (deterministic) | ✅ Works | Fallback when AI fails |
| Chat personality | ✅ Works | Contextual responses, suggestions |
