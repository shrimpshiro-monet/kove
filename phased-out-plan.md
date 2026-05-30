# Monet AI Director - Architecture Plan

## Strategic Focus: Core Loop First

**Critical insight**: This plan was dangerously close to overbuilding V1. The architecture below is now split into:

1. **CORE LOOP** (MVP - must work first) - The actual product that proves Monet works
2. **EXPANSION SYSTEMS** (post-MVP) - Future improvements after core loop is validated

**The moat is NOT rendering** - it's intent extraction, edit planning, creative reasoning, and refinement speed. Rendering just needs to be "good enough, deterministic, fast previews."

**Real product = iteration speed**: Users forgive imperfect first generations if refinement feels magical.

---

## Key Enhancements (Based on Feedback)

This plan incorporates critical architectural improvements:

1. **Edit Intent Layer**: New abstraction between user prompt and EDL generation
   - Extracts creative intent (goal, pacing, mood, energy curve, style)
   - Enables multi-variant EDL generation from same intent
   - Reduces refinement costs by 60% (tweak intent, not re-analyze)
   - Powers explainability: user sees *why* AI made decisions

2. **Transparent AI Reasoning**: Trust-building UX in Chat Mode
   - Show step-by-step thinking: intent parsing → analysis → planning
   - Ask clarifying questions before generating
   - Display segment previews, beat markers, confidence scores
   - Prove AI's decisions with visual evidence

3. **OpenReel Actions as Primary Format**: Not just engines
   - Import types, stores, action system from OpenReel
   - EDL converts to OpenReel Actions (full integration path)
   - FFmpeg only as fallback for unsupported features
   - Enables seamless Chat → Studio workflow

4. **Studio AI Assist Mode**: AI works in manual editor too
   - "Ask Monet" sidebar in Studio
   - Quick AI actions: auto color grade, sync to beats, suggest transitions
   - Generates OpenReel Actions user can preview/apply/reject
   - Hybrid: manual control + AI suggestions

5. **Custom Effects/Transitions Library**: User-created presets
   - Save custom effect chains and transitions
   - Share presets via JSON export/import
   - Community library (future)
   - Mix transitions + effects for unified custom transitions

6. **Full Audio Integration**: Not just beat detection
   - Audio ducking, voice isolation, noise reduction
   - 99+ audio effects from OpenReel's audio library
   - Export audio processing presets

7. **Genre-Agnostic Design**: Works for any edit category
   - Intent patterns for anime AMVs, sports, weddings, fan edits, trailers
   - Quality metrics per genre (beat sync, emotional resonance, style match)
   - Cross-genre learning improves all categories

8. **Additional Library Integration**: Best-in-class packages
   - Evaluate tone.js, gsap, lottie-web, fabric.js against OpenReel
   - Only add libraries that provide essential features or significant UX improvements
   - No duplicate functionality

## Context

Monet is **not a video editor** — it's an autonomous AI video director that collapses the entire filmmaking pipeline into conversational prompts. Users describe what they want ("make a 30s anime AMV cut to this song") and Monet analyzes footage, understands reference videos, detects beats, generates a complete edit plan, and renders the final video.

### The Problem
The current scaffold has:
- Chat UI with mock AI responses
- Studio timeline UI with no video rendering
- Zero integration between the two modes
- No video processing engine connected
- No AI backend for edit generation
- OpenReel Video (130k line professional editor) sitting unused in `/openreel-video/`

### The Goal
Build Monet's core intelligence system:
1. **Hybrid rendering**: Server-side AI analysis + client-side preview/rendering
2. **Extract & adapt OpenReel engines**: Pull VideoEngine, ExportEngine, and effects processors for AI-driven workflows
3. **Gemini 2.0 Flash backend**: Multimodal video analysis, beat detection, reference matching, edit plan generation
4. **Custom EDL schema**: AI-friendly JSON format that converts to OpenReel actions or FFmpeg commands

### User Decisions
- **Rendering approach**: Hybrid (upload for analysis, client-side for rendering)
- **OpenReel strategy**: Extract core engines + types/stores, adapt for AI workflow. Use OpenReel Actions as primary format, FFmpeg as fallback for unsupported features
- **AI backend**: Gemini 2.0 Flash (native video understanding)
- **EDL format**: Custom JSON schema with **Edit Intent Layer** (flexibility for AI generation + creative reasoning)
- **Additional libraries**: Integrate best-in-class packages for effects, transitions, audio (no-cost or essential-only)
- **Studio AI assistance**: Enable AI editing suggestions directly in Studio mode via automation/heuristics

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MONET FRONTEND                            │
│                     (TanStack Start + React)                     │
│                                                                  │
│  ┌──────────────────┐              ┌─────────────────────────┐ │
│  │   CHAT MODE      │              │     STUDIO MODE         │ │
│  │                  │◄─────────────┤                         │ │
│  │  User prompt     │  Import EDL  │  Manual timeline edit   │ │
│  │  Upload footage  │              │  OpenReel UI + Actions  │ │
│  │  Upload music    │              │  Full manual control    │ │
│  │  Upload ref video│              │                         │ │
│  │  View AI edit    │              │  AI ASSIST MODE:        │ │
│  │  Refine/tweak    ├─────────────►│  • Ask AI for tweaks   │ │
│  │                  │  Export to   │  • Auto color grade    │ │
│  │  THINKING LOGS:  │  Studio      │  • Smart transitions   │ │
│  │  • Analysis      │              │  • Beat sync helper    │ │
│  │  • Segment picks │              │                         │ │
│  │  • Intent decode │              │  Save custom effects/  │ │
│  └────────┬─────────┘              │  transitions library   │ │
│           │                        └───────────┬─────────────┘ │
│           └────────────┬───────────────────────┘               │
│                        │                                       │
└────────────────────────┼───────────────────────────────────────┘
                         │
         ┌───────────────▼──────────────────┐
         │   MONET RENDERING COORDINATOR    │
         │   (Decides: local vs server)     │
         │   Primary: OpenReel Actions      │
         │   Fallback: FFmpeg commands      │
         └───────────────┬──────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
┌───────────────────┐           ┌─────────────────────┐
│  CLIENT RENDERER  │           │  SERVER RENDERER    │
│  (Adapted OpenReel│           │  (FFmpeg Worker)    │
│   VideoEngine)    │           │                     │
│                   │           │  For heavy exports  │
│  • WebCodecs      │           │  • Full codec suite │
│  • WebGPU effects │           │  • Consistent output│
│  • Fast preview   │           │  • Parallel renders │
│  • Local export   │           │  • Cloudflare Queue │
└───────────────────┘           └─────────────────────┘
        │
        │
┌───────▼───────────────────────────────────────────────────────┐
│              MONET API (Cloudflare Workers)                    │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  POST /api/upload          → R2 storage + metadata extraction │
│  POST /api/analyze         → Gemini video analysis            │
│  POST /api/decode-intent   → Extract creative intent (NEW)    │
│  POST /api/generate-edl    → Gemini edit plan generation      │
│  POST /api/refine-edl      → EDL tweaks from user feedback    │
│  POST /api/studio-assist   → AI suggestions for Studio (NEW)  │
│  POST /api/render/server   → Queue FFmpeg render job          │
│  GET  /api/render/:id      → Poll render status               │
│                                                                │
└────────────────────────┬──────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
┌──────────────────┐            ┌─────────────────────┐
│  GEMINI SERVICE  │            │  STORAGE LAYER      │
│                  │            │                     │
│  • Video upload  │            │  • R2: raw footage  │
│  • Multimodal    │            │  • R2: renders      │
│    analysis      │            │  • D1: project meta │
│  • Beat detect   │            │  • KV: sessions     │
│  • Shot scoring  │            │                     │
│  • EDL synthesis │            │                     │
└──────────────────┘            └─────────────────────┘
```

---

## MVP Definition: The Core Loop

**Goal**: Prove Monet can consistently create edits that FEEL good with magical refinement.

### What MUST Work in V1

**The Complete Flow**:
```
Upload clips + music
  ↓
Extract intent (with clarifying questions)
  ↓
Analyze footage (segment scoring, beat detection)
  ↓
Generate simple EDL (cuts, speed, basic effects)
  ↓
Preview in browser (Canvas2D rendering)
  ↓
Refine via natural language ("faster", "hit harder on drop")
  ↓
