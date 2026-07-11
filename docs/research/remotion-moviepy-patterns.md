# Architecture Patterns: Remotion & MoviePy

Extracted code-level patterns for application to a TypeScript/Python video editing pipeline.

---

## 1. Remotion (remotion-dev/remotion)

### 1.1 Composition Architecture

**File**: `packages/core/src/Composition.tsx`

The `Composition` is a React component that registers a video into the system. It's not a rendering primitive — it's a **metadata declaration** that tells the system "this is a video, here are its dimensions/fps/duration, and here's the React component that renders each frame."

**Pattern: Composition as Registration + Lazy Component**

```typescript
// Composition registers itself into a CompositionManager context
const {registerComposition, unregisterComposition} = compManager;

useEffect(() => {
  registerComposition<Schema, Props>({
    durationInFrames: durationInFrames ?? undefined,
    fps: fps ?? undefined,
    height: height ?? undefined,
    width: width ?? undefined,
    id,
    folderName,
    component: lazy,  // Lazy-loaded React component
    defaultProps: serializeThenDeserializeInStudio(defaultProps),
    nonce: nonce.get(),
    parentFolderName: parentName,
    schema: schema ?? null,
    calculateMetadata: compProps.calculateMetadata ?? null,
    stack,
  } as TComposition<Schema, Props>);

  return () => {
    unregisterComposition(id);
  };
}, [/* dependencies */]);
```

**Key insight**: The `lazy` component is resolved via `useLazyComponent()`, which defers loading the actual rendering component until it's needed. This enables:
- Tree-shaking: unused compositions don't load
- Code-splitting: each composition's component bundle loads on demand
- The component receives resolved props from `useResolvedVideoConfig(id)`

**File**: `packages/core/src/video-config.ts`

```typescript
export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  id: string;
  defaultProps: Record<string, unknown>;
  props: Record<string, unknown>;
  defaultCodec: Codec | null;
  defaultOutName: string | null;
  defaultVideoImageFormat: VideoImageFormat | null;
  defaultPixelFormat: PixelFormat | null;
  defaultProResProfile: ProResProfile | null;
  defaultSampleRate: number | null;
};
```

**Application to Monet**: The `MonetEDL` is analogous to `VideoConfig`. Your EDL already defines dimensions/fps/duration per composition. The pattern: define a `CompositionRegistry` that maps EDL composition IDs to their rendering components, using lazy loading for on-demand compilation.

---

### 1.2 Frame-by-Frame Calculation (Sequence + Frame Position)

**File**: `packages/core/src/Sequence.tsx`

The `Sequence` component is the core temporal primitive. It **time-shifts** children by computing frame offsets:

```typescript
// Cumulated timeline calculation
const cumulatedFrom = parentSequence
  ? parentSequence.cumulatedFrom + parentSequence.relativeFrom
  : 0;

const effectiveRelativeFrom = from - trimBefore;
const absoluteFrom = (parentSequence?.absoluteFrom ?? 0) + effectiveRelativeFrom;

// Duration calculation: min of declared duration vs remaining parent time
const parentSequenceDuration = parentSequence
  ? Math.min(parentSequence.durationInFrames - effectiveRelativeFrom, durationInFrames)
  : durationInFrames;

const actualDurationInFrames = Math.max(
  0,
  Math.min(videoConfig.durationInFrames - from, parentSequenceDuration),
);
```

**Nested sequence frame math**: The `cumulatedNegativeFrom` handles negative `from` offsets (pre-roll):

```typescript
const currentSequenceStart = cumulatedFrom + effectiveRelativeFrom;
const parentSequenceStart = parentSequence
  ? parentSequence.cumulatedFrom + parentSequence.relativeFrom
  : 0;
const parentFirstFrame = parentSequence
  ? parentSequenceStart - parentSequence.cumulatedNegativeFrom
  : 0;
const firstFrame = Math.max(0, parentFirstFrame, currentSequenceStart);
const cumulatedNegativeFrom = currentSequenceStart - firstFrame;
```

**Application to Monet**: Your EDL already defines `from` and `durationInFrames` per clip. The pattern: compute `absoluteFrom` by walking up the clip's parent chain, and `cumulatedNegativeFrom` for pre-roll. This is how Remotion supports `<Sequence from={-20}>` — the clip starts rendering 20 frames before its parent begins.

---

### 1.3 Parallel Rendering with Browser Tab Pool

**File**: `packages/renderer/src/render-frames.ts`

**Pattern: Pool-based parallel frame rendering**

