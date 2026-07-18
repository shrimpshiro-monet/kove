# GEMINI.md — Monet AI Director Ground Truth

This file applies to Monet-owned code in:
- src/
- src/server/
- src/lib/
- src/components/
- src/routes/

**Scope Warning**: Forked/reference projects under `external/`, `hyperframes/`, `openreel-video/`, `remotion/`, `twick/`, `freecut/`, `OpenCut/`, `editly/`, and `moviepy` are NOT to be modified unless explicitly directed. OpenReel must be wrapped, not extracted.

---

# MONET AI DIRECTOR — CODING AGENT INSTRUCTIONS

> You are building an autonomous AI video director. Not a template engine. Not a clip arranger.
> A system that collapses the entire filmmaking pipeline into a conversation.
> Every line of code you write either pushes toward that or it doesn't. There is no middle.

---

## 0. READ THIS FIRST — THE NORTH STAR

**The moat is NOT rendering.** It is intent extraction, creative reasoning, refinement speed, and transparent AI decision-making. Rendering only needs to be good enough, deterministic, and fast for previews.

**The real product is iteration speed.** Users forgive an imperfect first generation. They will not forgive a slow refinement loop.

**Viral moment = the thing users screen-record.** The Aesthetic Dissection module (text-based editing, kinetic typography) is that moment. Build it like it's your only shot.

**Never overbuild.** The plan is phased for a reason. If a feature is tagged `(expansion system)` in the plan, do not touch it until the Core Loop is validated. Building expansion features before the Core Loop works is the fastest way to ship nothing.

---

## 1. IDENTITY & CONTEXT

### What Monet Is

```
User says: "30s anime AMV cut to this song, hit hard on the drop"
Monet does:
  → Extracts creative intent (EditIntent JSON)
  → Asks 1-2 clarifying questions if confidence < 0.8
  → Analyzes footage (segment scoring: motion + emotion)
  → Detects beats (BPM, beat grid from music)
  → Generates edit plan (MonetEDL JSON)
  → Renders preview (Canvas2D, <100ms per frame)
  → Scores the edit (beatSync%, pacingVariance, confidence)
  → Lets user refine via natural language in <3 seconds
  → Exports 1080p MP4
```

### Tech Stack (Non-Negotiable)

| Layer | Technology |
|---|---|
| Frontend | TanStack Start + React |
| Backend | Cloudflare Workers |
| AI | Gemini 3.5 Flash (`gemini-3.5-flash`) |
| Storage | R2 (media), D1 (metadata), KV (sessions/jobs) |
| Video engine | OpenReel (wrapped, NOT extracted — see §4) |
| Client render | Canvas2D via OpenReel adapter (MVP) |
| Server render | FFmpeg on Cloudflare Queue (expansion only) |
| EDL format | Custom MonetEDL JSON schema |

---

## 2. CODE QUALITY — THE ABSOLUTES

These are not guidelines. Violating them means the code is wrong.

### TypeScript

- **Strict mode everywhere.** `"strict": true` in every `tsconfig.json`. No exceptions.
- **No `any`.** If you're tempted to use `any`, you haven't designed the type yet. Design it.
- **No `as` type assertions** unless you are handling a library boundary with a provably correct cast, and you document why in a comment.
- **Discriminated unions for all state.** Never use boolean flags to encode state. Use `status: 'idle' | 'analyzing' | 'generating' | 'error'`.
- **Zod for all API boundaries.** Every request body, every Gemini response, every EDL that enters from the network must be validated. Fail loudly on schema mismatch.
- **Return types on all functions.** No implicit returns. If a function can return `null`, say so.
- **Named exports over default exports** for utilities and services. Default exports only for route components.

### Error Handling

- **Never swallow errors.** No empty `catch` blocks. If you catch, you handle or you rethrow.
- **Use a `Result<T, E>` pattern** for all async operations that can fail at the boundary (API calls, file ops, Gemini calls). Return the error — don't throw it — unless it's truly exceptional.
- **Gemini errors are not exceptional.** Rate limits, schema rejections, content filters — these happen. Handle them gracefully with retry logic (max 3 attempts, exponential backoff).
- **Log with context.** Every error log must include: what operation failed, what input triggered it, and the error itself. `console.error('failed')` is useless.
- **User-facing errors must be human readable.** Internal error codes stay internal. Never expose stack traces or Gemini error messages to the UI.

### Async / Concurrency

