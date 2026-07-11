# Kove Architecture Patterns — From Research

Synthesized from editly, auto-editor, remotion, moviepy, and MLT research.

---

## 1. Non-Destructive Timeline (from MLT)

**Pattern:** All edits are metadata on top of source files. Source files are never modified.

**Kove mapping:**
- `MonetEDL` = MLT's Tractor (timeline coordinator)
- `Shot.source` = MLT's Producer (reference to source file)
- `Shot.timing` = MLT's Cut (in/out points, never modifies source)
- `Shot.effects` = MLT's Filters (metadata that describes processing)
- `Shot.transition` = MLT's Transitions (blend between tracks)

**Key insight from MLT:** The cut model means multiple shots can reference the same source clip with different in/out points. Kove already does this — but MLT proves it's the right architecture.

---

## 2. JSON → FFmpeg Pipeline (from Editly)

**Pattern:** Don't build one monolithic FFmpeg command. Spawn per-layer decode processes.

**Editly's approach:**
1. Each video layer → separate FFmpeg process outputting raw RGBA
2. Node.js composites frames in Canvas2D/WebGL
3. Output FFmpeg process receives composited frames via stdin pipe

**Kove mapping:**
- `render-engine-editly.ts` already does this
- The EDL → EditlySpec → FFmpeg pipeline is correct
- Key optimization: process audio separately (3-stage pipeline from Editly)

**Editly's audio pipeline (steal this):**
```
Stage 1: Extract audio per clip (with speed adjustment)
Stage 2: Crossfade between clip audio files
Stage 3: Mix arbitrary tracks with amix + normalization
```

**Critical FFmpeg pattern from Editly:**
```
amix=inputs=N:duration=first:dropout_transition=0
```
First track determines output length, no dropout artifacts.

---

## 3. Frame-by-Frame Rendering (from Remotion)

**Pattern:** Compute absolute frame positions by walking up the clip hierarchy.

**Remotion's Sequence math:**
```typescript
const absoluteFrom = parentSequence.absoluteFrom + effectiveRelativeFrom;
const actualDuration = min(videoConfig.durationInFrames - from, parentSequenceDuration);
```

**Kove mapping:**
- MonetEDL's `shot.timing.startTime` = Remotion's `absoluteFrom`
- MonetEDL's `shot.timing.duration` = Remotion's `durationInFrames`
- The `cumulatedNegativeFrom` pattern handles pre-roll (negative from offsets)

**Parallel rendering pattern (from Remotion):**
- Create N offscreen canvases (or Web Workers)
- Each renders a range of frames
- Collect frame buffers, sort by frame number
- Feed sequentially to FFmpeg

---

## 4. Speed Ramps / Time Transforms (from MoviePy)

**Pattern:** `time_transform(lambda t: factor * t)` — the cleanest speed ramp implementation.

**MoviePy's approach:**
```python
def time_transform(self, fun):
    self.make_frame = lambda t: self.make_frame(fun(t))
```

**Kove mapping:**
- EDL `shot.timing.speed` = MoviePy's `playbackRate`
- EDL `shot.timing.speedRamp` = MoviePy's `time_transform` with easing
- The `setpts` FFmpeg filter is the low-level equivalent

**Key insight:** MoviePy's `Effect.copy()` before `apply()` prevents mutation bugs. Apply to `editly-effects.ts`.

---

## 5. Audio Waveform Analysis (from Auto-Editor)

**Pattern:** Scan audio as numpy arrays, not individual samples.

**Auto-editor's approach:**
- SIMD intrinsics for peak scanning (8-16 samples per cycle)
- Label combinator: `seq[uint8]` where 0=silent, 1=active
- `chunkify()` groups consecutive same-label frames into `(startFrame, endFrame)` tuples

**Kove mapping:**
- `beat_engine.py` already does this with onset detection
- The label combinator pattern maps to: beat-aligned (1) vs off-beat (0) vs syncopated (2)
- `chunkify()` directly generates shot in/out points from analysis

**Key insight:** Auto-editor uses libav C API directly (not FFmpeg CLI) with priority-queue for temporal frame interleaving. This avoids subprocess overhead.

---

## 6. The Analysis → Threshold → Label → Clip → Render Pipeline

**Both auto-editor and editly share this exact flow:**

```
1. ANALYZE: Extract raw metrics (audio energy, motion, brightness)
2. THRESHOLD: Convert to boolean arrays (is this frame "active"?)
3. LABEL: Assign labels (silent/active/special)
4. CLIP: Group consecutive labels into (startFrame, endFrame) tuples
5. RENDER: Process clips through FFmpeg/Canvas
```

**Kove's equivalent:**
```
1. ANALYZE: perception_pro.py + beat_engine.py + audio_analysis_pro.py
2. THRESHOLD: Gemini generates MonetEDL (AI decides what's "active")
3. LABEL: Shot.sectionRole + Shot.effects (section/effect labels)
4. CLIP: Shot.timing.startTime + duration (in/out points)
5. RENDER: editly + FFmpeg (or Canvas2D preview)
```

**The gap:** Kove skips step 2 (threshold) and goes straight to AI generation. This is fine for creative edits, but for style replication, we should add a deterministic threshold step based on reference analysis.

---

## 7. Transition Engine (from Editly)

**Pattern:** Each transition is a factory function returning a closure.

```typescript
create({ width, height, channels }) {
  const gl = GL(width, height);  // headless WebGL
  return ({ fromFrame, toFrame, progress }) => {
    // Apply easing, run GLSL shader, return composited frame
  };
}
```

**Kove mapping:**
- `editly-transitions.ts` already implements this
- The gl-transitions library provides 200+ GLSL transitions
- Progress is `0.0 → 1.0`, easing applied before shader

---

## 8. Spatial Geometry / Ken Burns (from Editly)

**Pattern:** Four resize modes with FFmpeg filter chain:

- `contain`: letterbox with correct aspect ratio
- `cover`: fill frame, crop overflow
- `contain-blur`: blurred background + sharp foreground
- Ken Burns via `zoomDirection`/`zoomAmount` params

**Kove mapping:**
- EDL `shot.transform.scale` = Ken Burns zoom
- EDL `shot.transform.position` = pan/tilt
- The FFmpeg `scale` + `crop` filters handle the geometry

---

## Actionable Changes for Kove

### Immediate (Phase 4):
1. **Adopt Editly's 3-stage audio pipeline** for export
2. **Use `amix=duration=first:dropout_transition=0`** for audio mixing
3. **Add `Effect.copy()` before `apply()`** to prevent mutation bugs

### Medium-term (Phase 5):
4. **Add deterministic threshold step** between analysis and AI generation
5. **Implement `chunkify()` pattern** for shot generation from analysis
6. **Use MoviePy's `time_transform` pattern** for speed ramps

### Long-term (Phase 6):
7. **Build parallel frame renderer** using Remotion's pool pattern
8. **Implement MLT's lazy evaluation** for deferred rendering
9. **Use auto-editor's label combinator** for complex edit expressions