```typescript
// Create a pool of Puppeteer pages, one per concurrency slot
const getPool = async () => {
  const pages = new Array(concurrencyOrFramesToRender)
    .fill(true)
    .map((_, i) => makeNewPage(framesToRender[i], i));
  const puppeteerPages = await Promise.all(pages);
  const pool = new Pool(puppeteerPages);
  return pool;
};

// Each page renders frames sequentially, pool distributes work
await Promise.all(
  allFramesAndExtraFrames.map(() => {
    return renderFrameAndRetryTargetClose({
      retriesLeft: MAX_RETRIES_PER_FRAME,
      attempt: 1,
      assets,
      /* ... frame rendering params */
    });
  }),
);
```

**Key detail**: The pool cycles tabs to avoid memory leaks:

```typescript
const cycle = cycleBrowserTabs({
  puppeteerInstance: browserReplacer,
  concurrency: resolvedConcurrency,
  logLevel,
  indent,
});
```

**Frame output collection**: Assets are collected per-frame, then sorted:

```typescript
return {
  assetsInfo: {
    assets: assets.sort((a, b) => a.frame - b.frame),
    imageSequenceName: path.join(frameDir, imageSequenceName),
    firstFrameIndex,
    downloadMap,
    trimLeftOffset,
    trimRightOffset,
    chunkLengthInSeconds,
    forSeamlessAacConcatenation,
  },
  frameCount: framesToRender.length,
};
```

**Application to Monet**: For Canvas2D preview rendering, use the same pattern: create N offscreen canvases (or Web Workers), each rendering a range of frames, then concat. For FFmpeg export, pipe frames in parallel with a worker pool (your `apps/worker-node` already does this via BullMQ).

---

### 1.4 Browser UI → Node.js FFmpeg Bridge

**File**: `packages/renderer/src/render-frames.ts`

The bridge works by:

1. **Browser renders each frame** to a buffer (JPEG/PNG) via Puppeteer
2. **Frame buffers are saved** to disk or held in memory
3. **FFmpeg stitching** reads the frame sequence and encodes to video

```typescript
// The render loop produces frame images + asset metadata
const allFramesAndExtraFrames = [
  ...extraFramesToCaptureAssetsFrontend,
  ...framesToRender,
  ...extraFramesToCaptureAssetsBackend,
];

// Each frame is rendered independently, assets are downloaded
await Promise.all(
  allFramesAndExtraFrames.map(() => renderFrameAndRetryTargetClose({...}))
);
```

The `stitchFramesToVideo` function (in a separate file) then invokes FFmpeg:

```
Browser render → frame images → FFmpeg stdin pipe → output video
```

**Application to Monet**: Your pipeline already does this: `Canvas2D preview` → `edl-to-editly.ts` → `editly` → `FFmpeg`. The Remotion pattern confirms this is the standard approach. The key optimization: render frames in parallel (browser tabs), then feed sequentially to FFmpeg.

---

### 1.5 State Management for Video Sequences

**File**: `packages/core/src/Sequence.tsx` (SequenceManager context)

Sequences register/unregister themselves into a shared `SequenceManager`:

```typescript
const {registerSequence, unregisterSequence} = useContext(SequenceManager);

useEffect(() => {
  if (isMedia) {
    if (isMedia.type === 'image') {
      registerSequence({
        type: 'image',
        controls: controls ?? null,
        effects: _remotionInternalEffects ?? EMPTY_EFFECTS,
        displayName: timelineClipName,
        duration: actualDurationInFrames,
        from,
        trimBefore: registeredTrimBefore,
        id,
        loopDisplay,
        parent: parentSequence?.id ?? null,
        rootId,
        showInTimeline,
        src: isMedia.src,
        refForOutline: refForOutline ?? null,
        isInsideSeries,
        frozenFrame: registeredFrozenFrame,
      });
    } else {
      registerSequence({
        type: isMedia.type,
        doesVolumeChange: isMedia.data.doesVolumeChange,
        duration: actualDurationInFrames,
        playbackRate: isMedia.data.playbackRate,
        volume: isMedia.data.volumes,
        startMediaFrom: startMediaFrom ?? isMedia.data.startMediaFrom,
        // ...
      });
    }
  } else {
    registerSequence({
      type: 'sequence',
      // ...
    });
  }
  return () => {
    unregisterSequence(id);
  };
}, [/* deps */]);
```

**Application to Monet**: Your EDL clips should register into a `ClipManager` context during preview. Each clip reports its type (video/audio/image), playback rate, volume curve, and effect stack. The timeline UI reads from this registry to render the timeline view.

---

## 2. MoviePy (Zulko/moviepy)

