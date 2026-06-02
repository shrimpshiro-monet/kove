---
description: "Use when generating, modifying, validating, or scoring a MonetEDL. Covers schema rules, quality thresholds, beat sync requirements, shot selection criteria, and validateEDL() hard failure conditions. Load when working on generate-edl.ts, refine-edl.ts, deterministic-edl.ts, or any code that produces or consumes EDL JSON."
applyTo: "src/server/api/generate-edl.ts,src/server/api/refine-edl.ts,src/server/lib/deterministic-edl.ts,src/server/types/edl.ts"
---

# MonetEDL — Quality Rules

Schema reference: [edl.ts](../../src/server/types/edl.ts)

## Hard Failure Conditions (reject and retry)

```typescript
// Duration must be within ±2s of intent.structure.duration
// No shot longer than 30% of total duration
// If syncToBeat=true → every shot must have beatLock
// No overlapping shots (gap ≥ 0)
// Every shot.source.clipId must exist in edl.metadata.sourceClipIds
// Shot duration: never < 0.5s, never > 8s (unless pacing: "slow")
```

Run `validateEDL()` in [generate-edl.ts](../../src/server/api/generate-edl.ts) before returning. Retry once silently on failure.

## Shot Selection Priority

```
Prefer segments with overall > 0.7
Accept segments with overall > 0.6
Reject everything below 0.6
```

Score adjustment for intent match:
```
+0.20  motion score    if pacing is aggressive/fast
+0.20  emotion score   if mood includes emotional/melancholic
+0.15  if faceDetected and contentPreferences.focusOn includes "face_closeups"
+0.15  if high motion and contentPreferences.focusOn includes "action_scenes"
```

## Scoring Formulas

```typescript
beatSyncScore    = shots_within_50ms_of_beat / total_shots  // target > 0.9
pacingVariance   = stddev(shot.timing.duration[])           // target 0.3–0.5
overallConfidence = 0.4 * beatSyncScore + 0.3 * pacingVariance_score + 0.3 * avgSegmentScore
```

`pacingVariance_score = 1.0` if variance in [0.3, 0.5], scales down outside range.

## Beat Lock Rules

```typescript
// beatLock.lockMode:
//   "start"  → shot.timing.startTime aligns to beat
//   "end"    → shot end time aligns to beat
//   "center" → shot midpoint aligns to beat (for slow/emotional)
```

Tolerance: ±50ms. This is the human perception threshold for music sync.

## Pacing Targets

| Pacing | Avg | Min | Max | Usage |
|---|---|---|---|---|
| `aggressive` | 1.8s | 1.0s | 3.0s | Anime AMV choruses, drops |
| `fast` | 2.5s | 1.5s | 4.0s | Sports, hype reels |
| `medium` | 3.5s | 2.0s | 5.0s | Music videos, vlogs |
| `slow` | 5.0s | 3.0s | 8.0s | Wedding, cinematic |

Vary ±30% around average. `pacingVariance < 0.15` is mechanical — add variance intentionally.

## Transition Rules

- **>80% must be `"cut"`** — professionals cut; amateurs crossfade everything
- `crossfade` only for slow/emotional moments or act transitions
- `dip_black` only for major act breaks
- No shot should have a crossfade AND an effect — pick one

## Effect Rules

- **<30% of shots** should have effects
- Max **one effect per shot**
- For anime_amv: glow on climax shots, shake on drops
- For sports: shake on impact moments only
- Effects should reinforce the emotion, not mask bad footage

## Color Grade by Genre

| Genre | colorGrade | vignette | grain |
|---|---|---|---|
| `anime_amv` | `"anime"` | 0.3 | 0 |
| `sports_highlight` | `"vibrant"` | 0.2 | 0 |
| `cinematic_trailer` | `"cinematic"` | 0.5 | 0.15 |
| `wedding` | `"cinematic"` | 0.4 | 0.1 |
| `music_video` | `"vibrant"` | 0.2 | 0 |

## aiRationale — Write Like a Director

Every shot MUST have `aiRationale`. Write it as a filmmaker, not a data analyst.

```
// ✅ Good
"This tight closeup of her hands at the verse drop — the stillness contrasts the beat perfectly"
"Wide establishing shot lets the music breathe before the chorus hits"

// ❌ Bad
"Segment selected due to high overall score of 0.83"
"This shot has motion=0.7 and emotion=0.6"
```

## Energy Curve Mapping

```
energyCurve[t] 0.8–1.0  →  cut every beat (1-2s shots)
energyCurve[t] 0.5–0.7  →  cut every 2-4 beats (2-4s shots)  
energyCurve[t] 0.2–0.4  →  breathe (4-8s shots)
```

The climax (highest energy in energyCurve, or `structure.drop`) → tightest cuts + glow/shake effects.