- **Never block the UI thread.** Heavy computations go in Workers or are deferred.
- **AbortController on every long fetch.** If the user navigates away or cancels, you must cancel the request.
- **Race conditions kill products.** Use refs to track the latest request ID. Discard stale responses.
- **Parallel where possible, sequential only when required.** Upload footage + music in parallel. Analysis waits for upload. That's the dependency graph — respect it.

### State Management

- **No prop drilling beyond 2 levels.** Use context or a store.
- **Server state is not client state.** Use TanStack Query for anything that lives on the server. Do not replicate server state in `useState`.
- **Optimistic updates only when safe.** If an operation can fail in ways that are hard to rollback, don't do it optimistically.
- **EDL is the source of truth.** Everything rendered, scored, or displayed derives from the current EDL. If your UI state diverges from the EDL, you have a bug.

### File Organization

```
src/
├── routes/           # Page-level components only
├── components/
│   ├── chat/         # Chat mode components
│   └── studio/       # Studio mode components
├── hooks/            # All custom hooks
├── lib/              # Pure utilities, no React
├── server/
│   ├── api/          # One file per endpoint
│   ├── services/     # External service wrappers (Gemini, R2, D1)
│   ├── workers/      # Queue consumers
│   ├── prompts/      # Gemini prompt text files (versioned)
│   └── migrations/   # D1 SQL migrations
└── types/            # Shared TypeScript types
```

- **One responsibility per file.** `gemini.ts` handles Gemini. `r2.ts` handles R2. Not both.
- **Types live next to where they're defined, or in `src/types/` if truly shared.**
- **Prompts are plain text files, not template strings.** They live in `src/server/prompts/`. This makes them diffs-able, reviewable, and version-controlled separately from code.

---

## 3. ARCHITECTURE LAW

These are structural rules. Breaking them creates debt that compounds.

### The Intent Layer Is Sacred

Every edit generation MUST flow through the Intent Layer:

```
User Prompt
  ↓
/api/decode-intent  → EditIntent JSON (stored, reusable)
  ↓
/api/analyze        → FootageAnalysis + BeatGrid (cached in D1)
  ↓
/api/generate-edl   → MonetEDL (derived from intent + analysis)
  ↓
Client Renderer     → Preview frames
```

**Never skip the Intent Layer.** Do not go `prompt → EDL` directly. The Intent Layer is:
1. Why refinements are cheap (tweak intent params, not re-analyze)
2. Why Monet can explain its decisions (intent is human-readable)
3. Why multi-variant generation is possible (same intent, different EDL strategies)
4. The thing that separates Monet from every template-based competitor

### MonetEDL Is the Lingua Franca

The `MonetEDL` schema is the contract between AI generation and rendering. It must:

- Be fully serializable to JSON (no functions, no class instances, no circular refs)
- Pass Zod validation on every read from D1 or Gemini response
- Include `aiRationale` on every `Shot` (this is what powers the Transparent AI UX)
- Include `beatLock` on shots that are beat-synced (this is what makes the sync feel magical)
- Convert cleanly to OpenReel Project via `openreel-adapter.ts`

Never modify the `MonetEDL` schema without:
1. Bumping the `version` field
2. Writing a migration for existing D1 records
3. Updating the Zod schema
4. Updating the Gemini prompt that generates it

### The Edit Intent Layer: Schema Constraints

`EditIntent` fields and their rules:

```typescript
// These MUST be present on every intent
goal.primary           // Required. Human readable. Not optional.
style.genre            // Required. Drives everything downstream.
style.pacing           // Required. Drives shot duration and energy curve.
structure.duration     // Required. The target output length in seconds.
technical.syncToBeat   // Required. Hard boolean — no maybe.

// These are computed or inferred, never user-entered directly
structure.energyCurve  // Generated from pacing + acts. Never ask user for this.
structure.climaxPoint  // Derived from music analysis (chorus detection). Never guess.
```

### OpenReel: Wrap, Don't Extract

**This is the highest-risk architectural decision. Get it wrong and you'll spend 3 weeks untangling hidden dependencies.**

Rules:
1. **In MVP: use OpenReel AS-IS.** Import it. Create an adapter. Feed it Actions. Do not modify it.
2. **The adapter is `src/lib/openreel-adapter.ts`.** This is the only file that imports OpenReel internals.
3. **MonetEDL → OpenReel Project conversion happens in the adapter.** Nowhere else.
4. **Only use these OpenReel components in MVP:**
   - `AudioEngine` (beat detection)
   - `VideoEngine` (Canvas2D rendering)
   - `ExportEngine` (WebCodecs export)
   - Core types: `Project`, `Clip`, `Track`, `Effect`