### 2.1 Mathematical Transforms Across Frames (Velocity Curves / Speed Ramps)

**File**: `moviepy/Clip.py` — `time_transform()`

This is the fundamental pattern for speed ramps, time reversal, and variable-speed effects:

```python
def time_transform(self, time_func, apply_to=None, keep_duration=False):
    """
    Returns a Clip instance playing the content of the current clip
    but with a modified timeline, time ``t`` being replaced by the return
    of `time_func(t)`.
    """
    return self.transform(
        lambda get_frame, t: get_frame(time_func(t)),
        apply_to,
        keep_duration=keep_duration,
    )
```

**Speed ramp example** — `MultiplySpeed` effect:

```python
@dataclass
class MultiplySpeed(Effect):
    factor: float = None
    final_duration: float = None

    def apply(self, clip: Clip) -> Clip:
        if self.final_duration:
            self.factor = 1.0 * clip.duration / self.final_duration

        new_clip = clip.time_transform(
            lambda t: self.factor * t, apply_to=["mask", "audio"]
        )

        if clip.duration is not None:
            new_clip = new_clip.with_duration(1.0 * clip.duration / self.factor)

        return new_clip
```

**Loop (cyclic time)** — `Loop` effect:

```python
@dataclass
class Loop(Effect):
    n: int = None
    duration: float = None

    def apply(self, clip: Clip) -> Clip:
        previous_duration = clip.duration
        clip = clip.time_transform(
            lambda t: t % previous_duration, apply_to=["mask", "audio"]
        )
        if self.n:
            self.duration = self.n * previous_duration
        if self.duration:
            clip = clip.with_duration(self.duration)
        return clip
```

**Subclip (time window)**:

```python
def subclipped(self, start_time=0, end_time=None):
    new_clip = self.time_transform(lambda t: t + start_time, apply_to=[])
    # ...
    new_clip.duration = end_time - start_time
    return new_clip
```

**Section cut-out (skip time range)**:

```python
def with_section_cut_out(self, start_time, end_time):
    new_clip = self.time_transform(
        lambda t: t + (t >= start_time) * (end_time - start_time),
        apply_to=["audio", "mask"],
    )
    if self.duration is not None:
        return new_clip.with_duration(self.duration - (end_time - start_time))
```

**Application to Monet**: The `time_transform` pattern is exactly what you need for beat-synced speed ramps. Each EDL clip can have a `timeFunction: (t) => t * speedAtTime(t)` that maps real timeline time to source media time. The key: `apply_to=["mask", "audio"]` ensures audio pitch-shifts match the visual speed change.

---

### 2.2 Custom Effect Function Pattern

**File**: `moviepy/Effect.py`

```python
class Effect(metaclass=ABCMeta):
    def copy(self):
        """Always copy before applying — effects mutate on apply."""
        return _copy.copy(self)

    @abstractmethod
    def apply(self, clip: Clip) -> Clip:
        pass
```

**File**: `moviepy/Clip.py` — `transform()`

The `transform` method is the universal effect applicator:

```python
def transform(self, func, apply_to=None, keep_duration=True):
    """
    func signature: (gf, t) -> frame
    where gf = parent clip's get_frame, t = time in seconds
    """
    new_clip = self.with_updated_frame_function(lambda t: func(self.get_frame, t))

    if not keep_duration:
        new_clip.duration = None
        new_clip.end = None

    for attribute in apply_to:
        attribute_value = getattr(new_clip, attribute, None)
        if attribute_value is not None:
            new_attribute_value = attribute_value.transform(
                func, keep_duration=keep_duration
            )
            setattr(new_clip, attribute, new_attribute_value)

    return new_clip
```

**File**: `moviepy/video/VideoClip.py` — `image_transform()`

For frame-level transforms (blur, color grading, etc.):

```python
def image_transform(self, image_func, apply_to=None):
    """Modifies images by replacing get_frame(t) with image_func(get_frame(t))"""
    return self.transform(lambda get_frame, t: image_func(get_frame(t)), apply_to)
```

**Application to Monet**: Your effects in `editly-effects.ts` map to this pattern. Each effect is a function `(frame, t) -> transformedFrame`. The MoviePy pattern confirms: effects should be composable via `transform()`, and each effect must be shallow-copied before apply (to avoid mutation bugs when reusing).

---

### 2.3 Dynamic Video Clip Stitching

**File**: `moviepy/video/compositing/CompositeVideoClip.py` — `concatenate_videoclips()`

**Two concatenation methods**:

