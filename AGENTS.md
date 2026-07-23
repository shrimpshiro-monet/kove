# AGENTS.md — Monet AI Director

## Architecture: Two layers, one pipeline

The system has two runtime layers that work together:

```
┌─────────────────────────────────────────────────┐
│  LAYER 1: AI Brain (Cloudflare Worker)          │
│  src/server.ts — Gemini-driven EDL generation   │
│  Upload → Analyze → Intent → Generate → Refine  │
│  Cannot spawn child processes (Worker limitation)│
└──────────────────────┬──────────────────────────┘
                       │ fetch() to port 3000
                       ▼
┌─────────────────────────────────────────────────┐
│  LAYER 2: Execution Engine (Fastify + Node.js)  │
│  apps/api/src/server.ts — FFmpeg, Blender,      │
│  Python, BullMQ queue, local filesystem         │
│  /api/execute/ffmpeg, /api/execute/blender       │
└─────────────────────────────────────────────────┘
```

- **Monet v1** (`src/`) — Cloudflare Worker, TanStack Start, AI brain. Entry: `src/server.ts` (1217-line fetch handler).
- **Kove v2** (`apps/api/`) — Fastify server, execution engine. Entry: `apps/api/src/server.ts`.
- v1 calls v2 for FFmpeg/Blender execution. v2 has standalone Python pipelines (vibe-generate, create-heavy-edit) that bypass v1.
- Frontend (`apps/web/`) routes AI calls to v1, execution calls to v2.

Two schemas: `packages/edl/` (v1, integrated) and `packages/edl-v2/` (v5.1, not wired).

## Root src/ vs apps/*/src/ — NOT a mistake

- `src/` = the TanStack Start app (Cloudflare Worker, v1 code)
- `apps/api/src/` = Kove v2 Fastify server
- `apps/worker-node/src/` = BullMQ render workers (requires Redis)
- `apps/web/src/` = standalone Vite web UI (`@monet/web`)

## Commands (non-obvious ones)

```bash
pnpm install          # pnpm@9.15.4 workspace; .npmrc has shamefully-hoist=true
bun run dev           # parallel: Vite :8787 + API :3000 + Worker (not pnpm)
pnpm dev:api          # solo Fastify (tsx watch)
pnpm dev:web          # solo Vite web app
pnpm dev:worker       # solo BullMQ consumer
pnpm test             # turborepo test pipeline
pnpm infra:up         # docker compose Redis (required for Kove v2/workers)
pnpm python:audio     # uvicorn workers/python-audio :8101
pnpm python:ai        # uvicorn workers/python-ai :8102
```

No CI workflows `.github/workflows/` exist. No `opencode.json`.

## Gotchas that will waste time

- **`routeTree.gen.ts`** is auto-generated (in `.prettierignore`). Never edit by hand.
- **Vite config** uses `@lovable.dev/vite-tanstack-config` — do NOT manually add `tanstackStart`, `viteReact`, `tailwindcss`, or `tsConfigPaths` plugins. The wrapper includes them.
- **Wrangler stubs** (`src/stubs/`) alias `editly`, `tailwindcss`, TanStack modules for Cloudflare Worker build. Don't remove.
- **`bunfig.toml`** has `minimumReleaseAge = 86400` (24h supply-chain guard). New deps <24h old may fail to install.
- **Clerk auth** is optional — only activates if `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` env vars are present.
- **Sentry** bootstraps on first request, not at module load.
- **Formatting** goes through eslint (`eslint-plugin-prettier/recommended`), not a standalone prettier command.
- **No filesystem in Workers.** Media → R2, metadata → D1, ephemeral → KV. Dev uses `os.tmpdir()` media cache but won't work in production.

## D1 migrations

`src/server/migrations/NNN_description.sql`. Append-only, idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

## Key packages

| Workspace | Path | Purpose |
|---|---|---|
| `@monet/edl` | `packages/edl/` | MonetEDL schema, validators, Zod — shared source of truth |
| `@monet/edl-enhancers` | `packages/edl-enhancers/` | EDL post-processing |
| `@kove/director` | `packages/kove-director/` | AI Director contract, capability registry |
| `@monet/openreel-adapter` | `packages/openreel-adapter/` | MonetEDL ↔ OpenReel |
| `@monet/engine-freecut` | `packages/engine-freecut/` | Alternative edit engine |
| `@monet/job-contracts` | `packages/job-contracts/` | BullMQ job type definitions |

Capabilities **auto-register** via side-effect imports in `packages/kove-director/src/capabilities/index.ts` — never import individual capability files.

## AI provider priority

Azure Foundry → Azure OpenAI → Vertex AI → Gemini API.
Envs in `.dev.vars` (loaded by vite.config.ts, NOT wrangler).

Prompts use `gemini-2.5-flash` with `responseSchema`. Prompts are `.txt` files in `src/server/prompts/`, loaded at runtime via `prompts/index.ts`. Never inline.

## Don't touch these

- `editly/` — local fork
- `external/*` — forked/pinned projects
- `openreel-video/` — wrapped, not extracted
- `hyperframes/` — independent repo

## Existing instruction files to read first

- **`GEMINI.md`** (529 lines) — architecture, code quality, Gemini rules, EDL mandates, performance targets
- **`.github/copilot-instructions.md`** (201 lines) — quality bar, scoring, pacing, genre defaults, refinement rules
- `.github/instructions/` — 5 files (backend, edl-quality, gemini-prompts, renderer, studio-portability), each with `applyTo` globs
- `packages/kove-director/CAPABILITY_INVENTORY.md` — auto-generated capability audit
- `docs/agents/domain.md` — doc layout convention (CONTEXT.md + ADRs)

## What "professional" means here (hard constraints from GEMINI.md)

- **No `any`** — design the type or use `unknown`
- **No empty catch** — handle or rethrow
- **No raw `fetch` in UI** — use `src/lib/api-client.ts`
- **Zod on every API boundary** — request bodies, Gemini responses, all EDL reads
- **`Result<T,E>` pattern** for async operations at API boundaries
- **`validateEDL()`** on every generated EDL — reject and retry on failure
- **Beat sync >80%**, refinement <3s, frame render <100ms
- **Segment selection**: prefer `overall > 0.7`, minimum `> 0.6`
- **Cuts >80%**, effects on <30% of shots, one effect per shot max
