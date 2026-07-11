# Kove — The Code Behind It

> Every file, every system, every line that makes Kove work. This is the complete technical reference.

---

## Architecture at a Glance

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

## Package Map

| Package | Purpose | Lines |
|---------|---------|------:|
| `packages/edl/` | MonetEDL schema — source of truth | 1,372 |
| `packages/openreel-adapter/` | Bidirectional EDL ↔ OpenReel bridge | 1,261 |
| `packages/kove-director/` | AI Director + 90-capability skill registry | 3,687 |
| `packages/edl-enhancers/` | EDL post-processing (style, beat-sync) | 1,637 |
| `packages/engine-freecut/` | Alternative edit engine (FFmpeg) | 992 |
| `packages/render-adapters/` | Render backend abstraction (FFmpeg, Blender) | 2,052 |
| `packages/job-contracts/` | BullMQ job type definitions | 260 |
| **packages total** | | **11,261** |

| App | Purpose | Lines |
|-----|---------|------:|
| `apps/api/` | Fastify API server (12 routes) | 2,232 |
| `apps/web/` | TanStack Start frontend (editor, engine, stores) | 10,232 |
| `apps/worker-node/` | Node.js render worker (BullMQ + Redis) | 200 |
| **apps total** | | **12,664** |

| Layer | Purpose | Lines |
|-------|---------|------:|
| `src/server/` | Cloudflare Worker entry + 24 API endpoints + 51 libs + 23 services | 25,098 |
| `src/routes/` | TanStack Start routes (landing, dashboard, editor, chat, studio) | 4,401 |
| `src/components/` | UI components (46 shadcn/ui + editor + chat) | 6,951 |
| `src/lib/` | Client libraries (renderer, shaders, style-dna, engines) | 16,649 |
| `src/catalog/` | Effect/transition catalog | 1,513 |
| `src/design/` | Design tokens | — |
| `scripts/` | Python pipeline + analysis + verification | 16,697 |
| **grand total** | | **~95,000** |

---

## Core Data Types

### MonetEDL (`packages/edl/src/schemas.ts` — 146 lines)

The source of truth. Everything visual derives from this.