```python
def concatenate_videoclips(clips, method="chain", transition=None, bg_color=None, is_mask=False, padding=0):
    # Chain method: simple frame-by-frame playback of successive clips
    if method == "chain":
        timings = np.cumsum([0] + [clip.duration for clip in clips])

        def frame_function(t):
            i = max([i for i, e in enumerate(timings) if e <= t])
            return clips[i].get_frame(t - timings[i])

        result = VideoClip(is_mask=is_mask, frame_function=frame_function)

    # Compose method: clips overlaid on a canvas, centered
    elif method == "compose":
        result = CompositeVideoClip(
            [clip.with_start(t).with_position("center")
             for (clip, t) in zip(clips, timings)],
            size=(w, h),
            bg_color=bg_color,
            is_mask=is_mask,
        )
```

**Timing calculation** with padding:

```python
timings = np.cumsum([0] + [clip.duration for clip in clips])
timings = np.maximum(0, timings + padding * np.arange(len(timings)))
timings[-1] -= padding  # Last element is the duration of the whole
```

**Application to Monet**: Your EDL defines clip order and timing. The `concatenate_videoclips` "chain" method is equivalent to sequential EDL playback. The "compose" method handles overlapping clips (like text overlays). The `transition` parameter enables crossfade-style transitions between clips.

---

### 2.4 Frame Sequence Manipulation

**File**: `moviepy/Clip.py` — `__getitem__` and `iter_frames()`

**Slicing with speed and reversal**:

```python
def __getitem__(self, key):
    if isinstance(key, slice):
        clip = self.subclipped(key.start or 0, key.stop or self.duration)

        if key.step:
            factor = abs(key.step)
            if factor != 1:
                # Change speed
                clip = clip.time_transform(
                    lambda t: factor * t, apply_to=apply_to, keep_duration=True
                )
                clip = clip.with_duration(1.0 * clip.duration / factor)
            if key.step < 0:
                # Time mirror (reversal)
                clip = clip.time_transform(
                    lambda t: clip.duration - t - 1 / self.fps,
                    keep_duration=True,
                    apply_to=apply_to,
                )
        return clip
    elif isinstance(key, tuple):
        # Concatenation of subclips
        return reduce(add, (self[k] for k in key))
    else:
        return self.get_frame(key)
```

**Frame iteration**:

```python
def iter_frames(self, fps=None, with_times=False, logger=None, dtype=None):
    for frame_index in logger.iter_bar(
        frame_index=np.arange(0, int(self.duration * fps))
    ):
        t = frame_index / fps
        frame = self.get_frame(t)
        if (dtype is not None) and (frame.dtype != dtype):
            frame = frame.astype(dtype)
        if with_times:
            yield t, frame
        else:
            yield frame
```

**Application to Monet**: Your EDL already defines clip ordering and timing. The `__getitem__` pattern shows how to implement EDL slicing: `edl[10:20]` returns a sub-EDL, `edl[10:20:2]` returns a 2x speed sub-EDL, `edl[20:10]` returns a reversed sub-EDL.

---

### 2.5 Bridge: High-Level Code → Low-Level FFmpeg

**File**: `moviepy/video/io/ffmpeg_reader.py` — `FFMPEG_VideoReader`

**Pattern: FFmpeg as a subprocess, frames as raw bytes**

```python
class FFMPEG_VideoReader:
    def initialize(self, start_time=0):
        cmd = (
            [FFMPEG_BINARY]
            + i_arg
            + [
                "-loglevel", "error",
                "-f", "image2pipe",
                "-vf", "scale=%d:%d" % tuple(self.size),
                "-sws_flags", self.resize_algo,
                "-pix_fmt", self.pixel_format,
                "-vcodec", "rawvideo",
                "-",  # output to stdout
            ]
        )
        self.proc = sp.Popen(cmd, **popen_params)

    def read_frame(self):
        w, h = self.size
        nbytes = self.depth * w * h
        s = self.proc.stdout.read(nbytes)
        result = np.frombuffer(s, dtype="uint8")
        result.shape = (h, w, len(s) // (w * h))
        self.last_read = result
        self.pos += 1
        return result

    def get_frame(self, t):
        pos = self.get_frame_number(t) + 1
        if pos == self.pos:
            return self.last_read
        elif (pos < self.pos) or (pos > self.pos + 100):
            # Random access: reinitialize
            self.initialize(t)
            return self.last_read
        else:
            # Sequential: skip forward
            self.skip_frames(pos - self.pos - 1)
            result = self.read_frame()
            return result
```

**File**: `moviepy/video/io/ffmpeg_writer.py` — `FFMPEG_VideoWriter`

**Pattern: Frame-by-frame encoding via stdin pipe**

