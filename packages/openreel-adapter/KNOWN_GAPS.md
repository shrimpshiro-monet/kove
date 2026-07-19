# Known Gaps — OpenReel Adapter

## All 9 gaps resolved ✅

| Gap | Description | Fixed In |
|-----|-------------|----------|
| GAP-001 | Clip keyframes not rendered | `c9ee626` — resolveClipKeyframes() |
| GAP-002 | Executor/compiler parallel paths | `13bf8ad` — TypeScript refinement path |
| GAP-003 | Rule-based refinement fallback | `4ff0ccd` — Unified LLM provider |
| GAP-004 | Clip-level only merge | `0a70881` — track/create + track/remove |
| GAP-005 | Stale scope propagation | `0a70881` — scope re-validation |
| GAP-006 | `any` types in vibe-refine | `13bf8ad` — Zod schema |
| GAP-007 | Timer-based job cleanup | Prior session — startup sweep |
| GAP-008 | 10-pattern rule limitation | `4ff0ccd` — LLM covers all capabilities |
| GAP-009 | No polling retry backoff | Prior session — exponential backoff with jitter |

---

## Historical details (preserved for reference)

### GAP-001: Clip-level keyframes not rendered by preview engine ✅ FIXED

**Fixed in:** commit `c9ee626` — Added `resolveClipKeyframes()` to `timeline-resolver.ts` that interpolates position, scale, rotation, and opacity keyframes at any local time using easing functions.

### GAP-002: Executor and compiler are parallel paths ✅ FIXED

**Fixed in:** commit `13bf8ad` — TypeScript refinement path (`refine-edl-ts.ts`) uses the same LLM provider chain and action vocabulary as generation. Both paths now produce DirectorActions that compile to the same action types.

### GAP-003: Refinement uses rule-based fallback ✅ FIXED

**Fixed in:** commit `4ff0ccd` — Unified LLM provider (Cerebras → Groq → NIM → DO) replaces the DO-only Nemotron call. The TypeScript refinement path (`refine-edl-ts.ts`) calls the LLM directly with a system prompt that covers all 77+ capabilities.

### GAP-004: Refinement merge is clip-level only ✅ FIXED

**Fixed in:** commit `0a70881` — `applyActionsToEdl()` now handles `track/create`, `track/remove`, and `marker.add` actions in addition to clip-level operations.

### GAP-005: Scope propagation is exact-match only ✅ FIXED

**Fixed in:** commit `0a70881` — Scope is re-validated against current EDL clip IDs before each refinement. Stale IDs are automatically filtered out.

### GAP-006: Refinement route uses `any` types ✅ FIXED

**Fixed in:** commit `13bf8ad` — `vibe-refine.ts` uses Zod schema (`RefineRequestSchema`) for request body validation.

### GAP-007: Refinement job cleanup is timer-based ✅ FIXED

**Fixed in:** Prior session — `sweepStaleJobs()` runs on startup, deleting `/tmp/kove-refine-jobs/` directories older than 24h.

### GAP-008: Rule-based refinement handles ~10 patterns ✅ FIXED

**Fixed in:** commit `4ff0ccd` — The TypeScript refinement path uses an LLM system prompt that covers all capability types.

### GAP-009: Frontend refinement polling has no retry backoff ✅ FIXED

**Fixed in:** Prior session — `useRefineEDL.ts` uses exponential backoff (1s → 2s → 4s → 5s max) with jitter.