Export 1080p MP4
```

**MVP Feature Set** (Core Loop Only):
- **Upload**: Clips (max 3), music track, optional reference video
- **Intent extraction**: Parse creative goal, pacing, mood, beat sync preference
- **Analysis**: Segment scoring (motion, emotion), beat grid generation
- **EDL generation**: Simple timeline with cuts, speed ramps, basic transforms (zoom, shake)
- **Effects (limited)**: Glow, shake, zoom pulse, brightness/contrast (4-5 max)
- **Transitions**: Cut, crossfade only (no complex transitions in V1)
- **Preview**: Canvas2D rendering (NOT WebGPU), 30fps, scrubbing
- **Refinement**: Intent-based tweaks ("faster cuts", "more energy", "sync tighter to beats")
- **Export**: Client-side 1080p MP4 via WebCodecs (no 4K, no server rendering)
- **Studio import**: Load EDL into OpenReel timeline (read-only preview, no editing yet)

**What's EXPLICITLY OUT OF SCOPE for MVP**:
- ❌ AI Studio Assist sidebar (expansion system)
- ❌ Custom effects/transitions library (expansion system)
- ❌ Multi-variant generation (expansion system, though architecture supports it)
- ❌ Server-side rendering (expansion system)
- ❌ Advanced audio effects beyond basic volume (expansion system)
- ❌ WebGPU rendering (Canvas2D is sufficient for MVP)
- ❌ Complex transitions (wipe, slide, zoom) (expansion system)
- ❌ Collaborative editing (expansion system)
- ❌ Community presets (expansion system)

**Success Criteria for MVP**:
1. User uploads 3 anime clips + song
2. Monet generates 30s AMV in <30 seconds total
3. Beat sync accuracy >80%
4. User says "make faster" → refinement in <5 seconds
5. Export completes in <60 seconds
6. Edit "feels good" (subjective but measurable via user testing)
7. 70%+ users would use again

**MVP Tech Stack**:
- **Rendering**: Use OpenReel AS-IS (wrapped, not extracted)
  - Create adapter layer: `MonetEDL → OpenReel Actions`
  - Feed Actions into OpenReel's existing engines
  - Extract engines only AFTER measuring bottlenecks
- **AI**: Gemini 2.0 Flash (intent + analysis + EDL generation)
- **Storage**: R2 for media, D1 for metadata, localStorage for client state
- **Client rendering**: OpenReel's Canvas2D fallback (simplest path)
- **Export**: OpenReel's ExportEngine (already works)

---

## Component Breakdown (MVP-Focused)

### 1. Frontend Architecture

#### Chat Mode Enhancements (`src/routes/chat_.$threadId.tsx`)
**Current state**: Mock AI replies, no video processing

**Changes needed**:
- Replace `mockReply()` with actual API calls to `/api/decode-intent` → `/api/analyze` → `/api/generate-edl`
- Add file upload handling (footage, music, reference video)
- **Show transparent AI reasoning** (trust-building UX):
  - **Stage 1: Intent Understanding**
    - "You want: a 30s anime AMV with high energy beats"
    - "Style reference detected: TikTok fan edit pacing"
    - "Goal: build tension → drop on chorus"
    - Show parsed intent JSON (expandable)
    - **Ask clarifying questions**: "Should I focus on action scenes or emotional moments?" with quick-reply buttons
  - **Stage 2: Analysis**
    - "Analyzing footage..." → progress bar
    - "Found 3 high-energy segments in clip 1 (timestamps: 0:05, 0:23, 1:14)"
    - Show thumbnail previews of selected segments
    - "Detecting beats at 128 BPM..." → waveform with beat markers
    - "Color palette: vibrant blues and oranges" → color swatches
  - **Stage 3: Planning**
    - "Building edit plan: 12 shots, avg 2.5s each"
    - "Aligning cuts to beat grid (84% sync confidence)"
    - Show draft timeline scrubber
  - **Stage 4: Confirmation**
    - "Ready to generate. This edit will be: [Fast-paced | Beat-synced | Action-focused]"
    - "Does this match your vision?" → Yes / Adjust buttons
- Preview pane showing generated edit timeline with scrubbing
- **Enhanced refinement UI**:
  - Natural language: "Make cuts faster", "More like the reference", "Hit harder on the drop"
  - Quick toggles: Faster/Slower cuts | More/Less effects | Tighter/Looser beat sync
  - Re-roll specific shots: Click shot → "Find better clip for this moment"
- Export button → triggers client or server render based on complexity
- **Nice-to-have preview features**:
  - Hover shot thumbnails to preview
  - Click beat markers to jump to moments
  - Side-by-side reference comparison
  - Export preview as GIF for sharing

**New components needed**:
- `<VideoUploader />` - Drag-drop for footage, music, reference
- `<IntentDecoder />` - Shows parsed creative intent with clarifying questions
- `<GeminiThinkingPanel />` - Real-time analysis status with segment previews
- `<EDLPreview />` - Interactive timeline with hover previews and scrubbing
- `<RefinementControls />` - Natural language + quick toggle refinements
- `<ShotRerollButton />` - Per-shot regeneration

**File paths**:
- Main: `src/routes/chat_.$threadId.tsx`
- Components: `src/components/chat/` (new directory)

---

#### Studio Mode Integration (`src/routes/studio_.$projectId.tsx`)
**Current state**: Placeholder timeline, no OpenReel integration

**Changes needed**:
- Import adapted OpenReel engines + types/stores (see section 2)
- Wire up VideoEngine for preview rendering
- Connect timeline clips to actual video playback
- Enable "Import from Chat" button → loads AI-generated EDL into manual timeline (converts to OpenReel Actions)
- Keep manual editing tools (effects, transitions, text) using OpenReel's action system
- **Add AI Assist Mode** (new sidebar panel):
  - "Ask Monet" chat interface within Studio
  - Quick AI actions:
    - "Auto color grade to match reference"
    - "Sync cuts to beat grid"
    - "Suggest transitions for selected clips"
    - "Find better clip for this moment"
    - "Remove silence from audio track"
  - AI generates OpenReel Actions that user can preview/apply/reject
  - Works via `/api/studio-assist` endpoint
- **Custom effects/transitions library**:
  - User can save custom effect chains as presets
  - "My Glitch Effect", "My Whip Pan Transition"
  - Share presets via export/import JSON
  - Community preset library (future)
- Export using client-side ExportEngine (OpenReel Actions → WebCodecs)

**Integration points**:
- `useStudioProjects()` → extend to include EDL field
- Timeline clips → convert to OpenReel Clip format
- Preview canvas → VideoEngine.renderFrame(time)
- Playback controls → PlaybackController.play/pause/seek

**File paths**:
- Main: `src/routes/studio_.$projectId.tsx`
- Engine adapter: `src/lib/openreel-adapter.ts` (new file)

---

#### Shared Infrastructure

**Rendering Coordinator** (`src/lib/rendering-coordinator.ts`, new file)
Decides whether to render client-side or server-side:
```typescript
interface RenderRequest {
  edl: MonetEDL;
  quality: 'preview' | '1080p' | '4k';
  format: 'mp4' | 'webm';
}

class RenderingCoordinator {
  async render(request: RenderRequest): Promise<Blob | JobId> {
    // Decision logic:
    // - Preview quality → always client
    // - 4K or long duration (>2min) → server
    // - Complex effects (>10 layers) → server
    // - Otherwise → client with fallback
  }
}
```

**Storage helpers** (`src/lib/storage.ts`, extend existing)
- Add `uploadToR2()` wrapper for Cloudflare R2
- Add `getSignedUrl()` for secure video access
- Extend `useChatThreads()` to include EDL and render status
- Extend `useStudioProjects()` to support AI-imported timelines

**File paths**:
- `src/lib/rendering-coordinator.ts` (new)
- `src/lib/storage.ts` (extend existing)
- `src/lib/api-client.ts` (new - typed fetch wrappers)

---

### 2. OpenReel Integration Strategy (Wrap, Don't Extract)

**Critical change**: DO NOT extract engines immediately. This is the highest technical risk.

**Problem with extraction**:
- Engines are likely coupled to stores, action dispatchers, event systems, renderer assumptions
- Could spend 2 weeks untangling hidden dependencies
- Risk rebuilding half a video editor accidentally

**Better approach**: Use OpenReel AS-IS first, then extract only proven bottlenecks.

#### Stage 1: Wrap OpenReel (MVP)

**Goal**: Get rendering working without surgery.

**Strategy**:
1. Import OpenReel packages as dependencies
2. Create thin adapter layer: `MonetEDL → OpenReel Project → OpenReel Actions`
3. Feed Actions into OpenReel's existing systems
4. Use OpenReel's rendering AS-IS

**File**: `src/lib/openreel-adapter.ts` (new)

```typescript
class OpenReelAdapter {
  async convertEDLToProject(edl: MonetEDL, mediaLibrary: MediaItem[]): Promise<Project> {
    // Map MonetEDL shots → OpenReel Clips
    // Map effects → OpenReel Effects
    // Map transitions → OpenReel Transitions
    // Return complete OpenReel Project structure
  }
  
  async renderPreview(project: Project, time: number): Promise<ImageBitmap> {
    // Call OpenReel's VideoEngine
    return await videoEngine.renderFrame(project, time);
  }
  
  async export(project: Project, settings: ExportSettings): Promise<Blob> {
    // Call OpenReel's ExportEngine
    return await exportEngine.export(project, settings);
  }
}
```

**What we import from OpenReel**:
- `@openreel/core` package (all engines)
- Types: `Project`, `Clip`, `Track`, `Effect`, `Transition`
- `VideoEngine` for preview rendering
- `ExportEngine` for export
- `AudioEngine` for beat detection (analysis phase)

**What we DON'T touch**:
- OpenReel UI components (we build our own)
- OpenReel state management (we use our own)
- OpenReel timeline editor (except for Studio mode import)

---

#### Stage 2: Measure Bottlenecks (Post-MVP)

After MVP works, profile performance:
- Preview frame render time
- Export speed
- Memory usage
- Bundle size

Only extract engines if:
- Rendering is provably too slow
- Bundle size is too large
- Specific feature is impossible via adapter

---

#### Stage 3: Extract Only Proven Bottlenecks (Expansion)

If profiling shows issues, extract surgically:
1. Identify specific engine (e.g., TransitionEngine is slow)
2. Extract that ONE engine only
3. Reimplement simplified version
4. Keep rest of OpenReel intact

**Never extract everything at once.**

---

#### MVP OpenReel Usage

For MVP, use these OpenReel components:

1. **AudioEngine**: Beat detection during analysis phase
2. **VideoEngine**: Canvas2D rendering for preview
3. **ExportEngine**: WebCodecs export to MP4
4. **Types**: Project, Clip, Track, Effect data structures

**OpenReel features NOT used in MVP**:
- ❌ Advanced transitions (just cut + crossfade)
- ❌ Nested sequences
- ❌ Adjustment layers
- ❌ Motion tracking
- ❌ Color grading (basic brightness/contrast only)
- ❌ Text/graphics (expansion system)
- ❌ Audio effects beyond volume (expansion system)

---

### 3. Edit Intent Layer (The Missing Abstraction)

**Critical architectural decision**: Before generating EDL, we extract **creative intent**.

This is the key differentiator that makes Monet a true AI director rather than a template generator.

#### Why Intent Layer Matters

**Current flow** (most AI editors):
```
User prompt → Analysis → EDL generation
```

**Problem**: AI has no reusable understanding of *why* it made decisions. Each refinement starts from scratch.

**Monet's flow**:
```
User prompt → Intent Extraction → Analysis → EDL generation
                     ↓
              (stored & reusable)