```typescript
interface ProjectEDL {
  version: 1;
  id: string;
  meta: EDLMeta;           // createdAt, updatedAt, aspectRatio, fps, sampleRate
  timeline: Timeline;       // duration, tracks[], markers[]
  assets: AssetRegistry;    // media{}, audio{}, overlays{}
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

### OpenReelProject (`packages/openreel-adapter/src/openreel-types.ts` — 320 lines)

The NLE format. Browser-based editor works with this shape.

```typescript
interface OpenReelProject {
  version: number;
  id: string;
  name: string;
  settings: OpenReelSettings;      // width, height, frameRate, sampleRate
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
  transform: OpenReelTransform;   // position, scale, rotation, anchor, opacity
  volume: number;
  keyframes: OpenReelKeyframe[];
  transition?: OpenReelTransition;  // incoming transition (authoritative)
  meta?: Record<string, unknown>;   // Kove metadata preserved 1:1
}
```

### OpenReelAction (`packages/openreel-adapter/src/openreel-types.ts` — 13 types)

Timeline mutations. Discriminated union.

```
timeline/clear    track/create      clip/add          clip/remove
clip/update       keyframe/add      transform/update  effect/apply
audio/beat-sync   audio/ducking     transition/add    marker/add
subtitle/add
```

### DirectorOutput (`packages/kove-director/src/contract.ts` — 282 lines)

What Nemotron/Gemini produces.

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

### Forward: MonetEDL → OpenReelProject

**File:** `packages/openreel-adapter/src/edl-to-openreel.ts` (176 lines)

```typescript
convertEDLToOpenReelProject(edl, mediaItems) → OpenReelProject
```

- Maps every MonetEDL field to OpenReel equivalents
- Preserves `clip.meta` (Kove metadata) on every clip
- Converts transform keyframes to OpenReel's scalar format
- Creates audio tracks for music/sfx clips

### Reverse: OpenReelProject → MonetEDL

**File:** `packages/openreel-adapter/src/openreel-to-edl.ts` (453 lines)

```typescript
openReelProjectToMonetEDL(project, options?) → { edl, debug }
```

- Converts back without losing any fields the forward adapter wrote
- Preserves user manual edits (trimmed durations, adjusted outPoints, speed changes)
- Debug mode logs unmapped fields

### Round-Trip Validation

**File:** `packages/openreel-adapter/src/__tests__/round-trip.test.ts` (289 lines)

```typescript
validateRoundTrip(original, reconstructed) → { success, mismatches[] }
```

43 tests. Every field verified to survive the round-trip.

---

## Kove Director (Skill Registry + Compiler)

### Capability Registry

**File:** `packages/kove-director/src/capabilities/registry.ts` (232 lines)

90 capabilities across 7 categories. 37 alpha, 27 beta, 25 planned.

| Category | Alpha | Beta | Planned | Total |
|----------|------:|-----:|--------:|------:|
| edit | 6 | 2 | 3 | 11 |
| effects | 6 | 8 | 12 | 26 |
| transitions | 19 | 1 | 1 | 21 |
| audio | 4 | 2 | 3 | 9 |
| overlays | 3 | 3 | 3 | 9 |
| camera | 2 | 2 | 1 | 5 |
| composition | 2 | 2 | 2 | 6 |
| **total** | **42** | **20** | **25** | **87** |

### Compiler

**File:** `packages/kove-director/src/compiler.ts` (632 lines)

```typescript
compileDirectorOutput(output, context?) → CompileResult
```

1. Consults registry first (Zod validation via `safeParse`)
2. Falls back to legacy switch for un-migrated caps
3. Wraps everything in a TRANSACTION (single undoable atomic unit)

### Capability Types

**File:** `packages/kove-director/src/capabilities/types.ts` (104 lines)

```typescript
interface Capability<TParams> {
  id: string;
  category: CapabilityCategory;
  status: CapabilityStatus;     // "alpha" | "beta" | "planned"
  version: string;
  description: string;
  triggerPhrases: string[];
  params: z.ZodType<TParams> | Record<string, string>;
  compile: (input: TParams, context?: CapabilityContext) => unknown[];
  examples: Array<{ input: TParams | string; output: unknown[] }>;
}