```python
class FFMPEG_VideoWriter:
    def __init__(self, filename, size, fps, codec="libx264", ...):
        cmd = [
            FFMPEG_BINARY, "-y",
            "-loglevel", "error",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", "%dx%d" % (size[0], size[1]),
            "-pix_fmt", input_pixel_format,
            "-r", "%.02f" % fps,
            "-an",
            "-i", "-",  # input from stdin
        ]
        self.proc = sp.Popen(cmd, **popen_params)

    def write_frame(self, img_array):
        if not img_array.flags["C_CONTIGUOUS"]:
            img_array = img_array.copy(order="C")
        self.proc.stdin.write(img_array)
```

**Write loop** (combines reader + writer):

```python
def ffmpeg_write_video(clip, filename, fps, codec="libx264", ...):
    with FFMPEG_VideoWriter(filename, clip.size, fps, codec=codec, ...) as writer:
        for t, frame in clip.iter_frames(logger=logger, with_times=True, fps=fps, dtype="uint8"):
            if clip.mask is not None:
                mask = 255 * clip.mask.get_frame(t)
                frame = np.dstack([frame, mask])
            writer.write_frame(frame)
```

**Application to Monet**: This is exactly what `render-engine-editly.ts` does, but MoviePy's pattern is cleaner:
1. Create FFmpeg writer subprocess with explicit pixel format
2. Iterate frames via `iter_frames()` (which calls `get_frame(t)` for each)
3. Write each raw frame to FFmpeg stdin
4. FFmpeg encodes and outputs to file

The key optimization from MoviePy: **seek distance heuristic** — if the target frame is within 100 frames of current position, skip forward instead of reinitializing the FFmpeg decoder. This avoids expensive seeks for sequential playback.

---

## 3. Cross-Cutting Patterns for Monet

### 3.1 The `frame_function(t)` Pattern (MoviePy) vs `<Sequence>` (Remotion)

Both repos solve the same problem: **map a timeline time to a source frame**.

- **MoviePy**: `frame_function(t) -> numpy_array` — each clip is a pure function of time
- **Remotion**: `<Sequence from={10} durationInFrames={30}>` — React component that conditionally renders based on current frame

**Monet equivalent**: Your EDL clips should expose a `getFrame(t: number) -> FrameBuffer` method. The EDL compiler resolves which clip is active at time `t`, computes the local time offset, and calls `clip.getFrame(localT)`.

### 3.2 Effect Composition

- **MoviePy**: `clip.with_effects([Resize(0.2), Mirrorx()])` — effects chain via `.apply(clip)`
- **Remotion**: Effects are React components wrapped in `<Sequence>` with `_remotionInternalEffects`

**Monet equivalent**: Your effects should be composable functions `(frame, effectParams) -> frame`. The EDL specifies effects per clip, and the renderer applies them in order.

### 3.3 FFmpeg Bridge Pattern

Both repos use the same architecture:

```
High-level code → Frame iteration → Raw pixel buffer → FFmpeg stdin pipe → Encoded output
```

**Monet's current path**: `MonetEDL → edl-to-editly.ts → editly → FFmpeg`
**Cleaner path** (per MoviePy): `MonetEDL → FrameIterator → Raw frames → FFmpeg stdin`

### 3.4 Key File Reference

| Pattern | Remotion File | MoviePy File | Monet Equivalent |
|---------|--------------|--------------|-----------------|
| Composition registration | `packages/core/src/Composition.tsx` | `moviepy/video/VideoClip.py` | EDL schema (`packages/edl/src/`) |
| Frame calculation | `packages/core/src/Sequence.tsx` | `moviepy/Clip.py` → `time_transform()` | `edl-to-editly.ts` |
| Parallel rendering | `packages/renderer/src/render-frames.ts` | `moviepy/video/io/ffmpeg_writer.py` | `apps/worker-node/` |
| Effect system | `packages/core/src/Sequence.tsx` → effects | `moviepy/Effect.py` + `moviepy/video/fx/` | `src/server/lib/editly-effects.ts` |
| FFmpeg bridge | `packages/renderer/src/render-frames.ts` | `moviepy/video/io/ffmpeg_reader.py` | `src/server/lib/render-engine-editly.ts` |
| Clip stitching | `packages/core/src/Sequence.tsx` (nested) | `moviepy/video/compositing/CompositeVideoClip.py` | EDL timeline composition |
| Speed/time transforms | React component composition | `Clip.time_transform()` | EDL `playbackRate` field |
| Asset preloading | `packages/preload/` | `FFMPEG_VideoReader.initialize()` | R2 fetch + buffer |
