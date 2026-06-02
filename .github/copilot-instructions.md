# Monet AI Director — Agent Instructions

**Mission**: Build an AI video editor that produces edits *indistinguishable from a professional human editor* — or better. Every line of code either raises the quality bar for final output or it doesn't.

See [CLAUDE.md](../CLAUDE.md) for full architecture, commands, and phase plan.

---

## Non-Negotiable Quality Bar

> The product works when a user uploads footage + song, says what they want, and gets a preview in <30s that makes them say **"wait, it actually got it"**.

Before shipping any change, ask: does this make the output edit better, faster, or more controllable? If not, it's scope creep.

**Hard targets** (defined in CLAUDE.md §9):
- Beat sync accuracy: **>80%** (measure it, don't assume it)
- Refinement loop: **<3s** from submit to updated preview
- Frame render: **<100ms** per frame
- Intent extraction: **<3s** p95

---

## Architecture in One Sentence Per Layer

| Layer | Role | Key File |
|---|---|---|
| **Intent** | Translates prompt → creative JSON — the moat | [decode-intent.ts](../src/server/api/decode-intent.ts) |
| **Analysis** | Scores footage segments + extracts beat grid | [analyze.ts](../src/server/api/analyze.ts) |
| **EDL Generation** | Intent + Analysis → MonetEDL | [generate-edl.ts](../src/server/api/generate-edl.ts) |
| **Renderer** | MonetEDL → Canvas2D preview frames | [monet-renderer.ts](../src/lib/renderer/monet-renderer.ts) |
| **Refinement** | Feedback → updated EDL (no re-analysis) | [refine-edl.ts](../src/server/api/refine-edl.ts) |
| **Export** | MonetEDL → H.264 MP4 via WebCodecs | [export-engine.ts](../src/lib/export-engine.ts) |

Flow is **always**: `Prompt → Intent → Analysis → EDL → Render`. Never skip the Intent layer.

---

## The EDL Is the Source of Truth

Everything visual derives from `MonetEDL`. See the full schema → [edl.ts](../src/server/types/edl.ts).

**Professional edit quality requires ALL of these on every EDL:**
- `shot.beatLock` present on every shot when `intent.technical.syncToBeat = true`
- `shot.aiRationale` on every shot — this is user-visible, write it like a filmmaker not a robot
- No shot `< 0.5s` (imperceptible) or `> 8s` (unless `pacing: slow`)
- `timeline.duration` within ±2s of `intent.structure.duration`
- Beat grid alignment within ±50ms — this is the human perception threshold
- `> 80%` transitions are `"cut"` — professionals cut, amateurs crossfade everything
- `< 30%` of shots have effects — restraint is craftsmanship

Run `validateEDL()` (in `generate-edl.ts`) on every generated EDL. Reject and retry if it fails.

---

## Scoring Functions (Know These Numbers)

```typescript
beatSyncScore    = % shots within ±50ms of beat grid    → target >0.9
pacingVariance   = std dev of shot durations             → target 0.3–0.5 (not <0.15, not >0.7)
overallConfidence = 0.4×beatSync + 0.3×pacing + 0.3×avgSegmentScore
```

**Segment quality threshold**: only use segments with `overall > 0.6`. Prefer `> 0.7`.
If `beatSyncScore < 0.7` after first generation, auto-retry once before returning to user (silently).

---

## Pacing Rules (Deterministic Fallback)

| Pacing | Avg Shot | Min | Max |
|---|---|---|---|
| `aggressive` | 1.8s | 1.0s | 3.0s |
| `fast` | 2.5s | 1.5s | 4.0s |
| `medium` | 3.5s | 2.0s | 5.0s |
| `slow` | 5.0s | 3.0s | 8.0s |

Vary ±30% around avg. `pacingVariance < 0.15` = mechanical and amateur. Vary it.

---

## Genre Defaults (What a Professional Would Do)

| Genre | Color Grade | Vignette | Pacing | Beat Sync |
|---|---|---|---|---|
| `anime_amv` | `anime` | 0.3 | aggressive | required |
| `sports_highlight` | `vibrant` | 0.2 | fast | required |
| `cinematic_trailer` | `cinematic` | 0.5 | varied | optional |
| `wedding` | `cinematic` | 0.4 | slow→medium | optional |
| `music_video` | `vibrant` | 0.2 | beat-driven | required |

For `anime_amv` and `music_video`: beat sync isn't optional. It's the whole point.

---

## Gemini Prompts Are Files, Not Strings

All prompts live in [src/server/prompts/](../src/server/prompts/). Load at runtime. Never hardcode prompt text in `.ts` files.

**Editing a prompt = editing a file in `prompts/`.** The prompt IS the product for generation quality.

When improving EDL quality, start here:
1. [generate-edl.txt](../src/server/prompts/generate-edl.txt) — shot selection, beat sync instructions
2. [analyze-footage.txt](../src/server/prompts/analyze-footage.txt) — segment scoring criteria
3. [analyze-music.txt](../src/server/prompts/analyze-music.txt) — beat grid precision

Always use `gemini-2.5-flash` (`gemini-2.5-flash`). No other model.
Always use Gemini's `responseSchema` for structured output. Never parse free-form text.
Always validate Gemini output with Zod before trusting it.

---

## Cloudflare Workers — Hard Constraints

- **No filesystem**. Media → R2 (`MONET_MEDIA`, `MONET_RENDERS`). Metadata → D1 (`DB`). Ephemeral → KV (`MONET_KV`).
- **Never buffer video in Worker memory** — use R2 multipart upload for files > a few MB
- **Gemini calls are async** — never block a sync Worker handler on one
- **CPU time limit** applies — heavy processing goes in Queue consumers
- See [wrangler.jsonc](../wrangler.jsonc) for all bindings

---

## Code Quality Rules (Hard)

- **No `any`** — design the type or use `unknown` + narrowing
- **No empty catch** — handle or rethrow with context
- **No raw `fetch` in UI components** — use [api-client.ts](../src/lib/api-client.ts)
- **No SQL string interpolation** — parameterized queries only
- **Result<T,E> pattern** for all async operations that can fail at API boundaries
- **Zod on every API boundary** — request bodies, Gemini responses, EDL reads from D1
- Every new API endpoint needs: Zod schema + typed response interface + standardized error shape

---

## The Refinement Loop Must Feel Magical

**Refinement = never re-analyze.** Always use cached analysis. Only the EDL changes.

Common feedback → expected behavior:
- "faster cuts" → reduce shot durations 30-50%
- "hit the drop harder" → find climax (60-70% in), make shots tighter after, add `shake`/`glow`
- "more energy" → add `glow`/`shake` effects, tighten cuts 20%
- "less effects" → remove effects, reduce intensity
- "sync tighter" → add `beatLock` to all shots

If refinement takes >5s wall clock, something is wrong. Profile it.

---

## TextTimeline (Phase 7B) — The Viral Feature

[TextTimeline.tsx](../src/components/chat/TextTimeline.tsx) is the screen-recordable moment. Protect it:
- Word deletion → EDL splice must complete in **<200ms** (it's pure JSON mutation, no API call)
- Preview update after deletion must happen in **<500ms**
- Undo stack: 20 deep, `useReducer`, no API round-trip
- Kinetic typography: `background: #000`, `color: #fff`, word scale = `1.0 + intensity × 0.5`
- Filler word detection: `um|uh|like|you know|er|hmm|ah|oh` + `confidence < 0.7`

---

## What "Professional" Means Here

A professional human editor would:
1. Select the **best** segments, not random ones — use `overall > 0.7` segments
2. **Cut on the beat** — ±50ms is the perception threshold
3. **Vary shot length** — monotone pacing (all same duration) is the mark of a beginner
4. Use effects **sparingly** — one effect per shot max, <30% of shots
5. Use **cuts 80%+ of the time** — crossfades are for slow/emotional moments only
6. Grade color **for the genre** — anime gets high-contrast saturated, cinematic gets teal-orange
7. **Match the music's energy curve** — high energy = short shots, low energy = longer shots
8. Write `aiRationale` like a real director: *"This closeup at the chorus drop captures the emotional peak"* not *"Shot 3 has high emotion score"*

Every generated EDL should be indistinguishable from one a skilled human editor would make.

---

## Current Negatives (Known Reality)

- Local environment split is still a major friction source:
  - `bun dev` / Vite local state is origin-scoped and not portable across ports (`8080` vs `8082`).
  - Direct `/studio/{id}` links can open an empty editor if timeline state is not available locally.
- In some local runs, Worker bindings are unavailable (`DB`, `R2`), so server-backed lookup and media hydration may return graceful `503` instead of loading timeline/media.
- Thread/project mapping can still be fragile if users deep-link into Studio before chat/thread hydration is complete.

## What Is Left (Highest Leverage Next)

1. Make direct Studio links fully portable in all local modes:
	- Keep server-backed lookup as primary path.
	- Add dev fallback persistence when `DB` binding is unavailable.
2. Normalize ID contracts end-to-end:
	- Ensure all routes and APIs consistently accept both `threadId` and `projectId` where relevant.
	- Persist canonical mapping server-side and stop relying on local-only mapping assumptions.
3. Add smoke tests for link portability:
	- Chat → Studio open on same origin.
	- Direct `/studio/{id}` open on fresh origin/session.
	- Missing binding mode returns actionable diagnostics, not blank preview/editor.

## Agent Behavior For These Gaps

- Never treat an empty Studio canvas as "loaded successfully"; verify timeline presence.
- When a timeline fails to hydrate, surface root cause (missing local state, DB unavailable, media unresolved) in UI diagnostics.
- Prefer typed API fallbacks over localStorage-only assumptions for route entry points.
