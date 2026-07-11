# Kove Pipeline — Complete Reference

> AI video editor: upload footage + song → describe what you want → beat-synced, AI-directed edit preview in <30s. Refine via chat. Export MP4.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER FLOW                                    │
│                                                                     │
│  Upload ──→ Analyze ──→ Generate EDL ──→ Preview ──→ Refine ──→ Export│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        DATA FLOW                                    │
│                                                                     │
│  EditIntent ──→ ReferenceDNA ──→ MonetEDL ──→ OpenReelProject       │
│       ↑              ↑              │              │                 │
│   Gemini        FFmpeg +         Canvas2D       NLE UI              │
│   (intent)      Gemini           (preview)    (manual edits)       │
│                                ↑              │                     │
│                            openReelToEDL ←────┘                     │
│                                │                                    │
│                            MonetEDL (round-trip)                    │
│                                │                                    │
│                         /api/vibe-refine                            │
│                                │                                    │
│                            monet_refine.py                          │
│                                │                                    │
│                            Refined EDL ──→ Preview ──→ ...          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Data Types

### MonetEDL (Source of Truth)

Defined in `packages/edl/src/schemas.ts`. Everything visual derives from this.

```typescript
interface ProjectEDL {
  version: 1;
  id: string;
  meta: EDLMeta;           // createdAt, updatedAt, aspectRatio, fps, sampleRate
  timeline: Timeline;       // duration, tracks[], markers[]
  assets: AssetRegistry;    // media{}, audio{}, overlays{}
}

interface Timeline {
  duration: number;
  tracks: Track[];
  markers: Marker[];        // beat, hook, chapter, transient, caption, impact
}

interface Track {
  id: string;
  type: "video" | "audio" | "text" | "fx" | "mask";
  clips: Clip[];
  order: number;
  locked: boolean;
  hidden: boolean;
}

interface Clip {
  id: string;
  mediaId: string;
  startTime: number;        // position on timeline (seconds)
  duration: number;         // visible duration on timeline
  inPoint: number;          // source media in point
  outPoint: number;         // source media out point
  speed: number;            // playback speed multiplier
  transforms: TransformKeyframes;  // position, scale, rotation keyframes
  audio: AudioProperties;   // gain, fadeIn, fadeOut, pan
  effects: EffectBlock[];   // attached effects
  meta?: Record<string, unknown>;  // Kove metadata (semanticEvent, shotType, etc.)
}
```

### OpenReelProject (NLE Format)

Defined in `packages/openreel-adapter/src/openreel-types.ts`. The browser-based NLE works with this shape.

```typescript
interface OpenReelProject {
  version: number;
  id: string;
  name: string;
  settings: OpenReelSettings;      // width, height, frameRate, sampleRate, channels?
  mediaLibrary: OpenReelMediaLibrary;
  timeline: OpenReelTimeline;      // tracks[], subtitles[], duration, markers[]
}

interface OpenReelClip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  effects: OpenReelEffect[];
  audioEffects: OpenReelEffect[];
  transform: OpenReelTransform;   // position, scale, rotation, anchor, opacity
  volume: number;
  keyframes: OpenReelKeyframe[];
  transition?: OpenReelTransition;  // incoming transition (authoritative)
  meta?: Record<string, unknown>;   // Kove metadata preserved 1:1
}
```

### OpenReelAction (Timeline Mutations)

Defined in `packages/openreel-adapter/src/openreel-types.ts`. 13-action discriminated union.

```
timeline/clear    track/create      clip/add          clip/remove
clip/update       keyframe/add      transform/update  effect/apply
audio/beat-sync   audio/ducking     transition/add    marker/add
subtitle/add
```

### DirectorOutput (AI Decisions)

Defined in `packages/kove-director/src/contract.ts`. What Nemotron/Gemini produces.

```typescript
interface DirectorOutput {
  reasoning: string;           // creative decisions explanation
  actions: DirectorAction[];   // typed editing actions
  metadata: {
    provider: string;
    model: string;
    latencyMs: number;
    tier: DirectorTier;        // "free" | "creator" | "pro"
    estimatedDuration: number;
    clipCount: number;
    effectCount: number;
  };
}
```

