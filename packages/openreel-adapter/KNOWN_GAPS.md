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

## GAP-002: Executor and compiler are parallel paths (not connected)

**Impact:** The kove-director compiler emits `OpenReelAction[]` but the action executor (`monet-action-executor.ts`) consumes `MonetEDL` directly, not Actions. The two systems operate independently.

**Workaround:** Phase 2 refinement must go through the EDL path, not the Action path. The compiler is used for initial generation; refinement operates on the EDL directly.

**Fix path (v1.2):** Wire the executor to consume `OpenReelAction[]` instead of `MonetEDL`, or build an Action→EDL bridge.

---

## GAP-003: Refinement uses rule-based fallback, not Nemotron

**Impact:** `scripts/monet_refine.py` currently uses a rule-based `apply_rule_based_refinement()` function that handles ~10 common prompts (slow-mo, shake, flash, zoom, crossfade, color grade, mute). Complex or ambiguous prompts fall through as no-ops.

**Workaround:** The Nemotron integration point exists in `build_refine_prompt()` but the actual API call is not wired. Users with complex refinement requests will see no change.

**Fix path (v1.1):** Wire the Nemotron API call in `monet_refine.py` using the same AI service pattern as `monet_pipeline.py`. The prompt construction is already implemented.

**Files affected:**
- `scripts/monet_refine.py` — replace `apply_rule_based_refinement()` with Nemotron call
- `src/server/services/ai-service.ts` — existing Nemotron client

---

## GAP-004: Refinement merge is clip-level only

**Impact:** The `compile_actions_to_edl()` function in `monet_refine.py` only handles clip-level operations (speed, effects, transitions, keyframes). Track-level operations (add track, remove track, reorder tracks) are not supported.

**Workaround:** Refinement cannot add new tracks (e.g., "add a voiceover track") or reorder the timeline structure.

**Fix path (v1.2):** Extend `compile_actions_to_edl()` to handle `track/create`, `track/remove`, and clip reordering actions.

---

## GAP-005: Scope propagation is exact-match only

**Impact:** Scope is a list of exact clip IDs. If the user selects clips in the UI but the clip IDs change after a previous refinement, the scope becomes stale.

**Workaround:** Users must re-select clips after each refinement. The scope is passed as a flat list, not a reactive reference.

**Fix path (v1.1):** Use clip indices or content hashes instead of IDs for scope matching, or re-validate scope against the current EDL before each refinement.

---

## GAP-006: Refinement route uses `any` types in req.body and res.send

**Impact:** `apps/api/src/api/vibe-refine.ts` casts `req.body as { ... }` without Zod validation. The `err` catch block uses `any`. This is pre-existing code that should be hardened before production.

**Workaround:** Acceptable for alpha. Not a data-loss risk since the Python script validates its own inputs.

**Fix path (v1.1):** Add Zod schema for request body validation on the route.

**Files affected:**
- `apps/api/src/api/vibe-refine.ts` — lines 31-37 (body cast), line 72 (err: any)

---

## GAP-007: Refinement job cleanup is timer-based, not deterministic

**Impact:** `CLEANUP_MS = 3_600_000` (1 hour) timer deletes temp files. If the server crashes, orphaned `/tmp/kove-refine-jobs/<uuid>/` directories accumulate.

**Workaround:** Manual cleanup or restart clears orphans. Not a data risk since temp files are ephemeral.

**Fix path (v1.2):** Add a startup sweep that deletes stale job directories older than 24h.

---

## GAP-008: Rule-based refinement handles ~10 patterns, not all 37 capabilities

**Impact:** `apply_rule_based_refinement()` in `monet_refine.py` only handles: slow-mo, fast, shake, flash, zoom-in, zoom-out, crossfade, color grade, mute. Requests like "whip-pan between clips", "add vignette", or "morph cut" silently no-op.

**Workaround:** Users must phrase requests within the 10 supported patterns. Nemotron integration (GAP-003) will handle the full capability set.

**Fix path (v1.1):** Wire Nemotron API call in `monet_refine.py` to replace the rule-based fallback.

**Files affected:**
- `scripts/monet_refine.py` — `apply_rule_based_refinement()` function (lines 222-343)

---

## GAP-009: Frontend refinement polling has no retry backoff

**Impact:** `useRefineEDL.ts` polls every 2 seconds with no exponential backoff. If the server is slow, this generates steady traffic.

**Workaround:** Acceptable for alpha. Server-side job timeout (120s) limits blast radius.

**Fix path (v1.1):** Add exponential backoff (2s → 4s → 8s) to the polling interval.
