# Kove v2 Pipeline Redesign

**Date:** 2026-07-14
**Status:** Design Complete — Ready for Implementation
**Scope:** Full rewrite of generation pipeline, EDL format, and rendering architecture

---

## 1. Problem Statement

The current Monet pipeline has:
- **Dual EDL schemas** — `packages/edl/` (track-based) vs `src/server/types/edl.ts` (shot-based) that don't cleanly bridge
- **Reference style not consumed** — server ignores the full reference style the client sends
- **Upside-down bug** — `__monetUpsideDown` flag read but never set
- **Untested export** — Editly integration not end-to-end verified
- **No real-time** — Cloudflare Workers have no WebSocket support
- **No co-editing** — User and AI can't work together simultaneously
- **No style transfer** — Can't replicate an editing style from a reference video
- **No multi-track compositing** — Flat shot list, no layers/tracks/masks

The goal: build a system that's more powerful than CapCut, Adobe After Effects, and Premiere combined — with an AI director that makes creative decisions like a human editor.

---

## 2. Architecture Overview

**Polyglot services, each in the best language for its job:**

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│              WebGL/WebGPU Canvas + Timeline UI           │
│                    Simple + Pro modes                    │
├─────────────────────────────────────────────────────────┤
│                 API GATEWAY (TypeScript)                 │
│              Cloudflare Workers + D1/KV/R2              │
│                   Auth, routing, storage                 │
├─────────────────────────────────────────────────────────┤
│                REAL-TIME SERVER (Go)                     │
│            WebSocket co-editing, session mgmt            │
│              Operational Transform / CRDT                │
├─────────────────────────────────────────────────────────┤
│              AI DIRECTOR (Python)                        │
│   Content Analysis → Music Analysis → Style Transfer     │
│   → Creative Planning → Critique → Refinement            │
│   + User Learning + Memory (diffs, not snapshots)        │
├─────────────────────────────────────────────────────────┤
│              RENDER ENGINE (Rust)                        │
│        FFmpeg bindings + WASM for browser preview        │
│         GPU shader pipeline, multi-track compositing     │
├─────────────────────────────────────────────────────────┤
│              SHARED: EDL v5.1 (JSON)                     │
│        The lingua franca — all services read/write it    │
└─────────────────────────────────────────────────────────┘
```

**Platform: Hybrid**
- Cloudflare: API gateway, auth, storage (R2/D1/KV)
- Dedicated server: AI Director (Python), Render Engine (Rust), Real-time Server (Go)

---

## 3. EDL v5.1 — Video Intermediate Representation

The EDL is not just a timeline format. It's a **Creative Decision Graph** — a layered intermediate representation that captures planning, direction, execution, and analysis.

### 3.1 Layer Architecture

```
┌─────────────────────────────────────────────┐
│  STYLE LAYER                                 │
│  tokens, genre, recipes, constraints         │
├─────────────────────────────────────────────┤
│  CREATIVE LAYER                              │
│  entities, storyArc, emotionArc, moments,    │
│  intentChains, generativeSlots               │
├─────────────────────────────────────────────┤
│  EDITORIAL LAYER                             │
│  sequences, shotRelationships, rhythm        │
├─────────────────────────────────────────────┤
│  RUNTIME LAYER                               │
│  tracks, clips, effects, transitions,        │
│  colorScience                                │
├─────────────────────────────────────────────┤
│  CAPABILITIES LAYER                          │
│  engine limits, runtime constraints          │
├─────────────────────────────────────────────┤
│  ANALYSIS LAYER                              │
│  confidence, energyCurve, recipeAnalytics    │
└─────────────────────────────────────────────┘
```

### 3.2 Key Design Decisions

1. **Refs over inline** — Entities, recipes, detections referenced by ID (`$ref:subject_1`), not duplicated
2. **No resolved values** — `targetStrength: 0.6` not `"high" + 0.6`. Renderer resolves at build time
3. **Parametric recipes** — Recipes use `base` + `emotionScale` + `aggressionScale` to derive values from style tokens
4. **Dependency graph** — Each shot/element declares what it depends on for recomputation
5. **No engine tags in runtime** — Capabilities layer handles engine selection at build time

### 3.3 Style Tokens

Numeric values (0.0–1.0), no labels. UI derives labels automatically.

```json
{
  "aggression": 0.8,
  "cinematic": 0.7,
  "chaos": 0.4,
  "luxury": 0.9,
  "warmth": 0.6,
  "nostalgia": 0.3,
  "futurism": 0.5,
  "intimacy": 0.7,
  "epicness": 0.85,
  "playfulness": 0.2,
  "darkness": 0.3,
  "energy": 0.9
}
```

**Token influence map** — tokens drive generation:

```json
{
  "aggression": {
    "affects": ["cutFrequency", "shakeIntensity", "flashDuration", "speedRampRange", "zoomSpeed", "textAnimationSpeed"],
    "multiplier": "linear"
  },
  "cinematic": {
    "affects": ["depthOfField", "colorGradeIntensity", "filmGrainAmount", "vignetteStrength", "transitionSmoothness"],
    "multiplier": "linear"
  },
  "chaos": {
    "affects": ["glitchFrequency", "rgbSplitAmount", "flickerIntensity", "randomness"],
    "multiplier": "exponential"
  }
}
```

### 3.4 Parametric Recipes

Recipes are parameterized systems, not hardcoded packs:

```json
{
  "streetwear_reveal_v2": {
    "applicableWhen": { "emotion": "awe", "energy": 0.7, "genre": ["tiktok_edit"] },
    "parametric": {
      "glow": {
        "base": 0.6,
        "emotionScale": { "awe": 1.0, "exhilaration": 1.2, "calm": 0.5 },
        "aggressionScale": 0.4
      },
      "shake": {
        "base": 0.3,
        "emotionScale": { "awe": 1.0, "exhilaration": 1.3, "calm": 0.3 },
        "aggressionScale": 0.5
      }
    },
    "transition": { "type": "flash", "baseDuration": 0.15 },
    "camera": { "movement": "steadicam", "baseIntensity": 0.5 }
  }
}
```

Same recipe + different style tokens = different edit.

### 3.5 Moments

Editors don't think in shots. They think in moments:

```json
{
  "id": "moment_reveal",
  "start": 3, "end": 6,
  "purpose": "subject_reveal",
  "emotion": "awe",
  "energy": 0.7,
  "shots": ["shot_2"],
  "recipes": ["streetwear_reveal_v2"],
  "focusEntity": "$ref:subject_1",
  "attention": {
    "$ref:subject_1": { "weight": 1.0, "priority": "focus" },
    "background": { "weight": 0.2, "priority": "suppress" }
  }
}
```

AI operates at moment level: `moment_reveal.energy += 0.2` instead of modifying 8 effects.

### 3.6 Build Pipeline

```
EDL v5.1 (authored)
    ↓
