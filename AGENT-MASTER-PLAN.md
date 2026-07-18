# KOVE / MONET — MASTER BUILD DOCUMENT

**Audience:** OpenCode and any autonomous coding agent working this repo unattended.
**Author context:** Written by Claude, from a full clone + git history read + web research, on 2026-07-18. The human owner is stepping away and will not be checking in. This document exists so you never have to ask him a question. If something below is ambiguous, resolve it yourself using the priority order in Part E and keep moving.

---

## 0. RULES OF ENGAGEMENT — READ THIS BEFORE ANYTHING ELSE

1. **Never stop to ask the human a question.** If a decision is ambiguous, pick the option that matches the existing architectural doctrine already in this repo (`AGENTS.md`, `GEMINI.md`, `.claude/agents/mogenter.md`, `.github/copilot-instructions.md`) and state the assumption in your commit message. Move on.
2. **Every feature you build must be committed, pushed, and verified end-to-end before you consider it done.** "Done" means all four of the following are true:
   - Code compiles/typechecks (`tsc --strict` clean, or the relevant language's equivalent — Python: `ruff`/`mypy` if configured, Rust: `cargo check`).
   - The manual or automated verification step listed for that task passes (this doc specifies one per task — run it, capture the output).
   - `git add -A && git commit -m "<conventional commit message>"` has been run.
   - `git push` has succeeded against `origin` (confirm with `git log origin/main..HEAD` returning empty, or the equivalent for whatever branch strategy is active).
   - If push fails (auth, protected branch, conflicts) — do not silently skip it. Open a PR branch (`feat/<slug>`), push that, and note in your log that a PR is waiting for merge. Never leave work uncommitted or unpushed as "I'll do it later."
3. **No feature is complete without a smoke test.** For backend endpoints: a `curl` or `bash` script exercising the route with a real payload, checked into `scripts/` or `tests/`. For frontend: a Vitest/RTL test or, at minimum, a Playwright/manual E2E checklist item added to `TESTING.md`. For pipelines (EDL generation, rendering, export): run the existing `test-full-pipeline.sh` / `test-resilience.sh` scripts (already in repo root) and confirm they still pass after your change.
4. **Read the existing doctrine first, every time, for every task:**
   - `AGENTS.md` (root) — monorepo map, gotchas, "don't touch these" list
   - `GEMINI.md` and `.claude/agents/mogenter.md` — the full architecture law (they are near-duplicates; `mogenter.md` is the canonical, more recent one)
   - `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` — scoped quality rules per subsystem
   - `packages/kove-director/CAPABILITY_INVENTORY.md` — the single source of truth for what's alpha/beta/planned
   - `packages/openreel-adapter/KNOWN_GAPS.md` — the 9 known integration gaps between Monet's EDL and OpenReel
   - `docs/agents/domain.md`, `docs/superpowers/specs/2026-07-14-kove-v2-pipeline-redesign.md` — architecture history and rationale
   These are not optional background reading — they contain hard constraints (e.g. "never modify OpenReel source," "no `any` types," "beat sync must exceed 80%") that override generic best practice.
5. **This repo is two products living in one monorepo, not one.** Do not conflate them:
   - **Monet v1** — root `src/`, Cloudflare Worker + TanStack Start + Gemini. This is the shipped/shippable product.
   - **Kove v2** — `apps/api` (Fastify) + `apps/web` (Vite) + `apps/worker-node` (BullMQ) + `packages/edl-v2` + `packages/kove-director` + `workers/python-*`. This is the in-progress rebuild with a real AI Director, multi-track EDL, and a proper render worker.
   Every task below states which of the two it belongs to. Do not "helpfully" port a v1 feature into v2 or vice versa without it being an explicit task.
6. **Never touch:** `editly/` (local fork), `external/*` (pinned forks), `openreel-video/` (wrapped, not extracted — this is non-negotiable, see Part C), `hyperframes/` (independent repo), `routeTree.gen.ts` (auto-generated).
7. **Commit message format:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`) — this repo already uses this convention consistently (checked 150 commits of history). Match it exactly, e.g. `feat(director): wire kinetic-caption action verb to compiler`.

---

## PART A — WHAT WE BUILT, WHY, AND HOW

*(This section exists because you, the agent picking this up, might not have the conversation history that produced this codebase. Everything below is reconstructed from `git log`, the capability inventory, and the doctrine docs — not assumed.)*

### A1. The core idea

Kove/Monet is **an AI video director**, not a template engine. The pitch, verbatim from the product doctrine: a user uploads footage and a song, describes what they want in plain English, and the system produces a fully-edited, beat-synced preview in under 30 seconds — then lets them refine it conversationally ("make it faster," "hold that shot longer") with sub-3-second turnaround, with no re-analysis of the source footage.

The differentiator the team has been explicit about protecting is **not rendering quality** — it's:
- **Intent extraction** (prompt → structured creative brief) — called "the moat" throughout the docs
- **Refinement speed** (the thing that makes iteration feel magical instead of like editing software)
- **Style Cloning** (paste a YouTube URL, Gemini watches the whole video and extracts a structured "editing DNA" — rhythm, shot language, color grade, signature moves — then that DNA becomes hard constraints on the next generation, not vague inspiration)

### A2. Why it's built as two coexisting codebases (v1 and v2)

Git history shows a clean phase transition. Commits up through `1512a4f` ("Add Kove v2 pipeline redesign spec") were building **Monet v1**: a single Cloudflare Worker doing prompt→intent→analysis→EDL→Canvas2D render→WebCodecs export, all on Gemini, all serverless. It shipped a working core loop (`fa7b895 "first watchable render"` is the milestone commit) and then kept iterating on quality: reference-video style cloning (`88094ea` onward), a deterministic (non-LLM) style-replication engine as a fallback (`b34bab6`), and real computer-vision perception (PaddleOCR, YOLO/ByteTrack, PySceneDetect, librosa) wired directly into EDL generation (`1c526d4`).

**Why v2 exists:** the v1 architecture hit real walls, documented explicitly in `docs/superpowers/specs/2026-07-14-kove-v2-pipeline-redesign.md`:
- Two EDL schemas that didn't cleanly bridge (shot-based vs track-based)
- No real-time collaboration (Cloudflare Workers have no WebSocket support)
- No proper multi-track compositing (flat shot list only — no layers, no masks)
- Reference style data was being sent by the client but the server was silently ignoring most of it
- Export path was never verified end-to-end

So starting at commit `febe491` ("Phase 1 implementation plan"), the team began building **Kove v2** alongside v1, not instead of it: a polyglot system — Fastify API gateway, Python AI Director (content analysis, music analysis, creative planning, critique, refinement), a Rust/FFmpeg-class render worker (implemented in Node/TypeScript for now — `apps/worker-node`), and a new **EDL v5.1** schema (`packages/edl-v2`) structured as four stacked layers: Style → Creative → Editorial → Runtime. This is a genuine Intermediate Representation for video editing decisions, not just a timeline JSON blob.

v2 has been built in strict TDD phases (visible directly in commit messages: "Phase 1 — EDL schema," "Phase 2 — AI Director," "Phase 3 — Rendering + UI," "Phase 4 — Fix plumbing, wire brain to body," "Phase 5 — Real-time preview"). Each phase has a corresponding plan doc in `docs/superpowers/plans/`.

### A3. What's actually working right now (alpha), by subsystem

Pulled directly from `packages/kove-director/CAPABILITY_INVENTORY.md`, which is itself an auto-generated cross-reference of every editing feature against whether the AI Director can actually trigger it. Totals: **37 alpha, 25 beta, 24 planned** (86 total tracked capabilities).

| Category | Alpha (done, wired) | Beta (built, not exposed to AI) | Planned (not built) |
|---|---|---|---|
| Edit (cut/trim/speed/reorder) | 5 | 4 | 1 |
| Effects (color/blur/glow/shake/etc.) | 6 | 14 | 4 |
| Overlays (text/captions/titles) | 1 | 4 | 4 |
| Audio (volume/fade/duck/beat-sync) | 4 | 2 | 3 |
| Transitions | 19 | 1 | 1 |
| Camera (crop/stabilize/reframe) | 1 | 0 | 4 |
| Composition (multicam/B-roll/PiP/masks) | 1 | 0 | 7 |

**Read this table correctly: "beta" is the highest-leverage backlog.** It means the engine code and often the UI already exist and work — the only missing piece is a Director action verb (an entry in `packages/kove-director/src/contract.ts` + a compiler case in `packages/kove-director/src/compiler.ts`) so the AI can actually invoke it. This is 1–8 hours of work per item, not a rebuild. The inventory file itself ranks the top 5 by effort/impact — see Part B, they line up almost exactly with what the market research below says users want most.

**Concretely alpha and shippable today:**
- Full intent extraction → footage/music analysis → EDL generation → Canvas2D preview → sub-3s refinement → WebCodecs 1080p MP4 export pipeline (Monet v1, `src/server/api/*`)
- Reference video style cloning via Gemini Files API — rhythm contract, shot language, color grade, effects philosophy, extracted from an arbitrary YouTube URL or uploaded reference file (`analyze-reference.ts`, `reference_engine.py`)
- A **second, deterministic (non-LLM) style-replication engine** that generates an EDL directly from extracted reference statistics with no Gemini call at all — a real fallback path, not a stub (`deterministic style engine`, commit `b34bab6`)
- 19 of 22-ish transition types, fully wired through both the Canvas2D preview renderer and the Editly/FFmpeg server export path
- Word-level transcription → clickable text timeline → delete-word-to-splice-EDL → kinetic-typography mode ("Aesthetic Dissection" — the explicitly-designated viral/screen-recordable feature)
- Kove v2: FastAPI AI Director with real content analysis (Gemini semantic scene understanding), real music analysis (librosa onset detection, section segmentation), creative planning (story arc + moments), a programmatic+Gemini critic, and a full render worker with 15 effect types and 6 transition families running through actual FFmpeg (not mocked) — verified via `a64f13f "add e2e render test with real FFmpeg rendering"`

### A4. Non-negotiable engineering standards already established (don't relitigate these)

From `mogenter.md` / `GEMINI.md` / `.github/copilot-instructions.md`, consistently enforced across 150 commits:
- No `any` in TypeScript, ever. No empty catch blocks. `Result<T,E>` pattern at API boundaries, not thrown exceptions.
- Zod validation on every API boundary — request bodies, Gemini responses, every EDL read from D1.
- `validateEDL()` runs on every generated EDL; hard failures trigger an automatic retry, never surfaced to the user as an error.
- Beat sync accuracy target >80% (auto-retry if a generated EDL falls below 70%), refinement loop <3s wall clock, preview frame render <100ms, intent extraction <3s p95.
- Prompts to Gemini are versioned `.txt` files in `src/server/prompts/`, never inline template strings.
- OpenReel is wrapped, never modified, never reached into directly — all access goes through `packages/openreel-adapter`. This is elaborated fully in Part C.

---

## PART B — GAP ANALYSIS: WHAT USERS ACTUALLY WANT (RESEARCHED, WITH SOURCES)

Researched July 2026 against the current AI video editor market: CapCut, Descript, DaVinci Resolve, Adobe Premiere + Firefly, Runway, Opus Clip, ChatCut, Vizard, Submagic. Findings cross-referenced against this repo's own `CAPABILITY_INVENTORY.md` "planned" and "beta" columns. The alignment is strong — this repo's own internal audit already anticipated almost everything the market is asking for. That means the backlog below is not speculative; it's mostly "finish what's already half-built."

### B1. What the market says, by source

- The 2026 bar for "AI video editor" has shifted from "has an AI button somewhere" to "AI as the primary interface — describe an edit in plain English and have it executed," per a 10-tool comparative test (ChatCut, May 2026). Kove/Monet already clears this bar structurally (prompt→intent→EDL is the whole architecture) — the gap is breadth of what the AI can *do* once invoked, which is exactly the alpha/beta split above.
- **Auto-reframe with subject tracking** (convert horizontal → vertical while keeping the subject in frame) is now table-stakes in CapCut's free desktop tier and repeatedly named as a core differentiator (SmashingApps, June 2026; Adobe Premiere feature rankings, 2026). In this repo: **planned, not implemented** (`CAPABILITY_INVENTORY.md`: Reframe — compiler emits the action, "no actual reframing implementation").
- **Kinetic/word-highlight captions** are independently confirmed as a top-requested short-form feature and are explicitly called out in this repo's own inventory as "the #1 requested feature for short-form content" — status: **beta**, engine registry declares it, compiler emits the action, but the actual `KineticTextEngine` renderer doesn't exist yet. Estimated 8 hours per the repo's own effort note.
- **Background blur / subject isolation** ("blur the background") is named a top-3 TikTok/short-form editing request in the same research the repo's own inventory cites. Status: **beta** — UI toggle and slider already exist in `ClipInspector.tsx`, the blur effect already renders; only the Director action verb is missing (~1 hour per the repo's own estimate).
- **Multi-cam sync and editing** is called out repeatedly (Descript and Firecut both handle it "with minimal input" per 2026 trend analysis; professional tool comparisons list it as a baseline expectation). Status in this repo: **not implemented at all** — single `video-main` track, no angle selection or sync logic.
- **Generative B-roll** (AI-sourced or AI-generated supplementary footage matching the scene's lighting/color grade) is flagged as one of five defining 2026 AI-editing trends, and 2026 competitive analysis notes major platforms are actively absorbing this from niche tools. Status in this repo: **not implemented**.
- **Speed ramps** are independently confirmed as a top creative request in general editing discourse and are the repo's own #1 "flip beta→alpha" candidate (V-shaped keyframes already generated by the executor, only the compiler case is missing — ~2 hours).
- **Auto-transcription / text-based editing** (Descript's signature feature — "edit the transcript, video follows") is something this repo already does natively and arguably does *better*, since the "delete word → splice EDL → kinetic typography" loop is a designed viral moment, not just a transcript editor. This is a genuine competitive advantage already built — protect it, don't let it regress.
- Performance/reliability complaints are now as common as feature-gap complaints: 2026 creators report timeline stuttering and slow exports more than missing features (Vagon, 2026) — a signal that the repo's own hard performance targets (<100ms frame render, <3s refinement) are the right things to keep enforcing, not vanity numbers.
- The creator tool-chaining pattern — Descript for transcript editing → Opus Clip for clip extraction → Runway for B-roll — is explicitly named as the current default workflow because no single tool does all three well (Presenc AI, May 2026). **This is Kove/Monet's actual strategic opening**: if intent extraction + style cloning + kinetic captions + auto-reframe + B-roll generation + multicam all live in one AI-directed pipeline, that collapses three subscriptions and three context-switches into one conversation. That is the product thesis and it is still true.

### B2. Prioritized backlog (ranked by effort-to-value, cross-referencing repo inventory + market signal)

**Tier 1 — finish what's already 80% built (do these first, days not weeks):**
1. Speed Ramp action verb (compiler.ts case + contract.ts interface) — ~2h
2. Freeze Frame action verb + ClipInspector toggle — ~3h
3. Background Blur action verb (`effect.custom` + `bg_blur`, no engine work needed) — ~1h
4. Browser-side audio fade (wire `fadeIn`/`fadeOut` into `AudioTimelineEngine`'s `GainNode`) — ~4h
5. Kinetic Captions renderer (`KineticTextEngine`, Canvas2D word-by-word from transcript, wire to `subtitle/add`) — ~8h

**Tier 2 — real gaps with strong market signal, need net-new implementation:**
6. Auto-reframe with subject tracking (vertical crop that follows the subject) — needs a real tracker (see Part C, this is where OpenReel's existing crop/keyframe machinery should be reused rather than built from scratch)
7. Ripple delete (close gaps on clip delete instead of leaving dead space) — currently `deleteClip` leaves a gap, no ripple logic exists
8. Generative B-roll (text-to-video insert matching scene lighting/grade, or at minimum a stock-footage-search fallback if generative video isn't in budget/scope)
9. Multi-cam sync (angle grouping + audio-waveform-based sync, then manual/AI angle switching)
10. Subject isolation / background removal (SAM2 integration is already stubbed as an engine name — `sam-vfx` — in `src/lib/engines/registry.ts` but has no actual model wired)

**Tier 3 — pro-tier / longer horizon:**
11. Color LUT / curves / wheels (declared in `contract.ts` pro tier, zero implementation)
12. Mask compositing, depth parallax, text-behind-subject
13. Audio EQ / dynamics processing

### B3. Sources consulted (July 2026)

- CapCut resource hub, "8 Top AI Video Platforms for 2026" — capcut.com/resource/8-top-ai-video-platforms
- VideoGen, "AI Video Editors Compared 2026" — blog.videogen.io
- gstory.ai, "CapCut vs Descript vs OpusClip 2026" — gstory.ai/blog/best-ai-powered-video-editing-tools
- Reap, "Best AI Video Editing Tools in 2026" — reap.video/blog/best-ai-video-editing-tools
- fahimai.com, "CapCut vs Descript 2026" — fahimai.com/capcut-vs-descript
- Vizard, "Best AI Video Editor in 2026" — vizard.ai/blog/best-ai-video-editor-2026
- techno-pulse.com, "Best AI Video Editing Tools 2026: CapCut vs Premiere vs Resolve vs Descript"
- ChatCut, "10 Best AI Video Editors in 2026 (Tested Side-by-Side)" — chatcut.io/blog/best-ai-video-editor-2026
- freeacademy.ai, "CapCut AI Features: Complete Guide & Review 2026"
- SmashingApps, "Best Free Video Editing Software 2026" — smashingapps.com/best-free-video-editing-software
- Vagon, "Best Video Editing Software in 2026" — vagon.io/blog/best-video-editing-software
- Presenc AI, "Best AI Video Editing Tools for Creators 2026" — presenc.ai/research/best-ai-video-editing-tools-for-creators-2026
- screenapp.io, "AI Video Editing Trends 2026: 5 Game-Changing Features"
- digen.ai, "10 Top AI Video Editing Features 2026"
- toneproduction.net, "Best Video Editing Software In 2026"
- awingvisuals.com, "Top Professional Video Editing Tools 2026"

---

## PART C — THE OPENREEL INTEGRATION PIPELINE

### C1. What OpenReel actually is

`Augani/openreel-video` — an MIT-licensed, 130k+ LOC, fully client-side browser video editor. React + TypeScript, WebCodecs + WebGPU, multi-track timeline, keyframe animation, color grading (wheels/curves/LUTs), audio mixing with real effects (EQ, compressor, reverb, chorus, flanger), 20+ text animations, export to MP4/WebM/ProRes with hardware encoding. It is genuinely a CapCut-class editor, open source, and it already lives in this repo at `openreel-video/` as a vendored copy.

### C2. The existing doctrine: wrap, don't extract

This decision is already made and documented as **the single highest-risk architectural call in the project** (`mogenter.md` §3). The rule, restated precisely because it must not be re-litigated:

1. Use OpenReel as-is. Do not modify its source.
2. All access goes through one file: `packages/openreel-adapter/` (in v1 this was `src/lib/openreel-adapter.ts`; in the current monorepo it's the dedicated `@monet/openreel-adapter` workspace package).
3. `MonetEDL ↔ OpenReel Project` conversion happens only in the adapter. Nowhere else in the codebase is allowed to import OpenReel internals directly.
4. Only these OpenReel components are in scope for MVP: `AudioEngine` (beat detection), `VideoEngine` (Canvas2D rendering), `ExportEngine` (WebCodecs export), and the core types `Project`, `Clip`, `Track`, `Effect`.
5. OpenReel's own UI, state management, and timeline editor are explicitly off-limits for Chat Mode. (The Studio/Timeline mode in `apps/web` is a separate surface and may use more of OpenReel's UI layer — check `docs/superpowers/plans/*studio-portability*` before assuming otherwise.)
6. Extraction (pulling an OpenReel engine out to run standalone, modify, or replace) only happens post-MVP, only for a *proven* bottleneck, one engine at a time, after profiling — never speculatively.

This is why `openreel-video/` is on the "don't touch" list in `AGENTS.md`. It is correct and should stay that way. **Do not "clean up" or refactor OpenReel itself. Ever, unless a task explicitly says otherwise with a profiling number attached.**

### C3. Current state of the adapter — 9 known gaps, already triaged

`packages/openreel-adapter/` already exists with `openreel-to-edl.ts`, `edl-to-openreel.ts`, `openreel-types.ts`, and round-trip tests. `KNOWN_GAPS.md` documents exactly what's broken, with fix paths already scoped. Do not rediscover these — implement the fixes:

| Gap | Impact | Fix path | Est. |
|---|---|---|---|
| GAP-001 | Clip-level keyframes stored but never read by preview engine — animations silently render as static | Extend `apps/web/src/engine/timeline-resolver.ts` to consume `clip.keyframes[]`; wire existing `resolveAnimatedValue()` in `interpolator.ts` | Medium |
| GAP-002 | Compiler emits `OpenReelAction[]`, but the executor (`monet-action-executor.ts`) consumes `MonetEDL` directly — two parallel, disconnected paths | Wire executor to consume Actions directly, or build an Action→EDL bridge | Medium |
| GAP-003 | Refinement uses a rule-based fallback (~10 hardcoded patterns) instead of the real LLM (Nemotron) — complex requests silently no-op | Wire the already-scaffolded Nemotron call in `scripts/monet_refine.py`'s `build_refine_prompt()` | Small |
| GAP-004 | Refinement merge is clip-level only — can't add/remove/reorder tracks | Extend `compile_actions_to_edl()` for track-level ops | Medium |
| GAP-005 | Scope propagation is exact-clip-ID match — goes stale across refinements | Switch to clip indices or content hashes, or re-validate scope against current EDL before each refinement | Small |
| GAP-006 | `vibe-refine.ts` casts `req.body as {...}` with no Zod, `err: any` in catch | Add Zod schema, type the catch | Small |
| GAP-007 | Refine job cleanup is timer-based only — orphaned temp dirs survive a crash | Add a startup sweep for `/tmp/kove-refine-jobs/<uuid>/` older than 24h | Small |
| GAP-008 | Rule-based refinement covers 9 patterns out of 37 alpha capabilities — most requests silently no-op | Same fix as GAP-003, this is the real unlock | Small (shared with GAP-003) |
| GAP-009 | Refinement polling has no backoff, hits the server every 2s regardless of load | Add exponential backoff (2s→4s→8s) in `useRefineEDL.ts` | Small |

**GAP-003/GAP-008 together are the highest-leverage fix in the entire adapter.** Right now the AI Director can theoretically direct 37 alpha capabilities, but the *refinement* loop — the "magic" the whole product is built around — can only actually execute ~9 of them because it's running on a hardcoded rule engine instead of the LLM. Wiring the real Nemotron call unlocks the full capability set for refinement, not just for initial generation. This should be the first OpenReel-adjacent task any agent picks up.

### C4. Target pipeline (what "integrated" means, end state)

```
User prompt / refinement text
        │
        ▼
Intent Layer (Gemini)  ──never skip──▶  EditIntent JSON
        │
        ▼
Footage + Music Analysis (Gemini + librosa + PySceneDetect + YOLO/ByteTrack)
        │
        ▼
Kove Director (packages/kove-director)
   — creative planning, critique, capability-aware action selection
        │
        ▼
Compiler (compiler.ts)  ──▶  OpenReelAction[]  (typed, versioned, Zod-validated)
        │
        ├──▶ [initial generation path] ──▶ openreel-adapter: edl-to-openreel.ts ──▶ OpenReel Project
        │                                                                              │
        └──▶ [refinement path, GAP-002 fix] ──▶ Action executor consumes Actions directly, mutates live Project
                                                                                        │
                                                                                        ▼
                                                                         OpenReel VideoEngine (Canvas2D/WebGPU preview)
                                                                                        │
                                                                                        ▼
                                                                         OpenReel ExportEngine (WebCodecs → MP4/WebM/ProRes)
```

The two paths converging on the executor (instead of one going through EDL and one going through Actions) is what GAP-002 fixes. Once that's closed, "generate" and "refine" become the same code path with different entry points — which is the actual architectural goal, not two systems that happen to both work.

### C5. Phased plan to integrate OpenReel fully (explicit, sequential, for OpenCode)

**Phase OR-1 — Close the refinement gap (GAP-003 + GAP-008).**
- Files: `scripts/monet_refine.py`, `src/server/services/ai-service.ts` (existing Nemotron client — reuse, don't rebuild)
- Task: replace `apply_rule_based_refinement()` with a real call using the existing `build_refine_prompt()` scaffold and the existing Nemotron client pattern from `monet_pipeline.py`. Keep the rule-based function as a fallback only if the LLM call fails (network error, timeout) — do not delete it, degrade to it.
- Verify: run the 9 previously-supported rule-based prompts through the new path, confirm identical or better output. Then run 5 prompts *outside* the old 9-pattern set (e.g. "add a whip-pan between clips 2 and 3," "add a vignette," "do a morph cut here") and confirm they now produce real EDL changes instead of no-ops.
- Commit: `fix(director): wire Nemotron refinement, close GAP-003/GAP-008`

**Phase OR-2 — Unify generation and refinement on the Action executor (GAP-002).**
- Files: `apps/web/src/lib/executors/monet-action-executor.ts`, `packages/openreel-adapter/src/edl-to-openreel.ts`
- Task: either (a) make the executor consume `OpenReelAction[]` directly for both generation and refinement, deprecating the separate EDL-only refinement path, or (b) build and test a thin `Action → EDL` bridge if a full executor rewrite is too risky in one pass. Prefer (a) — it's architecturally correct — but if profiling/testing shows regressions, do (b) and leave a TODO with the reason.
- Verify: round-trip test — generate an EDL, refine it 3 times in a row through the unified path, confirm the resulting OpenReel Project matches what the old EDL-only path would have produced (diff the two outputs on a fixed test EDL).
- Commit: `refactor(openreel-adapter): unify generation/refinement on Action executor, close GAP-002`

**Phase OR-3 — Fix clip-level keyframe rendering (GAP-001).**
- Files: `apps/web/src/engine/timeline-resolver.ts`, `apps/web/src/engine/keyframes/interpolator.ts`, `packages/kove-director/src/compiler.ts`
- Task: wire `resolveAnimatedValue()` (already implemented) into the timeline resolver so `clip.keyframes[]` actually animates at render time. This unblocks `push_in`, `pull_out`, `color_pulse` and any future keyframed effect from silently rendering static.
- Verify: generate an EDL with a `push_in` keyframe on a clip, render the preview, confirm the scale value actually changes across frames (screenshot 3 frames at t=0, t=mid, t=end and diff pixel values, or log the resolved scale value per frame).
- Commit: `fix(engine): interpolate clip-level keyframes at render time, close GAP-001`

**Phase OR-4 — Harden the remaining small gaps (GAP-004, 005, 006, 007, 009).**
- Do these together as a cleanup pass since each is small (see table above for files/fixes).
- Verify each independently per its fix-path description in `KNOWN_GAPS.md`.
- Commit as one PR with 5 commits, one per gap, e.g. `fix(refine): add Zod validation to vibe-refine.ts request body, close GAP-006`.

**Phase OR-5 — Extend OpenReel usage: pull in the pro-tier engines the adapter doesn't touch yet.**
- OpenReel already has, natively, several things this repo's `CAPABILITY_INVENTORY.md` lists as "planned": color wheels/curves/LUTs, multi-track audio EQ/compressor/reverb/chorus/flanger, ProRes export, image-sequence export, screen recording.
- Task: before building any of Part B's Tier 3 backlog from scratch, check whether OpenReel already has it. If it does, the correct move is **extending the adapter's surface area** (new Action verbs mapping to existing OpenReel capabilities) — not reimplementing. This is the entire point of wrapping instead of extracting: OpenReel is 130k lines of already-working editor code sitting right there.
- Concretely: `color.lut`, `color.curves`, `color.wheels`, `audio.eq`, `audio.dynamics` are all declared-but-not-compiled in `packages/kove-director/src/contract.ts`. Check `openreel-video/apps/web/src/` for the corresponding existing engine/component before writing a single line of new effect code.
- Verify: for each newly-wired action verb, confirm the Director can invoke it via a natural-language refinement prompt and see the effect applied in the OpenReel preview.
- Commit per capability: `feat(director): wire color.lut action verb to existing OpenReel LUT engine`

**Phase OR-6 — Auto-reframe using OpenReel's existing crop/keyframe machinery (Part B, Tier 2, item 6).**
- Do not build a new tracking engine from scratch. `apps/web/src/engine/depth/depth-runtime.ts` and the `sam-vfx` engine declaration already exist as partial scaffolding; OpenReel's `CropKeyframe` schema (`packages/edl/src/schemas.ts:88`) already supports animated crop regions.
- Task: the missing piece is a subject-tracking signal (bounding box per frame) feeding into a sequence of `CropKeyframe`s. YOLO/ByteTrack is already integrated for footage analysis (`1c526d4`) — reuse that tracker's output instead of adding a new dependency.
- Verify: run auto-reframe on a horizontal test clip with a moving subject, confirm the exported vertical crop keeps the subject in frame across the full duration (spot-check 5 evenly-spaced frames).
- Commit: `feat(camera): auto-reframe using existing YOLO/ByteTrack subject tracking + OpenReel CropKeyframe`

---

## PART D — HOW OPENCODE SHOULD WORK THROUGH THIS, TASK BY TASK

For every single task, in every phase, in either Part B or Part C:

1. **State the phase and task ID** in your first action (e.g. "Starting Phase OR-1").
2. **State which files will change** before changing them.
3. **Read the relevant doctrine file(s)** listed in §0.4 for the subsystem you're touching.
4. **Write the test first** where the codebase already does TDD (it does, consistently — see git log: nearly every `feat` commit is paired with a `test` addition or is itself titled with TDD language). Match that convention.
5. **Implement.**
6. **Run the verification step specified for that task.** If none is specified, write one — a task without a verification step is not actually a task, it's a guess.
7. **Typecheck / lint clean.** `pnpm typecheck` / relevant per-workspace command. Zero new errors, zero new warnings introduced by your change (pre-existing ones in files you didn't touch are not your problem unless the task says so).
8. **Commit** with a Conventional Commits message referencing the phase/gap ID where applicable.
9. **Push.** Confirm the push landed (`git log origin/<branch>..HEAD` empty, or check the PR is open).
10. **Update `CAPABILITY_INVENTORY.md`** if you flipped something from beta→alpha or planned→beta. This file is load-bearing documentation, not a changelog — keep it accurate or the next agent (human or AI) makes decisions on stale data.
11. **Move to the next task.** Do not wait for confirmation.

### If you hit something not covered by this document

Priority order for resolving ambiguity, highest first:
1. Does an existing doctrine file (`AGENTS.md`, `mogenter.md`, `.github/instructions/*`) already answer this? Follow it.
2. Does `CAPABILITY_INVENTORY.md` or `KNOWN_GAPS.md` already describe the fix path? Follow it.
3. Does the OpenReel codebase already solve this problem natively? Wrap it via the adapter instead of building new.
4. Does the market research in Part B suggest what users actually expect here? Match that expectation.
5. If genuinely none of the above apply — and only then — make the most conservative choice (the one that's easiest to revert, least likely to violate "wrap don't extract," and best matches the existing code style in the surrounding file) and clearly flag the assumption in the commit message with `ASSUMPTION:` prefixed in the commit body so it's greppable later.

Never block on a question. Never leave a `TODO: ask user` in code. Decide, document the decision, ship it.

---

## PART E — OPEN QUESTIONS THIS DOCUMENT DELIBERATELY DOES NOT ANSWER FOR YOU

These are flagged, not solved, because they're product/business decisions, not engineering ones — and per §0.1, when something really is a business decision rather than an engineering one, the right move is to make the reversible choice and note it, not stall:

- Whether Kove v2 fully replaces Monet v1 or the two ship as separate tiers (e.g. v1 = fast/simple mode, v2 = pro/studio mode) is not decided in any doc found in this repo. Default assumption if forced to choose: **keep both live, v1 as the fast default path, v2's Studio mode as the power-user surface** — this matches the existing `chat_.$threadId.tsx` (v1, chat-first) vs `studio_.$projectId.tsx` (v2-leaning, timeline-first) route split already in the codebase.
- Generative B-roll (Part B, Tier 2, item 8) requires either a paid generative video API or a stock-footage-search integration — this is a cost decision, not purely technical. Default assumption: build the stock-footage-search fallback first (cheaper, faster, no new heavy dependency), leave a clean interface for swapping in generative video later.
- Real-time collaborative co-editing (mentioned as a v2 goal in the pipeline redesign spec, "Go WebSocket server, Operational Transform / CRDT") has no phase plan doc yet in `docs/superpowers/plans/`. Do not start this without writing that plan doc first, following the same format as the existing Phase 1–5 plans — this is too large and too easy to get wrong to improvise.
