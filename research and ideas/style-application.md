# style-application.md

## Source: `src/server/director/enhance-edl-with-style.ts`

### What it does
Takes `StyleDirectives` (from `compileReferenceStyleToDirectives`) and enhances EDL shots with effects, timing, and metadata.

### Two modes

**Role-based mode** (when `tempoMode !== "narrative"` or `strict_replication`):
- Uses `TEMPO_PROFILES[tempo]` to determine effect placement
- Three effect roles: **ramp** (anticipation before beat), **hit** (impact on beat), **glide** (breathing between beats)
- Beat detection from `edl.music.beatGrid`
- Drop detection from music energy spikes

**Legacy mode** (fallback):
- Uses `shouldApplyEvery(index, frequency)` to gate effect placement
- Direct effect placement based on directives

### GPU effects (strict_replication only)
Added on every other shot:
- `bloom_highlights` — cinematic glow
- `sepia` — vintage tone
- `vignette_pro` — dark edges
- `hologram`, `thermal`, `plasma` — for aggressive mode

### What it does NOT do
- Does NOT change shot timing (inPoint/outPoint)
- Does NOT change shot selection
- Does NOT influence which source moments are chosen
- Only adds effects and metadata to existing shots
