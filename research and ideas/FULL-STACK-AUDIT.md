# Kove — Complete Stack Audit

**Date**: July 6, 2026  
**Status**: End-to-end review

---

## What Kove Is

AI video editor: upload footage + song + optional reference → describe what you want → beat-synced, AI-directed edit preview in <30s → export MP4. Uses Gemini for creative reasoning, FFmpeg for server rendering, Canvas2D for browser preview.

---

## Architecture (30 seconds)

```
User Prompt → /api/decode-intent (EditIntent) → /api/analyze (footage+music)
  → /api/generate-edl (MonetEDL) → Canvas2D preview (browser)
  → /api/refine-edl (iteration, no re-analysis) → /api/export-mp4 (FFmpeg)
```

The **MonetEDL** is the source of truth. Everything visual derives from it.

---

## Part 1: What Exists (BUILT)

### Server (src/server/)

| Area | Files | Status |
|------|-------|--------|
| API routes | 34 registered routes, 24 handler files | ✅ Working |
| AI service (multi-provider router) | ai-service.ts (703 lines) | ✅ Working |
| AI providers | Gemini, Cerebras, Groq, NVIDIA NIM, DashScope, Azure | ✅ Configured |
| EDL generation (V3) | generate-edl.ts (519 lines) | ✅ Working |
| EDL refinement (streaming SSE) | refine-edl.ts (158 lines) | ✅ Working |
| Reference analysis | analyze-reference.ts (338 lines) | ✅ Working |
| Director feedback loop | director-feedback.ts (120 lines) | ✅ Working |
| FFmpeg render engine | render-engine-editly.ts + ffmpeg-renderer.ts | ✅ Working |
| Scene detection | scene-detection.ts | ✅ Working |
| Energy analysis | energy-analysis.ts | ✅ Working |
| Effect mapping | editly-effects.ts (433 lines) | ✅ Working |
| Style compiler | style-compiler.ts | ✅ Working |
| Music director | music-director.ts (341 lines) | ✅ Working |
| Upload (R2 + D1) | upload.ts (391 lines) | ✅ Working |
| Media serving (Range requests) | media.ts (412 lines) | ✅ Working |
| Export (queued) | export.ts (127 lines) | ✅ Working |
| SAM2 isolation | specialist-isolate.ts + sam2-service.ts | ✅ Working |
| Depth estimation | specialist-depth.ts + depth-anything-service.ts | ✅ Working |
| Frame interpolation | specialist-slowmo.ts + rife-service.ts | ✅ Working |
| Transcription | transcribe.ts (187 lines) | ⚠️ Mock data when no audio |
| Beat detection | upload-and-detect.ts | ⚠️ Hardcoded mock (bpm: 120) |
| Signed URL upload | upload.ts generateSignedUploadUrl | ⚠️ Stub (returns raw R2 URL) |
| OpenReel sync | sync-from-advanced-editor.ts | ❌ Deprecated (501) |

### Frontend (src/routes/ + apps/web/)

| Area | Files | Status |
|------|-------|--------|
| Landing page | landing.tsx (663 lines) | ✅ Complete |
| Chat editor | chat_.$threadId.tsx (1978 lines) | ✅ Complete |
| Simple editor | SimpleEditorPage.tsx (543 lines) | ✅ Complete |
| Dashboard | dashboard.tsx (1010 lines) | ✅ Complete |
| Studio (NLE) | studio_.$projectId.tsx (266 lines) | ✅ Complete |
| Video preview (Canvas2D) | monet-renderer.ts (1558 lines) | ✅ Working |
| Sequential player | VideoPreview.tsx (357 lines) | ✅ Working |
| Effect engine | effect-runner + layered-effect-runner | ✅ Working |
| Transition engine | transitions.ts | ✅ Working |
| Shader effects (WebGL) | shader-fx.ts + spiderverse/ | ✅ Working |
| Particle effects | particle-fx.ts | ✅ Working |
| Text engine | text-engine.ts | ✅ Working |
| WebGL color grading | webgl-grade-renderer.ts | ✅ Working |
| SAM mask renderer | sam-mask-renderer.ts | ✅ Working |
| Media loader + cache | media-loader.ts | ✅ Working |
| Project store (Zustand) | project-store.ts (320 lines) | ✅ Working |
| Shot-to-EDL conversion | shot-to-project-edl.ts (141 lines) | ✅ Working |
| API client | api-client.ts (788 lines) | ✅ Working |
| Style DNA (16 presets) | style-dna/library/ | ✅ Working |
| Engine registry (14 engines) | engines/registry.ts (256 lines) | ✅ Working |
| Engine router | engines/router.ts (215 lines) | ✅ Working |
| Engine dispatch | engines/engine-dispatch.ts (452 lines) | ✅ Working |
| Action executor (1031 lines) | monet-action-executor.ts | ✅ Working |
| Blueprint preview | BlueprintPreview.tsx (436 lines) | ✅ Working |
| Text timeline editing | TextTimeline.tsx (304 lines) | ✅ Working |
| Composition overlay | CompositionOverlay.tsx (78 lines) | ⚠️ Disabled (ENABLE_HYPERFRAMES=false) |
| History panel | HistoryPanel.tsx (155 lines) | ⚠️ Clear/Export buttons are visual stubs |
| Remotion preview | RemotionInline.tsx (315 lines) | ⚠️ Built but not used by any route |

