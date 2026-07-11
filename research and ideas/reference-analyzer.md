# reference-analyzer.md

## Source: `src/server/api/analyze-reference.ts`

### What it does
Takes uploaded reference video → extracts frames → computes motion energy + cut frequency → sends to LLM → returns ReferenceStyle

### Pipeline
1. `extractFrames(env, referenceFileId, 24)` — extract 24 frames from video
2. `computeMotionEnergy(env, referenceFileId)` — per-frame energy scores
3. `computeCutFrequency(env, referenceFileId)` — cuts per second, avg shot duration, variance
4. LLM analyzes frames with vision → returns style JSON
5. Deterministic values forced back in (LLM can't make these up)
6. **NEW: Normalization step** maps output to `compileReferenceStyleToDirectives` format

### Output fields
```
cutFrequency: 2.5 (cuts per second)
avgShotDurationSeconds: 0.4
cutDurationsVariance: 0.12
motionEnergyProfile: [0.3, 0.7, ...]
detectedEffects: [...]
rhythm: { avgShotDuration, cutAlignment, cutsPerSecond }  // NEW
intentMapping: { pacing, energy }  // NEW
pacing: { climaxPosition, energyCurve }  // NEW
effects: { transitionsBreakdown, effectsFrequency }  // NEW
```

### Key issue
The normalization was added AFTER the original analysis. The dev server cached the old version. The `REFERENCE_STYLE_DETAIL {}` in logs was because `refResult.style?.rhythm` didn't exist yet.
