# SimpleEditor Media Flow — Exact Trace + Verification

## The Chain

```
User drops video.mp4
  ↓
VideoUploader.onFilesChange([{ id: crypto, file: File, type: "footage" }])
  ↓
SimpleEditorPage.uploadedFiles state
  ↓
handleGenerate(prompt)
  ↓
uploadToR2(file, projectId, "footage") → { fileId: "r2-abc123" }
  ↓
uploadedFiles[0].r2FileId = "r2-abc123"
  ↓
blobUrlMap["r2-abc123"] = URL.createObjectURL(file)
  ↓
callGenerateEDL(projectId, intentId, analysisId, ...)
  ↓
Server generates shot-based EDL:
  { shots: [{ source: { clipId: "r2-abc123", inPoint: 0, outPoint: 5.2 }, timing: { startTime: 0, duration: 5.2 } }] }
  ↓
applyEDL(generatedEdl, mediaItems, blobUrlMap)
  ↓
applyMonetEDLToProject(edlInput, mediaItems, blobUrlMap)
  ↓
[auto-detect] edlInput.shots exists && !edlInput.timeline.tracks
  ↓
convertShotEDLToProjectEDL(edlInput, blobUrlMap)
  ↓
builds:
  assets.media["r2-abc123"] = { id: "r2-abc123", path: "blob:http://...", duration: 5.2 }
  timeline.tracks[0].clips[0] = { mediaId: "r2-abc123", startTime: 0, duration: 5.2 }
  ↓
project.edl = converted ProjectEDL
  ↓
LivePreview reads project.edl
  ↓
createWebPlayer(canvas, edl)
  ↓
resolveFrame(edl, time) → { clip: { mediaId: "r2-abc123" }, localTime: ... }
  ↓
edl.assets.media["r2-abc123"].path → "blob:http://..."
  ↓
createVideoElement("blob:http://...")
  ↓
<video src="blob:http://..." /> → REAL VIDEO FRAMES
```

## Verification: What to Check in Browser Console

After generating an edit, paste this in the browser console:

```js
const store = useProjectStore.getState();
const edl = store.project?.edl;
const media = edl?.assets?.media;
const clips = edl?.timeline?.tracks?.[0]?.clips;

console.log("=== VERIFICATION ===");
console.log("1. EDL format:", edl?.timeline?.tracks ? "ProjectEDL ✅" : "Shot-based ❌");
console.log("2. Clip count:", clips?.length ?? 0);
console.log("3. Clip mediaIds:", clips?.map(c => c.mediaId));
console.log("4. Asset keys:", Object.keys(media ?? {}));
console.log("5. Asset paths:", Object.entries(media ?? {}).map(([k, v]) => `${k}: ${v.path?.slice(0, 50)}`));
console.log("6. mediaLibrary items:", store.project?.mediaLibrary?.items?.length ?? 0);
```

**Expected output if working:**
```
1. EDL format: ProjectEDL ✅
2. Clip count: 5
3. Clip mediaIds: ["r2-abc123", "r2-def456", ...]
4. Asset keys: ["r2-abc123", "r2-def456", ...]
5. Asset paths: ["r2-abc123: blob:http://localhost:8787/...", ...]
6. mediaLibrary items: 2
```

**Expected output if broken:**
```
1. EDL format: Shot-based ❌     ← conversion didn't fire
4. Asset keys: []                ← no assets built
5. Asset paths: []               ← no paths to load
```

## The 4 Critical Files

### 1. `apps/web/src/engine/web-player.ts`
**Role:** The rendering engine for SimpleEditor.
**Reads:** `edl.assets.media[frame.clip.mediaId].path`
**Creates:** `<video src={path}>`
**Line 170:** `const asset = edl.assets.media[frame.clip.mediaId];`
**Line 176:** `const entry = getVideo(asset.id, asset.path);`
**Line 33:** `video.src = src;` — THIS is where the blob URL becomes a video source

### 2. `apps/web/src/stores/shot-to-project-edl.ts`
**Role:** Converts shot-based EDL → ProjectEDL.
**Input:** `shotEdl.shots[]` + `mediaUrlMap` (blob URLs)
**Output:** `ProjectEDL` with `assets.media[clipId].path = blobUrl`
**Line 34:** `path: mediaUrlMap[clipId] ?? mediaUrlMap[shot.source?.clipId] ?? ""`
**THIS IS THE MOST CRITICAL LINE.** If `mediaUrlMap[clipId]` is empty string, the video has no source.

### 3. `apps/web/src/stores/project-store.ts`
**Role:** Zustand store — holds `project.edl`.
**Line 160:** Auto-detects shot-based EDL: `edlInput?.shots && !edlInput.timeline?.tracks`
**Line 161:** Calls `convertShotEDLToProjectEDL(edlInput, mediaUrlMap ?? {})`
**Line 166:** Stores converted EDL: `project.edl = edl`
**If this detection fails, the raw shot-based EDL gets stored and the web player can't read it.**

### 4. `apps/web/src/components/editor/simple-editor/SimpleEditorPage.tsx`
**Role:** Orchestrates the upload → generate → apply flow.
**Line 156-161:** Builds `blobUrlMap[r2FileId] = URL.createObjectURL(file)`
**Line 220:** `await applyEDL(generatedEdl, mediaItems, blobUrlMap)`
**Line 211-218:** Builds `mediaItems` array for `mediaLibrary`

## Potential Failure Points

### Failure A: clipId mismatch
Server EDL `shots[].source.clipId` might not match `blobUrlMap` keys.

The `blobUrlMap` keys are `r2FileId` values (from `uploadToR2`).
The server EDL `clipId` values should also be `r2FileId` values (from `footageIds`).
**But:** if the server normalizes/changes the clip IDs, the lookup fails.

### Failure B: Conversion doesn't fire
The auto-detect at line 160 checks: `edlInput?.shots && !edlInput.timeline?.tracks`
If the server EDL already has `timeline.tracks` (ProjectEDL format), conversion is skipped.
But if it doesn't have `assets.media` populated, the web player sees empty assets.

### Failure C: Empty blob URL
If `blobUrlMap[clipId]` is `undefined`, the converter sets `path: ""`.
An empty string as video src → the video element loads nothing → black canvas.

## Fix If Still Broken

If verification shows the chain is correct but video is still black:

1. Check browser Network tab — are blob URLs loading?
2. Check `<video>` elements in DOM — are they created? What's their `src`?
3. Add `console.log` in `createVideoElement()` (web-player.ts:33) to log the src:
   ```ts
   function createVideoElement(src: string): VideoEntry {
     console.log("[WebPlayer] Creating video with src:", src.slice(0, 80));
     // ...
   }
   ```
4. If src is empty string → the blobUrlMap lookup failed (Failure C)
5. If src is a blob URL but video doesn't load → CORS or blob revoked (Failure D)