### Packages

| Package | What It Does | Status |
|---------|--------------|--------|
| @monet/edl | MonetEDL schema (source of truth) | ✅ Working |
| @monet/edl-enhancers | 10 EDL post-processing enhancers | ✅ Working |
| @monet/engine-freecut | Alternative edit engine | ✅ Working |
| @monet/openreel-adapter | MonetEDL ↔ OpenReel conversion | ✅ Working |
| @monet/render-adapters | Render backend abstraction | ✅ Working |
| @monet/kove-director | Director capabilities contract | ✅ Working |
| @monet/job-contracts | BullMQ job type definitions | ✅ Working |

### Infrastructure

| Component | Status |
|-----------|--------|
| Cloudflare Workers (API) | ✅ Configured |
| R2 (MONET_MEDIA + MONET_RENDERS) | ✅ Configured |
| D1 database (5 migrations) | ✅ Configured |
| KV (MONET_KV) | ✅ Configured |
| Queue (RENDER_QUEUE) | ✅ Configured |
| Redis (docker-compose) | ✅ Configured |
| Python audio worker (port 8101) | ✅ Configured |
| Python AI worker (port 8102) | ✅ Configured |
| BullMQ workers (preview + final) | ✅ Configured |

### Reference System

| Component | Status |
|-----------|--------|
| Reference catalog (16 videos) | ✅ Built |
| Long-form catalog (3 YouTube videos) | ✅ Built |
| Reference analysis pipeline | ✅ Working |
| Reference similarity scoring | ✅ Working |
| Reference director prompts | ✅ Working |
| Reference style enforcer | ✅ Working |
| Regeneration loop (3 attempts) | ✅ Working |

### Prompt Library (12 files)

| Prompt | Used By | Status |
|--------|---------|--------|
| analyze-footage.txt | /api/analyze | ✅ |
| analyze-music.txt | /api/analyze | ✅ |
| analyze-reference.txt | /api/analyze-reference | ✅ |
| compile-style.txt | /api/style/compile | ✅ |
| critique-edl.txt | EDL critique | ✅ |
| decode-intent.txt | /api/decode-intent | ✅ |
| generate-composition.txt | /api/generate-composition | ✅ |
| generate-edl-v3.txt | /api/generate-edl | ✅ |
| generate-patch.txt | Director feedback | ✅ |
| refine-edl.txt | /api/refine-edl | ✅ |
| style-vocabulary.txt | EDL generation | ✅ |
| index.ts | Loader utility | ✅ |

---

## Part 2: What's Missing (NOT BUILT)

### P0 — Critical for Product

| Feature | Why It's Critical | What's Needed |
|---------|-------------------|---------------|
| **Visual style transfer (LoRA)** | "Edit like this video" only transfers rhythm, not visual look | Wan 2.1 LoRA training + inference on Colab |
| **IPAdapter integration** | Zero-shot style from reference frame | HuggingFace API or Colab |
| **Real beat detection** | upload-and-detect.ts returns hardcoded bpm:120 | Librosa integration (python-audio worker exists) |
| **Real transcription** | transcribe.ts generates mock transcripts | Whisper integration (python-ai worker exists) |
| **Signed URL upload** | generateSignedUploadUrl is a stub | aws4fetch SigV4 implementation |
| **Export quality parity** | Preview looks good, export doesn't match | Fix Editly filter chain mapping |
| **Error recovery** | Pipeline silently continues on failure | Fail-loud validation at each step |

### P1 — Important for Quality

| Feature | Why It Matters | What's Needed |
|---------|----------------|---------------|
| **Multi-format export** | TikTok (9:16), YouTube (16:9), Instagram (1:1) | FFmpeg scaling + aspect ratio options |
| **Audio cleanup** | Background noise removal | FFmpeg afftdn filter or WebRTC VAD |
| **Batch processing** | Multiple videos at once | Queue-based batch endpoint |
| **Render progress webhooks** | Real-time render status | WebSocket or SSE for render progress |
| **Render job cancellation** | Stop stuck renders | BullMQ job removal + cleanup |
| **4K output validation** | Ensure export matches preview | Resolution/quality checks |
| **HyperFrames integration** | Composition overlay disabled | Debug and re-enable ENABLE_HYPERFRAMES |

### P2 — Differentiation

