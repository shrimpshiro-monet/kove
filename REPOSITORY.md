# REPOSITORY.md — Complete Codebase Reference

> Auto-generated documentation of every file in the Monet AI Video Director repository.
> Excludes: `node_modules/`, `.git/`, `hyperframes/`, `openreel-video/`, `.agents/`, `.github/skills/`, `external/`

---

## Architecture Overview

```
User Prompt → /api/decode-intent (EditIntent) → /api/analyze (footage+music)
  → /api/generate-edl (MonetEDL) → Canvas2D preview (browser)
  → /api/refine-edl (iteration) → /api/export-mp4 (FFmpeg)
```

The **MonetEDL** is the source of truth. Everything visual derives from it.
Schema lives in `packages/edl/src/`.

### LLM Provider
All LLM calls route through `scripts/analyzers/llm_provider.py` to **DigitalOcean Inference**:
- `nemotron-nano-12b-v2-vl` (vision) — frame analysis, classification, semantic events
- `mimo-v2.5` (text) — DNA-to-text tasks
- Auth: `DIGITALOCEAN_API_KEY` env var (also stored as Cloudflare Worker secret)
- Auto-loads from `.dev.vars` for local dev

---

## Root Config Files

| File | Lines | Purpose |
|------|-------|---------|
| `wrangler.jsonc` | 69 | Cloudflare Workers config — bindings (R2, D1, KV, Queue, AI) |
| `package.json` | 40 | Monorepo root — scripts, workspace config |
| `bunfig.toml` | 6 | Bun package manager config |
| `docker-compose.yml` | 24 | Redis + Python services orchestration |
| `eslint.config.js` | 40 | ESLint config for TS/JS |
| `.prettierrc` | 6 | Prettier formatting rules |
| `components.json` | 22 | shadcn/ui component config |
| `Dockerfile` | 21 | Root Docker image (Cloudflare Worker) |
| `.dev.vars` | — | Local secrets (DIGITALOCEAN_API_KEY) — gitignored |
| `.dev.vars.example` | 21 | Template for local secrets |
| `.env.example` | 21 | Template for env vars (Redis, ports, whisper) |
| `.gitignore` | — | Git ignore rules |
| `.npmrc` | — | npm config |

---

## Root Documentation

| File | Lines | Purpose |
|------|-------|---------|
| `AGENTS.md` | 167 | Agent instructions — repo structure, commands, conventions |
| `GEMINI.md` | 529 | **Ground truth** — architecture, code quality, API design, Gemini rules |
| `README.md` | 230 | Project overview, setup, quick start |
| `VIBE-EDITOR.md` | 1149 | Detailed vibe editor architecture doc |
| `TESTING.md` | 90 | Test setup and running instructions |
| `SESSION-DOCUMENTATION.md` | 2593 | Session history and decisions |
| `VERTEX-AI-SETUP.md` | 137 | Google Vertex AI configuration guide |
| `REPOSITORY.md` | — | This file |

---

## `src/` — Main TanStack Start App

### Root Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/server.ts` | 672 | **Cloudflare Worker entry** — route registration, middleware, all server APIs |
| `src/routeTree.gen.ts` | 535 | Auto-generated TanStack route tree |
| `src/start.ts` | 22 | App start entry |
| `src/router.tsx` | 16 | Client-side router config |

### `src/server/` — Server-Side Code

**NOTE:** No files directly in `src/server/` — server logic is in subdirectories.

#### `src/server/lib/` — Core Libraries

| File | Lines | Purpose |
|------|-------|---------|
| `edl-to-editly.ts` | — | MonetEDL → Editly spec compiler |
| `render-engine-editly.ts` | — | Production render via editly package |
| `editly-effects.ts` | — | 433 lines mapping EDL effects to FFmpeg filter chains |
| `editly-transitions.ts` | — | Shot-to-shot transition mapping |
| `scene-detection.ts` | — | FFmpeg scene change detection (real cuts) |
| `energy-analysis.ts` | — | Per-frame energy calculation (motion + brightness) |
| `real-trace-builder.ts` | — | Builds ReferenceEditTrace from FFmpeg data |
| `reference-verification.ts` | — | Verifies Gemini's style extraction against ground truth |

