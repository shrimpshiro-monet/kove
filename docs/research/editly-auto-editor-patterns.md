# Editly + Auto-Editor Architecture Patterns

Deep code-level patterns extracted from both repos. For application to a TypeScript/Python video editing pipeline.

---

## 1. mifi/editly — Architecture Patterns

### Repo structure (key files)

```
src/
  index.ts              — Main entry, rendering pipeline, frame loop
  parseConfig.ts        — JSON spec → ProcessedClip[] normalization
  ffmpeg.ts             — FFmpeg/FFprobe wrapper (execa)
  audio.ts              — Audio extraction, mixing, crossfade
  transition.ts         — WebGL GL transition engine
  frameSource.ts        — Per-clip multi-layer compositing
  sources/
    index.ts            — Frame source registry (factory pattern)
    video.ts            — Video decode + spatial transforms
    gl.ts               — GLSL shader source
    fabric.ts           — Canvas2D compositing layer
    image.ts, title.ts, etc — Per-type frame sources
  transforms/
    rawVideoToFrames.ts — Pipe chunking for raw video frames
```

### Pattern 1: JSON Timeline → FFmpeg Command Construction

**File: `src/sources/video.ts`**

Editly does NOT build one monolithic FFmpeg command. Instead, it spawns **per-layer FFmpeg decode processes** that output raw RGBA frames into Node.js memory:

```typescript
// src/sources/video.ts — video layer decode command
const args = [
  "-nostdin",
  ...(inputCodec ? ["-vcodec", inputCodec] : []),
  ...(cutFrom ? ["-ss", cutFrom.toString()] : []),
  "-i", path,
  ...(cutTo ? ["-t", ((cutTo - cutFrom!) * speedFactor!).toString()] : []),
  "-vf", `${ptsFilter}fps=${framerateStr},${scaleFilter}`,
  "-map", "v:0",
  "-vcodec", "rawvideo",
  "-pix_fmt", "rgba",
  "-f", "image2pipe",
  "-",  // stdout → Node.js readable stream
];
```

The output ffmpeg process (`src/index.ts`) receives RGBA frames via stdin pipe:

```typescript
// src/index.ts — output writer process
const args = [
  "-f", "rawvideo", "-vcodec", "rawvideo",
  "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", framerateStr,
  "-i", "-",  // stdin from Node.js
  ...(audioFilePath ? ["-i", audioFilePath] : []),
  ...getOutputArgs(),
  "-y", outPath,
];
```

**Key insight**: Editly uses FFmpeg as a **raw frame decoder** and **encoder**, not as a filter graph composer. All compositing happens in JavaScript/Canvas.

### Pattern 2: Transition Engine (WebGL + gl-transitions)

**File: `src/transition.ts`**

Transitions use **headless WebGL** to run GLSL shaders from the gl-transitions library:

```typescript
// src/transition.ts — Transition.create()
create({ width, height, channels }) {
  const gl = GL(width, height);  // headless-gl
  const resizeMode = "stretch";

  function convertFrame(buf: Buffer) {
    return ndarray(buf, [width, height, channels], [channels, width * channels, 1]);
  }

  return ({ fromFrame, toFrame, progress }) => {
    const buffer = createBuffer(gl, [-1, -1, -1, 4, 4, -1], gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let transition = createTransition(gl, this.source, { resizeMode });

    gl.clear(gl.COLOR_BUFFER_BIT);

    const fromFrameNdArray = convertFrame(fromFrame);
    const textureFrom = createTexture(gl, fromFrameNdArray);
    // ... same for textureTo ...

    buffer.bind();
    transition.draw(
      this.easingFunction(progress),
      textureFrom, textureTo,
      gl.drawingBufferWidth, gl.drawingBufferHeight,
      this.params,
    );

    const outArray = Buffer.allocUnsafe(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, outArray);
    return outArray;
  };
}
```

**Execution loop** in `src/index.ts`:

```typescript
while (!outProcessError) {
  const transitionFrameAt = fromClipFrameAt - (fromClipNumFrames - transitionNumFramesSafe);
  const runTransitionOnFrame = currentTransition.create({ width, height, channels });

  if (isInTransition) {
    const frameSource2Data = await frameSource2.readNextFrame({ time: toClipTime });
    const progress = transitionFrameAt / transitionNumFramesSafe;
    outFrameData = runTransitionOnFrame({
      fromFrame: frameSource1Data,
      toFrame: frameSource2Data,
      progress: progress,
    });
  } else {
    outFrameData = frameSource1Data; // pass-through
  }

  await new Promise((r) => outProcess?.stdin?.write(outFrameData, r));
}
```

**Key insight**: Each transition is a factory function that creates a closure capturing the WebGL context. Progress is `0.0 → 1.0`. The easing function is applied before passing to the GLSL shader.

### Pattern 3: Spatial Geometry (Pan/Zoom/Tracking)

**File: `src/sources/video.ts`**

Four resize modes with FFmpeg filter chain construction:

```typescript
// contain: letterbox with correct aspect ratio
if (["contain", "contain-blur"].includes(resizeMode)) {
  if (ratioW > ratioH) {
    targetHeight = requestedHeight;
    targetWidth = Math.round(requestedHeight * inputAspectRatio);
  } else {
    targetWidth = requestedWidth;
    targetHeight = Math.round(requestedWidth / inputAspectRatio);
  }
  scaleFilter = `scale=${targetWidth}:${targetHeight}`;
}

// cover: fill frame, crop overflow
else if (resizeMode === "cover") {
  scaleFilter = `scale=${scaledWidth}:${scaledHeight},crop=${targetWidth}:${targetHeight}`;
}

// speed via setpts
if (speedFactor !== 1) {
  ptsFilter = `setpts=${speedFactor}*PTS,`;
}
```

For **contain-blur**, the blurred background is a separate fabric layer:

```typescript
if (resizeMode === "contain-blur") {
  const mutableImg = img.cloneAsImage({});
  const blurredImg = await blurImage({ mutableImg, width: requestedWidth, height: requestedHeight });
  blurredImg.set({ left, top, originX, originY });
  canvas.add(blurredImg);
}
```

**Ken Burns** is specified via `zoomDirection`/`zoomAmount` params in the JSON spec and applied as progressive scale changes across frames.

### Pattern 4: Audio Layer Stacking

**File: `src/audio.ts`**

Three-stage audio pipeline:

**Stage 1** — Extract audio from each clip (or generate silence):

```typescript
// Per-layer audio extraction with speed adjustment
const args = [
  "-nostdin", ...getCutFromArgs({ cutFrom }),
  "-i", path,
  "-t", cutToArg.toString(),  // (cutTo - cutFrom) * speedFactor
  "-sample_fmt", "s32", "-ar", "48000",
  "-map", "a:0", "-c:a", "flac",
  ...(atempoFilter ? ["-filter:a", atempoFilter] : []),
  "-y", layerAudioPath,
];

// Mix multiple audio layers within a clip
const args = [
  "-nostdin",
  ...flatMap(processedAudioLayers, ([layerAudioPath]) => ["-i", layerAudioPath]),
  "-filter_complex",
  `amix=inputs=${n}:duration=longest:weights=${weights.join(" ")}`,
  "-c:a", "flac", "-y", clipAudioPath,
];
```

**Stage 2** — Crossfade between clip audio files:

```typescript
// acrossfade filter chain
const filterGraph = clipAudio.slice(0, -1).map(({ transition }, i) => {
  return `${inStream}[${i + 1}:a]acrossfade=d=${transition.duration}:c1=${audioOutCurve}:c2=${audioInCurve}`;
}).join(",");
```

**Stage 3** — Mix arbitrary audio tracks with normalization:

```typescript
// Per-track trim + delay, then amix
filterComplex = streams.map(({ start, cutFrom, cutTo }, i) => {
  return `[${i}:a]atrim=start=${cutFrom},adelay=delays=${Math.floor(start * 1000)}:all=1[a${i}]`;
}).join(";");

filterComplex += `;${streams.map((_, i) => `[a${i}]`).join("")}amix=inputs=${n}:duration=first:dropout_transition=0:weights=${weights}${audioNormArg}${volumeArg}`;
```