| Feature | Why It Matters | What's Needed |
|---------|----------------|---------------|
| **Text behind subjects** | Viral TikTok feature | SAM2 + DepthAnything + Canvas2D layering |
| **Background removal** | Green screen without green screen | SAM2 mask + inpainting |
| **Object tracking overlays** | Effects that follow subjects | SAM2 point tracking |
| **Depth-aware effects** | Cinematic look | DepthAnything + Canvas2D |
| **Long-form → short-form** | Content repurposing | AI-selected moment extraction |
| **Collaborative editing** | Team workflows | WebSocket infrastructure |
| **Mobile app** | CapCut's territory | React Native or PWA |

### P3 — Platform

| Feature | Why It Matters | What's Needed |
|---------|----------------|---------------|
| **Auth / user accounts** | Multi-user support | Clerk, Supabase Auth, or Cloudflare Access |
| **Payment integration** | Revenue | Stripe (waived fees via GitHub Pack) |
| **Template marketplace** | Network effects | Upload/share/browse templates |
| **API for developers** | Platform play | Public API with rate limiting |
| **Analytics dashboard** | Usage insights | Cloudflare Analytics + custom events |

---

## Part 3: Brutal Assessment

### What's Actually Working End-to-End

The core loop works:
1. ✅ Upload footage + music + reference
2. ✅ Analyze footage (FFmpeg scene detection + AI vision)
3. ✅ Analyze music (audio features)
4. ✅ Analyze reference (FFmpeg + LLM)
5. ✅ Decode intent from prompt
6. ✅ Generate EDL (V3 with reference constraints)
7. ✅ Preview in browser (Canvas2D)
8. ✅ Refine via chat (Director feedback loop)
9. ✅ Export MP4 (FFmpeg via Editly)

### What's Actually Broken

| Issue | Impact | Fix Effort |
|-------|--------|------------|
| Beat detection is mocked (bpm:120) | Music sync is fake | Low — python-audio worker exists |
| Transcription is mocked | No real word-level sync | Low — python-ai worker exists |
| Signed URL is a stub | Upload may fail in production | Low — aws4fetch is a library |
| Reference analyzer sometimes returns empty data | Style replication fails silently | Medium — already partially fixed this session |
| Export quality doesn't match preview | User trust issue | High — Editly filter chain mapping |
| Composition overlay disabled | Missing feature | Low — debug why it was disabled |
| History panel buttons are visual stubs | UX gap | Low — add onClick handlers |

### What's Actually Missing (The Hard Stuff)

| Missing Feature | Difficulty | Time to Build |
|----------------|------------|---------------|
| Visual style transfer (LoRA) | High | 2-3 weeks |
| IPAdapter integration | Medium | 1 week |
| Text behind subjects | Medium | 1 week |
| Background removal pipeline | Medium | 1 week |
| Multi-format export | Low | 1-2 days |
| Audio cleanup | Low | 1 day |
| Auth / user accounts | Medium | 1 week |
| Payment (Stripe) | Low | 2-3 days |
| Mobile app | Very High | 2-3 months |

### The Numbers

| Metric | Count |
|--------|-------|
| Total TypeScript files | ~300+ |
| Total lines of code (est.) | ~100,000+ |
| API routes | 34 |
| Server handler files | 24 |
| Server lib files | 52 |
| Server service files | 23 |
| Prompt files | 12 |
| Route pages | 10 |
| UI components (shadcn) | 46 |
| App-specific components | 17 |
| Browser lib modules | 22+ |
| Monorepo packages | 7 |
| Python worker endpoints | 7 |
| Script files | 45 |
| Reference videos | ~20 |
| Style presets | 16 |
| Rendering engines | 14 |
| Effect types supported | 18+ |

---

## Part 4: What To Do Next (Priority Order)

### This Week (Fix Foundations)
1. Wire real beat detection (python-audio worker)
2. Wire real transcription (python-ai worker / Whisper)
3. Fix signed URL upload
4. Re-enable composition overlay
5. Fix export quality parity

### Next Week (Add Compositing)
1. Text behind subjects (SAM2 + DepthAnything)
2. Background removal (SAM2)
3. Object tracking overlays
4. Multi-format export

### Month 2 (Add Style Transfer)
1. Wan 2.1 LoRA training on Colab
2. IPAdapter integration
3. Style transfer pipeline end-to-end

### Month 3 (Launch)
1. Auth (Clerk or Supabase)
2. Payment (Stripe)
3. Landing page polish
4. Beta testing

---

## Bottom Line

Kove has **~100K lines of code** across **300+ files**. The core pipeline works. The architecture is solid. The AI routing is robust. The rendering engine is comprehensive.

**What's actually missing is not infrastructure — it's intelligence.**

The system can:
- Upload, analyze, generate, preview, refine, export ✅

The system cannot:
- Replicate visual style (only editing rhythm) ❌
- Detect real beats from music ❌ (mocked)
- Transcribe real audio ❌ (mocked)
- Composite text behind subjects ❌
- Remove backgrounds ❌
- Export at preview quality ❌ (sometimes)

Fix those 6 things and Kove is a functional AI video editor. Not a great one. But a real one.