interface CapabilityContext {
  duration?: number;
  selectedClipIds?: string[];
  trackId?: string;
  currentClip?: { id, mediaId, duration, inPoint, outPoint, startTime };
}
```

---

## API Routes

### Fastify API (`apps/api/src/`)

| Route | File | Lines | Purpose |
|-------|------|------:|---------|
| `POST /api/vibe-generate` | `vibe-generate.ts` | 263 | End-to-end generation |
| `GET /api/vibe-generate/status/:jobId` | `vibe-generate.ts` | — | Poll generation |
| `POST /api/vibe-refine` | `vibe-refine.ts` | 194 | Refine existing EDL |
| `GET /api/vibe-refine/status/:jobId` | `vibe-refine.ts` | — | Poll refinement |
| `POST /api/vibe-render` | `vibe-render.ts` | 181 | Export to MP4 |
| `POST /api/analyze` | `analyze.ts` | 87 | Analyze footage + music |
| `POST /api/upload-direct` | `upload-direct.ts` | 79 | Upload files to R2 |
| `POST /api/spatial/*` | `spatial.ts` | 131 | Spatial VFX |
| `POST /api/blender-render` | `blender-render.ts` | 93 | Blender 3D render |
| `POST /api/native-executor` | `native-executor.ts` | 178 | Native timeline executor |
| `POST /api/render/vibe` | `render.ts` | 87 | Render routes |
| `GET /api/render/vibe/status/:jobId` | `render-status.ts` | 65 | Render status |

### Cloudflare Worker (`src/server/api/`)

| Endpoint | File | Lines | Purpose |
|----------|------|------:|---------|
| `POST /api/decode-intent` | `decode-intent.ts` | 189 | Extract EditIntent from prompt |
| `POST /api/analyze` | `analyze.ts` | 221 | Footage analysis |
| `POST /api/analyze-reference` | `analyze-reference.ts` | 152 | Reference video style extraction |
| `POST /api/generate-edl` | `generate-edl.ts` | 314 | Generate MonetEDL |
| `POST /api/generate-composition` | `generate-composition.ts` | 227 | Generate composition |
| `POST /api/generate-patch` | `generate-patch.ts` | 178 | Generate EDL patch |
| `POST /api/refine-edl` | `refine-edl.ts` | 158 | Refine existing EDL |
| `POST /api/export-mp4` | `export-mp4.ts` | 97 | Export to MP4 |
| `POST /api/export` | `export.ts` | 127 | Export routes |
| `POST /api/upload` | `upload.ts` | 391 | Upload to R2 |
| `POST /api/upload-and-detect` | `upload-and-detect.ts` | 92 | Upload + detect |
| `POST /api/media` | `media.ts` | 412 | Media management |
| `POST /api/transcribe` | `transcribe.ts` | 187 | Audio transcription |
| `POST /api/render-preview` | `render-preview.ts` | 86 | Preview render |
| `POST /api/director-loop` | `director-loop.ts` | 52 | Director loop |
| `POST /api/director-feedback` | `director-feedback.ts` | 120 | Director feedback |
| `POST /api/apply-patch` | `apply-patch.ts` | 145 | Apply EDL patch |
| `POST /api/style-compile` | `style-compile.ts` | 29 | Style compilation |
| `POST /api/sync-from-advanced-editor` | `sync-from-advanced-editor.ts` | 18 | Sync from NLE |
| `POST /api/studio-project` | `studio-project.ts` | 271 | Studio project management |
| `POST /api/specialist-depth` | `specialist-depth.ts` | 73 | Depth estimation |
| `POST /api/specialist-isolate` | `specialist-isolate.ts` | 86 | Subject isolation |
| `POST /api/specialist-slowmo` | `specialist-slowmo.ts` | 59 | Slow-motion |
| `POST /api/gemini-think-effects` | `gemini-think-effects.ts` | 152 | Gemini effect reasoning |

---

## Frontend Components

### Editor Components (`apps/web/src/components/editor/`)

| File | Lines | Purpose |
|------|------:|---------|
| `SimpleEditorPage.tsx` | 291 | Main editor — Director mode layout |
| `AdvancedEditor.tsx` | 77 | Full NLE via OpenReel iframe |
| `SimplifiedEditor.tsx` | 606 | Legacy "Cursor for video" editor |
| `ClipInspector.tsx` | 721 | Clip detail inspector (right rail) |
| `TimelineEditor.tsx` | 220 | Timeline view |
| `LivePreview.tsx` | 143 | Canvas2D preview renderer |
| `MonetGeneratePanel.tsx` | 303 | Generation controls |
| `SpatialVFXPanel.tsx` | 221 | Spatial VFX controls |
| `AudioWaveform.tsx` | 66 | Audio visualization |
| `RenderStatusPanel.tsx` | 50 | Render progress |
| `VibeEditor.tsx` | 13 | Studio mode shell |

### Simple Editor (`apps/web/src/components/editor/simple-editor/`)

| File | Lines | Purpose |
|------|------:|---------|
| `ProjectHeader.tsx` | 113 | Top bar — project name, mode toggle |
| `ChatStream.tsx` | 171 | Message stream (Kove + user messages) |
| `ChatInputDock.tsx` | 200 | Chat input with scope chip, quick tags |
| `KoveResponseCard.tsx` | 112 | AI response card (mono, "> " prefix) |
| `VideoPreview.tsx` | 142 | Video preview with player controls |
| `ProgressPipeline.tsx` | 82 | Terminal-style progress (char-by-char) |
| `Sidebar.tsx` | 258 | Navigation sidebar with Kove branding |
| `HistoryPanel.tsx` | 155 | Edit history panel |
| `types.ts` | — | Shared types |

### Effect Inspector (`apps/web/src/components/editor/effects/`)

| File | Lines | Purpose |
|------|------:|---------|
| `EffectInspector.tsx` | 281 | Effect property inspector |
| `EffectInspectorConnected.tsx` | 58 | Connected version with store |
| `EffectParamControl.tsx` | 111 | Individual effect parameter control |
| `effect-control-registry.ts` | — | Registry of effect control components |

### shadcn/ui Components (`src/components/ui/`)

46 components. Key ones used in the editor:

| Component | Lines | Usage |
|-----------|------:|-------|
| `button.tsx` | 49 | All buttons (default, destructive, outline, ghost) |
| `card.tsx` | 55 | Card containers |
| `dialog.tsx` | 104 | Modal dialogs |
| `input.tsx` | 22 | Text inputs |
| `tabs.tsx` | 53 | Tab navigation |
| `tooltip.tsx` | 32 | Tooltips |
| `badge.tsx` | 32 | Status badges |
| `separator.tsx` | 24 | Dividers |
| `scroll-area.tsx` | 44 | Custom scrollbars |
| `select.tsx` | 152 | Dropdown selects |
| `slider.tsx` | 23 | Range sliders |
| `switch.tsx` | 27 | Toggle switches |

---

## Preview Engine (`apps/web/src/engine/`)

| File | Lines | Purpose |
|------|------:|---------|
| `web-player.ts` | — | Main Canvas2D player |
| `timeline-resolver.ts` | — | Resolves timeline → render commands |
| `bezier-easing.ts` | — | Easing functions for keyframes |
| `keyframes/interpolator.ts` | — | Keyframe interpolation |
| `keyframes/keyframe-types.ts` | — | Keyframe type definitions |
| `effects/effect-runner.ts` | — | Effect execution |
| `effects/layered-effect-runner.ts` | — | Layered effect execution |
| `audio/audio-engine.ts` | — | Audio playback |
| `audio/audio-timeline-engine.ts` | — | Audio timeline |
| `audio/beat-engine.ts` | — | Beat detection |
| `audio/beat-resolver.ts` | — | Beat resolution |
| `audio/sfx-engine.ts` | — | SFX playback |
| `depth/depth-runtime.ts` | — | Depth estimation runtime |
| `mask/mask-runtime.ts` | — | Mask rendering |
| `spatial/spatial-compositor.ts` | — | Spatial compositing |

---

## Server Libraries (`src/server/lib/`)

51 library files. Key systems:

| File | Lines | Purpose |
|------|------:|---------|
| `deterministic-edl.ts` | 568 | Deterministic EDL generation |
| `editly-effects.ts` | 515 | 433 lines mapping EDL effects → FFmpeg filters |
| `edl-to-editly.ts` | 361 | MonetEDL → EditlySpec compiler |
| `edl-normalizer.ts` | 408 | EDL normalization |
| `effect-vocabulary.ts` | 550 | Effect vocabulary for Nemotron |
| `energy-analysis.ts` | 380 | Per-frame energy calculation |
| `moment-mapping.ts` | 433 | Moment map for timeline |
| `scene-detection.ts` | 240 | FFmpeg scene change detection |
| `real-trace-builder.ts` | 262 | Builds ReferenceEditTrace from FFmpeg data |
| `reference-verification.ts` | 266 | Verifies Gemini style extraction vs ground truth |
| `reference-to-edl.ts` | 366 | Reference → EDL conversion |
| `music-director.ts` | 341 | Music-driven editing decisions |
| `onset-alignment.ts` | 235 | Onset detection + alignment |
| `audio-structure.ts` | 364 | Audio structure analysis |
| `edit-planner.ts` | 421 | Edit planning |
| `regeneration-loop.ts` | 275 | Regeneration with tighter constraints |
| `edl-scoring.ts` | 174 | EDL quality scoring |

---

## Server Services (`src/server/services/`)

23 AI/FFmpeg service files:

| File | Lines | Purpose |
|------|------:|---------|
| `ai-service.ts` | 644 | Main AI service (Gemini, Nemotron) |
| `vertex-ai.ts` | 634 | Vertex AI integration |
| `footage-analysis.ts` | 916 | Footage analysis pipeline |
| `ffmpeg-renderer.ts` | 462 | FFmpeg rendering |
| `ffmpeg-proxy-service.ts` | 285 | FFmpeg proxy |
| `gemini-sdk.ts` | 261 | Gemini SDK wrapper |
| `ai-services-client.ts` | 232 | AI services client |
| `intent-service.ts` | 209 | Intent extraction |
| `edl-critique-service.ts` | 187 | EDL critique |
| `sam2-service.ts` | 175 | SAM2 segmentation |
| `nim.ts` | 177 | NVIDIA NIM integration |
| `depth-anything-service.ts` | 164 | Depth estimation |
| `music-structure-service.ts` | 148 | Music structure |
| `azure-openai.ts` | 145 | Azure OpenAI |
| `dashscope.ts` | 139 | DashScope integration |
| `azure-foundry.ts` | 121 | Azure Foundry |
| `edl-ai-enrichment.ts` | 151 | EDL AI enrichment |
| `rife-service.ts` | 112 | RIFE interpolation |
| `replicate-client.ts` | 102 | Replicate integration |
| `huggingface-client.ts` | 100 | HuggingFace client |
| `style-compiler.ts` | 115 | Style compilation |
| `model-config.ts` | 12 | Model configuration |
| `queue-status.ts` | 61 | Queue status |

---

## Director System (`src/server/director/`)

| File | Lines | Purpose |
|------|------:|---------|
| `enhance-edl-with-style.ts` | 342 | Enhance EDL with reference style |
| `reference-similarity.ts` | 288 | Real similarity scoring (cosine + KL divergence) |
| `reference-director.ts` | 274 | Builds prompt forcing Gemini to edit like reference |
| `style-directives.ts` | 233 | Style directive system |
| `creative-density.ts` | 91 | Creative density scoring |
| `reference-edit-trace.ts` | 56 | Reference edit trace type |

---

## AI Prompts (`src/server/prompts/`)

12 prompt template files (`.txt`):

```
analyze-footage.txt      — Footage analysis prompt
analyze-music.txt        — Music analysis prompt
analyze-reference.txt    — Reference style extraction
compile-style.txt        — Style compilation
critique-edl.txt         — EDL quality critique
decode-intent.txt        — Intent extraction from user prompt
generate-composition.txt — Composition generation
generate-edl-v3.txt      — EDL generation (v3)
generate-patch.txt       — EDL patch generation
refine-edl.txt           — EDL refinement
style-vocabulary.txt     — Style vocabulary for effects
```

---

## Python Pipeline (`scripts/`)

| File | Lines | Purpose |
|------|------:|---------|
| `monet_pipeline.py` | 1,162 | End-to-end generation pipeline |
| `monet_refine.py` | 348 | Rule-based refinement worker |
| `verify-refinement-loop.py` | 177 | 4-scenario refinement verification |
| `grammar_extractor.py` | 494 | Grammar extraction from reference |
| `reference-dna.py` | 291 | Reference DNA extraction |
| `universal-vibe-editor.py` | 293 | Universal vibe editing |
| `replicate-steph-exact.py` | 279 | Steph Curry style replication |
| `replicate-spiderman-edit.py` | 387 | Spiderman edit replication |
| `steph-curry-monet-render.py` | 363 | Steph Curry render |
| `steph-xfade-render.py` | 319 | Steph crossfade render |

### Python Analyzers (`scripts/analyzers/`)

| File | Lines | Purpose |
|------|------:|---------|
| `effect_detector.py` | 572 | Effect detection from video |
| `shot_type_classifier.py` | 446 | Shot type classification |
| `dna_blender.py` | 446 | DNA blending |
| `motion_analyzer.py` | 400 | Motion analysis |
| `text_detector.py` | 400 | Text detection |
| `color_analyzer.py` | 384 | Color analysis |
| `footage_analyzer.py` | 346 | Footage analysis |
| `semantic_analyzer.py` | 318 | Semantic analysis |
| `beat_detector.py` | 273 | Beat detection |
| `llm_provider.py` | 261 | LLM provider abstraction |
| `dna_schema.py` | 260 | DNA schema definitions |
| `speed_ramp_detector.py` | 257 | Speed ramp detection |
| `reference_type_classifier.py` | 212 | Reference type classification |
| `type_profiles.py` | 204 | Type profiles |

---

## Design System

### Tokens (`src/design/tokens.ts` + `src/styles.css`)

```typescript
// Colors
ink: "#0A0A0A"        // Concrete Black — app bg
asphalt: "#141414"    // Wet Asphalt — panel bg
studio: "#1E1E1E"     // Studio Grey — elevated bg
chain: "#3A3A3A"      // Chain Link — borders
newsprint: "#B5B0A6"  // Newsprint — secondary text
paper: "#F5F1E8"      // Torn Paper — primary text
orange: "#FF4E00"     // Kove Orange — the ONLY accent

// Radius
sharp: "4px"          // buttons, inputs, clips
card: "6px"           // small cards
panel: "8px"          // panels
modal: "10px"         // modals

// Typography
display: Space Grotesk, Söhne, Inter, system-ui
ui: Inter, Söhne, system-ui
mono: JetBrains Mono, Berkeley Mono, ui-monospace

// Motion
fast: "80ms"
base: "120ms"
slow: "200ms"
ease: "ease-out"
```

### CSS (`src/styles.css` — 556 lines)

Tailwind CSS v4 with `@theme inline`. Two themes:
- **Dark (default):** Kove brutalist monochrome — ink/asphalt/studio/chain surfaces, paper text, orange accent
- **Light:** Inverted — paper canvas, ink text, orange accent

---

## Test Suites

| Suite | File | Count | What it tests |
|-------|------|------:|---------------|
| Round-trip | `packages/openreel-adapter/src/__tests__/round-trip.test.ts` | 43 | Forward + reverse adapter fidelity |
| Alpha capabilities | `packages/kove-director/src/capabilities/__tests__/alpha-caps.test.ts` | 238 | All 37 alpha caps compile + execute |
| Refinement loop | `scripts/verify-refinement-loop.py` | 4 scenarios | Full timeline, scoped, manual edit preservation, unsupported capability |
| EDL normalizer | `src/server/lib/edl-normalizer.test.ts` | — | EDL normalization |

---

## Cloudflare Bindings (Production)

| Binding | Type | Purpose |
|---------|------|---------|
| `MONET_MEDIA` | R2 | Footage, music, reference uploads |
| `MONET_RENDERS` | R2 | Exported MP4 renders |
| `DB` | D1 | Intents, analyses, EDLs, reference styles |
| `MONET_KV` | KV | Job status, upload tokens |
| `RENDER_QUEUE` | Queue | Async render jobs |

---

## Known Gaps

| ID | Category | Impact | Fix Phase |
|----|----------|--------|-----------|
| GAP-001 | Preview | Clip keyframes orphaned (not rendered) | v1.1 |
| GAP-002 | Architecture | Executor/compiler parallel paths | v1.2 |
| GAP-003 | Refinement | Rule-based, not Nemotron (10/37 patterns) | v1.1 |
| GAP-004 | Refinement | Clip-level merge only | v1.2 |
| GAP-005 | Scope | Exact-match clip IDs only | v1.1 |
| GAP-006 | API | Route uses `any` types | v1.1 |
| GAP-007 | Ops | Timer-based temp cleanup | v1.2 |
| GAP-008 | Refinement | 10/37 patterns handled by rules | v1.1 |
| GAP-009 | Frontend | No polling backoff | v1.1 |

---

## Sprint Progress

| Phase | Status | What shipped |
|-------|--------|-------------|
| Phase 0 | ✅ | openreel-types.ts, removed phantom @openreel/core |
| Phase 1 Run 1 | ✅ | Reverse adapter (453 lines), 43/43 round-trip tests |
| Phase 1 Run 2 | ✅ | 90 capability files, registry, manifest builder |
| Phase 1 Run 3 | ✅ | Zod migration (38 alpha caps), compiler refactor, Nemotron manifest |
| Phase 2 Step A | ✅ | /api/vibe-refine endpoint, monet_refine.py |
| Phase 2 Step B | ✅ | useRefineEDL hook, api-client, project store dirty tracking |
| Phase 2 Step C | ✅ | 4/4 verification scenarios, KNOWN_GAPS updated |
| Phase 3 Step A | ✅ | Design tokens, Kove palette, fonts |
| Phase 3 Step B | ✅ | 110+ hardcoded colors → Kove tokens across 10 files |
| Phase 3 Step C | ✅ | Chat panel, mode switcher, ProgressPipeline |
| Phase 4 | ⏳ | Ship the alpha loop (MonetGeneratePanel, export) |

---

*Every line of code in this document exists in the repo. This is the complete technical reference for Kove.*