```

**Benefits**:
1. **Multiple render strategies**: Same intent → generate 3 EDL variations → user picks best
2. **Cheaper refinements**: "Make faster" tweaks intent → regenerate EDL (no re-analysis)
3. **Cross-genre learning**: Intent patterns from anime AMVs inform sports highlights
4. **Explainability**: User sees *why* AI made choices, builds trust
5. **Better prompts**: Gemini optimized for intent extraction (structured output) vs. messy EDL generation

#### Intent Schema

```typescript
interface EditIntent {
  version: string;                    // "1.0.0"
  
  goal: {
    primary: string;                  // "build tension before chorus drop"
    secondary?: string[];             // ["showcase character emotions", "fast pacing"]
  };
  
  targetAudience: {
    platform: 'tiktok' | 'youtube' | 'instagram' | 'twitter' | 'general';
    demographics?: string;            // "anime fans 16-24"
  };
  
  style: {
    genre: string;                    // "anime_amv" | "sports_highlight" | "wedding" | "cinematic_trailer"
    pacing: 'slow' | 'medium' | 'fast' | 'aggressive' | 'varied';
    mood: string[];                   // ["energetic", "emotional", "dark", "triumphant"]
    referenceStyle?: string;          // Extracted from reference video
  };
  
  structure: {
    duration: number;                 // Target seconds
    acts?: Act[];                     // Optional story beats
    energyCurve: number[];            // 0-1 values, one per second or beat
    climaxPoint?: number;             // Timestamp of peak moment
  };
  
  technical: {
    syncToBeat: boolean;              // Hard sync to music beats
    beatSyncStrength?: number;        // 0-1, how strict
    avgShotDuration?: number;         // Seconds, null = AI decides
    transitionStyle: 'cut' | 'smooth' | 'dynamic' | 'aggressive' | 'mixed';
    colorTreatment: 'vibrant' | 'cinematic' | 'vintage' | 'raw' | 'anime' | 'monochrome';
    effectsIntensity: number;         // 0-1
  };
  
  contentPreferences: {
    focusOn?: string[];               // ["face_closeups", "action_scenes", "landscape_shots"]
    avoid?: string[];                 // ["shaky_footage", "dark_scenes"]
    characters?: CharacterFocus[];    // For story-driven edits
  };
  
  constraints?: {
    mustInclude?: SegmentRef[];       // User-selected clips that must appear
    mustAvoid?: string[];             // "no slow-mo", "no text overlays"
    maxComplexity?: 'simple' | 'medium' | 'complex';  // Affects effects/layers
  };
}

interface Act {
  name: string;                       // "Intro", "Build-up", "Drop", "Outro"
  startTime: number;                  // Seconds into final edit
  duration: number;
  energy: number;                     // 0-1
  mood: string;
}

interface CharacterFocus {
  name: string;                       // "Naruto", "Sasuke"
  prominence: number;                 // 0-1, how much screen time
  emotionalArc?: string;              // "determined → victorious"
}

interface SegmentRef {
  clipId: string;
  inPoint: number;
  outPoint: number;
  reason?: string;                    // Why user wants this included
}
```

#### Example Intent (Anime AMV)

```json
{
  "version": "1.0.0",
  "goal": {
    "primary": "build tension through action sequences then explode on chorus drop",
    "secondary": ["showcase Naruto's determination", "fast-paced energy"]
  },
  "targetAudience": {
    "platform": "tiktok",
    "demographics": "anime fans 16-24"
  },
  "style": {
    "genre": "anime_amv",
    "pacing": "aggressive",
    "mood": ["energetic", "triumphant", "intense"],
    "referenceStyle": "tiktok_fan_edit_whip_pans"
  },
  "structure": {
    "duration": 30,
    "acts": [
      { "name": "Build-up", "startTime": 0, "duration": 18, "energy": 0.6, "mood": "intense" },
      { "name": "Drop", "startTime": 18, "duration": 12, "energy": 1.0, "mood": "explosive" }
    ],
    "energyCurve": [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.95, ...],
    "climaxPoint": 18.5
  },
  "technical": {
    "syncToBeat": true,
    "beatSyncStrength": 0.9,
    "avgShotDuration": 2.5,
    "transitionStyle": "aggressive",
    "colorTreatment": "anime",
    "effectsIntensity": 0.7
  },
  "contentPreferences": {
    "focusOn": ["face_closeups", "action_scenes", "power_up_moments"],
    "avoid": ["still_shots", "comedy_scenes"],
    "characters": [
      { "name": "Naruto", "prominence": 0.8, "emotionalArc": "determined → victorious" }
    ]
  }
}
```

#### How Intent Powers the System

**1. Intent Extraction API** (`/api/decode-intent`)
```typescript
// Input: user prompt + uploaded media references
POST /api/decode-intent
{
  "prompt": "Make a 30s anime AMV with high energy beats",
  "hasReferenceVideo": true,
  "hasMusicTrack": true
}

// Output: EditIntent JSON + clarifying questions
{
  "intent": { /* EditIntent object */ },
  "confidence": 0.85,
  "clarifyingQuestions": [
    {
      "question": "Should I focus on action scenes or emotional moments?",
      "options": ["Action-heavy", "Emotional arc", "Balanced mix"],
      "affectsField": "contentPreferences.focusOn"
    },
    {
      "question": "How aggressive should the pacing be?",
      "options": ["Fast cuts (<2s)", "Medium pacing (2-4s)", "Varied rhythm"],
      "affectsField": "technical.avgShotDuration"
    }
  ]
}
```

**2. Intent → Multiple EDLs**
```typescript
// Generate 3 variations from same intent
const intents = [
  { ...baseIntent, technical: { ...baseIntent.technical, transitionStyle: 'aggressive' } },
  { ...baseIntent, technical: { ...baseIntent.technical, transitionStyle: 'smooth' } },
  { ...baseIntent, structure: { ...baseIntent.structure, energyCurve: altCurve } }
];

const edls = await Promise.all(intents.map(intent => generateEDL(intent, analysis)));
// User picks favorite, or AI scores them and shows best
```

**3. Intent-Based Refinement**
```typescript
// User says: "Make cuts faster"
// Instead of re-generating full EDL:
const updatedIntent = {
  ...originalIntent,
  technical: {
    ...originalIntent.technical,
    avgShotDuration: originalIntent.technical.avgShotDuration * 0.7  // 30% faster
  }
};

// Regenerate EDL from updated intent (faster, uses cached analysis)
const refinedEDL = await generateEDL(updatedIntent, cachedAnalysis);
```

**4. Intent Presets**
```typescript
// Build library of proven intent patterns
const intentPresets = {
  "tiktok_anime_amv": { genre: "anime_amv", pacing: "aggressive", ... },
  "wedding_emotional": { genre: "wedding", pacing: "slow", mood: ["romantic", "nostalgic"], ... },
  "sports_highlight": { genre: "sports_highlight", pacing: "fast", focusOn: ["scoring_plays"], ... }
};

// User selects preset → auto-fill intent → faster generation
```

**5. Cross-Genre Learning**
```typescript
// Analyze successful edits to extract patterns
const successfulIntent = extractIntent(highRatedEDL);
// Use as training data for better intent understanding
// "When user says 'hype reel', they usually mean pacing='aggressive' + energyCurve peaking at 0.9"
```

**6. Edit DNA** (Post-MVP Expansion)

"Edit DNA" is a creative fingerprint - a quantified style signature.

```typescript
interface EditDNA {
  cutDensity: number;              // 0-1, how frequently cuts happen
  motionAggression: number;        // 0-1, camera motion intensity
  transitionRhythm: 'mechanical' | 'syncopated' | 'organic' | 'chaotic';
  emotionalCadence: 'rising' | 'falling' | 'wave' | 'plateau';
  visualChaos: number;             // 0-1, compositional variety
  colorTemperature: 'cool' | 'warm' | 'mixed';
  effectIntensity: number;         // 0-1, how heavy effects are
  beatAlignmentStrictness: number; // 0-1, how tightly synced to music
}
```

**Use cases**:
- **Style cloning**: User loves their AMV → extract DNA → apply to new footage
- **Style evolution**: User says "make it more aggressive" → increase motionAggression + cutDensity
- **Style mixing**: Blend DNA from 2 reference videos (70% reference A + 30% reference B)
- **Personalization**: Learn user's preferred DNA over time
- **Marketplace**: Users share/sell Edit DNA presets (future)

**Example**:
```json
{
  "name": "Aggressive Anime AMV",
  "dna": {
    "cutDensity": 0.82,
    "motionAggression": 0.71,
    "transitionRhythm": "syncopated",
    "emotionalCadence": "rising",
    "visualChaos": 0.63,
    "colorTemperature": "warm",
    "effectIntensity": 0.7,
    "beatAlignmentStrictness": 0.9
  }
}
```

**This becomes Monet's signature feature**: Creative embeddings for video editing.

---

### 4. Director Brain Layer (Cinematic Decision Engine)

**Critical missing piece**: Intent → EDL is too direct. We need an intermediate **editorial philosophy layer**.

This layer bridges creative goals (Intent) with mechanical execution (EDL).

#### What is the Director Brain?

The Director Brain is Monet's cinematic reasoning system. It:
- Translates abstract intent into concrete editorial decisions
- Scores shot combinations for continuity
- Evaluates pacing variance
- Ensures emotional beats align with structure
- Provides self-critique before finalizing EDL

**Flow**:
```
Intent → Director Brain → Edit Plan → EDL → OpenReel Actions
```

#### Edit Plan Schema

```typescript
interface EditPlan {
  version: string;
  