#### `src/server/director/` — Director Logic

| File | Lines | Purpose |
|------|-------|---------|
| `reference-similarity.ts` | — | Real similarity scoring (cosine + KL divergence) |
| `reference-director.ts` | — | Builds prompt section forcing Gemini to edit like reference |

#### `src/server/api/` — API Endpoints

| File | Lines | Purpose |
|------|-------|---------|
| `analyze-reference.ts` | — | Reference video analysis endpoint (YouTube + R2) |

#### `src/server/prompts/` — Prompt Templates

All prompts are `.txt` files. Edit the file, not the code.

#### `src/server/data/` — Reference Catalogs

| File | Lines | Purpose |
|------|-------|---------|
| `reference-catalog.json` | — | 16 videos with cut rates, color profiles, style signatures |
| `long-form-reference-catalog.json` | — | 3 YouTube videos with structural editing analysis |

### `src/routes/` — UI Routes

| File | Lines | Purpose |
|------|-------|---------|
| `src/routes/__root.tsx` | — | Root layout |
| Other route files | — | Various app pages |

### `src/components/` — UI Components

| File | Lines | Purpose |
|------|-------|---------|
| Various `.tsx` files | — | UI components for the editor interface |

### `src/lib/` — Client Utilities

| File | Lines | Purpose |
|------|-------|---------|
| `api-client.ts` | — | Fetch wrapper — all UI API calls go through this |

---

## `scripts/` — Python Pipeline & Analyzers

### Main Pipeline

| File | Lines | Purpose |
|------|-------|---------|
| `monet_pipeline.py` | 976 | **Main entry point** — Reference → Grammar → DNA → EDL → Render |
| `grammar_extractor.py` | 494 | Standalone grammar extraction |
| `reference-dna.py` | 291 | Reference DNA generation |
| `universal-vibe-editor.py` | 293 | Universal vibe editor script |
| `replicate-spiderman-edit.py` | 387 | Spiderman edit replication |
| `replicate-steph-exact.py` | 279 | Steph Curry exact edit replication |
| `steph-curry-monet-render.py` | 363 | Steph Curry Monet render |
| `steph-xfade-render.py` | 319 | Steph Curry xfade render |

### `scripts/analyzers/` — DNA Extraction Analyzers

| File | Lines | Purpose |
|------|-------|---------|
| `__init__.py` | 1 | Package marker |
| `llm_provider.py` | 261 | **DigitalOcean Inference wrapper** — `call_vision_llm()`, `call_text_llm()`, image mosaic, retry logic, `.dev.vars` auto-load |
| `motion_analyzer.py` | 400 | Farneback optical flow — motion magnitude, camera/subject motion classification |
| `beat_detector.py` | 273 | Librosa beat tracking — BPM, beat times, rhythm analysis |
| `color_analyzer.py` | 384 | K-means color clustering — palette, luminance, saturation, grade classification |
| `shot_type_classifier.py` | 446 | Face detection (MediaPipe or YCbCr fallback) + edge/complexity analysis → wide/medium/close/extreme_close |
| `effect_detector.py` | 572 | Edge analysis + pixel variance → blur, glow, flash, shake, vignette, desaturation detection |
| `text_detector.py` | 400 | Edge density + brightness analysis → text overlay detection |
| `speed_ramp_detector.py` | 257 | Motion analysis → speed ramp detection (fast, slow, ramp) |
| `semantic_analyzer.py` | 318 | **LLM-powered** — batched Nemotron calls → per-shot emotion, event type, narrative role |
| `reference_type_classifier.py` | 212 | **LLM-powered** — classifies video type (sports_highlight, vlog, etc.) |
| `dna_blender.py` | 446 | Merges multiple DNA analyses with weighted averaging |
| `dna_schema.py` | 260 | DNA data structure definitions and validation |
| `type_profiles.py` | 204 | Per-type editing profiles (sports, vlog, dance, etc.) |
| `DETERMINISM.md` | 95 | Audit of deterministic vs non-deterministic behavior |
| `LLM_PROVIDERS.md` | 69 | LLM provider documentation, costs, failure modes |
| `MEDIAPIPE_INSTALL.md` | 41 | MediaPipe installation guide for M-series Macs |

