# Failed Generations

Every time Kove fails to generate an edit, save the inputs and outputs here.

This is the failure dataset. Failures become the roadmap.

## Schema

Each failure is stored in a timestamped subdirectory:

```
failed_generations/
  montage_steph_highlights_20260718_105512/
    footage.mp4         # Copy of input footage
    profile.json        # Style profile used
    prompt.txt          # Prompt (if any)
    reference.mp4       # Reference video (if any)
    output.edl.json     # Generated EDL (may be partial)
    output.mp4          # Rendered output (if any)
    failure.json        # Failure metadata
```

## failure.json schema

```json
{
  "timestamp": "2026-07-18T10:55:12",
  "test_name": "montage_steph_highlights",
  "mode": "montage",
  "footage": "test/High Quality Steph Curry Clips for Edits! (2024-25).mp4",
  "duration_s": 72.8,
  "resolution": "1280x720",
  "category": "montage",
  "failure_type": "crash | bad_cuts | bad_captions | bad_pacing | bad_prompt_following | render_error",
  "returncode": 1,
  "stderr": "...",
  "error": "Human-readable description of what went wrong",
  "num_shots": 0,
  "edl_valid": false
}
```

## Failure categories

| Category | Description |
|---|---|
| crash | Director or renderer crashes (exception, segfault, OOM) |
| bad_cuts | Cuts don't match sentence boundaries or beat grid |
| bad_captions | Captions are wrong, misaligned, or missing |
| bad_pacing | Output duration or shot rhythm is wrong |
| bad_prompt_following | Output doesn't match prompt intent |
| render_error | FFmpeg xfade or overlay fails |

## Current status

As of 2026-07-18: all 11 stranger footage stress tests pass.
No failures in the wild yet.
