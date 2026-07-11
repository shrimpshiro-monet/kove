# Steph Curry Reference Match Test

## Purpose

Validates that Monet's pipeline can generate an EDL that matches the Steph Curry
reference edit 1:1 — same timing, same effects, same pacing, same beat sync.

## Reference Video

**File:** `reference-edits-2/steph curry.MP4`

| Property | Value |
|----------|-------|
| Duration | 19.16s |
| Resolution | 576×576 |
| FPS | 30 |
| Total cuts | 27 |
| Cut rate | 1.41 cuts/s |
| Avg shot duration | 0.71s |
| Effects | impact_flash, speed_ramp, context_shake, chromatic_burst |
| Transitions | cut, whip_pan |
| Color grade | cool_dark (desaturated, cool tones) |
| VFX intensity | high |

## User Prompt (what the AI director receives)

```
19s basketball highlight reel, Steph Curry, fast cuts on beat, dark cool tones,
impact flashes on every shot, speed ramps on hero moments, chromatic burst on
the climax. Match the reference edit exactly.
```

## Files

| File | Purpose |
|------|---------|
| `steph-curry-expected-edl.json` | The target EDL — 27 shots matching the reference's timing, effects, and structure |
| `steph-curry-reference-match.ts` | Validation script — scores the EDL against reference constants |

## Running the Test

```bash
# Validate the expected EDL (should score 100/100)
bun test/steph-curry-reference-match.ts

# Validate a generated EDL
bun test/steph-curry-reference-match.ts path/to/generated.edl.json
```

## Scoring Criteria (100 points total)

| Check | Weight | Threshold |
|-------|--------|-----------|
| Duration match | 15% | Within ±2s of 19.16s |
| Shot count | 15% | Within ±5 of 27 shots |
| Avg shot duration | 15% | Within ±0.3s of 0.71s |
| Resolution | 10% | Exactly 576×576 |
| Shot duration bounds | 10% | All shots 0.3–3.5s |
| Effect coverage | 15% | ≥40% of shots have effects |
| Required effect types | 10% | Must include impact_flash + speed_ramp |
| Beat lock coverage | 10% | ≥50% of shots beat-locked |
| No overlapping shots | 10% | Zero temporal overlaps |

**Pass threshold:** 80/100

## What This Tests

1. **EDL structure** — correct schema, valid timing, no overlaps
2. **Pacing fidelity** — matches the reference's fast-cut sports style (0.71s avg)
3. **Effect vocabulary** — uses the right effects in the right density
4. **Beat sync** — shots lock to the beat grid
5. **Timing precision** — speed ramps use the new integral formula
6. **Transition variety** — mix of cuts and whip_pans, not monotone

## Reference Analysis (from reference-catalog.json)

The Steph Curry edit uses a **sports highlight** style with:
- **Fast pacing** — 1.41 cuts/second, median shot ~0.7s
- **Dark cool tones** — desaturated, blue-shifted color grade
- **Impact-driven** — flash on every cut, chromatic burst on key moments
- **Speed ramping** — slow-mo on hero shots (releases, celebrations)
- **Micro-cuts** — 2-3 rapid cuts in sequence for rhythm breaks
- **Whip pans** — used sparingly as energy punctuation

This matches the reference catalog's `sports_highlight` style profile exactly.