---

## Bidirectional Adapter System

The heart of the round-trip. Two adapters convert between MonetEDL and OpenReelProject without data loss.

### Forward: MonetEDL → OpenReelProject

**File:** `packages/openreel-adapter/src/edl-to-openreel.ts`

```
convertEDLToOpenReelProject(edl, mediaItems) → OpenReelProject
```

- Maps every MonetEDL field to OpenReel equivalents
- Preserves `clip.meta` (Kove metadata) on every clip
- Converts transform keyframes to OpenReel's scalar format
- Maps effects to OpenReel effect format
- Creates audio tracks for music/sfx clips
- Maps markers to OpenReel marker format

### Reverse: OpenReelProject → MonetEDL

**File:** `packages/openreel-adapter/src/openreel-to-edl.ts`

```
openReelProjectToMonetEDL(project, options?) → { edl, debug }
```

- Converts back without losing any fields the forward adapter wrote
- Preserves user manual edits (trimmed durations, adjusted outPoints, speed changes, added effects)
- Debug mode logs unmapped fields (e.g. custom keyframe properties)
- Intentionally drops non-serializable fields (fileHandle, blob, waveformData)

### Round-Trip Validation

```
validateRoundTrip(original, reconstructed) → { success, mismatches[] }
```

Structural comparison ensuring every field survives the round-trip. Used in tests and can be called at runtime.

### Known Gaps (Adapter)

| Gap | Description | Risk |
|-----|-------------|------|
| GAP-001 | Clip-level keyframes not rendered by preview engine | Trust bug (says "applied" but shows static) |
| GAP-002 | Executor and compiler are parallel paths (not connected) | Refinement must use EDL path |
| GAP-005 | Scope propagation is exact-match only | Stale scope after multiple refinements |

---

## Kove Director (Skill Registry + Compiler)

### Capability Registry

**File:** `packages/kove-director/src/capabilities/`

37 capabilities across 7 categories. Each has: Zod schema, compile function, trigger phrases, examples.

| Category | Count | Examples |
|----------|-------|----------|
| edit | 6 | split-clip, trim-clip, delete-clip, move-clip, speed-static, beat-cut |
| effects | 6 | push-in, pull-out, shake, flash, whip-pan, color-grade |
| transitions | 19 | crossfade, glitch, whip-pan, slide-left, zoom-push, film-burn, etc. |
| audio | 4 | mute, volume, fadeIn, fadeOut |
| overlays | 3 | text-overlay, image-overlay, watermark |
| camera | 2 | dolly-zoom, pan-follow |
| composition | 2 | montage, split-screen |

**Status tiers:**
- `alpha` — Zod-validated, wired end-to-end (37 caps)
- `beta` — Engine exists, no action verb yet (27 caps)
- `planned` — Placeholder, not built (25 caps)

**Registry API:**
```typescript
registerCapability(cap)          // register at module load
lookupCapability(id)             // get by ID
searchByTrigger(phrase)          // find matching capability
buildManifest(tier?)             // generate Nemotron-ready manifest
buildJsonManifest(tier?)         // JSON version for programmatic use
```

### Compiler

**File:** `packages/kove-director/src/compiler.ts`

Converts DirectorOutput → OpenReelAction[] via the registry.

```typescript
compileDirectorOutput(output, context?) → CompileResult
```

1. Consults registry first (Zod validation via `safeParse`)
2. Falls back to legacy switch for un-migrated caps
3. Wraps everything in a TRANSACTION (single undoable atomic unit)

### Capability Context

```typescript
interface CapabilityContext {
  duration?: number;
  selectedClipIds?: string[];
  trackId?: string;
  currentClip?: { id, mediaId, duration, inPoint, outPoint, startTime };
}
```

Passed to `compile()` at runtime for scoped operations.

---

## Pipeline Stages (End-to-End)

### Stage 1: Intent Extraction

**Route:** `POST /api/decode-intent`
**AI:** Gemini 2.5 Flash
**Input:** User prompt (text)
**Output:** `EditIntent` JSON

