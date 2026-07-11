# shot-selector.md

## Source: `src/server/lib/fast-planner.ts`

### What it does
Generates shots when AI creative pass fails or as deterministic fallback.

### Shot selection logic
1. Flatten all segments from footage analysis
2. Normalize field names (start/end → startTime/endTime)
3. Rank by `visualInterestScore + energyScore`
4. Pick top segments, cycling if not enough unique ones
5. Distribute cut times evenly across target duration, snapped to onsets
6. For each shot: compute `inPoint` using golden-ratio offset

### Source diversity fix (current)
**Before**: `(i % 3) * (segDuration / 3)` — only 3 fixed positions
**After**: `((i * PHI) % 1) * segDuration` — golden ratio gives 20 unique positions

### Key limitation
With metadata_fallback analysis (1 segment, 10s), there's only 10s of source material. The golden-ratio offset distributes across this 10s, but the footage itself may not have 20 visually distinct moments in 10s.

### What's missing
- No understanding of "best moments" — just mathematical distribution
- No consideration of motion, emotion, or visual interest at specific timestamps
- No reference-aware shot selection (doesn't use reference pacing data)
