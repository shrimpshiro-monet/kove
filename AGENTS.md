# AGENTS.md — Monet AI Video Director

## What this repo is

AI video editor: upload footage + song → describe what you want → beat-synced, AI-directed edit preview in <30s. Uses Gemini for creative reasoning, Editly+FFmpeg for server rendering, Canvas2D for browser preview.

## Commands

```bash
# Install (pnpm, not npm)
pnpm install

# Dev (starts all apps via turborepo)
bun run dev              # or: pnpm dev

# Individual app dev
pnpm dev:api             # apps/api (Fastify, port varies)
pnpm dev:web             # apps/web (TanStack Start)
pnpm dev:worker          # apps/worker-node (editly render worker)

# Typecheck / lint / test
pnpm typecheck           # turbo typecheck (all packages)
pnpm lint                # turbo lint
pnpm test                # turbo test

# Infra (Redis + Python audio/AI services)
pnpm infra:up            # docker compose -f infra/docker-compose.yml up -d
pnpm infra:down

# Python services (standalone)
pnpm python:audio        # workers/python-audio, port 8101
pnpm python:ai           # workers/python-ai (Whisper), port 8102

# HyperFrames bridge
bun run hf:clone         # clone hyperframes upstream
bun run hf:check         # verify hyperframes setup
node scripts/monet-hyperframes-bridge.mjs --edl ./edl.json --out ./hyperframes-out
```

## Repo structure — the confusing parts

**Two `src/` directories exist.** This is NOT a mistake:

- **Root `src/`** — the main TanStack Start app (Cloudflare Worker entry at `src/server.ts`). This is where most code lives: routes, server APIs, services, prompts, lib, components.
- **`apps/*/src/`** — separate monorepo packages (Fastify API, web lib, Node.js render worker). These are independent packages with their own tsconfig.

**Monorepo packages** (`packages/`):
- `edl` — MonetEDL schema (source of truth for the edit format)
- `edl-enhancers` — EDL post-processing (style directives, intensity)
- `core` — shared types and utilities
- `engine-freecut` — alternative edit engine
- `openreel-adapter` — MonetEDL → OpenReel project conversion
- `render-adapters` — render backend abstraction
- `feature-registry` — effect/transition registry
- `job-contracts` — BullMQ job type definitions

**`editly/`** at root is a local fork of the editly npm package. Do NOT treat it as application code — it's a vendored dependency.

## Architecture in 30 seconds

```
User Prompt → /api/decode-intent (EditIntent) → /api/analyze (footage+music)
  → /api/generate-edl (MonetEDL) → Canvas2D preview (browser)
  → /api/refine-edl (iteration, no re-analysis) → /api/export-mp4 (FFmpeg)
```

The **MonetEDL** is the source of truth. Everything visual derives from it. Schema lives in `packages/edl/src/`.

## Vibe editing (Editly integration) — current state

The "vibe editing" system compiles MonetEDL → Editly spec → FFmpeg render:

- `src/server/lib/edl-to-editly.ts` — MonetEDL → EditlySpec compiler
- `src/server/lib/render-engine-editly.ts` — production render via editly package
- `src/server/lib/editly-effects.ts` — 433 lines mapping EDL effects to FFmpeg filter chains
- `src/server/lib/editly-transitions.ts` — shot-to-shot transition mapping
- `apps/worker-node/` — Node.js worker that runs editly renders (BullMQ + Redis)

**Known gaps**: The editly integration exists but is not fully end-to-end tested. Effects coverage is broad (blur, color, shake, zoom, glow, etc.) but transitions and complex composites may have gaps. The sandbox routes (`src/routes/editly-showcase.tsx`, etc.) are for experimentation, not production.

## AI provider setup

Priority chain: Azure Foundry → Azure OpenAI → Vertex AI → Gemini API.

For local dev, add to `.dev.vars`:
```
GEMINI_API_KEY=your_key_here
```
Or for Vertex AI:
```
GCP_PROJECT_ID=your-project
GCP_LOCATION=us-central1
```

See `.dev.vars.example` for all options.

## Cloudflare bindings (production)

| Binding | Type | Purpose |
|---|---|---|
| `MONET_MEDIA` | R2 | Footage, music, reference uploads |
| `MONET_RENDERS` | R2 | Exported MP4 renders |
| `DB` | D1 | Intents, analyses, EDLs, reference styles |
| `MONET_KV` | KV | Job status, upload tokens |
| `RENDER_QUEUE` | Queue | Async render jobs |