**Key insight**: Editly uses `amix` with `duration=first` (first track determines output length) and `dropout_transition=0` for clean mixing.

### Pattern 5: Main Rendering Pipeline Entry Point

**File: `src/index.ts` — `Editly()` function**

```typescript
async function Editly(input: ConfigurationOptions): Promise<void> {
  const config = new Configuration(input);

  // 1. Parse and normalize the JSON spec
  const { clips, arbitraryAudio } = await parseConfig({ clips: clipsIn, ... });

  // 2. Process audio (extract, mix, crossfade, normalize)
  const audioFilePath = await editAudio({ keepSourceAudio, clips, ... });

  // 3. Detect dimensions from first video
  // (auto-detect width/height/fps from first video layer)

  // 4. Spawn output FFmpeg process (stdin pipe)
  outProcess = startFfmpegWriterProcess();

  // 5. Create frame sources for first two clips
  frameSource1 = await getTransitionFromSource();
  frameSource2 = await getTransitionToSource();

  // 6. Main frame loop — write RGBA frames to FFmpeg stdin
  while (!outProcessError) {
    // Read frames from current sources
    // Apply transition if in transition zone
    // Write raw RGBA to FFmpeg stdin
    // Advance clip pointers when transition completes
  }

  outProcess.stdin?.end();
  await outProcess;
}
```

---

## 2. WyattBlue/auto-editor — Architecture Patterns

### Repo structure (key files)

```
src/
  main.nim              — CLI entry, arg parsing
  conductor.nim         — Orchestration: analyze → edit → render
  edit.nim              — --edit expression evaluator, threshold → label array
  timeline.nim          — Timeline data structures (v3), clip construction
  action.nim            — Action/effect definitions, serialization (atf-8)
  ffmpeg.nim            — libav C API wrapper (NOT subprocess)
  analyze/
    audio.nim           — SIMD-accelerated audio peak scanning
    motion.nim          — Frame-diff motion detection
    blackdetect.nim     — Black frame detection
    subtitle.nim        — Subtitle regex matching
  render/
    format.nim          — Output muxing via libav (priority queue interleaving)
    video.nim           — Video frame generation with effect chains
    audio.nim           — Audio mixing/remuxing
  exports/              — Premiere, FCP, Resolve, ShotCut, Kdenlive, OTIO
  imports/              — FCP7 XML, JSON timeline import
```

### Pattern 1: Audio Waveform Scanning (SIMD)

**File: `src/analyze/audio.nim`**

Auto-editor uses **SIMD intrinsics** (SSE2 on x86, NEON on ARM, WASM SIMD) to scan audio peaks:

```nim
# SSE2 path (x86)
proc sseAbs16(v: M128i): M128i {.inline.} =
  sseMax16(v, sseSubs16(sseZero(), v))  # saturating abs

# Main loop: read chunk of S16 samples, find max absolute value
proc readChunk(iter: AudioIterator): Unorm16 =
  let samples = cast[ptr UncheckedArray[int16]](iter.readBuffer)
  let samplesRead = av_audio_fifo_read(iter.fifo, cast[pointer](addr iter.readBuffer), currentSize)
  let totalSamples = samplesRead * iter.channelCount

  var v0 = sseZero()
  var v1 = sseZero()
  var i = 0
  while i + 16 <= totalSamples:
    v0 = sseMax16(v0, sseAbs16(sseLoad(addr samples[i])))
    v1 = sseMax16(v1, sseAbs16(sseLoad(addr samples[i + 8])))
    i += 16
  var vmax = sseMax16(v0, v1)
  # ... tail loop + horizontal max ...
  return toUnorm16(float32(maxAbs) / 32767.0)
```