[Recipe Expander] — parametric recipes → concrete effects (build artifact)
    ↓
[Capability Resolver] — checks engine capabilities, falls back
    ↓
[Strength Resolver] — targetStrength → engine-specific numeric intensity
    ↓
Resolved EDL (build artifact, not authored)
    ↓
[Renderer] — Canvas2D / FFmpeg / WebGL
```

Authored EDL never contains resolved values. Build pipeline produces them.

---

## 4. AI Director Service (Python)

### 4.1 Pipeline

```
User Prompt + Footage + Music
        ↓
┌─────────────────────────────────────────┐
│  1. Content Analysis                     │
│     Faces, objects, depth, motion,       │
│     scenes, composition, color, semantic │
│                                          │
│  2. Music Analysis                       │
│     BPM, beats, onsets, sections,        │
│     energy, vocals, frequency            │
│                                          │
│  3. Style Transfer                       │
│     Cut pattern, effects, transitions,   │
│     color, pacing, recipes               │
│                                          │
│  4. Creative Planning                    │
│     Story arc, moments, shot selection,  │
│     recipe assignment, emotion arc       │
│                                          │
│  5. Critique + Refinement                │
│     Beat sync, attention, constraints,   │
│     energy flow, dependencies            │
└─────────────────────────────────────────┘
        ↓
    EDL v5.1
```

### 4.2 Key Components

- **ContentAnalyzer** — Frame-by-frame vision (Gemini), depth (MiDaS), objects (YOLO), motion (optical flow), scenes (PySceneDetect)
- **MusicAnalyzer** — Beat grid (librosa), onsets, sections, energy curve, vocal detection
- **StyleTransfer** — Extracts editing DNA from reference videos, matches/generates recipes
- **CreativePlanner** — Makes editorial decisions, bakes all preferences before build
- **Critic** — Self-evaluates: beat sync, attention preservation, constraint compliance, energy flow
- **Refiner** — Iterative improvement loop (max 3 iterations)

### 4.3 User Learning

**UserStyleProfiler** — learns from user interactions:
- **Layer 1: Token-level** — coarse preferences (aggression, cinematic, etc.)
- **Layer 2: Path-level** — precise EDL path preferences (moment_resolution.duration)
- **Signal priority:** Refinement deltas (50%) > Accept/reject (30%) > Published (20%)
- **Cold start:** Cohort fallback (genre + platform peers) → blended → individual
- **Confidence-weighted blending** between cohort and individual profiles

**DirectorMemory** — global knowledge:
- **Recipe effectiveness** by genre/platform with Bayesian averaging
- **Similar edit matching** via vector search
- **Diff-based storage** — base + diffs, not full snapshots
- **Checkpointing** — every 10 diffs, O(10) reads max
- **Exploration** — 90/10 exploit/explore (4 proven + 1 wildcard per recipe set)

### 4.4 Refinement Flow

```
User: "make the reveal more aggressive"
    → moment_reveal.energy += 0.2
    → Recipe recalculated with higher aggression token
    → Parametric: glow 0.6 * 1.2 = 0.72
    → Critic re-evaluates
    → New EDL returned

User: "use the mrbeast style"
    → Load mrbeast_hook_v7 recipe set
    → Recipes replaced for applicable moments
    → Critic re-evaluates
    → New EDL returned