### `scripts/eval/` — Evaluation & Testing

| File | Lines | Purpose |
|------|-------|---------|
| `test_determinism.py` | 143 | Runs grammar extraction 3x, asserts byte-identical output |
| `run_eval.py` | 452 | Full evaluation pipeline runner |
| `loopback.py` | 427 | Loopback test (DNA → EDL → compare) |
| `quick_compare.py` | 70 | Quick comparison of two DNA outputs |

---

## `apps/api/` — Fastify API Server

| File | Lines | Purpose |
|------|-------|---------|
| `src/server.ts` | — | Fastify server entry |
| `src/api/analyze.ts` | — | Footage+music analysis endpoint |
| `src/api/generate-edl.ts` | — | EDL generation from DNA |
| `src/api/render.ts` | — | Render orchestration |
| `src/api/render-status.ts` | — | Render job status polling |
| `src/api/blender-render.ts` | — | DNA blender render |
| `src/api/create-heavy-edit.ts` | — | Heavy edit creation |
| `src/api/native-executor.ts` | — | Native (non-Docker) execution |
| `src/api/spatial.ts` | — | Spatial VFX API |
| `src/api/upload-direct.ts` | — | Direct file upload |
| `src/api/vibe-render.ts` | — | Vibe-based rendering |
| `src/services/python-workers.ts` | — | Python worker process management |
| `src/services/python-spatial-workers.ts` | — | Python spatial worker management |
| `src/services/queue.ts` | — | Job queue management |
| `package.json` | — | API package dependencies |
| `tsconfig.json` | — | TypeScript config |

---

## `apps/web/` — TanStack Start Frontend

### Components

| File | Lines | Purpose |
|------|-------|---------|
| `src/components/editor/AdvancedEditor.tsx` | — | Full editor with timeline + preview |
| `src/components/editor/SimplifiedEditor.tsx` | — | Simplified editor view |
| `src/components/editor/VibeEditor.tsx` | — | Vibe-based editing interface |
| `src/components/editor/TimelineEditor.tsx` | — | Timeline-based editor |
| `src/components/editor/LivePreview.tsx` | — | Real-time canvas preview |
| `src/components/editor/AudioWaveform.tsx` | — | Audio waveform visualization |
| `src/components/editor/ClipInspector.tsx` | — | Individual clip inspection |
| `src/components/editor/MonetGeneratePanel.tsx` | — | AI generation controls |
| `src/components/editor/RenderStatusPanel.tsx` | — | Render progress display |
| `src/components/editor/SpatialVFXPanel.tsx` | — | Spatial VFX controls |
| `src/components/editor/effects/EffectInspector.tsx` | — | Effect inspection panel |
| `src/components/editor/effects/EffectInspectorConnected.tsx` | — | Connected effect inspector |
| `src/components/editor/effects/EffectParamControl.tsx` | — | Effect parameter controls |
| `src/components/editor/effects/effect-control-registry.ts` | — | Effect control type registry |
| `src/components/preview/BlueprintPreview.tsx` | — | Blueprint/technical preview |
| `src/components/preview/BlueprintPreviewConnected.tsx` | — | Connected blueprint preview |
| `src/components/ErrorBoundary.tsx` | — | React error boundary |

### Engine (Client-Side Rendering)