5. **Do not touch OpenReel's UI components, state management, or timeline editor** in Chat Mode.
6. **Extraction only happens post-MVP, only for proven bottlenecks, one engine at a time.** Profile first. Extract second. Never extract speculatively.

### Rendering Coordinator Logic

The `RenderingCoordinator` decides client vs server. The logic is:

```
Preview quality → always client
1080p, duration ≤ 2min, effects ≤ 10 layers → client
4K → server (expansion only, do not build until server render is implemented)
Duration > 2min → server (expansion only)
Complex effects > 10 layers → server (expansion only)
```

In MVP: **client only.** The server render path does not exist yet. Do not build placeholder code for it. Do not leave `TODO: server render` stubs. Build the client path correctly. The server path comes later.

### Cloudflare Workers Constraints (Non-Negotiable)

Workers are not Node.js. These are not optional warnings:

- **No filesystem access.** There is no disk. Everything goes through R2, D1, or KV.
- **CPU time limit: 30s per request (default), 5min with Durable Objects.** Gemini calls must be async. Never block on a long Gemini response in a synchronous handler.
- **No native modules.** FFmpeg, sharp, anything with native bindings — server-side only, in a separate Worker or Queue consumer.
- **Max request body: 100MB for Workers, unlimited with R2 multipart upload.** Footage files must use R2 multipart. Never buffer them in Worker memory.
- **R2 for all media.** Footage, music, reference videos, render outputs — all go to R2. D1 only stores keys, metadata, and JSON.
- **KV for ephemeral state only.** Job status, upload tokens. Not for anything you care about long-term.

---

## 4. API DESIGN RULES

### Endpoint Contracts