```

---

## 5. Render Engine (Rust)

### 5.1 Dual Rendering

- **Browser preview:** WASM compilation of Rust renderer → Canvas2D/WebGL
- **Server export:** Native Rust binary → FFmpeg bindings + GPU shaders

### 5.2 Multi-track Compositing

- Layer blending (normal, multiply, screen, overlay, etc.)
- Chroma key / green screen
- Depth-based masking
- Rotoscoping (manual + AI-assisted)
- 3D text with surface tracking

### 5.3 Effects Pipeline

- 43+ effects (blur, glow, shake, zoom, rgb_split, particle, liquid, etc.)
- Per-parameter keyframes
- Audio-reactive effects (bass → intensity)
- Physics simulations (particles, liquid, cloth)

---

## 6. Real-time Server (Go)

### 6.1 WebSocket Co-editing

- Multiple users edit simultaneously
- Operational Transform or CRDT for conflict resolution
- Low-latency state synchronization
- Session management

### 6.2 AI Co-pilot

- AI suggests next cuts in real-time
- User makes a cut, AI suggests the next one
- Conversational workflow

---

## 7. API Gateway (TypeScript on Cloudflare)

### 7.1 Routes

```
POST /api/v2/analyze          — Content + music analysis
POST /api/v2/style/extract    — Extract style from reference
POST /api/v2/plan             — Generate EDL from prompt
POST /api/v2/critique         — Evaluate EDL quality
POST /api/v2/refine           — Refine EDL based on feedback
POST /api/v2/remix            — Apply new style/tokens
POST /api/v2/recompute        — Recompute after dependency change
GET  /api/v2/user/profile     — User style profile
GET  /api/v2/user/history     — Edit history
GET  /api/v2/memory/similar   — Find similar past edits
```

### 7.2 Storage

- **R2:** Footage, music, renders, masks, depth maps
- **D1:** Intents, analyses, EDLs, user profiles, interaction history
- **KV:** Job status, upload tokens, sessions

---

## 8. Frontend (React + WebGL/WebGPU)

### 8.1 Dual Mode

- **Simple mode:** Shot-based timeline, drag-and-drop, presets
- **Pro mode:** Layer-based timeline, keyframes, masks, compositing

### 8.2 Real-time Preview

- WebGL/WebGPU canvas for effects rendering
- Seek-driven deterministic playback
- Audio-reactive visual feedback

### 8.3 Collaborative Editing

- WebSocket connection to real-time server
- Multiple cursors, presence indicators
- AI co-pilot suggestions inline

---

## 9. Implementation Order

### Phase 1: Foundation (Weeks 1-2)
1. EDL v5.1 schema package (TypeScript types + Zod validation)
2. Content Analyzer (Python) — frame extraction, face/object detection, depth, motion
3. Music Analyzer (Python) — beat detection, section segmentation, energy curve

### Phase 2: Director (Weeks 3-4)
4. Creative Planner (Python) — story arc, moments, shot selection
5. Critic + Refiner (Python) — self-evaluation, iterative improvement
6. Style Transfer (Python) — reference video analysis, recipe matching

### Phase 3: Rendering (Weeks 5-6)
7. Recipe Expander — parametric recipes → concrete effects
8. Canvas2D renderer (browser preview)
9. FFmpeg renderer (server export)

### Phase 4: Intelligence (Weeks 7-8)
10. User Style Profiler — learning from interactions
11. Director Memory — diff storage, checkpointing, similar edit search
12. Bandit exploration — recipe discovery

### Phase 5: Real-time (Weeks 9-10)
13. Go WebSocket server
14. CRDT/OT for concurrent edits
15. AI co-pilot real-time suggestions

### Phase 6: Polish (Weeks 11-12)
16. Frontend UI (simple + pro modes)
17. Multi-track compositing
18. 3D text, rotoscoping, advanced masking

---

## 10. Success Criteria

1. **First real edit:** One B-tier edit from real footage, end-to-end, that a creator would post
2. **Beat sync:** 95%+ of cuts aligned to musical beats
3. **Style transfer:** Reference video → matching edit in <60 seconds
4. **Refinement:** User can say "more aggression" and get a visibly different edit
5. **Performance:** Browser preview at 30fps, server export <2x realtime
6. **Learning:** After 5 edits, the system noticeably anticipates user preferences

---

## 11. Known Risks

1. **`semantic_understanding`, `extract_cut_pattern`, `select_shots`** — these are the core AI functions. If they don't produce good edits, the entire learning/recipe/token system is optimizing mediocrity.
2. **Rust WASM bundle size** — may need code splitting for browser preview
3. **Go WebSocket server** — new infrastructure to maintain
4. **Polyglot complexity** — 4 languages (TypeScript, Python, Rust, Go) means 4 toolchains

---

## 12. What We're NOT Building (Yet)

- 3D scene graph / full 3D compositing
- Real-time video generation (AI-generated footage)
- Collaborative editing with >10 users
- Mobile app (web-first)
