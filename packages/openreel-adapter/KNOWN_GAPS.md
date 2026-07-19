# Known Gaps — OpenReel Adapter

## GAP-001: Clip-level keyframes not rendered by preview engine

**Impact:** Keyframe animations targeting clip properties (push_in, pull_out, color_pulse, etc.) are stored on `OpenReelClip.keyframes[]` but never read by the preview engine at render time. The animation appears "applied" in the UI but renders as static.

**Trust bug risk:** Phase 2 refinement will tell users "applied push_in to clip 3" when the preview shows no animation.

**Workaround (alpha):** Kove Director must NOT emit `keyframe/add` actions targeting clip properties. Use static transform values instead (e.g., `transform/update` with a fixed `scale` value rather than scale keyframes).

**Fix path (v1.1):** Either:
- Extend `apps/web/src/engine/timeline-resolver.ts` to consume `clip.keyframes[]` and interpolate values at render time
- Or migrate clip keyframes into a global keyframes track that the engine already processes

**Files affected:**
- `apps/web/src/engine/timeline-resolver.ts` — needs keyframe interpolation
- `apps/web/src/engine/keyframes/interpolator.ts` — already has `resolveAnimatedValue()`, needs to be wired to clip keyframes
- `packages/kove-director/src/compiler.ts` — `compileClipSpeed` and `compileEffectKeyframe` emit keyframe/add actions

---

## GAP-002: ~~Executor and compiler are parallel paths~~ ✅ FIXED

**Fixed in:** commit `13bf8ad` — TypeScript refinement path (`refine-edl-ts.ts`) uses the same LLM provider chain and action vocabulary as generation. Both paths now produce DirectorActions that compile to the same action types.

---

## GAP-003: ~~Refinement uses rule-based fallback~~ ✅ FIXED

**Fixed in:** commit `4ff0ccd` — Unified LLM provider (Cerebras → Groq → NIM → DO) replaces the DO-only Nemotron call. The TypeScript refinement path (`refine-edl-ts.ts`) calls the LLM directly with a system prompt that covers all 77+ capabilities.

---

## GAP-004: Refinement merge is clip-level only

**Impact:** The `applyActionsToEdl()` function in `refine-edl-ts.ts` handles clip-level operations (speed, effects, transitions, keyframes, volume, fades) and color grading. Track-level operations (`track/create`, `track/remove`) are no-ops.

**Workaround:** Refinement cannot add new tracks (e.g., "add a voiceover track") or reorder the timeline structure.

**Fix path (v1.2):** Extend `applyActionsToEdl()` to handle `track/create`, `track/remove`, and clip reordering actions.

---

## GAP-005: Scope propagation is exact-match only

**Impact:** Scope is a list of exact clip IDs. If the user selects clips in the UI but the clip IDs change after a previous refinement, the scope becomes stale.

**Workaround:** Users must re-select clips after each refinement. The scope is passed as a flat list, not a reactive reference.

**Fix path (v1.1):** Use clip indices or content hashes instead of IDs for scope matching, or re-validate scope against the current EDL before each refinement.

---

## GAP-006: ~~Refinement route uses `any` types~~ ✅ FIXED

**Fixed in:** commit `13bf8ad` — `vibe-refine.ts` now uses Zod schema (`RefineRequestSchema`) for request body validation. The TypeScript refinement path uses proper types throughout.

---

## GAP-007: ~~Refinement job cleanup is timer-based~~ ✅ FIXED

**Fixed in:** Prior session — `sweepStaleJobs()` runs on startup, deleting `/tmp/kove-refine-jobs/` directories older than 24h. Timer-based cleanup retained as secondary mechanism.

---

## GAP-008: ~~Rule-based refinement handles ~10 patterns~~ ✅ FIXED

**Fixed in:** commit `4ff0ccd` — The TypeScript refinement path uses an LLM system prompt that covers all capability types. No more hardcoded pattern matching.

---

## GAP-009: Frontend refinement polling has no retry backoff

**Impact:** `useRefineEDL.ts` polls every 2 seconds with no exponential backoff. If the server is slow, this generates steady traffic.

**Workaround:** Acceptable for alpha. Server-side job timeout (120s) limits blast radius.

**Fix path (v1.1):** Add exponential backoff (2s → 4s → 8s) to the polling interval.