| File | Lines | Purpose |
|------|-------|---------|
| `src/engine/web-player.ts` | — | Main web player engine |
| `src/engine/timeline-resolver.ts` | — | Timeline resolution logic |
| `src/engine/bezier-easing.ts` | — | Bezier easing functions |
| `src/engine/effects/effect-runner.ts` | — | Effect execution engine |
| `src/engine/effects/layered-effect-runner.ts` | — | Layered effect composition |
| `src/engine/keyframes/interpolator.ts` | — | Keyframe interpolation |
| `src/engine/keyframes/keyframe-types.ts` | — | Keyframe type definitions |
| `src/engine/audio/audio-engine.ts` | — | Audio playback engine |
| `src/engine/audio/audio-timeline-engine.ts` | — | Audio-timeline sync |
| `src/engine/audio/audio-buffer-cache.ts` | — | Audio buffer caching |
| `src/engine/audio/audio-types.ts` | — | Audio type definitions |
| `src/engine/audio/beat-engine.ts` | — | Beat detection engine |
| `src/engine/audio/beat-resolver.ts` | — | Beat resolution logic |
| `src/engine/audio/sfx-engine.ts` | — | Sound effects engine |
| `src/engine/depth/depth-runtime.ts` | — | Depth/parallax runtime |
| `src/engine/depth/depth-types.ts` | — | Depth type definitions |
| `src/engine/mask/mask-runtime.ts` | — | Mask runtime |
| `src/engine/mask/mask-types.ts` | — | Mask type definitions |
| `src/engine/spatial/spatial-compositor.ts` | — | Spatial compositing |
| `src/engine/spatial/spatial-runtime.ts` | — | Spatial runtime |

### Stores & Hooks

| File | Lines | Purpose |
|------|-------|---------|
| `src/stores/project-store.ts` | — | Main project state store |
| `src/stores/edl-adapter.ts` | — | EDL ↔ project store adapter |
| `src/stores/monet-effect-store-adapter.ts` | — | Effect store adapter |
| `src/stores/monet-generate-adapter.ts` | — | Generation adapter |
| `src/stores/monet-render-adapter.ts` | — | Render adapter |
| `src/stores/monet-spatial-adapter.ts` | — | Spatial adapter |
| `src/hooks/useKeyboardShortcuts.ts` | — | Keyboard shortcut handling |
| `src/hooks/useRefineEDL.ts` | — | EDL refinement hook |
| `src/hooks/useRenderStatus.ts` | — | Render status polling |
| `src/lib/api-client.ts` | — | API client wrapper |
| `src/lib/executors/monet-action-executor.ts` | — | Monet action executor |
| `src/lib/media/project-media-hydration.ts` | — | Media hydration |
| `src/lib/project-store-types.ts` | — | Project store type defs |

---

## `apps/worker-node/` — Node.js Render Worker

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | — | Worker entry — BullMQ + Redis consumer |
| `src/queues/render-preview.worker.ts` | — | Preview render job handler |
| `src/queues/render-final.worker.ts` | — | Final render job handler |
| `src/queues/enhance-edl.worker.ts` | — | EDL enhancement job handler |
| `package.json` | — | Worker dependencies |
| `tsconfig.json` | — | TypeScript config |

---

## `packages/` — Monorepo Shared Packages

| Package | Purpose |
|---------|---------|
| `packages/edl/` | MonetEDL schema — **source of truth** for the edit format |
| `packages/edl-enhancers/` | EDL post-processing (style directives, intensity) |
| `packages/core/` | Shared types and utilities |
| `packages/engine-freecut/` | Alternative edit engine |
| `packages/openreel-adapter/` | MonetEDL → OpenReel project conversion |
| `packages/render-adapters/` | Render backend abstraction |
| `packages/feature-registry/` | Effect/transition registry |
| `packages/job-contracts/` | BullMQ job type definitions |

---

## `editly/` — Local Fork

Vendored dependency (editly npm package). **Not application code.** Do not treat as application code.

---

## `docker/` — Render Container

| File | Lines | Purpose |
|------|-------|---------|
| `docker/render/Dockerfile` | — | Docker image with FFmpeg + Node.js |
| `docker/render/render.js` | 168 | **Render script** — extracts clips, applies effects (blur/vignette/flash/desaturation), xfade transitions between shots |
| `docker/render/README.md` | — | Render container documentation |