```
User: "30s anime AMV cut to this song, hit hard on the drop"
  → Gemini extracts: genre, mood, targetDuration, pacing, effectIntensity, ...
```

Clarifying questions asked if confidence < 0.8.

### Stage 2: Analysis

**Route:** `POST /api/analyze`
**AI:** Gemini 2.5 Flash + FFmpeg
**Input:** Footage files + music file + EditIntent
**Output:** `AnalysisResult` (segment scores, beat grid, reference DNA)

- Motion scoring per segment
- Beat detection (BPM, beat grid)
- Reference video analysis (if provided)
- Shot classification

### Stage 3: EDL Generation

**Route:** `POST /api/generate-edl`
**AI:** Gemini 2.5 Flash with responseSchema
**Input:** AnalysisResult + EditIntent + ReferenceDNA
**Output:** `MonetEDL` (ProjectEDL)

- Gemini produces DirectorOutput (typed actions)
- Compiler converts to OpenReelAction[]
- Actions applied to build MonetEDL
- `validateEDL()` runs — reject and retry if invalid

### Stage 4: OpenReel Hydration

**Adapter:** `convertEDLToOpenReelProject()`
**Input:** MonetEDL
**Output:** OpenReelProject (hydrated into NLE)

- Timeline resolves clips, effects, transitions
- Media items loaded into media library
- NLE UI becomes interactive

### Stage 5: Canvas2D Preview

**Engine:** `apps/web/src/engine/web-player.ts`
**Input:** OpenReelProject
**Output:** <100ms per frame browser preview

- Timeline resolver reads OpenReelProject
- Interpolates keyframes at current time
- Renders to Canvas2D
- Auto-plays on generation

### Stage 6: Manual Editing (Studio Mode)

**User interaction** in the NLE timeline:
- Trim clips (drag edges)
- Split clips (playhead position)
- Delete clips
- Reorder clips
- Add effects (UI panel)
- Adjust speed, transforms, audio

All edits modify the OpenReelProject in-memory. The `timelineDirty` flag flips to `true`.

### Stage 7: Chat Refinement (Director Mode)

**Route:** `POST /api/vibe-refine` → async job
**Worker:** `scripts/monet_refine.py`
**Input:** Current MonetEDL + user prompt + optional scope (clip IDs)
**Output:** Refined MonetEDL

```
User: "add slow-mo to clip 3"
  → Frontend: getCurrentMonetEDL() → refineEdit(edl, prompt, scope)
  → API: writes temp files, spawns python3 monet_refine.py
  → Python: rule-based or Nemotron refinement
  → Frontend: polls GET /api/vibe-refine/status/:jobId
  → On complete: loadMonetEDL(refinedEdl) → Canvas2D re-renders
```

**Refinement preserves:**
- All clips not in scope (exact ID match)
- User-added effects, speed changes, transforms
- Kove metadata (semanticEvent, shotType, etc.)

**Supported patterns (rule-based):**
| Pattern | Action |
|---------|--------|
| slow-mo, slow motion | clip.speed = 0.5 |
| fast, speed up | clip.speed = 1.5 |
| shake, impact, punch | context_shake effect |
| flash, white flash | impact_flash effect |
| zoom in, push in | push_in effect |
| zoom out, pull out | pull_out effect |
| crossfade, fade, transition | crossfade transition |
| warm, cooler, color | color.grade |
| mute, quiet | audio gain = 0.2 |

**Known gaps:**
| Gap | Description |
|-----|-------------|
| GAP-003 | Uses rule-based fallback, not Nemotron (10/37 patterns) |
| GAP-004 | Clip-level merge only (no track-level operations) |
| GAP-008 | 10 of 37 capabilities handled by rules |
| GAP-009 | Frontend polling has no exponential backoff |

### Stage 8: Round-Trip (Manual Edit Preservation)

```
OpenReelProject (with manual edits)
  → openReelProjectToMonetEDL() → MonetEDL
  → /api/vibe-refine → Refined MonetEDL
  → convertEDLToOpenReelProject() → OpenReelProject (re-hydrated)
  → Canvas2D preview re-renders
```

All manual edits (trim, split, speed change, added effects) survive the round-trip.

### Stage 9: Export