  narrativeFlow: {
    sequences: Sequence[];              // Story beats/acts
    emotionalArc: EmotionalMoment[];    // Key emotional moments
    climaxPoint: number;                // Timestamp of peak
  };
  
  pacingMap: {
    regions: PaceRegion[];              // Tempo changes
    avgShotDuration: number;            // Global average
    variance: number;                   // Pacing variety (0-1)
  };
  
  shotSelectionStrategy: {
    selectionCriteria: Criteria[];      // How to pick clips
    continuityRules: Rule[];            // Shot-to-shot coherence
    diversityTarget: number;            // Visual variety goal (0-1)
  };
  
  editingPhilosophy: {
    cutRhythm: 'mechanical' | 'musical' | 'narrative' | 'chaotic';
    transitionApproach: 'invisible' | 'stylized' | 'aggressive';
    visualTreatment: 'naturalistic' | 'stylized' | 'hyper';
    audioSync: 'strict' | 'loose' | 'offbeat';
  };
  
  scoring: {
    beatSyncScore: number;              // 0-1
    pacingCoherenceScore: number;       // 0-1
    emotionalImpactScore: number;       // 0-1
    visualDiversityScore: number;       // 0-1
    temporalContinuityScore: number;    // 0-1 (shot-to-shot)
    overallConfidence: number;          // 0-1
  };
}

interface Sequence {
  name: string;                         // "Build-up", "Drop", "Resolution"
  startTime: number;
  duration: number;
  purpose: string;                      // "build tension", "release energy"
  energy: number;                       // 0-1
  mood: string;
  shotCount: number;                    // How many shots
  visualStyle: string;                  // "close-ups", "wide shots", "mixed"
}

interface EmotionalMoment {
  time: number;
  intensity: number;                    // 0-1
  emotion: string;                      // "triumph", "despair", "excitement"
  clipId: string;                       // Which clip delivers this
  inPoint: number;
  outPoint: number;
  why: string;                          // Rationale
}

interface PaceRegion {
  startTime: number;
  endTime: number;
  tempo: 'slow' | 'medium' | 'fast' | 'frenetic';
  avgShotDuration: number;
  beatsPerShot: number;                 // Musical relationship
}

interface Criteria {
  metric: 'motion' | 'emotion' | 'brightness' | 'color_vibrance' | 'face_closeup';
  weight: number;                       // 0-1
  threshold?: number;
}

interface Rule {
  type: 'motion_continuity' | 'brightness_match' | 'color_harmony' | 'composition_balance';
  strictness: number;                   // 0-1, how hard to enforce
  penalty: number;                      // Score penalty for violation
}
```

#### Why Director Brain Matters

1. **Explainability**: User sees cinematic reasoning, not just technical choices
2. **Self-critique**: AI scores its own plan before generating EDL
3. **Variant generation**: Tweak `editingPhilosophy` → generate different edit approaches
4. **Training data**: Successful Edit Plans become learning corpus
5. **Refinement intelligence**: "Make faster" updates `pacingMap`, not random EDL tweaks

#### MVP Implementation

For MVP, Director Brain is **simplified**:
- Just `pacingMap` (shot durations aligned to beat grid)
- Just `shotSelectionStrategy.selectionCriteria` (motion + emotion scoring)
- Just `scoring.beatSyncScore` and `scoring.overallConfidence`

Full Director Brain (narrativeFlow, continuityRules, self-critique) is **expansion system**.

---

### 5. Scoring Systems (Self-Critique Engine)

**Critical insight**: AI systems become dramatically better once they can critique outputs.

Right now: generation exists. Evaluation barely exists.

#### Core Scoring Metrics

**For MVP**, implement these 3 scores:

1. **Beat Sync Quality** (0-1)
   ```typescript
   function scoreBeatSync(edl: MonetEDL, beatGrid: number[]): number {
     let hits = 0;
     let total = edl.shots.length;
     
     for (const shot of edl.shots) {
       const nearestBeat = findNearestBeat(shot.timing.startTime, beatGrid);
       const offset = Math.abs(shot.timing.startTime - nearestBeat);
       if (offset < 0.05) hits++;  // Within 50ms = hit
     }
     
     return hits / total;
   }
   ```

2. **Pacing Variance** (0-1)
   ```typescript
   function scorePacingVariance(edl: MonetEDL): number {
     const durations = edl.shots.map(s => s.timing.duration);
     const stdDev = calculateStdDev(durations);
     const mean = calculateMean(durations);
     
     // Coefficient of variation (normalized)
     const cv = stdDev / mean;
     
     // 0 = all shots same length (boring)
     // 1 = high variety (dynamic)
     return Math.min(cv / 0.5, 1.0);  // Normalize to 0-1
   }
   ```

3. **Overall Confidence** (0-1)
   ```typescript
   function scoreOverallConfidence(
     beatSyncScore: number,
     segmentQuality: number[],    // Per-clip quality scores from analysis
     intentMatch: number           // How well EDL matches intent
   ): number {
     const avgSegmentQuality = mean(segmentQuality);
     
     return (
       beatSyncScore * 0.4 +
       avgSegmentQuality * 0.3 +
       intentMatch * 0.3
     );
   }
   ```

**Display to user**:
```
✓ Beat sync: 87% (excellent)
✓ Pacing variety: 72% (dynamic)
✓ Overall confidence: 81%
```

#### Post-MVP Scoring (Expansion Systems)

4. **Temporal Continuity** (shot-to-shot coherence)
   ```typescript
   function scoreTemporalContinuity(shots: Shot[], footage: Footage[]): number {
     let continuityScore = 0;
     
     for (let i = 0; i < shots.length - 1; i++) {
       const shotA = shots[i];
       const shotB = shots[i + 1];
       
       // Compare adjacent shots
       const brightnessDiff = Math.abs(shotA.avgBrightness - shotB.avgBrightness);
       const motionDiff = Math.abs(shotA.motion Vector - shotB.motionVector);
       const colorDiff = calculateColorDistance(shotA.dominantColor, shotB.dominantColor);
       
       // Penalize jarring transitions
       const penalty = (
         (brightnessDiff > 0.3 ? 0.2 : 0) +
         (motionDiff > 0.5 ? 0.3 : 0) +
         (colorDiff > 0.4 ? 0.2 : 0)
       );
       
       continuityScore += (1 - penalty);
     }
     
     return continuityScore / (shots.length - 1);
   }
   ```

5. **Motion Continuity**: Penalize opposing motion directions
6. **Transition Smoothness**: Evaluate visual flow across cuts
7. **Emotional Intensity Matching**: Does clip emotion match intended beat?
8. **Visual Diversity**: Avoid repetitive shots
9. **Clip Repetition Penalties**: Don't reuse same clip too often
10. **Reference Similarity** (if reference video provided): Style match score

#### Using Scores

**Generation-time**:
- Generate 3 EDL variants
- Score each
- Return highest-scoring one (or all 3 for user choice)

**Refinement-time**:
- User says "make faster"
- Generate new EDL
- Compare scores: beatSyncScore maintained? Confidence improved?
- If scores drop, retry with adjusted parameters

**User feedback loop**:
- "Was this edit good?" → thumbs up/down
- Store successful Edit Plans + scores
- Learn patterns: "High beatSyncScore + high pacingVariance = anime AMV success"

---

### 6. Monet EDL Schema (Custom JSON Format)

The Edit Decision List is the AI's blueprint. It must be:
- Simple for Gemini to generate
- Rich enough to express cinematic intent
- Convertible to OpenReel actions (primary) or FFmpeg commands (fallback)

#### Schema Design

```typescript
interface MonetEDL {
  version: string;                    // "1.0.0"
  metadata: {
    title: string;
    createdAt: number;
    aiModel: string;                  // "gemini-2.0-flash"
    prompt: string;                   // User's original request
  };
  
  timeline: {
    resolution: { width: number; height: number };  // e.g. 1920x1080
    fps: number;                                     // 30, 60, etc.
    duration: number;                                // Total seconds
  };
  
  music?: {
    sourceId: string;                  // Reference to uploaded music file
    bpm: number;                       // Detected beats per minute
    beatGrid: number[];                // Timestamps of beats [0.5, 1.0, 1.5, ...]
    volume: number;                    // 0-1
    fadeIn?: number;                   // Seconds
    fadeOut?: number;                  // Seconds
  };
  
  shots: Shot[];                       // Ordered list of shots
  
  globalEffects?: {
    colorGrade?: ColorGradePreset;     // "cinematic", "vibrant", "vintage"
    vignette?: number;                 // 0-1
    grain?: number;                    // 0-1
  };
}

interface Shot {
  id: string;
  
  source: {
    clipId: string;                    // Reference to uploaded footage
    inPoint: number;                   // Trim start (seconds into source clip)
    outPoint: number;                  // Trim end
  };
  