---

## `infra/` & `k8s/` — Infrastructure

| File | Lines | Purpose |
|------|-------|---------|
| `infra/docker-compose.yml` | — | Redis + Python audio/AI services |
| `k8s/deployment.yaml` | — | Kubernetes deployment manifest |

---

## `brain/` — Architecture Documentation

| File | Lines | Purpose |
|------|-------|---------|
| `brain/architecture_blueprint.md` | — | System architecture blueprint |
| `brain/license_manifest.json` | — | License manifest |
| `brain/license_manifest.schema.json` | — | License manifest schema |

---

## `workers/` — Python Microservices

### `workers/python-audio/`
| File | Lines | Purpose |
|------|-------|---------|
| `app.py` | — | FastAPI audio service entry |
| `workers/analyze_audio.py` | — | Audio analysis (BPM, key, energy) |
| `workers/render_audio_vfx.py` | — | Audio VFX rendering |
| `requirements.txt` | — | Python dependencies |
| `Dockerfile` | — | Container build |

### `workers/python-ai/`
Whisper-based AI service for transcription.

---

## `monet/` — Python Package (V2 Architecture)

| File | Purpose |
|------|---------|
| `monet/__init__.py` | Package init |
| `monet/main.py` | Main entry point |
| `monet/cli.py` | CLI interface |
| `monet/vertex_ai.py` | Vertex AI integration |
| **Engines** | |
| `monet/engines/freecut/` | FreeCut engine — planner + executor + FFmpeg compiler |
| `monet/engines/editly/` | Editly engine — compiler + runner |
| `monet/engines/opencut/` | OpenCut engine — compiler + runner |
| `monet/engines/beatsync/` | Beat sync — detector + snap logic |
| `monet/engines/motion/` | Motion tracking + follow caption |
| `monet/engines/sam_vfx/` | SAM-based VFX — ML pipeline + compiler |
| **Session** | |
| `monet/session/state.py` | Session state management |
| `monet/session/chat.py` | Chat interface |
| `monet/session/diff.py` | Diff computation |
| `monet/session/incremental.py` | Incremental updates |
| `monet/session/patches.py` | Patch application |
| `monet/session/sync.py` | State synchronization |
| **Vibe** | |
| `monet/vibe/pipeline.py` | Vibe editing pipeline |
| `monet/vibe/session.py` | Vibe session management |
| `monet/vibe/feedback.py` | Feedback collection |
| `monet/vibe/history.py` | Edit history |
| **Style** | |
| `monet/style/analyzer.py` | Style analysis |
| `monet/style/profile.py` | Style profiles |
| `monet/styler/mood.py` | Mood-based styling |
| **Router** | |
| `monet/router/router.py` | Request routing |
| `monet/router/dispatch.py` | Request dispatch |
| `monet/router/capabilities.py` | Capability detection |
| **Other** | |
| `monet/billing/` | Cost tracking, tier management, middleware |
| `monet/auth/` | JWT auth, rate limiting |
| `monet/export/` | Export presets, API, exporter |
| `monet/realtime/` | Real-time progress updates |
| `monet/collab/presence.py` | Collaborative presence |
| `monet/analytics/` | Usage analytics |
| `monet/affiliates/` | Affiliate tracking |
| `monet/templates/` | Template library |
| `monet/thumbnail/generator.py` | Thumbnail generation |
| `monet/unison/` | Multi-model scoring + harness |
| `monet/experiments/ab.py` | A/B testing |
| `monet/learning/reward.py` | Reward learning |
| `monet/workers/render_worker.py` | Render worker |
| `monet/observability/` | Metrics + middleware |

---

## DNA Schema (Key Fields)

The DNA is the source of truth for everything visual:

```json
{
  "name": "steph-curry",
  "source": "reference.mp4",
  "duration": 19.16,
  "resolution": {"width": 576, "height": 576},
  "fps": 29.97,
  "referenceType": "sports_highlight",
  "referenceTypeConfidence": 0.97,
  "totalShots": 14,
  "avgShotDuration": 1.335,
  "cutRate": 0.73,
  "shots": [{
    "index": 0,
    "start": 0,
    "end": 7.1,
    "duration": 7.1,
    "shotType": "wide",
    "effects": ["blur"],
    "transitions": ["fade_white"],
    "visualEffects": ["glow"],
    "hasText": true,
    "textCount": 15,
    "avgSpeed": 2.0,
    "speedType": "very_fast",
    "hasRamp": false,
    "semanticEvent": {
      "description": "Player receives ball at top of key",
      "actions": ["dribbling"],
      "subjects": ["player"],
      "emotion": "anticipation",
      "event_type": "setup",
      "narrative_role": "establishing",
      "importance": 7
    },
    "motion_magnitude": 0.26,
    "camera_motion": "handheld",
    "subject_motion": "running",
    "energy": 0.26
  }],
  "motionStats": { "avg_magnitude": 0.258, "peak_magnitude": 0.99, ... },
  "colorProfile": { "grade": "desaturated", "saturation_mean": 17.4, ... },
  "shotTypes": { "distribution": {"wide": 0.93, ...}, "detectionMethod": "mediapipe" },
  "effects": { "totalEffects": 17, "effectTypes": {...} },
  "text": { "textShots": 14, ... },
  "speed": { "avgSpeed": 1.75, ... },
  "semanticEvents": {
    "totalEvents": 14,
    "dominantEmotion": "tension",
    "dominantEventType": "action",
    "eventTypes": {...},
    "emotions": {...},
    "avgImportance": 7.9
  },
  "audioAnalysis": { "tempo": 99.4, "beats": [...] },
  "energyCurve": [{"time": 0.2, "energy": 0.36}, ...],
  "grammarRules": {...}
}
```

---

## Pipeline Flow

```
1. Upload: User provides footage + music + (optional) reference video
2. Intent: /api/decode-intent → EditIntent (what the user wants)
3. Analyze Reference: extract_grammar() runs all analyzers:
   - FFmpeg scene detection → cuts
   - Farneback optical flow → motion
   - Librosa beat tracking → BPM/rhythm
   - K-means color clustering → palette/grade
   - MediaPipe face detection → shot types
   - Edge analysis → effects (blur, glow, flash, etc.)
   - Text detection → overlays
   - Speed analysis → ramps
   - LLM (Nemotron) → semantic events + emotion
   - LLM (Nemotron) → reference type classification
4. DNA: All analysis results packed into MonetEDL DNA
5. EDL: DNA → EDL (timing, effects, transitions mapped to footage)
6. Preview: EDL → Canvas2D browser preview
7. Refine: User feedback → /api/refine-edl (adjust DNA, no re-analysis)
8. Render: EDL → FFmpeg concat (local) or Docker editly (effects)
```

---

## Render Pipeline

### Local (FFmpeg concat)
- No effects applied — just cuts + speed
- Fallback when Docker unavailable

### Docker (editly renderer)
- Effects applied: blur (`boxblur=8:8`), vignette (`vignette=PI/4`), flash (`eq=brightness=0.3`), desaturation (`eq=saturation=0.3`)
- Transitions: xfade between clips (fade, fadeblack, wipeleft, etc.)
- Output: H.264 High profile, yuv420p, 576x576
- **Effects capped at 1 per clip** to prevent stacking

---

## Key Conventions

- **Gemini prompts are .txt files** in `src/server/prompts/`
- **EDL validation** runs on every generated EDL
- **No `any`** in TypeScript. No empty catch blocks.
- **Zod on every API boundary** — request bodies, Gemini responses
- **`Result<T, E>` pattern** for all async operations
- **Server routes** registered in `src/server.ts` as `{method, path, handler}` array
- **No new dependencies** — use only urllib + json + base64 + PIL for Python LLM code
- **Effects: max 1 per clip** — deduplicate at DNA level, EDL generation, and render
