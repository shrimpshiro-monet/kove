# Monet AI Director: The Core Loop Architecture

This document explains exactly how the Chat Page transforms a natural language prompt into a rendered video edit.

---

## 1. The High-Level Flow (The "Core Loop")

The entire system is designed to collapse the filmmaking pipeline into a four-stage synchronous handshake.

```
User Prompt + Files
  ↓
Stage 1: Intent Extraction (/api/decode-intent)
  ↓
Stage 2: Media Analysis (/api/analyze)
  ↓
Stage 3: EDL Generation (/api/generate-edl)
  ↓
Stage 4: Client Hydration & Rendering (OpenReel Adapter)
```

---

## 2. Detailed Step-by-Step Breakdown

### Stage 1: Intent Extraction (`/api/decode-intent`)
When you hit "Send", Monet first tries to understand *what* you want to make before looking at the footage.
- **Client Entry:** `src/routes/chat_.$threadId.tsx` (calls `decodeIntent`)
- **API Client:** `src/lib/api-client.ts`
- **Server Handler:** `src/server/api/decode-intent.ts`
- **System Prompt:** `src/server/prompts/decode-intent.txt`
- **Logic Service:** `src/server/services/intent-service.ts`
- **Fields:** It defines the `goal`, `style.genre`, `style.pacing`, and `technical.syncToBeat`.
- **Reasoning:** If the prompt is vague (e.g., "make it cool"), Gemini generates 1-2 **Clarifying Questions** instead of guessing.

### Stage 2: Media Analysis (`/api/analyze`)
Once intent is clear, Monet "watches" the footage.
- **Client Entry:** `src/routes/chat_.$threadId.tsx` (calls `analyzeMedia`)
- **Server Handler:** `src/server/api/analyze.ts`
- **Visual Analysis Prompt:** `src/server/prompts/analyze-footage.txt`
- **Audio Analysis Prompt:** `src/server/prompts/analyze-music.txt`
- **Logic Service:** `src/server/services/footage-analysis.ts`
- **Process:**
    - **Visuals:** Gemini analyzes the footage in segments, scoring them for motion, emotion, and "hero moments".
    - **Audio:** The system detects the **Beat Grid** (BPM and timestamps) from the music.
- **Output:** A combined `AnalysisResult` containing segment scores and a rhythm map.

### Stage 3: EDL Generation (`/api/generate-edl`)
This is where the actual "Direction" happens.
- **Client Entry:** `src/routes/chat_.$threadId.tsx` (calls `generateEDL`)
- **Server Handler:** `src/server/api/generate-edl.ts`
- **System Prompt:** `src/server/prompts/generate-edl.txt`
- **EDL Schema:** `packages/edl/src/schema.ts` (The contract between AI and Engine)
- **Constraint:** It must align cuts to the Beat Grid if `syncToBeat` is true.
- **The Contract:** It outputs a **MonetEDL** (Edit Decision List). This JSON file contains a list of `shots`, their `in/out` points, and `aiRationale`.

### Stage 4: Client Hydration & Rendering (The Engine)
Monet does **not** use a traditional video editor like Premiere or FFMPEG for the preview.
- **Preview Component:** `src/components/chat/VideoPreview.tsx`
- **The Adapter:** `src/lib/openreel-adapter.ts`
- **EDL Transformer:** `src/lib/openreel/edl-to-openreel.ts`
- **Bridge Logic:** `src/lib/openreel/monet-bridge.ts`
- **Engine UI Wrapper:** `src/lib/openreel/editor-wrapper.ts`
- **Tracking Modules:** 
    - `src/lib/openreel/face-tracking.ts`
    - `src/lib/openreel/motion-tracking.ts`
    - `src/lib/openreel/planar-tracking.ts`
- **Display:** It uses **Canvas2D** to render frames on the fly in the browser (<100ms latency). This allows for instant scrubbing and real-time playback without waiting for a server render.

---

## 3. The Tech Stack Summary

| Component | Technology | Role |
|---|---|---|
| **Creative Brain** | Gemini 3.5 Flash | Reasoning, Intent, Shot Selection |
| **Logic Layer** | Cloudflare Workers | API Orchestration & Database (D1) |
| **Storage** | Cloudflare R2 | Media Hosting (Footage/Music) |
| **Video Engine** | **OpenReel** | Deterministic Timeline & Canvas Rendering |
| **Frontend** | TanStack Start (React) | UI & Real-time Preview |

---

## 4. Why This Approach?

1.  **Transparent AI:** Because the system generates an intermediate **Intent** and **EDL**, the user can see *why* a shot was picked (via `aiRationale`).
2.  **Instant Refinement:** If you say "make the cuts faster", Monet only has to re-run **Stage 3** (EDL Generation). It doesn't need to re-analyze the video, making the update happen in <3 seconds.
3.  **Deterministic:** The same EDL will always result in the same pixel-perfect render across any device because OpenReel is a code-based engine, not a loose collection of clips.

---

## 5. Summary of "The Engine"
When people ask "What engine does it use?", the answer is:
**Monet uses Gemini for the Creative Logic and OpenReel for the Visual Execution.**

It's a "Director-Operator" model:
- **Director (Gemini):** Decides when to cut and what effects to apply.
- **Operator (OpenReel):** Precisely executes those instructions on a HTML5 Canvas.
