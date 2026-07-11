# director.md

## Two Separate Pipelines

### Pipeline 1: `handleGenerateEDL` (what frontend calls)
**File**: `src/server/api/generate-edl.ts`

Two-pass system:
1. **Pass 1**: LLM creative skeleton (3-line system prompt)
2. **Pass 2**: Deterministic timing via `alignToOnsets` or `fastPlanner`

**System prompt**:
```
You are a video director. Given footage analysis, music analysis, and intent,
produce an EDLCreativeSkeleton: an ordered list of shots with emotional roles
and effect INTENTS.

CRITICAL RULES:
- Do NOT specify exact times or durations. Pass 2 handles timing math.
- Each shot references source.clipId and source.segmentIndex from the analysis.
- effectIntents describe creative intent (energy_boost, tension_build, etc.), NOT concrete effects.
- The emotional arc should escalate, peak, and resolve.
- Return ONLY valid JSON matching the EDLCreativeSkeleton schema.
```

**Reference injection**: Just `JSON.stringify(referenceStyle)` appended to prompt body.

**Schema**: Shot has `source.clipId`, `source.segmentIndex`, `intendedRole`, `emotionalBeat`, `effectIntents[]`, `aiRationale`

### Pipeline 2: `generateEDL` in edl-generation.ts (what chat thread SHOULD call)
**File**: `src/server/lib/edl-generation.ts`

Full v3 prompt with:
- 500+ line style vocabulary (4 pillars: Brutalist Impact, Tension-Pivot, Vocal Flow Sync, Legacy Montage)
- Reference director section with concrete rules
- Moment maps from reference trace
- Effect vocabulary from reference analysis
- Critique loop for refinement
- `enforceReferenceStyleOnEDL` to override shots

**This pipeline is NOT used by the frontend.**

---

## The Fix Needed
Wire the frontend to call the v3 pipeline instead of the skeleton pipeline.
