# Task: Scene Detection Over-splitting Fix + Thumbnail Previews

## Status: DONE

## Changes Made

### Task 1: Reduce Over-splitting

**Python (`workers/python-ai/workers/deep_analysis.py`)**
- `detect_shots_pyscenedetect`: `adaptive_threshold` 3.0 → 3.5, `min_scene_len` 15 → 45 (1.5s minimum at 30fps)
- `detect_shots_ffmpeg`: Added minimum shot duration filter (0.5s) — shots shorter than this are merged into adjacent shots by skipping their cut timestamp

**TypeScript (`src/server/lib/scene-detection.ts`)**
- `calculateShotDurations` now merges shots shorter than 0.3s into adjacent shots instead of including them as separate segments
- Returns both `durations` and `mergedScenes` so the caller gets the filtered scene list
- `detectSceneChanges` uses the merged scenes in its return value

### Task 2: Scene Preview Thumbnails

**`src/server/lib/scene-detection.ts`**
- New export: `extractSceneThumbnails(videoPath, scenes, totalDuration, maxThumbnails = 20)`
- Extracts a 160px-wide JPEG thumbnail at each shot midpoint
- Returns base64-encoded data URIs

**`src/server/api/detect-scenes.ts`**
- Refactored to manage temp file lifecycle directly (was using `detectSceneChangesFromBuffer` which cleaned up before thumbnails could be extracted)
- After detection, calls `extractSceneThumbnails` and includes `thumbnails` array in response

## Commits

- `4535f89` — `fix: increase scene detection min_scene_len to reduce over-splitting`
  (Both tasks combined — scene-detection.ts was modified by both, so splitting would leave broken intermediate state)