Every endpoint must have:
1. A Zod request schema (validated at the start of the handler, before anything else)
2. A TypeScript response type (exported for use by the frontend's API client)
3. Standardized error response shape: `{ error: { code: string; message: string; details?: unknown } }`
4. An explicit HTTP status code for every response path

### The API Client (`src/lib/api-client.ts`)

**One typed function per endpoint. No raw `fetch` calls anywhere in UI components.**

The API client must:
- Be fully typed (input and output)
- Handle auth headers (if/when added)
- Handle AbortController signals
- Return `Result<T, ApiError>` — never throw

### Streaming Responses

The Gemini Thinking Panel shows real-time progress. This requires streaming:

- Use `ReadableStream` for long-running operations (analysis, EDL generation)
- Stream structured JSON chunks, not raw text: `{ stage: 'analyzing', progress: 0.4, data: SegmentPreview }`
- Client reads with `EventSource` or `fetch` + stream reader
- Never stream partial JSON that can't be independently parsed

---

## 5. GEMINI INTEGRATION RULES

### Model

Always `gemini-3.5-flash`. Never use another model without explicit user instruction.

### Prompt Engineering Rules

1. **Prompts are files, not strings.** Every Gemini prompt lives in `src/server/prompts/*.txt`. Load them at runtime. This makes them editable without code changes.

2. **System prompt + user prompt separation.** System = role + schema + constraints. User = the actual data (footage analysis, user prompt, etc.).

3. **Always request structured JSON output for EDL and Intent generation.** Use Gemini's `responseSchema` parameter. Do not parse free-form text.

4. **Include the full MonetEDL schema in the EDL generation prompt.** Gemini needs to see it to generate valid EDL. Do not summarize it.

5. **Validate every Gemini response with Zod before using it.** Gemini can hallucinate fields, omit required ones, or return subtly wrong types. Trust nothing.

6. **Include `aiRationale` in the EDL generation prompt instructions.** Tell Gemini explicitly: "For each shot, include an `aiRationale` field explaining why this shot was selected for this moment." This is what powers the transparent UX.

### Gemini Error Handling

- Retryable errors: 429, 503, 504.
- Max 3 attempts, exponential backoff.

### Gemini File Upload Rules

- Files uploaded to Gemini Files API expire after 48 hours. Store the `fileUri` in D1 with an `expiresAt` timestamp.
- Always check expiry before reusing a Gemini file URI. If expired, re-upload from R2.
- Upload files in parallel when analyzing multiple clips. Never await sequentially.
- Max file size for Gemini: 2GB. Flag files approaching this limit.

### Beat Detection Fallback

Gemini beat detection is the primary path. If it fails or confidence is low:
1. Use OpenReel's `AudioEngine` as fallback
2. Log the fallback occurrence (track failure rates)
3. Never tell the user "beat detection failed" — tell them "analyzing music rhythm"

---

## 6. EDL GENERATION — QUALITY MANDATES

Every generated EDL must pass these checks before being returned to the user. Hard failures reject the EDL and trigger a retry:

### Hard Failures (Reject & Retry)

- Duration must match intent (±2s)
- No shot longer than 30% of total duration
- If `syncToBeat=true`, all shots must have `beatLock`
- No overlapping shots on the timeline
- Every shot must reference a real clip

### Scoring — Compute and Display Always

These scores are computed on every EDL and shown to the user in the preview panel. They are not optional.

```typescript
interface EDLScores {
  beatSyncAccuracy: number;    // 0-1. Shown as % with label: "Beat sync: 87%"
  pacingVariance: number;      // 0-1. Shown as: "Pacing: dynamic / monotone"
  overallConfidence: number;   // 0-1. Shown as: "Confidence: 81%"
}
```

If `beatSyncAccuracy < 0.7` after generation, automatically trigger one refinement cycle before returning to user. Log the retry. Never surface the retry to the user — it should feel seamless.

---

## 7. RENDERING PIPELINE RULES

### Canvas2D (MVP Renderer)

- **Frame rendering must complete in <100ms.**
- **Cache decoded video frames.**
- **Effects in MVP are limited to**: glow, shake, zoom pulse, brightness, contrast.
- **Transitions in MVP are limited to**: cut, crossfade.
- **`globalEffects.colorGrade` is applied as a CSS filter on the canvas.**

### Export (WebCodecs)

- **Progress must be reported.**
- **Export runs in a Web Worker.**
- **If WebCodecs is not available** (old browser), fallback to server export.
- **Output: H.264/AAC MP4, 1080p, 30fps.**
- **Audio mixing**: The music track is mixed under the clips' audio at the volume specified in `edl.music.volume`.

### Preview Component Rules

- Show the full timeline with shot thumbnails.
- Show beat markers overlaid on the timeline.
- Show the `EDLScores` in the bottom panel.
- Support scrubbing (click or drag on timeline → seek preview).
- Show `aiRationale` on shot hover (tooltip).
- Be fully functional with no media — show placeholders during loading.
- DO NOT: Auto-play on mount, Lag more than 150ms on seek, Show raw JSON, Block render while thumbnails are loading.

---

## 8. THE VIRAL FEATURES — BUILD THESE RIGHT OR DON'T BUILD THEM

### Aesthetic Dissection Module (Phase 7B)

**Transcription requirements:**
- Word-level timestamps.
- `confidence` per word must be computed.
- Transcription for 30s video: must complete in <5 seconds.

**Text Timeline editor requirements:**
- Deleting a word removes exactly those milliseconds from the EDL. Gap must close.
- Re-stitching must happen in <200ms.
- Preview must update within 500ms of a deletion.
- Undo must work (max depth: 20).
- Words display their intensity as a visual property.
- Clicking a word seeks the preview to that timestamp.

**Kinetic Typography mode requirements:**
- Each word is a separate EDL shot of type `text`.
- Word scale = `1.0 + (intensity_score * 0.5)`.
- Word blur = `intensity_score < 0.3 ? 2px : 0`.
- Background: `#000000`. Text: `#FFFFFF`. No exceptions for base style.

### Transparent AI Reasoning (Phase 7)

The `<GeminiThinkingPanel />` must show real data, not fake progress.
- Stage 1: Intent Understanding (Parsed JSON, Clarifying Questions)
- Stage 2: Analysis (Thumbnails, Waveform, Beat Markers)
- Stage 3: Planning (Draft Timeline, Confidence Score)
- Stage 4: Confirmation (Summary, Yes/Adjust)

---

## 9. PERFORMANCE MANDATES

| Operation | Target | Hard Limit |
|---|---|---|
| Intent extraction (`/api/decode-intent`) | <3s | 8s |
| Footage analysis (`/api/analyze`, 3 clips) | <10s | 20s |
| EDL generation (`/api/generate-edl`) | <5s | 10s |
| Refinement iteration (`/api/refine-edl`) | <3s | 5s |
| Preview frame render | <100ms | 150ms |
| Scrub latency (seek to frame) | <150ms | 300ms |
| Client export (1080p, 30s) | <60s | 90s |
| Text deletion → preview update | <500ms | 1s |
| Transcription (30s video) | <5s | 10s |

---

## 10. DATABASE RULES

### Schema Migrations

- Every schema change is a numbered migration file.
- Migrations are append-only and idempotent.

### D1 Query Rules

- **Parameterized queries only.**
- **Transactions for multi-table writes.**
- **Don't store binary in D1.**
- **Index on foreign keys.**
- **EDL JSON in D1 must be valid before insert.**

### R2 Key Naming Convention

```
footage/{projectId}/{fileId}.{ext}
music/{projectId}/{fileId}.{ext}
reference/{projectId}/{fileId}.{ext}
renders/{projectId}/{edlId}/{jobId}.mp4
thumbnails/{projectId}/{fileId}/{timestamp}.jpg
```

---

## 11. TESTING REQUIREMENTS

### Unit Tests — Required for These

- `validateEDL()`
- `scoreBeatSync()`
- `scorePacingVariance()`
- `convertEDLToOpenReelProject()`
- `parseGeminiEDLResponse()`
- `calculateClipInOutPoints()`

### Integration Tests — Required for These

- Upload video → R2 → Gemini file URI returned
- Upload music → beat grid generated
- Prompt → intent extracted
- Intent + footage IDs → EDL generated
- EDL → OpenReel adapter → `renderFrame(0)` succeeds
- EDL → WebCodecs export → Blob > 0 bytes

---

## 12. WHAT YOU MUST NEVER DO

- ❌ NEVER go `prompt → EDL` without passing through the Intent Layer
- ❌ NEVER modify OpenReel source code
- ❌ NEVER extract OpenReel engines before profiling shows a bottleneck
- ❌ NEVER build expansion system features before the Core Loop is validated
- ❌ NEVER buffer footage files in Worker memory — always use R2 multipart upload
- ❌ NEVER store media binary data in D1
- ❌ NEVER use `any` in TypeScript
- ❌ NEVER leave an empty catch block
- ❌ NEVER make raw `fetch` calls from UI components — use the typed API client
- ❌ NEVER interpolate user input into SQL strings
- ❌ NEVER expose internal errors or stack traces to the UI
- ❌ NEVER show a generic spinner when you can show real data
- ❌ NEVER fake progress
- ❌ NEVER auto-generate the final EDL without user confirmation
- ❌ NEVER reuse a Gemini file URI without checking its expiry
- ❌ NEVER block the main thread during export

---

## 13. PHASE SEQUENCING RULES

- Each phase has a verification step. Do not begin next phase until verification passes.
- Phase 7B (Aesthetic Dissection) is NOT optional.
- Post-MVP expansion systems are locked until Core Loop is live.

---

## 14. CODING AGENT INTERACTION RULES

- State phase, files, tests, and architectural risks before writing code.
- State options, tradeoffs, and ask for a decision if unsure.
- Measure performance before optimizing.

---

### Manual E2E Checklist (Run Before Each Phase Completion)

```
□ Upload one or more clips, optionally with music — no errors
□ Enter prompt: "30s AMV, hit hard on the drop"
□ Verify: Intent panel shows parsed intent within target latency
□ Verify: At least 1 clarifying question appears (if confidence < 0.8)
□ Answer questions → analysis starts automatically
□ Verify: Segment thumbnails appear during analysis
□ Verify: Beat markers appear on waveform during analysis
□ Verify: EDL preview renders — scrubbing works
□ Verify: Beat sync score ≥ 70%
□ Type: "Make the cuts faster" → new EDL within target latency
□ Verify: New EDL scores shown, pacing is faster
□ Click Export → progress bar appears → MP4 downloads
□ Verify: MP4 plays correctly in browser — audio and video in sync
□ Open MP4 in Phase 10: Studio → timeline shows shots
```

---

## 15. SUCCESS CRITERIA

- Upload one or more clips, optionally with music → Intent panel within target latency → Refine in 5s → Export MP4.
- Beat sync >80%.
- Aesthetic Dissection (transcript edit → instant update) works.

### Success Criteria — Generalization Note

Clip count is never fixed. Monet must support N uploaded clips where N >= 1. If the user asks for a specific number of clips or shots, honor it. Otherwise, Monet chooses the number of shots based on intent, pacing, music structure, and available footage quality.

---

*Last updated: June 3, 2026*
*This document is the ground truth for the coding agent.*