**Architecture**: Audio is decoded via libav (FFmpeg's C API), resampled to S16 mono, chunked into fixed-duration buckets (typically 1/30th second), and the peak amplitude per chunk becomes a single `Unorm16` value (0.0–1.0).

The `loudness` iterator yields one `Unorm16` per timeline frame:

```nim
iterator loudness*(processor: var AudioProcessor, container: InputContainer): Unorm16 =
  for decodedFrame in container.decode(processor.audioIndex, processor.codecCtx, frame):
    processor.iterator.writeFrame(decodedFrame)
    while processor.iterator.hasChunk():
      yield processor.iterator.readChunk()
```

**Key insight for TypeScript/Python**: Replace numpy with `Float32Array` + `Math.max` for basic peaks, or use WebAssembly SIMD for production speed. The chunk-per-frame model maps directly to `seq[Unorm16]` → `Array<number>`.

### Pattern 2: Decibel/Transient → inPoint/outPoint Arrays

**File: `src/edit.nim` — `interpretEdit()`**

The edit expression evaluator converts analysis data → `seq[bool]` → label array:

```nim
proc interpretEdit*(args, container, input, tb, bar): seq[uint8] =
  # Step 1: Evaluate --edit expression → boolean mask
  proc editEval(expr: Expr, text: string): seq[bool] =
    case text[node[0]..]:
    of "audio":
      # Apply threshold to loudness levels
      result.orWithThreshold(audio(bar, container, input, tb, stream), threshold)
    of "motion":
      result.orWithThreshold(motion(bar, container, input, tb, stream, width, blur, rect), threshold)
    of "or":
      result = editEval(node[1], text)
      for i in 2..<node.len:
        result = result or editEval(node[i], text)

  # Step 2: Boolean mask → uint8 label array
  let base = evalEditString(args.edit)
  result = newSeq[uint8](base.len)
  for i in 0..<base.len:
    if base[i]: result[i] = 1'u8

  # Step 3: Higher-priority labels override (label 2 beats label 1)
  for le in args.labeledEdits:
    let mask = evalEditString(le.expr)
    let lbl = uint8(le.label)
    for i in 0..<mask.len:
      if mask[i] and lbl > result[i]:
        result[i] = lbl
```

**The threshold comparison** (`orWithThreshold`):

```nim
proc orWithThreshold(result: var seq[bool], levels: seq[Unorm16], t: Unorm16) =
  if result.len == 0:
    result = newSeq[bool](levels.len)
    for i in 0..<levels.len:
      result[i] = levels[i] >= t
  else:
    let n = min(result.len, levels.len)
    for i in 0..<n:
      result[i] = result[i] or (levels[i] >= t)
```

**Converting labels → timeline** in `src/conductor.nim`:

```nim
# After interpretEdit() returns labels, apply margin + smoothing
mutMargin(active, startMargin, endMargin)
smoothing(active, mincut, minclip)

# Labels map to actions
var actionMap = newSeq[Actions](maxLabel + 1)
actionMap[0] = args.whenInactive   # default: cut
actionMap[1] = args.whenActive     # default: keep
# actionMap[label] → what to do with that section
```

Then `chunkify()` in `timeline.nim` groups consecutive same-label frames into `(startFrame, endFrame, effectIndex)` tuples:

```nim
proc chunkify(arr: seq[int], effects: seq[Actions]): seq[(int64, int64, int, Actions)] =
  var start: int64 = 0
  var j: int64 = 1
  while j < arr.len:
    if arr[j] != arr[j - 1]:
      result.add (start, j, arr[j-1], effects[arr[j - 1]])
      start = j
    inc j
  result.add (start, arr.len.int64, arr[j-1], effects[arr[j - 1]])
```

**Key insight for TypeScript/Python**: The pattern is `analysis: number[] → threshold → boolean[] → label[] → chunkify → Clip[]`. The label system (0=silent, 1=active, 2+=special) allows compositing multiple edit methods with priority.

### Pattern 3: Timeline Data Structures

**File: `src/timeline.nim`**

The `v3` timeline is the central data structure:

```nim
type Clip* = object
  src*: ptr string        # pointer to interned source path
  start*: int64           # timeline frame offset
  dur*: int64             # output duration in frames
  offset*: int64          # source offset (where in the source file)
  stream*: int16          # which stream index (video=0, audio=0,1,...)
  effects*: uint32        # index into Timeline.effects[]

type Clip2* = object      # non-linear timeline tracking
  start*: int64           # source start frame
  `end`*: int64           # source end frame
  effect*: uint32

type v3* = object
  layout*: ref AVChannelLayout
  res*: (int32, int32)    # output resolution
  tb*: AVRational         # timebase (fps as rational)
  bg*: RGBColor           # background color
  sr*: cint               # sample rate
  v*: seq[seq[Clip]]      # video layers (outer=tracks, inner=clips)
  a*: seq[seq[Clip]]      # audio layers
  s*: seq[seq[Clip]]      # subtitle layers
  langs*: seq[Lang]       # language tags per track
  effects*: seq[Actions]  # global effects pool (deduplicated)
  clips2*: seq[Clip2]     # non-linear source tracking
```

**Timeline construction** from analysis:

```nim
proc initLinearTimeline*(src, tb, bg, mi, effects, actionIndex): v3 =
  let pseudoChunks = chunkify(actionIndex, effects)
  for chunk in pseudoChunks:
    let speed = if actionGroup.isCut: 99999.0 else: actionGroup.computeSpeed()
    let (offset, dur) = clipBounds(chunk[0], chunk[1], speed)
    clips.add Clip(src: src, start: start, dur: dur, offset: offset, effects: e)
  result = v3(tb: tb, effects: effects, clips2: clips2, ...)
  mutHelper(result, mi, clips)  # expand into video/audio/subtitle layers
```

**Key insight**: Effects are stored in a deduplicated pool (`effects: seq[Actions]`). Each clip references effects by index. `Actions` is a fat pointer to a compact binary serialization (atf-8 format) — not a string or object.

### Pattern 4: Motion-Based Editing

**File: `src/analyze/motion.nim`**

Motion detection uses FFmpeg's filter graph API (via libav) to scale + grayscale + blur frames, then computes pixel difference:

```nim
iterator motionness*(processor: var VideoProcessor, width, blur: int32,
    rect: Unorm24x4): Unorm16 =
  var filter = &"scale={width}:-1,format=gray,gblur=sigma={blur}"
  # Optional crop to region of interest
  if x != 0.0 or y != 0.0 or w != 1.0 or h != 1.0:
    filter = &"crop={cw}:{ch}:{cx}:{cy}," & filter

  for filteredFrame in processor.videoPipeline(filter):
    # Copy frame data (row-by-row to handle stride padding)
    let stride = filteredFrame.linesize[0].int
    if stride == rowBytes:
      copyMem(currentFrame, filteredFrame.data[0], totalPixels)
    else:
      for y in 0..<filteredFrame.height.int:
        copyMem(addr currentFrame[y * rowBytes],
          cast[pointer](cast[int](filteredFrame.data[0]) + y * stride), rowBytes)

    if not firstTime:
      # Count changed pixels → motion metric
      var diffCount: int32 = 0
      for i in 0..<totalPixels:
        if prevFrame[i] != currentFrame[i]:
          inc diffCount
      value = toUnorm16(float32(diffCount) / float32(totalPixels))
    else:
      firstTime = false

    # Yield for each frame index between previous and current
    for i in 0..<index - prevIndex:
      yield value
    swap(prevFrame, currentFrame)
```

**Key insight**: Motion is measured as `changedPixels / totalPixels` after scaling to a fixed width (default 400px) and applying Gaussian blur. The threshold is typically 0.02 (2% of pixels changed = "active").

### Pattern 5: FFmpeg Rendering (libav API, not subprocess)

**File: `src/render/format.nim`**

Auto-editor uses the **libav C API directly** (not FFmpeg CLI):

```nim
proc makeMedia*(args, tl, outputPath, rules, bar, cache) =
  var output = openWrite(outputPath)

  # Create video encoder context
  (vEncCtx, vOutStream, videoFrameIter) = makeNewVideoFrames(output, tl, args, cache)

  # Create audio encoder contexts (one per layer or mixed)
  for i in 0..<tl.a.len:
    let (aOutStream, aEncCtx) = output.addStream(audCodec, rate=rate, layout=tl.layout)
    aEncCtx.open()

  # Priority-queue interleaving of video + audio frames
  var frameQueue = initHeapQueue[Priority]()

  while true:
    # Get next video frame
    (videoFrame, index) = videoFrameIter()
    if videoFrame != nil:
      frameQueue.push(Priority(index: float(index), frame: videoFrame, stream: vOutStream))

    # Get audio frames (throttled to avoid getting too far ahead)
    for i in 0..<audioFrameIters.len:
      if shouldGetAudio[i]:
        (audioFrames[i], _) = audioFrameIters[i]()
        frameQueue.push(Priority(...))

    # Mux frames in temporal order
    while frameQueue.len > 0 and frameQueue[0].index <= float64(index):
      let item = frameQueue.pop()
      for outPacket in encCtx.encode(item.frame, outPacket):
        outPacket.stream_index = item.stream.index
        av_packet_rescale_ts(outPacket, encCtx.time_base, item.stream.time_base)
        output.mux(outPacket[])
```

**Key insight**: The priority queue ensures video and audio frames are muxed in correct temporal order, with a `MAX_AUDIO_AHEAD = 30` frame throttle to bound memory usage.

---

## 3. Applicable Patterns for TypeScript/Python Pipeline

### From Editly

| Pattern | Implementation | Applicable to Monet |
|---------|---------------|---------------------|
| Per-layer FFmpeg decode → RGBA | Spawn FFmpeg per layer, pipe raw frames to compositor | `src/server/lib/editly-effects.ts` already does this |
| WebGL transition engine | headless-gl + gl-transitions library | Monet already has Canvas2D transitions; could add WebGL |
| Audio amix with duration=first | `amix=inputs=N:duration=first:dropout_transition=0` | Replace `ffmpeg-concat` style audio with amix chains |
| Factory transition closures | `create()` returns a closure that captures GL context | Clean pattern for EDL→render transition pipeline |
| Configuration normalization | `parseConfig()` resolves defaults, validates, computes speedFactor | Map to MonetEDL validation + normalization |

### From Auto-Editor

| Pattern | Implementation | Applicable to Monet |
|---------|---------------|---------------------|
| Label-based edit system | `seq[uint8]` where 0=silent, 1=active, N=special | Map to MonetEDL effect intensity channels |
| Chunkify algorithm | Group consecutive same-label frames into `(start, end, effect)` | Build MonetEDL clips from analysis data |
| Threshold → boolean → label | `levels[i] >= threshold` → `or`/`and`/`xor` combinators | Compose multiple analysis signals (audio + motion + scene) |
| Effect dedup pool | `effects: seq[Actions]` indexed by uint32 | MonetEDL effects could deduplicate similarly |
| Priority-queue mux | HeapQueue for temporal frame ordering | Better than sequential mux for multi-track |
| SIMD audio peaks | SSE2/NEON/WASM intrinsics for peak detection | WebAssembly audio analysis for browser preview |
| Non-linear timeline (v3) | `Clip` with `src/start/dur/offset/stream/effects` | Maps to MonetEDL clip structure |
| Motion detection via pixel diff | `changedPixels / totalPixels` after scale+blur | Simple motion heuristic for beat analysis |

### Hybrid Architecture Recommendation

```
Analysis Phase (Python/TypeScript):
  audio: numpy Float32 → peaks per frame → seq[number]
  motion: ffmpeg → scale/gray/blur → pixel diff → seq[number]
  scene: ffmpeg scene detect → cut points

Edit Decision Phase (TypeScript):
  threshold(audio, motion, scene) → seq[boolean]
  combine(or/and/xor) → seq[uint8] labels
  chunkify(labels) → Clip[] with effect indices

Render Phase (FFmpeg CLI or libav):
  editly pattern: per-layer decode → compositor → pipe to encoder
  auto-editor pattern: libav API with priority-queue mux
  Monet pattern: EDL → FFmpeg filter graph → render
```
