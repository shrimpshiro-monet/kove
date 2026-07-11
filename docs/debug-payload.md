# debug-payload.md

## What the generator actually receives

### Creative Prompt (what the LLM sees)
```
Intent: {"style":["hype basketball edit"],"energy":"high","pacing":"fast cuts synced to beat drops"}

Footage analysis: [{"clipId":"abc","duration":10,"segments":[{"start":0,"end":10,"scores":{"motion":0.5}}]}]

Music: BPM 120, duration 30s, mood "energetic", sections: [...]

Reference style to match: {"cutFrequency":2.5,"avgShotDurationSeconds":0.4,...}

Reference mode: strict_replication

Edit intensity: 0.5

Tempo mode: reference_mirror

Produce an EDLCreativeSkeleton with 15 shots.
```

### What's MISSING from the prompt
- No reference director section (concrete rules)
- No moment maps (specific timeline positions)
- No effect vocabulary (which effects to use and when)
- No pillar weights (brutalistImpact, tensionPivot, etc.)
- No style vocabulary (4 pillars of modern editing)
- No replication contract (tolerances, constraints)

### What the v3 prompt includes but isn't used
```
REFERENCE DIRECTOR STYLE — OVERRIDE DEFAULTS WITH THIS
- Average shot duration: 0.40s (hard target)
- Cut alignment: strict
- Climax at: 65% of timeline
- Editor philosophy: "..."
- Signature move: "..."

REFERENCE STYLE CONSTRAINTS
- Keep average shot duration within ±15% of 0.40s
- Keep transition mix near 80% cuts / 20% crossfades

STYLE SLOTS (moment-by-moment effects from reference)
- t=0.0s: impact_hit, speed_ramp (intensity 80%)
- t=5.0s: push_in, color_pulse (intensity 60%)
...

EFFECT VOCABULARY
- Most used effects: impact_flash (45%), speed_ramp (30%), ...
```