No filesystem access in Workers. Everything through R2/D1/KV.

## Reference edit system

Three folders of reference videos at repo root:
- `monet-reference-edits/` — 6 short TikTok/IG edits (576x576)
- `reference-edits-2/` — 11 videos (Steph Curry, Tyler The Creator, Lewis Hamilton, etc.)
- `longer-reference-videos-for-youtube/` — 3 full YouTube videos with frame-by-frame ANALYSIS.md

Analyzed metadata lives in `src/server/data/`:
- `reference-catalog.json` — 16 videos with cut rates, color profiles, style signatures
- `long-form-reference-catalog.json` — 3 YouTube videos with structural editing analysis

Reference videos are for **style analysis only** — never loaded as footage in EDL.

### Reference analysis pipeline

The reference analysis extracts editing DNA from reference videos. Key files:

- `src/server/api/analyze-reference.ts` — Main endpoint. Handles YouTube URLs and R2 files.
- `src/server/lib/scene-detection.ts` — FFmpeg scene change detection (real cuts, not mock)
- `src/server/lib/energy-analysis.ts` — Per-frame energy calculation (motion + brightness)
- `src/server/lib/real-trace-builder.ts` — Builds `ReferenceEditTrace` from FFmpeg data
- `src/server/lib/reference-verification.ts` — Verifies Gemini's style extraction against ground truth
- `src/server/director/reference-similarity.ts` — Real similarity scoring (cosine + KL divergence)
- `src/server/director/reference-director.ts` — Builds prompt section forcing Gemini to edit like reference

**Analysis flow**:
1. YouTube URL → yt-dlp download → FFmpeg scene detection + energy analysis → Real trace
2. R2 file → Fetch buffer → FFmpeg scene detection + energy analysis → Real trace
3. Gemini's `ReferenceStyle` is verified against FFmpeg ground truth
4. If Gemini was wrong (e.g., avg shot duration off by >25%), corrections are applied
5. Effect vocabulary extracted: exact effects, frequencies, hotspots, transition breakdown
6. Moment map built: specific timeline positions the EDL must hit (climax, breathing, rhythm points)
7. Reference director prompt includes moment-by-moment instructions, not just averages
8. Similarity scoring uses real cosine similarity on energy curves + KL divergence on shot duration distributions
9. Regeneration loop: if similarity < 65%, regenerate with tighter constraints (up to 3 attempts)

**Test results** (steph curry.MP4 reference, 19s):
- FFmpeg detected 9 real cuts, avg 1.92s/shot
- 16 effects extracted (morph_cut:9, push_in:5, glitch:2)
- 8 must-hit moments identified
- EDL matching reference: 91.1% similarity (100% shot duration, 98.5% energy, 75% effects)

## Key conventions

- **Gemini prompts are .txt files** in `src/server/prompts/`, not inline strings. Edit the file, not the code.
- **EDL validation** runs on every generated EDL via `validateEDL()`. Reject and retry if it fails.
- **No `any`** in TypeScript. No empty catch blocks. No raw `fetch` in UI — use `src/lib/api-client.ts`.
- **Zod on every API boundary** — request bodies, Gemini responses, EDL from D1.
- **`Result<T, E>` pattern** for all async operations at API boundaries.
- **Server routes** registered in `src/server.ts` as `{method, path, handler}` array.
- **Prompts use `gemini-2.5-flash`** with `responseSchema` for structured output. Never parse free-form.

## Existing instruction files (read these first)

- **`GEMINI.md`** — 529-line ground truth: architecture, code quality, API design, Gemini rules, EDL quality, rendering, performance targets, phase sequencing. **Start here.**
- **`.github/copilot-instructions.md`** — 201-line agent instructions covering architecture, scoring, pacing, genre defaults, Cloudflare constraints, code quality rules, and known negatives.
- `MONET-CORE-LOOP.md` — Pipeline architecture walkthrough
- `PRODUCTION-RESILIENCE.md` — Deterministic fallback, caching, retry logic
- `RENDERER-COMPLETE.md` — Canvas2D renderer architecture and status

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/`. No external PRs as triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` at repo root + `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.
