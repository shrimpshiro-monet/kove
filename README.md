<p align="center">
  <img src="public/favicon.svg" width="80" alt="Jalebi">
</p>

<h1 align="center">Jalebi</h1>

<p align="center">
  AI video director + browser editor. Monorepo.
</p>

---

## What is this?

This is the monorepo for **Jalebi** — an AI video director that generates beat-synced edits from footage, music, and a prompt. It also ships a full browser-based video editor (Jalebi Advanced).

```
packages/
├── edl/                  # JalebiEDL schema — the source of truth for all edits
├── edl-enhancers/        # EDL post-processing pipeline
├── edl-v2/               # Next-gen EDL schema (WIP)
├── kove-director/        # AI director contract + capability registry
├── openreel-adapter/     # JalebiEDL ↔ browser editor format bridge
├── engine-freecut/       # Alternative edit engine
├── job-contracts/        # BullMQ job type definitions
└── render-adapters/      # Render engine adapters

apps/
├── (root src/)           # TanStack Start app — AI brain (Cloudflare Worker)
├── api/                  # Fastify server — execution engine (FFmpeg, Blender)
├── web/                  # Standalone Vite web UI
├── kove-advanced/        # Browser video editor (React + WebGPU)
└── worker-node/          # BullMQ render workers

workers/
├── python-ai/            # Python AI inference service (:8102)
├── python-audio/         # Python audio processing (:8101)
├── python-director/      # Python director pipeline
├── python-music-analyzer/# Beat detection, BPM, song structure
├── python-content-analyzer/# Content analysis
├── render-worker/        # Render orchestration
├── monet-analysis-service/# Footage analysis
└── thinking-service/     # Reasoning / planning service
```

---

## Quick start

```bash
# Install (pnpm 9.x, Node 18+)
pnpm install

# Add API keys
cp .dev.vars.example .dev.vars
# edit .dev.vars with your Gemini key

# Start everything (Vite + API + worker)
bun run dev
```

Or start individual services:

```bash
pnpm dev:api          # Fastify server (port 3000)
pnpm dev:web          # Vite web app
pnpm dev:worker       # BullMQ consumer
pnpm infra:up         # Docker (Redis)
pnpm python:audio     # Python audio (:8101)
pnpm python:ai        # Python AI (:8102)
```

---

## Two layers, one pipeline

```
┌─────────────────────────────────────────────────┐
│  Layer 1: AI Brain (Cloudflare Worker)          │
│  Upload → Analyze → Intent → Generate → Refine  │
│  Cannot spawn child processes (Worker limit)    │
└──────────────────────┬──────────────────────────┘
                       │ fetch() to port 3000
                       ▼
┌─────────────────────────────────────────────────┐
│  Layer 2: Execution Engine (Fastify + Node.js)  │
│  FFmpeg, Blender, Python, BullMQ queue          │
│  /api/execute/ffmpeg, /api/execute/blender       │
└─────────────────────────────────────────────────┘
```

The AI brain (Layer 1) generates an EDL. The execution engine (Layer 2) renders it.

---

## The AI pipeline

```
User Prompt
  ↓
decode-intent     →  EditIntent         (genre, pacing, energy, mood)
  ↓
analyze           →  FootageAnalysis    (segment scores + beat grid)
  ↓
generate-edl      →  JalebiEDL         (every shot: in/out, beat lock, effect, rationale)
  ↓
Canvas2D preview  →  Frames            (<100ms each)
  ↓
refine-edl        →  Updated EDL       (<3s, no re-analysis)
  ↓
WebCodecs export  →  1080p MP4
```

AI provider priority: Azure Foundry → Azure OpenAI → Vertex AI → Gemini API.

---

## Browser editor (Jalebi Advanced)

`apps/kove-advanced/` is a full browser-based video editor. Multi-track timeline, keyframes, color grading, audio effects, text & graphics, export to MP4/WebM/ProRes. Runs entirely client-side with WebGPU and WebCodecs.

```bash
cd apps/kove-advanced
pnpm install
pnpm dev              # → http://localhost:5173
```

---

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Start full stack (Vite + API + worker) |
| `pnpm build` | Turbo build all packages |
| `pnpm test` | Turbo test all packages |
| `pnpm dev:api` | Solo Fastify server |
| `pnpm dev:web` | Solo Vite web app |
| `pnpm dev:worker` | Solo BullMQ consumer |
| `pnpm infra:up` | Start Redis via Docker |
| `pnpm python:audio` | Python audio service (:8101) |
| `pnpm python:ai` | Python AI service (:8102) |

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | TanStack Start + React 19 |
| Backend | Cloudflare Workers + Fastify |
| AI | Gemini 2.5 Flash, Azure Foundry |
| Media storage | Cloudflare R2 |
| Metadata | Cloudflare D1 (SQLite) |
| Queues | BullMQ + Redis |
| Video engine | Canvas2D + WebCodecs + FFmpeg |
| Browser editor | React + WebGPU + THREE.js |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Build | Vite + pnpm + Turbo |

---

## Quality targets

- Beat sync accuracy **>80%**
- Refinement loop **<3s**
- Frame render **<100ms**
- Intent extraction **<3s** p95
- Effects on **<30%** of shots, one per shot max
- Cuts **>80%** of transitions

---

## License

MIT
