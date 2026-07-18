# AGENTS.md — Monet AI Video Director

## What this repo is

AI video editor with **two coexisting pipelines**:

1. **Monet v1 (Core Loop)** — Prompt-driven. User describes what they want → Gemini reasons about edit → Canvas2D preview → FFmpeg export. Runs on Cloudflare Workers. Entry: `src/server.ts`.
2. **Kove v2 (Vibe Edit)** — Reference-driven. User provides footage + reference video → Python analyzes both → extracts editing DNA → applies style → Editly/FFmpeg render. Runs on local Fastify API. Entry: `apps/api/src/server.ts`.

The **MonetEDL** is the shared source of truth. Schema in `packages/edl/src/`.

## Commands

```bash
pnpm install                # install (pnpm, not npm; uses workspace from pnpm-workspace.yaml)
bun run dev                 # starts 3 parallel processes: Vite (port 8787) + API (port 3000) + Worker
pnpm dev:api                # apps/api Fastify server solo
pnpm dev:web                # apps/web solo
pnpm dev:worker             # apps/worker-node solo
pnpm typecheck              # turbo run typecheck across all packages
pnpm lint                   # turbo run lint
pnpm test                   # turbo run test
pnpm infra:up               # docker compose -f infra/docker-compose.yml up -d (Redis)
pnpm infra:down
pnpm python:audio           # workers/python-audio on port 8101
pnpm python:ai              # workers/python-ai (Whisper) on port 8102
```

## Repo structure gotchas

**Two `src/` directories exist. This is NOT a mistake:**
- **Root `src/`** — the main TanStack Start app (Cloudflare Worker). Routes, server APIs, services, prompts, lib, components. **v1 Monet code.**
- **`apps/*/src/`** — separate monorepo packages with their own tsconfig. **`apps/api/` is the v2 Kove Fastify server.**

**Don't touch these (vendored/forked):**
- `editly/` — local fork of the editly npm package
- `external/*/` — forked or pinned projects (hyperframes, openreel-video, pyscenedetect, etc.)
- `hyperframes/` — its own independent repo (has its own AGENTS.md)

**Monorepo packages** (`packages/`):
- `edl` — MonetEDL schema (source of truth, used by both pipelines)
- `edl-v2` — New EDL schema v5.1 (Kove v2, not integrated into main pipeline yet)
- `edl-enhancers` — EDL post-processing
- `kove-director` — AI Director contract, capability registry, EDL→actions compiler
- `openreel-adapter` — MonetEDL ↔ OpenReel project conversion
- `engine-freecut` — alternative edit engine
- `render-adapters` — render backend abstraction
- `feature-registry` — effect/transition registry
- `job-contracts` — BullMQ job type definitions

**Workspace includes** `external/openreel-video/packages/*` in addition to `apps/*`, `packages/*`, `workers/*`.

**TanStack stubs** in `src/stubs/` exist because `editly`, `tailwindcss`, and certain TanStack modules must be stubbed for the Cloudflare Worker build. Don't remove them.

## AI provider setup

Priority chain: Azure Foundry → Azure OpenAI → Vertex AI → Gemini API.
Add to `.dev.vars` (loaded by `vite.config.ts`, not wrangler):
```
GEMINI_API_KEY=your_key_here
```
See `.dev.vars.example` for all options (Vertex AI, Groq, NVIDIA NIM, etc.).

## Cloudflare bindings (production)

| Binding | Type | Purpose |
|---|---|---|
| `MONET_MEDIA` | R2 | Footage, music, reference uploads |
| `MONET_RENDERS` | R2 | Exported MP4 renders |
| `DB` | D1 | Intents, analyses, EDLs, reference styles |
| `MONET_KV` | KV | Job status, upload tokens |
| `RENDER_QUEUE` | Queue | Async render jobs |

**No filesystem access in Workers.** Everything through R2/D1/KV. The v1 pipeline uses `os.tmpdir()` as local media cache for dev but this won't work in production Workers.

## Key conventions

- **Gemini prompts are .txt files** in `src/server/prompts/` — never inline strings
- **No `any`** — use `unknown` + narrowing or design the type
- **No empty catch blocks** — handle or rethrow with context
- **No raw `fetch` in UI** — use `src/lib/api-client.ts`
- **Zod on every API boundary** — request bodies, Gemini responses, EDL from D1
- **`Result<T, E>` pattern** for async operations that can fail at API boundaries
- **Server routes** registered in `src/server.ts` as `{method, path, handler}` array
- **EDL validation** via `validateEDL()` on every generated EDL. Reject and retry if it fails
- **Prompts use `gemini-2.5-flash`** with `responseSchema` for structured output. Never parse free-form
- **Capabilities auto-register** via side-effect imports in `packages/kove-director/src/capabilities/index.ts` — don't import individual capability files

## Test locations

```bash
pnpm test                   # turbo test across workspace
vitest run                  # runs from vitest.config.ts
```
- Unit/integration tests: `src/server/lib/__tests__/*.test.ts` + `tests/*.{test,ts,tsx}`
- Python pipeline tests: `tests/test_*.py`
- Shell smoke scripts: `test-intent.sh`, `test-full-pipeline.sh`, `test-real-analysis.sh`, `test-resilience.sh`, `test-hardened-intent.sh`

## Reference videos

Three folders at repo root (style analysis only, never loaded as EDL footage):
- `monet-reference-edits/` — 6 short edits (576x576)
- `reference-edits-2/` — 11 videos (Curry, Tyler, Hamilton, etc.)
- `longer-reference-videos-for-youtube/` — 3 YouTube videos with ANALYSIS.md

## Existing instruction files (read these first)

- **`GEMINI.md`** — 529-line ground truth: architecture, code quality, API design, Gemini rules, EDL quality, rendering, performance targets
- **`.github/copilot-instructions.md`** — 201-line agent instructions covering architecture, scoring, pacing, genre defaults, Cloudflare constraints, quality rules, known negatives, and remaining gaps
- `.github/instructions/` — 5 focused instruction files: backend, edl-quality, gemini-prompts, renderer, studio-portability
- `packages/kove-director/CAPABILITY_INVENTORY.md` — Auto-generated audit of every editing feature with status and verb mapping
- `MONET-CORE-LOOP.md` — Pipeline architecture walkthrough
- `PRODUCTION-RESILIENCE.md` — Deterministic fallback, caching, retry logic
- `RENDERER-COMPLETE.md` — Canvas2D renderer architecture and status
- `docs/agents/domain.md` — single-context documentation layout and ADR pattern
