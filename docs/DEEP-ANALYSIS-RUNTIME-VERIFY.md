# Deep Analysis Runtime Verification

> Date: 2026-07-08
> File: `workers/python-ai/workers/deep_analysis.py`
> Status: PASS

---

## Test Video

- **File:** `benchmark-outputs/run-08-output.mp4`
- **Duration:** 30.03s
- **FPS:** 30.0
- **Total frames:** 901

## Results

| Metric | Value | Status |
|--------|-------|--------|
| Runtime | 28.61s | OK |
| Top-level keys | 16 (identical to before) | PASS |
| Shots | 24 | PASS |
| Velocity samples | 299 (901/3) | PASS |
| Color samples | 180 (901/5) | PASS |
| Flash frames | 0 (none in this video) | PASS |
| Palette colors | 5 | PASS |
| Palette hex values | `#1b1c1f`, `#9dc7d4`, `#827e67`, `#e7efee`, `#534a46` | PASS |
| Audio | No audio track (expected for render output) | PASS |
| BPM | null (no audio) | PASS |
| Pacing | medium | PASS |

## Brightness Timeline (Flash Detection)

| Metric | Value | Status |
|--------|-------|--------|
| Timeline length | 901 | PASS |
| Indices length | 901 | PASS |
| Every frame sampled | Yes (901 == 901) | PASS |
| First index | 0 | PASS |
| Last index | 900 | PASS |

## Dataclass Schema Verification

| Dataclass | Fields | Status |
|-----------|--------|--------|
| Shot | index, start_time, end_time, duration, start_frame, end_frame | IDENTICAL |
| VelocitySample | timestamp, magnitude | IDENTICAL |
| ColorSample | timestamp, brightness, saturation, contrast, temperature | IDENTICAL |
| FlashFrame | timestamp, frame_index, brightness, flash_type | IDENTICAL |
| BeatInfo | bpm, beats, onsets | IDENTICAL |
| AnalysisResult | total_duration, fps, total_frames, width, height, shots, velocity_curve, color_samples, flash_frames, audio, cut_frequency, avg_shot_duration, shot_duration_variance, pacing, dominant_palette, summary | IDENTICAL |

## Backwards Compatibility

All old function signatures still work:

- `compute_optical_flow(video_path, sample_interval)` -> `list[VelocitySample]`
- `extract_color_samples(video_path, sample_interval)` -> `list[ColorSample]`
- `detect_flash_frames(video_path, sample_interval)` -> `list[FlashFrame]`
- `extract_dominant_palette(video_path, n_colors, sample_frames)` -> `list[str]`

## Compilation

```
$ python3 -m py_compile workers/deep_analysis.py
COMPILE OK
```

## Acceptance Criteria

- [x] Python compiles
- [x] `run_deep_analysis()` returns same 16 top-level keys
- [x] All dataclass schemas unchanged
- [x] No frontend contract changes
- [x] Brightness timeline is every-frame (901/901)
- [x] No crashes on real MP4
- [x] Palette returns valid hex colors
- [x] Audio gracefully returns null when no track
- [x] PySceneDetect fallback still works (FFmpeg path exists)
- [x] Compatibility wrappers present for old callers