  timing: {
    startTime: number;                 // Position on main timeline
    duration: number;                  // Actual duration on timeline
    speed?: number;                    // 1.0 = normal, 0.5 = slow-mo, 2.0 = fast
  };
  
  transform?: {
    position?: { x: number; y: number };  // -1 to 1 (normalized)
    scale?: number;                       // 1.0 = 100%
    rotation?: number;                    // Degrees
    crop?: { top: number; bottom: number; left: number; right: number };  // 0-1
  };
  
  effects?: Effect[];
  
  transition?: {
    type: 'cut' | 'crossfade' | 'whip_pan' | 'dip_black' | 'zoom' | 'slide';
    duration: number;                  // Seconds
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  };
  
  beatLock?: {
    beatIndex: number;                 // Which beat to align to
    lockMode: 'start' | 'end' | 'center';  // Align shot start/end/center to beat
  };
  
  aiRationale?: string;                // Why AI chose this shot (for user transparency)
}

interface Effect {
  type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'glow' | 'shake' | 'zoom_pulse';
  intensity: number;                   // 0-1
  startTime?: number;                  // Effect start within shot (seconds)
  duration?: number;                   // Effect duration (if not full shot)
  params?: Record<string, number>;     // Effect-specific parameters
}

type ColorGradePreset = 
  | 'cinematic'        // Teal & orange, low saturation
  | 'vibrant'          // High saturation, punchy
  | 'vintage'          // Faded, warm tones
  | 'monochrome'       // Black & white
  | 'anime'            // High contrast, saturated primaries
  | 'raw';             // No grading

```

#### Example EDL (30s Anime AMV)

```json
{
  "version": "1.0.0",
  "metadata": {
    "title": "Naruto AMV - Bring Me to Life",
    "createdAt": 1735430400000,
    "aiModel": "gemini-2.0-flash",
    "prompt": "Make a 30s anime AMV cut to this song"
  },
  "timeline": {
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "duration": 30.0
  },
  "music": {
    "sourceId": "music_abc123",
    "bpm": 140,
    "beatGrid": [0.43, 0.86, 1.29, 1.72, ...],
    "volume": 0.8,
    "fadeIn": 0.5
  },
  "shots": [
    {
      "id": "shot_1",
      "source": {
        "clipId": "clip_xyz789",
        "inPoint": 5.2,
        "outPoint": 7.1
      },
      "timing": {
        "startTime": 0.0,
        "duration": 1.9
      },
      "transform": {
        "scale": 1.2
      },
      "effects": [
        { "type": "glow", "intensity": 0.6 }
      ],
      "transition": {
        "type": "whip_pan",
        "duration": 0.2
      },
      "beatLock": {
        "beatIndex": 0,
        "lockMode": "start"
      },
      "aiRationale": "Opening with intense eye close-up, synced to first beat"
    },
    {
      "id": "shot_2",
      "source": {
        "clipId": "clip_xyz789",
        "inPoint": 12.5,
        "outPoint": 14.8
      },
      "timing": {
        "startTime": 1.9,
        "duration": 2.3,
        "speed": 0.8
      },
      "effects": [
        { "type": "shake", "intensity": 0.4, "startTime": 0.5, "duration": 0.3 }
      ],
      "beatLock": {
        "beatIndex": 4,
        "lockMode": "start"
      },
      "aiRationale": "Slow-mo power-up scene, shake on impact frame"
    }
  ],
  "globalEffects": {
    "colorGrade": "anime",
    "vignette": 0.3,
    "grain": 0.1
  }
}
```

#### EDL Conversion Logic

**File**: `packages/monet-renderer/src/edl-converter.ts`

```typescript
class EDLConverter {
  toOpenReelProject(edl: MonetEDL, mediaLibrary: MediaItem[]): Project {
    // Convert MonetEDL → OpenReel Project structure
    // - Create Timeline with single video track
    // - Convert shots[] → Clips with transforms, effects
    // - Apply beatLock timing
    // - Set globalEffects as track-level adjustments
  }
  
  toFFmpegFilterGraph(edl: MonetEDL): string {
    // For server-side rendering
    // Generate FFmpeg complex filter string
    // Handle transitions, effects, audio mixing
  }
}
```

---

### 4. Backend API Architecture

**Platform**: Cloudflare Workers (already configured in `wrangler.jsonc`)

**Storage**:
- **R2** (object storage): Raw footage, music, reference videos, rendered outputs
- **D1** (SQLite): Project metadata, EDL JSON, user sessions
- **KV** (key-value): Render job status, temporary upload tokens

#### API Endpoints

##### `POST /api/upload`
**Purpose**: Upload footage, music, or reference video

**Flow**:
1. Client requests signed upload URL
2. Direct upload to R2 (large file support)
3. Extract metadata (duration, resolution, codec)
4. Store metadata in D1
5. Return `{ fileId, duration, resolution }`

**Implementation**: `src/server/api/upload.ts` (new file)

---

##### `POST /api/analyze`
**Purpose**: Send footage/music/reference to Gemini for analysis

**Request**:
```json
{
  "footageIds": ["clip_1", "clip_2"],
  "musicId": "music_1",
  "referenceId": "ref_video_1",
  "prompt": "Make a 30s hype reel"
}
```

**Flow**:
1. Fetch files from R2
2. Upload to Gemini Files API
3. Call Gemini 2.0 Flash with multimodal prompt:
   - Analyze footage: scene detection, motion scoring, emotional beats
   - Analyze music: BPM, beat grid, chorus detection
   - Analyze reference: pacing, transition style, color palette
4. Return structured JSON analysis

**Response**:
```json
{
  "footage": [
    {
      "clipId": "clip_1",
      "segments": [
        { "start": 5.2, "end": 7.1, "score": 0.95, "description": "Intense close-up" }
      ]
    }
  ],
  "music": {
    "bpm": 140,
    "beatGrid": [0.43, 0.86, ...],
    "structure": { "intro": [0, 8], "verse": [8, 24], "chorus": [24, 40] }
  },
  "reference": {
    "avgShotDuration": 1.8,
    "transitionStyle": "whip_pan",
    "colorPalette": "vibrant"
  }
}
```

**Implementation**: `src/server/api/analyze.ts` (new file)

---

##### `POST /api/generate-edl`
**Purpose**: Generate full edit plan from analysis

**Request**:
```json
{
  "analysis": { /* from /api/analyze */ },
  "prompt": "Make a 30s hype reel",
  "preferences": {
    "duration": 30,
    "style": "aggressive",
    "musicSync": true
  }
}
```

**Flow**:
1. Construct prompt for Gemini:
   - "You are a professional video editor. Based on this footage analysis, create a beat-synced edit plan..."
   - Include analysis data
   - Include reference style if provided
   - Request structured JSON output (MonetEDL schema)
2. Call Gemini with JSON mode
3. Validate EDL schema
4. Store EDL in D1
5. Return EDL

**Response**: Full `MonetEDL` object

**Implementation**: `src/server/api/generate-edl.ts` (new file)

---

##### `POST /api/refine-edl`
**Purpose**: Tweak existing EDL based on user feedback

**Request**:
```json
{
  "edlId": "edl_123",
  "feedback": "Make cuts faster, more like the reference"
}
```

**Flow**:
1. Fetch original EDL from D1
2. Call Gemini with refinement prompt:
   - "Here's the current edit plan. The user wants: [feedback]. Adjust the EDL."
3. Return updated EDL

**Response**: Updated `MonetEDL`

**Implementation**: `src/server/api/refine-edl.ts` (new file)

---

##### `POST /api/render/server`
**Purpose**: Queue server-side render job (for heavy exports)

**Request**:
```json
{
  "edlId": "edl_123",
  "quality": "4k",
  "format": "mp4"
}
```

**Flow**:
1. Enqueue job in Cloudflare Queue
2. Worker processes job:
   - Fetch footage from R2
   - Convert EDL to FFmpeg command
   - Render video
   - Upload to R2
3. Update job status in KV

**Response**: `{ jobId: "job_456" }`

**Implementation**: 
- `src/server/api/render.ts` (API handler)
- `src/server/workers/render-worker.ts` (queue consumer)

---

##### `GET /api/render/:jobId`
**Purpose**: Poll render job status

**Response**:
```json
{
  "status": "processing",
  "progress": 0.65,
  "estimatedTimeRemaining": 45,
  "downloadUrl": null
}
```

**Implementation**: `src/server/api/render-status.ts`

---

### 5. Gemini Integration

**Service**: `src/server/services/gemini.ts` (new file)

```typescript
class GeminiService {
  async uploadFile(blob: Blob): Promise<string> {
    // Use Gemini Files API
  }
  
  async analyzeFootage(fileId: string): Promise<FootageAnalysis> {
    // Call Gemini 2.0 Flash with video understanding
    // Prompt: "Analyze this footage. Identify high-energy segments, facial expressions, camera motion..."
  }
  
  async detectBeats(audioFileId: string): Promise<BeatGrid> {
    // Gemini can analyze audio for BPM and beat timestamps
  }
  
  async generateEDL(params: EDLGenerationParams): Promise<MonetEDL> {
    // Main AI director logic
    // Prompt includes:
    // - Footage analysis
    // - Music beat grid
    // - Reference style (if provided)
    // - User prompt
    // Request structured JSON output
  }
  
  async refineEDL(edl: MonetEDL, feedback: string): Promise<MonetEDL> {
    // Iterative refinement
  }
}
```

**Prompts**:
Store in `src/server/prompts/` as separate files for versioning:
- `analyze-footage.txt`
- `detect-beats.txt`
- `generate-edl.txt`
- `refine-edl.txt`

---

### 6. Database Schema (D1)

```sql
-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Media uploads
CREATE TABLE media_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'footage', 'music', 'reference'
  r2_key TEXT NOT NULL,
  duration REAL,
  resolution TEXT,
  metadata TEXT,  -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Edit decision lists
