# Monet

**An AI video director that edits like a human — or better.**

You upload footage and a song. You describe what you want. Monet figures out the rest.

> *"30s anime AMV, hit hard on the drop"* → beat-synced, fully edited preview in under 30 seconds.

---

## What it actually does

Most "AI video editors" are template engines. You pick a style, it shuffles clips in.

Monet is different. It runs a full editorial pipeline — the same one a professional editor runs in their head:

1. **Intent extraction** — parses your prompt into a creative brief (genre, pacing, energy curve, beat sync strength, mood). This is the moat.
2. **Footage analysis** — scores every segment of your clips for motion quality, emotional resonance, and visual composition.
3. **Music analysis** — extracts beat grid, BPM, song structure, and detects the drop.
4. **EDL generation** — combines intent + analysis into a concrete edit plan: every shot with its in/out point, beat lock, transition, effect, and a written rationale from the AI director.
5. **Canvas2D preview** — renders the edit in-browser at <100ms per frame.
6. **Refinement loop** — "make it faster" → updated EDL in <3 seconds. No re-analysis. Pure edit iteration.
7. **WebCodecs export** — 1080p H.264 MP4 directly in the browser.

And one more thing:

### Style Cloning

Paste any YouTube URL. Monet sends it to Gemini, which watches the entire video and extracts the editor's DNA: their rhythm contract, shot language, subject obsessions, energy curve, signature move, color grade, effects philosophy. That style gets injected directly into EDL generation — not just as loose parameters but as concrete imperatives. *"This editor cuts on every beat, holds their closeups 0.3s longer than the beat, and never crossfades during high energy."*

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start + React 19 |
| Backend | Cloudflare Workers |
| AI | Gemini 2.5 Flash (via Google Generative AI SDK) |
| Media storage | Cloudflare R2 |
| Metadata / EDL | Cloudflare D1 (SQLite) |
| Session / jobs | Cloudflare KV |
| Video engine | OpenReel (Canvas2D + WebCodecs) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Build | Vite + Bun |

---

## Architecture

```
User Prompt
  ↓
/api/decode-intent   →  EditIntent JSON        (the creative brief)
  ↓
/api/analyze         →  FootageAnalysis        (segment scores + beat grid)
  ↓
/api/generate-edl    →  MonetEDL               (the actual edit plan)
  ↓
Canvas2D Renderer    →  Preview frames         (<100ms each)
  ↓
/api/refine-edl      →  Updated MonetEDL       (<3s, no re-analysis)
  ↓
WebCodecs Exporter   →  1080p MP4
```

The **MonetEDL** is the source of truth for everything visual. Every shot has:
- `source` — clip ID, in/out points
- `timing` — start time, duration, speed
- `beatLock` — which beat in the grid this shot starts on
- `effects` — glow, shake, zoom_pulse (used sparingly, <30% of shots)
- `transition` — cut (>80%) or crossfade
- `aiRationale` — why the AI director chose this moment, written like a filmmaker

### Key files