**Route:** `POST /api/render/vibe`
**Engine:** FFmpeg via editly or direct ffmpeg
**Input:** MonetEDL + footage paths + music path
**Output:** MP4 file

- Editly renders with effects, transitions, speed changes
- Output stored in R2 (MONET_RENDERS bucket)
- Download URL returned to frontend

---

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/decode-intent` | Extract EditIntent from prompt |
| POST | `/api/analyze` | Analyze footage + music + reference |
| POST | `/api/generate-edl` | Generate MonetEDL from analysis |
| POST | `/api/vibe-generate` | End-to-end: upload → analysis → EDL → OpenReel |
| GET | `/api/vibe-generate/status/:jobId` | Poll generation progress |
| POST | `/api/vibe-refine` | Refine existing EDL via chat |
| GET | `/api/vibe-refine/status/:jobId` | Poll refinement progress |
| POST | `/api/render/vibe` | Export EDL to MP4 |
| GET | `/api/render/vibe/status/:jobId` | Poll render progress |
| POST | `/api/upload-direct` | Upload footage/music files |
| POST | `/api/analyze-reference` | Analyze reference video style |
| POST | `/api/spatial/*` | Spatial VFX endpoints |
| POST | `/api/blender-render` | Blender 3D render |
| POST | `/api/native-executor` | Native timeline executor |

---

## Monorepo Structure

```
monet-ai-story/
├── packages/
│   ├── edl/                    # MonetEDL schema (source of truth)
│   │   └── src/schemas.ts      # ProjectEDL, Clip, Track, etc.
│   │   └── src/effect-types.ts # MonetEffectType union
│   ├── openreel-adapter/       # Bidirectional EDL ↔ OpenReel bridge
│   │   └── src/openreel-types.ts      # Canonical OpenReel types
│   │   └── src/edl-to-openreel.ts     # Forward: MonetEDL → OpenReel
│   │   └── src/openreel-to-edl.ts     # Reverse: OpenReel → MonetEDL
│   │   └── src/__tests__/round-trip.test.ts  # 43/43 tests
│   ├── kove-director/          # AI Director + Skill Registry
│   │   └── src/contract.ts     # DirectorOutput, DirectorAction types
│   │   └── src/compiler.ts     # DirectorOutput → OpenReelAction[]
│   │   └── src/capabilities/   # 37 alpha + 27 beta + 25 planned caps
│   │   │   └── types.ts        # Capability<T>, LegacyCapability, Context
│   │   │   └── registry.ts     # register, lookup, buildManifest
│   │   │   └── edit/           # split, trim, delete, move, speed, beat-cut
│   │   │   └── effects/        # push-in, pull-out, shake, flash, etc.
│   │   │   └── transitions/    # 19 transition types
│   │   │   └── audio/          # mute, volume, fadeIn, fadeOut
│   │   │   └── overlays/       # text, image, watermark
│   │   │   └── camera/         # dolly-zoom, pan-follow
│   │   │   └── composition/    # montage, split-screen
│   ├── core/                   # Shared types and utilities
│   └── edl-enhancers/          # EDL post-processing
│
├── apps/
│   ├── api/                    # Fastify API server
│   │   └── src/server.ts       # Route registration
│   │   └── src/api/            # Route handlers
│   │       └── vibe-generate.ts    # End-to-end generation
│   │       └── vibe-refine.ts      # Refinement endpoint
│   │       └── vibe-render.ts      # Export endpoint
│   │       └── analyze.ts          # Footage analysis
│   ├── web/                    # TanStack Start frontend
│   │   └── src/stores/project-store.ts  # Zustand store (EDL state)
│   │   └── src/hooks/useRefineEDL.ts    # Refinement polling hook
│   │   └── src/lib/api-client.ts        # API client functions
│   │   └── src/engine/web-player.ts     # Canvas2D preview
│   │   └── src/engine/timeline-resolver.ts  # Timeline → render commands
│   └── worker-node/            # Node.js render worker (BullMQ + Redis)
│
├── scripts/
│   ├── monet_refine.py         # Rule-based refinement worker
│   ├── monet_pipeline.py       # End-to-end generation pipeline
│   ├── verify-refinement-loop.py  # 4-scenario verification
│   ├── export-capabilities-manifest.ts  # Nemotron manifest builder
│   ├── capabilities.json       # Generated: 64 capabilities
│   ├── capabilities.md         # Generated: 155 lines
│   └── analyzers/              # FFmpeg scene detection, energy analysis
│
└── packages/openreel-adapter/
    └── KNOWN_GAPS.md           # 9 documented gaps
```

---

## Key Conventions

- **Gemini prompts are `.txt` files** in `src/server/prompts/`, not inline strings
- **EDL validation** runs on every generated EDL via `validateEDL()`. Reject and retry on failure
- **No `any`** in new TypeScript code. No empty catch blocks
- **Zod on every API boundary** — request bodies, Gemini responses, EDL from D1
- **`Result<T, E>` pattern** for all async operations at API boundaries
- **Discriminated unions** for all state (`status: 'idle' | 'analyzing' | 'generating' | 'error'`)
- **Named exports** over default exports for utilities and services
- **No raw `fetch` in UI** — use `src/lib/api-client.ts`

---

## Test Suites

| Suite | Location | Count | What it tests |
|-------|----------|-------|---------------|
| Round-trip | `packages/openreel-adapter/src/__tests__/round-trip.test.ts` | 43 | Forward + reverse adapter fidelity, manual edit preservation, debug logging |
| Alpha capabilities | `packages/kove-director/src/capabilities/__tests__/alpha-caps.test.ts` | 238 | All 37 alpha caps compile + execute correctly |
| Refinement loop | `scripts/verify-refinement-loop.py` | 4 scenarios | Full timeline, scoped, manual edit preservation, unsupported capability |

---

## Cloudflare Bindings (Production)

| Binding | Type | Purpose |
|---------|------|---------|
| `MONET_MEDIA` | R2 | Footage, music, reference uploads |
| `MONET_RENDERS` | R2 | Exported MP4 renders |
| `DB` | D1 | Intents, analyses, EDLs, reference styles |
| `MONET_KV` | KV | Job status, upload tokens |
| `RENDER_QUEUE` | Queue | Async render jobs |

No filesystem access in Workers. Everything through R2/D1/KV.

---

## Known Gaps Summary

| ID | Category | Impact | Fix Phase |
|----|----------|--------|-----------|
| GAP-001 | Preview | Clip keyframes orphaned (not rendered) | v1.1 |
| GAP-002 | Architecture | Executor/compiler parallel paths | v1.2 |
| GAP-003 | Refinement | Rule-based, not Nemotron | v1.1 |
| GAP-004 | Refinement | Clip-level merge only | v1.2 |
| GAP-005 | Scope | Exact-match clip IDs only | v1.1 |
| GAP-006 | API | Route uses `any` types | v1.1 |
| GAP-007 | Ops | Timer-based temp cleanup | v1.2 |
| GAP-008 | Refinement | 10/37 patterns handled | v1.1 |
| GAP-009 | Frontend | No polling backoff | v1.1 |

---

## Sprint Progress

| Phase | Status | What was delivered |
|-------|--------|-------------------|
| Phase 0 | ✅ Done | openreel-types.ts, removed phantom @openreel/core |
| Phase 1 Run 1 | ✅ Done | Reverse adapter (250 lines), 43/43 round-trip tests |
| Phase 1 Run 2 | ✅ Done | 90 capability files, registry, manifest builder |
| Phase 1 Run 3 | ✅ Done | Zod migration (38 alpha caps), compiler refactor, Nemotron manifest |
| Phase 2 Step A | ✅ Done | /api/vibe-refine endpoint, monet_refine.py |
| Phase 2 Step B | ✅ Done | useRefineEDL hook, api-client, project store dirty tracking |
| Phase 2 Step C | ✅ Done | 4/4 verification scenarios, KNOWN_GAPS updated |
| Phase 3 | ⏳ Next | Restyle OpenReel to Kove design language |
| Phase 4 | ⏳ Pending | Ship the alpha loop (MonetGeneratePanel, export) |

---

*Generated from PIPELINE.md — the single source of truth for Kove's architecture.*