CREATE TABLE edls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  data TEXT NOT NULL,  -- MonetEDL JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Render jobs
CREATE TABLE render_jobs (
  id TEXT PRIMARY KEY,
  edl_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'queued', 'processing', 'complete', 'failed'
  progress REAL DEFAULT 0,
  output_r2_key TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (edl_id) REFERENCES edls(id)
);
```

**Migration file**: `src/server/migrations/001_initial.sql` (new)

---

### 7. Client-Side Rendering (Adapted OpenReel)

**File**: `packages/monet-renderer/src/client-renderer.ts` (new)

```typescript
class MonetClientRenderer {
  private videoEngine: VideoEngine;
  private exportEngine: ExportEngine;
  private converter: EDLConverter;
  
  async preview(edl: MonetEDL, time: number): Promise<ImageBitmap> {
    // Render single frame at given time
    // 1. Convert EDL to OpenReel Project
    // 2. Call videoEngine.renderFrame(time)
    // 3. Apply effects from EDL
    // 4. Return frame
  }
  
  async export(edl: MonetEDL, options: ExportOptions): Promise<Blob> {
    // Full video export
    // 1. Convert EDL to Project
    // 2. Call exportEngine.export(project, options)
    // 3. Show progress via callback
    // 4. Return video Blob
  }
}
```

**Integration with Studio mode**:
- `useMonetRenderer()` hook in `src/hooks/use-monet-renderer.ts` (new)
- Manages WebCodecs initialization, frame caching
- Provides `renderFrame(time)` and `exportVideo(edl, quality)` methods

---

### 8. File Structure (After Implementation)

```
monet-ai-story/
├── src/
│   ├── routes/
│   │   ├── chat_.$threadId.tsx        (MODIFY - add upload, API calls, preview)
│   │   └── studio_.$projectId.tsx     (MODIFY - integrate renderer)
│   ├── components/
│   │   ├── chat/                      (NEW)
│   │   │   ├── VideoUploader.tsx
│   │   │   ├── GeminiThinkingPanel.tsx
│   │   │   ├── EDLPreview.tsx
│   │   │   └── RefinementControls.tsx
│   │   └── studio/                    (NEW)
│   │       ├── TimelineView.tsx       (integrated with renderer)
│   │       └── PreviewCanvas.tsx
│   ├── hooks/
│   │   ├── use-monet-renderer.ts      (NEW)
│   │   └── use-render-coordinator.ts  (NEW)
│   ├── lib/
│   │   ├── api-client.ts              (NEW - typed fetch wrappers)
│   │   ├── rendering-coordinator.ts   (NEW - client vs server decision)
│   │   ├── openreel-adapter.ts        (NEW - EDL conversion)
│   │   └── storage.ts                 (MODIFY - add R2 helpers)
│   ├── server/
│   │   ├── api/                       (NEW)
│   │   │   ├── upload.ts
│   │   │   ├── analyze.ts
│   │   │   ├── generate-edl.ts
│   │   │   ├── refine-edl.ts
│   │   │   ├── render.ts
│   │   │   └── render-status.ts
│   │   ├── services/                  (NEW)
│   │   │   ├── gemini.ts
│   │   │   └── ffmpeg.ts
│   │   ├── workers/                   (NEW)
│   │   │   └── render-worker.ts
│   │   ├── prompts/                   (NEW)
│   │   │   ├── analyze-footage.txt
│   │   │   ├── detect-beats.txt
│   │   │   ├── generate-edl.txt
│   │   │   └── refine-edl.txt
│   │   └── migrations/                (NEW)
│   │       └── 001_initial.sql
│   └── server.ts                      (MODIFY - add API routes)
├── packages/
│   └── monet-renderer/                (NEW - extracted OpenReel engines)
│       ├── src/
│       │   ├── engines/
│       │   │   ├── video-engine.ts
│       │   │   ├── export-engine.ts
│       │   │   ├── effects-engine.ts
│       │   │   └── transition-engine.ts
│       │   ├── edl-converter.ts
│       │   ├── client-renderer.ts
│       │   ├── types.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── openreel-video/                    (REFERENCE - mine for engines)
└── wrangler.jsonc                     (MODIFY - add R2, D1, Queue bindings)
```

---

## Implementation Phases (MVP-First)

**Goal**: Prove the Core Loop works. Ship fast, iterate based on real usage.

### Phase 1: Backend Foundation (Week 1)
1. Set up Cloudflare bindings in `wrangler.jsonc` (R2, D1 only - NO Queues yet)
2. Create D1 database schema (`001_initial.sql`) - minimal tables only
3. Implement `/api/upload` endpoint with R2 integration
4. Implement `GeminiService` with basic file upload
5. Test video upload → R2 → Gemini Files API flow

**Verification**: Can upload a video file, get it into R2, and reference it in Gemini

**Skip for MVP**: Server render queues, complex job status tracking

---

### Phase 2: Intent Extraction (Week 1-2)
**NEW: Critical first step**

1. Design EditIntent schema (MVP version - simplified)
2. Write Gemini prompt for intent extraction (`decode-intent.txt`)
3. Implement `/api/decode-intent` endpoint
4. Generate clarifying questions when confidence is low
5. Test with various prompts ("anime AMV", "hype reel", "wedding video")

**Verification**: Given user prompt, get back EditIntent JSON with confidence score and optional clarifying questions

---

### Phase 3: AI Analysis Pipeline (Week 2)
1. Write Gemini prompts for footage analysis (`analyze-footage.txt`)
2. Implement `/api/analyze` endpoint
3. Test beat detection with music files (via OpenReel's AudioEngine)
4. Test footage segment scoring (motion + emotion only for MVP)
5. Cache analysis results in D1 for refinement reuse

**Verification**: Given footage + music, get back structured analysis JSON with segment scores and beat grid

**Skip for MVP**: Reference video style extraction (expansion), advanced scoring

---

### Phase 4: EDL Generation with Scoring (Week 2-3)
1. Design MonetEDL schema (MVP version - simple effects only)
2. Implement basic scoring functions (beatSyncScore, pacingVariance, confidence)
3. Write Gemini prompt for EDL generation (`generate-edl.txt`)
4. Implement `/api/generate-edl` endpoint with scoring
5. Test with anime AMV, sports highlight, fan edit

**Verification**: Given intent + analysis, get back valid MonetEDL with scores displayed

**Skip for MVP**: Director Brain layer (expansion), multi-variant generation (expansion), temporal continuity scoring (expansion)

---

### Phase 5: OpenReel Adapter (Week 3)
**CRITICAL: Wrap, don't extract**

1. Add OpenReel packages as dependencies (`@openreel/core`, `@openreel/web`)
2. Create `src/lib/openreel-adapter.ts` adapter layer
3. Implement `convertEDLToProject(edl) → OpenReel Project`
4. Test conversion with sample EDL
5. Verify OpenReel can load converted project

**Verification**: Given MonetEDL, generate valid OpenReel Project structure

**DO NOT**: Extract engines, modify OpenReel code, create new packages yet

---

### Phase 6: Preview Rendering (Week 3)
1. Wire up OpenReel's VideoEngine (Canvas2D mode) via adapter
2. Implement `renderFrame(project, time) → ImageBitmap`
3. Build simple canvas preview component
4. Add scrubbing controls
5. Test with generated EDL

**Verification**: Given EDL, render and scrub preview in browser

**Skip for MVP**: WebGPU rendering, advanced caching, real-time playback optimization

---

### Phase 7: Chat Mode Integration (Week 3-4)
1. Build `<VideoUploader />` component (simple drag-drop)
2. Build `<IntentDecoder />` - shows parsed intent + clarifying questions
3. Build `<GeminiThinkingPanel />` - shows analysis progress with segment previews
4. Wire up API calls: decode-intent → analyze → generate-edl
5. Build `<EDLPreview />` - timeline viz with scores
6. Integrate preview rendering via OpenReel adapter
7. Add simple export button (client-side only)

**Verification**: Upload 3 clips + music → prompt → see intent → see analysis → preview edit → export MP4

**Skip for MVP**: Advanced refinement UI (keep it simple: text input only), hover previews, side-by-side reference comparison

---

### Phase 7B: Aesthetic Dissection Module (Week 4) 🎯 VIRAL FEATURE
**The "Edit by Text" magic moment** - Gemini's suggestion for zero-cost differentiation

This is THE feature that makes Monet feel impossible. Users will screen-record this and it'll go viral.

#### Why This Goes Here
- Phase 7 already has timeline preview + EDL rendering working
- Zero disruption to Phase 2-6 momentum
- Free APIs (Gemini Flash transcription or Groq Whisper)
- Feeds into existing MonetEDL structure (just adds transcript metadata)
- High viral potential (text-based editing = accessibility + speed)

#### What Gets Built

**1. Audio Transcription Pipeline** (Backend)
```typescript
// src/server/api/transcribe.ts (NEW)
async function transcribeAudio(audioFileId: string): Promise<Transcript> {
  // Strip audio from video via FFmpeg
  // Send to Gemini Flash or Groq Whisper (FREE)
  // Request WORD-LEVEL timestamps
  
  return {
    words: [
      { text: "Create", start_ms: 0, end_ms: 420, confidence: 0.98 },
      { text: "the", start_ms: 420, end_ms: 520, confidence: 0.99 },
      { text: "future", start_ms: 520, end_ms: 1100, confidence: 0.97 }
    ],
    intensity_scores: [0.3, 0.2, 0.8]  // Voice intensity per word (from audio analysis)
  };
}
```

**2. Extend MonetEDL Schema**
```typescript
interface Shot {
  // ... existing fields
  transcript?: {
    words: Word[];
    intensity_scores: number[];
  };
}