```
src/
├── server/
│   ├── api/
│   │   ├── decode-intent.ts      # Intent extraction (the moat)
│   │   ├── analyze.ts            # Footage + music analysis
│   │   ├── generate-edl.ts       # EDL generation + scoring
│   │   ├── refine-edl.ts         # Refinement loop
│   │   ├── analyze-reference.ts  # Style cloning (YouTube URL or file)
│   │   └── transcribe.ts         # Word-level transcription
│   ├── prompts/                  # All Gemini prompts as .txt files
│   │   ├── generate-edl.txt
│   │   ├── analyze-reference.txt # The style cloning prompt
│   │   ├── decode-intent.txt
│   │   └── refine-edl.txt
│   ├── types/
│   │   ├── edl.ts                # MonetEDL schema
│   │   ├── intent.ts             # EditIntent schema
│   │   └── reference-style.ts    # ReferenceStyle (editing DNA)
│   └── services/
│       └── gemini-sdk.ts         # GeminiService + Files API upload
├── lib/
│   ├── renderer/
│   │   └── monet-renderer.ts     # Canvas2D frame renderer
│   ├── export-engine.ts          # WebCodecs MP4 export
│   └── api-client.ts             # Typed frontend → backend calls
└── routes/
    ├── chat_.$threadId.tsx        # Main chat + pipeline UI
    └── studio_.$projectId.tsx     # Advanced timeline editor
```

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- A Cloudflare account (for R2, D1, KV in production)
- A Gemini API key ([get one here](https://aistudio.google.com))

### Local dev

```bash
# Install dependencies
bun install

# Add your Gemini API key
echo "GEMINI_API_KEY=your_key_here" >> .dev.vars

# Start dev server (Cloudflare Workers + Vite)
bun run dev
```

Open [http://localhost:8080](http://localhost:8080).

### Build

```bash
bun run build
```

### Deploy to Cloudflare

```bash
# One-time setup: create D1 database, R2 buckets, KV namespace
bash scripts/setup-cloudflare.sh

# Run D1 migrations
wrangler d1 execute monet-db --file src/server/migrations/001_initial.sql
wrangler d1 execute monet-db --file src/server/migrations/002_edls_refinement.sql
wrangler d1 execute monet-db --file src/server/migrations/003_reference_styles.sql

# Deploy
wrangler deploy
```

---

## The pipeline in detail

### Beat sync

Cuts must land within **50ms** of a beat grid point — that's the human perception threshold. Monet measures `beatSyncScore` on every generated EDL and auto-retries if it falls below 70%. Target is >80%.

### Pacing variance

Monotone pacing (all shots the same length) is the mark of a beginner. Monet targets a coefficient of variation of 0.3–0.5 — dynamic, not mechanical.

### Scoring

```
beatSyncScore     = % shots within ±50ms of beat grid   → target >0.9
pacingVariance    = std dev of shot durations            → target 0.3–0.5
overallConfidence = 0.4×beatSync + 0.3×pacing + 0.3×avgSegmentScore
```

### Style cloning

When a YouTube URL or reference file is provided:

1. Gemini watches the video and extracts `ReferenceStyle` — a structured object covering: `rhythm` (avg shot duration, beats per cut, cut alignment), `pacing` (10-point energy curve, climax position), `shotLanguage` (closeup ratio, subject focus, sequence grammar), `visualStyle` (color grade, contrast, temperature), `effects` (types, frequency, transition breakdown), `emotionalArc`, and `editingPhilosophy` (summary, rhythm contract, restraint level, signature move).

2. At EDL generation time, `buildReferenceDirectorSection()` converts this into concrete imperative instructions inside the Gemini prompt — not suggestions, contracts. The model is told to edit like that specific creator.

### Refinement loop

Refinement **never re-analyzes footage**. It takes the current EDL + feedback text and returns an updated EDL. Cold: <5s. p95: <3s. This is what makes iteration feel magical.

### Text-based editing (Aesthetic Dissection)

Word-level transcription → clickable text timeline → delete words to splice the EDL → kinetic typography mode (words as canvas shots, scale = `1.0 + intensity × 0.5`). This is the screen-recordable moment.

---

## Cloudflare bindings

| Binding | Type | Purpose |
|---|---|---|
| `MONET_MEDIA` | R2 | Footage, music, reference video uploads |
| `MONET_RENDERS` | R2 | Exported MP4 renders |
| `DB` | D1 | Intents, analyses, EDLs, reference styles |
| `MONET_KV` | KV | Job status, upload tokens, ephemeral state |
| `GEMINI_API_KEY` | Secret | Gemini 2.5 Flash API access |

---

## Quality constraints

These are not guidelines — they're the criteria for whether the product works:

- Beat sync accuracy **>80%**
- Refinement loop **<3s** wall clock
- Frame render **<100ms** per frame
- Intent extraction **<3s** p95
- Word deletion → preview update **<500ms**

If any of these regress, profile and fix before shipping anything else.

---

## What "professional" means here

A professional human editor:
1. Picks the **best** segments, not random ones
2. Cuts **on the beat** — ±50ms is the perception threshold
3. **Varies shot length** — monotone pacing is a beginner tell
4. Uses effects **sparingly** — one per shot max, <30% of shots
5. Uses **cuts 80%+ of the time** — crossfades are for slow/emotional moments only
6. Grades color **for the genre**
7. **Matches music's energy curve** — high energy = short shots
8. Writes rationale like a real director, not a scoring algorithm

Every generated EDL should be indistinguishable from one a skilled human would make.