interface Word {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}
```

**3. Text-Based Timeline Editor** (Frontend)
```tsx
// src/components/chat/TextTimeline.tsx (NEW)
export function TextTimeline({ edl, onEdit }) {
  // Render transcript as editable text
  // Each word is a clickable span with timestamp metadata
  
  const handleWordDelete = (word: Word) => {
    // Calculate Δt = word.end_ms - word.start_ms
    // Splice those milliseconds out of EDL.shots
    // Update timeline preview instantly (just JSON mutation, no re-render)
  };
  
  return (
    <div className="text-timeline">
      {edl.shots.flatMap(shot => 
        shot.transcript?.words.map(word => (
          <span 
            key={word.start_ms}
            onClick={() => jumpToTimestamp(word.start_ms)}
            onDelete={() => handleWordDelete(word)}
            className="editable-word"
          >
            {word.text}
          </span>
        ))
      )}
    </div>
  );
}
```

**4. Kinetic Typography Mode** (A24 Aesthetic)
```typescript
// When user selects "Cinematic Minimalist" style preset
// Phase 7's EDL generator creates TEXT-ONLY shots

interface KineticTypographyShot {
  type: "text";
  words: Word[];
  style: {
    font: "SF Pro Display";
    weight: intensity_score > 0.7 ? "bold" : "regular";
    scale: 1.0 + (intensity_score * 0.5);  // Louder words = bigger
    blur: intensity_score < 0.3 ? 2 : 0;    // Quiet words = subtle blur
    color: "#FFFFFF";
    background: "#000000";
  };
}
```

#### Implementation Steps

**Step 1: Transcription API** (2-3 hours)
1. Add `/api/transcribe` endpoint
2. Strip audio via FFmpeg (already have for beat detection)
3. Call Gemini Flash with audio file (or Groq Whisper)
4. Parse word-level timestamps
5. Store in D1 alongside analysis results

**Step 2: EDL Schema Extension** (1 hour)
1. Add `transcript` field to `Shot` interface
2. Update EDL generation to include transcript if available
3. Update deterministic fallback to handle transcript data

**Step 3: Text Timeline UI** (3-4 hours)
1. Build `<TextTimeline />` component
2. Render words as editable spans
3. Wire up delete → EDL mutation → preview update
4. Add jump-to-timestamp on word click
5. Show intensity visualization (word size/color)

**Step 4: Kinetic Typography Renderer** (4-5 hours)
1. Detect "text-only" mode in EDL
2. Generate TextLayer OpenReel actions instead of video clips
3. Map intensity_scores to CSS transforms (scale, blur, opacity)
4. Render preview in canvas

#### User Experience Flow

```
User uploads video with voiceover
  ↓
[Phase 7] EDL generated with visual timeline
  ↓
User clicks "Edit by Text" tab
  ↓
Transcript appears (word-level timestamps)
  ↓
User backspaces "um" and "uh" filler words
  ↓
Timeline instantly updates (those milliseconds gone)
  ↓
User selects "Kinetic Typography" preset
  ↓
Video preview switches to text-on-black with dynamic scaling
  ↓
Export → viral TikTok of the feature itself
```

#### Why This Is MVP-Compatible

**Zero new infrastructure:**
- Uses existing FFmpeg pipeline (already needed for beat detection)
- Uses existing Gemini API (already configured)
- Uses existing MonetEDL structure (just adds metadata)
- Uses existing OpenReel rendering (just adds TextLayer support)

**Zero cost:**
- Gemini Flash transcription: FREE (or Groq Whisper: FREE)
- Audio analysis for intensity: FREE (part of existing analysis)
- Processing: Client-side JSON mutations

**High ROI:**
- Accessibility: Deaf/HOH creators can edit by text
- Speed: Editing text is 10x faster than scrubbing
- Viral factor: Screen-record this, get 1M views
- Differentiation: NO other AI editor has this

#### Success Criteria

- User can delete words from transcript → timeline updates instantly
- Kinetic typography mode renders text with dynamic scaling
- Export works with text-only EDLs
- Processing time: <5 seconds for 30s video transcription

#### Expansion Hooks (Post-MVP)

- **Search & Replace**: "Replace all 'um' with silence"
- **Profanity Filter**: Auto-bleep swear words
- **Translation Mode**: Show transcript in multiple languages
- **Lyric Sync**: For music videos, sync lyrics to beats
- **Subtitle Export**: Generate .srt files from transcript

---

### Phase 8: Export Integration (Week 4)
1. Wire up OpenReel's ExportEngine via adapter
2. Implement client-side MP4 export (1080p only)
3. Add progress bar
4. Test export with generated EDL
5. Verify output plays correctly

**Verification**: Export completes in <60 seconds for 30s edit

**Skip for MVP**: Server-side rendering, 4K export, format options (just MP4)

---

### Phase 9: Refinement Loop (Week 4)
1. Implement intent-based refinement (tweak intent params, regenerate EDL)
2. Build simple refinement UI (text input: "make faster", "hit harder on drop")
3. Implement `/api/refine-edl` endpoint
4. Cache analysis to speed up refinement
5. Display before/after scores

**Verification**: User refines edit → new EDL in <5 seconds → scores show improvement

**Skip for MVP**: Multi-variant generation, shot re-rolling, complex refinement controls

---

### Phase 10: Studio Import (Week 4-5)
1. Build "Import from Chat" button in Studio
2. Load EDL into OpenReel timeline (read-only for MVP)
3. Enable scrubbing and preview
4. Test hybrid workflow

**Verification**: Generate edit in Chat → open in Studio → see timeline → scrub

**Skip for MVP**: Manual editing on imported timeline (expansion), AI Assist sidebar (expansion)

---

### Phase 11: Polish & User Testing (Week 5)
1. Add error handling and retry logic
2. Add loading states everywhere
3. Write basic user documentation
4. Test with real users (5-10 people)
5. Gather feedback on "edit quality" and "iteration speed"
6. Fix critical UX issues

**Verification**: 70%+ test users would use Monet again

---

### Phase 12: MVP Launch Prep (Week 5-6)
1. Deploy to Cloudflare Pages
2. Set up analytics (PostHog or similar)
3. Add usage tracking (API calls, export completions)
4. Create demo video
5. Prepare for beta launch

**Verification**: Public URL works, analytics tracking confirmed

---

## Post-MVP: Expansion Systems

**Only build these AFTER Core Loop is validated and users are actively using Monet.**

These are ordered by impact, not complexity.

### Expansion 1: Multi-Variant Generation
**Impact**: High - increases first-time success rate
**Effort**: Medium - intent system already supports it

- Generate 3 EDL variants from same intent (tweak pacing, transition style, energy curve)
- Score each variant
- Show user top 2-3 options to choose from
- Learn from user preferences

**Why wait**: Need real user data to know which variants matter most

---

### Expansion 2: Director Brain Layer
**Impact**: High - enables self-critique and explainability
**Effort**: High - new intermediate layer + complex scoring

- Implement full EditPlan schema (narrativeFlow, shotSelectionStrategy, continuityRules)
- Add temporal continuity scoring (shot-to-shot coherence)
- Add motion continuity penalties
- Generate Edit Plan before EDL, show to user for transparency
- Self-critique: AI scores its own plan, regenerates if low confidence

**Why wait**: MVP's simple scoring (beatSync + pacing) proves concept first

---

### Expansion 3: Edit DNA System
**Impact**: Very High - signature feature, marketplace potential
**Effort**: Medium - build on top of existing intent system

- Extract EditDNA from successful edits
- Allow users to save/clone/evolve styles
- Style mixing (blend DNA from 2 references)
- Personalized editing (learn user's preferred DNA)
- Marketplace for DNA presets (monetization)

**Why wait**: Need corpus of successful edits to extract patterns from

---

### Expansion 4: AI Studio Assist
**Impact**: Medium-High - bridges Chat and Studio modes
**Effort**: Medium - leverage existing AI pipeline

- "Ask Monet" sidebar in Studio mode
- Quick AI actions: "auto color grade", "sync to beats", "suggest transitions"
- AI generates OpenReel Actions that user previews/applies/rejects
- `/api/studio-assist` endpoint

**Why wait**: MVP users won't manually edit much - validate demand first

---

### Expansion 5: Advanced Effects & Transitions
**Impact**: Medium - visual polish, differentiation
**Effort**: High - may require engine extraction or custom shaders

- Custom transition library (mix effects + transitions)
- WebGPU rendering for complex effects
- User-created preset sharing
- Community library

**Why wait**: MVP's simple effects (glow, shake, zoom) prove core loop first. Don't overbuild rendering before validating AI quality.

---

### Expansion 6: Server-Side Rendering
**Impact**: Medium - enables 4K, heavy exports, background processing
**Effort**: High - FFmpeg infrastructure, queue management, job orchestration

- Cloudflare Queue for render jobs
- FFmpeg worker for server rendering
- Job status polling UI
- 4K export, ProRes, advanced codecs

**Why wait**: Client-side 1080p export covers 90% of MVP use cases. Server infra is expensive to maintain before revenue.

---

### Expansion 7: Advanced Audio Features
**Impact**: Low-Medium - nice-to-have, not core differentiator
**Effort**: Medium - integrate OpenReel's audio library

- Audio ducking (auto-reduce music during dialog)
- Voice isolation
- 99+ audio effects
- Noise reduction
- Audio preset library

**Why wait**: MVP's beat detection + volume control covers core use case (music-synced edits). Advanced audio is power user territory.

---

### Expansion 8: Engine Extraction
**Impact**: Variable - depends on bottlenecks
**Effort**: Very High - risky refactor

- Profile rendering performance
- Extract ONLY bottleneck engines (e.g., if TransitionEngine is slow)
- Reimplement simplified versions
- Keep rest of OpenReel intact

**Why wait**: Only extract after measuring actual bottlenecks. Never extract "just in case."

---

### Expansion 9: Collaborative Editing
**Impact**: High (for teams) - not consumer MVP feature
**Effort**: Very High - requires real-time sync, auth, permissions

- Share projects
- Comment on shots
- Version history
- Team workspaces

**Why wait**: Series A problem, not survival problem

---

### Expansion 10: Mobile Optimization
**Impact**: High (for reach) - mobile-first creators
**Effort**: High - lighter renderer, touch UI, responsive design

- Lighter renderer for iOS/Android
- Touch-optimized controls
- Responsive timeline
- Native app wrappers (Capacitor/Tauri)

**Why wait**: Desktop MVP first - easier to iterate, easier to debug rendering

---

## Decision Framework: MVP vs Expansion

**Ask before building anything**:
1. Does this prove the Core Loop works? → MVP
2. Does this improve iteration speed? → MVP
3. Does this require real user data to validate? → Expansion
4. Does this significantly increase complexity? → Expansion
5. Is this a "nice-to-have" polish feature? → Expansion

**The real product is iteration speed, not feature count.**

---

## Key Design Decisions

### Why Custom EDL Schema?
- **OpenReel's Action format** is designed for undo/redo and manual editing. It's verbose and has fields AI doesn't need (trackId, locked, etc.)
- **FFmpeg filter graphs** are powerful but unreadable and hard for AI to reason about
- **Custom schema** gives us:
  - Simple structure for AI to generate
  - Flexibility to add AI-specific fields (aiRationale, beatLock, etc.)
  - Easy conversion to both OpenReel and FFmpeg

### Why Extract vs. Use OpenReel As-Is?
- OpenReel is 130k lines built for **manual editing**
- **For Chat Mode** (AI-driven): Extract engines only
  - No undo/redo needed (AI generates plan atomically)
  - No track locking/hiding (AI manages single timeline)
  - No collision detection (AI plans don't overlap)
  - Gives us: same rendering quality, 90% less code, faster iteration
- **For Studio Mode** (manual + AI assist): Keep full OpenReel architecture
  - Import types, stores, action system, full UI components
  - Enable undo/redo, manual editing, complex timelines
  - Add AI assist layer on top for suggestions
- **Hybrid approach**: Chat Mode = lightweight, Studio Mode = full power

### Why Hybrid Rendering?
- **Client-side advantages**:
  - Instant preview (no upload wait)
  - Zero infrastructure cost
  - Privacy (footage never leaves device)
  - Fast iteration (refinement feels real-time)
- **Server-side advantages**:
  - Consistent quality (not limited by device)
  - Heavy exports (4K, long videos)
  - Full FFmpeg codec suite
  - Background processing (user can close tab)
- **Hybrid = best of both**:
  - Upload for AI analysis (necessary)
  - Preview client-side (fast)
  - Export client-side for quick edits
  - Export server-side for heavy renders

### Why Gemini 2.0 Flash?
- Native multimodal video understanding (no separate vision model)
- Fast (low latency for chat experience)
- Structured JSON output mode (perfect for Intent + EDL generation)
- Beat detection in audio (built-in)
- Long context window (can analyze full clips)
- Cheaper than GPT-4V

### Why Intent Layer?
- **Reusability**: Extract intent once, generate multiple EDL variations
- **Cheaper refinements**: Tweak intent parameters instead of re-analyzing footage
- **Explainability**: User sees *why* AI made decisions (builds trust)
- **Cross-genre learning**: Successful intent patterns improve future generations
- **Multi-strategy rendering**: Same intent → 3 EDL variants → user picks best
- **Credit savings**: Intent caching reduces Gemini API calls by ~60%
- **Faster iteration**: "Make faster" updates intent.technical.avgShotDuration, not full regeneration

### Why OpenReel Actions as Primary Format?
- **Studio integration**: Seamless transition from Chat Mode to manual editing
- **Undo/redo**: Studio users can refine AI edits with full history
- **Type safety**: OpenReel's types prevent invalid edit operations
- **Effect library**: Access to 99+ audio effects, video filters, transitions
- **Community**: OpenReel is active open-source project with continuous improvements
- **FFmpeg fallback**: For features OpenReel doesn't support (rare edge cases)

---

## Critical Files to Create/Modify

### New Files (Priority Order)
1. `src/server/services/gemini.ts` - AI integration
2. `src/server/api/upload.ts` - File handling
3. `src/server/api/analyze.ts` - Video analysis
4. `src/server/api/generate-edl.ts` - EDL generation
5. `packages/monet-renderer/src/types.ts` - MonetEDL schema
6. `packages/monet-renderer/src/edl-converter.ts` - EDL conversion
7. `packages/monet-renderer/src/client-renderer.ts` - Rendering
8. `src/lib/api-client.ts` - Frontend API calls
9. `src/components/chat/VideoUploader.tsx` - Upload UI
10. `src/components/chat/EDLPreview.tsx` - Timeline preview

### Modified Files
1. `src/routes/chat_.$threadId.tsx` - Add upload, API integration, preview
2. `src/routes/studio_.$projectId.tsx` - Integrate renderer
3. `src/lib/storage.ts` - Extend for R2, EDL storage
4. `src/server.ts` - Add API routes
5. `wrangler.jsonc` - Add Cloudflare bindings

### Files to Study (OpenReel Reference)
1. `/openreel-video/packages/core/src/video/video-engine.ts` - Rendering logic
2. `/openreel-video/packages/core/src/export/export-engine.ts` - Export flow
3. `/openreel-video/packages/core/src/types/project.ts` - Data structures
4. `/openreel-video/packages/core/src/actions/action-executor.ts` - State updates

---

## Testing Strategy

### Unit Tests
- EDL schema validation
- EDL → OpenReel conversion
- Beat grid generation
- Gemini response parsing

### Integration Tests
- Upload → R2 → Gemini Files API
- Full analysis pipeline
- EDL generation with various prompts
- Client-side frame rendering
- Export pipeline (client and server)

### E2E Tests (Manual for MVP)
1. Upload 3 clips + song
2. Prompt: "Make a 30s hype reel"
3. Verify thinking stages appear
4. Verify EDL preview renders
5. Verify export completes
6. Verify refinement works ("Make faster")

---

## Performance Targets

- **Intent extraction**: <3 seconds (with clarifying questions if needed)
- **Analysis time**: <10 seconds for 3min of footage
- **EDL generation**: <5 seconds (with cached intent + analysis)
- **Preview frame rendering**: <100ms (60fps capable)
- **Client export (1080p 30s)**: <60 seconds
- **Server export (4K 30s)**: <5 minutes
- **Refinement iteration**: <3 seconds (intent-based tweaks, no re-analysis)
- **Multi-variant generation**: <8 seconds for 3 EDL variants from same intent

---

## Future Enhancements (Post-MVP)

1. **Multi-take management**: AI compares multiple footage takes, picks best
2. **Style transfer**: Train custom models on user's favorite edits
3. **Collaborative editing**: Share projects, comment on shots
4. **Mobile optimization**: Lighter renderer for iOS/Android
5. **Plugin system**: Custom transitions, effects, filters
6. **Voice commands**: "Make it faster" via speech input
7. **Real-time preview**: Stream EDL changes while AI generates
8. **Batch rendering**: Queue 10+ edits, render overnight

---

## Success Metrics

### Technical
- 95%+ EDL generation success rate
- <5% server render failures
- <100ms p99 frame render latency
- Zero data loss (all uploads recoverable)

### Product
- User can generate edit in <2 minutes (end-to-end: upload → preview)
- **Genre-specific quality targets**:
  - Anime AMVs: 85%+ beat sync accuracy, 90%+ user satisfaction
  - Sports highlights: 95%+ capture of key plays, <3% missed moments
  - Wedding videos: 80%+ emotional resonance score (user survey)
  - Fan edits: 90%+ style match to reference video
  - Any edit genre: Works for any category users request
- 70%+ users export without refinement (AI got it right first time)
- 60%+ users refine at least once (engagement, not failure)
- 40%+ users move to Studio mode for advanced tweaks (power users)
- 30%+ users save custom effects/transitions (library building)

---

## End State

After full implementation, Monet will be:

1. **A conversational video director**: Chat interface where users describe edits and get finished videos
2. **An AI-powered timeline editor**: Studio mode for manual control with AI-assisted tools and automation
3. **A hybrid rendering platform**: Client-side preview + server-side export for any complexity
4. **A Gemini-native application**: Deep integration with multimodal video understanding via Intent Layer
5. **An intent-driven system**: Creative reasoning layer that enables multi-variant generation, cheaper refinements, and cross-genre learning
6. **A library builder**: Users save and share custom effects, transitions, and intent presets
7. **A genre-agnostic platform**: Handles anime AMVs, sports highlights, weddings, fan edits, trailers, ads, and any edit category users request
8. **A scalable SaaS business**: Ready for subscription tiers ($30-$50/mo) and affiliate program (30-40% recurring commission) when product is bulletproof

The architecture supports the vision: **One prompt → One masterpiece. No timeline, no friction.**

When bulletproof: Affiliate marketing becomes the primary growth engine, with creators earning recurring revenue for every subscriber they bring.
