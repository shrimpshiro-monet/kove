---
description: "Use when working on the Canvas2D renderer, adding new visual effects, fixing frame rendering, working on transitions, improving render performance, or debugging preview playback. Covers MonetRenderer API, effect implementations, Canvas2D constraints, and the <100ms per frame target. Load when editing monet-renderer.ts, effects.ts, transitions.ts, or VideoPreview.tsx."
applyTo: "src/lib/renderer/**,src/components/chat/VideoPreview.tsx,src/lib/export-engine.ts"
---

# Renderer — Canvas2D Engine

Files: [src/lib/renderer/](../../src/lib/renderer/)

## Performance Contract

- **<100ms per frame** — hard limit. If consistently exceeded, profile before continuing.
- **<150ms scrub latency** — seek to arbitrary timestamp.
- Never render on main thread without a `requestAnimationFrame` guard.
- Cache decoded video frames ±2 seconds around current position.

## MonetRenderer API

```typescript
class MonetRenderer {
  async initialize(edl: MonetEDL, canvas: HTMLCanvasElement, mediaUrls?: Map<string, string>)
  async renderFrame(time: number): Promise<void>
  getDuration(): number
  cleanup(): void  // Always call on component unmount — releases video elements
}
```

## Rendering Pipeline Order (Do Not Reorder)

```
1. Find current shot at time T
2. Compute sourceTime = shot.source.inPoint + timeInShot × (shot.timing.speed ?? 1.0)
3. ctx.save()
4. Apply transform: translate(x,y) → scale(s) → rotate(r)
5. Draw video frame: ctx.drawImage(videoEl, ...)
6. Apply post-processing effects (order matters: color → glow → shake)
7. Blend transition (if transition period: apply crossfade/dip_black alpha)
8. ctx.restore()
```

## Effects Reference ([effects.ts](../../src/lib/renderer/effects.ts))

| Effect | Canvas API | Intensity → Param |
|---|---|---|
| `blur` | `ctx.filter = "blur(Xpx)"` | intensity × 10px |
| `brightness` | `ctx.filter = "brightness(X)"` | 0.5 + intensity × 1.0 |
| `contrast` | `ctx.filter = "contrast(X)"` | 0.5 + intensity × 1.5 |
| `saturation` | `ctx.filter = "saturate(X)"` | intensity × 2.0 |
| `glow` | shadow blur | radius = intensity × 30 |
| `shake` | `ctx.translate(dx, dy)` | offset ±intensity × 20px |
| `zoom_pulse` | `ctx.scale(s)` | 1 + sin(t/200) × intensity × 0.05 |

**Always reset `ctx.filter = "none"` after filtered draw.** Filters persist to next draw call if not reset.

## Color Grades (globalEffects.colorGrade)

Applied as CSS filter on the `<canvas>` element (not per-frame compositing in MVP):

```typescript
const COLOR_GRADE_FILTERS: Record<string, string> = {
  cinematic:   "contrast(1.1) saturate(0.85) sepia(0.15)",  // teal-orange
  vibrant:     "contrast(1.15) saturate(1.4)",               // sports/dance
  vintage:     "sepia(0.4) contrast(0.9) brightness(1.05)",
  monochrome:  "grayscale(1)",
  anime:       "contrast(1.2) saturate(1.6) brightness(1.05)",  // high-contrast
  raw:         "",
};
```

## Transitions ([transitions.ts](../../src/lib/renderer/transitions.ts))

| Type | Implementation | Use For |
|---|---|---|
| `cut` | Instantaneous, duration=0 | 80%+ of transitions |
| `crossfade` | Blend opacity 0→1 | Slow/emotional moments |
| `dip_black` | Fade to #000 then back | Major act breaks |
| `slide` | Translate right→left | Upbeat/dynamic (rare) |

Transition `progress` is 0→1 over `transition.duration` seconds.

## Export Engine ([export-engine.ts](../../src/lib/export-engine.ts))

- **Web Worker only** — never run export on main thread
- Progress callback every 1s: `{ framesRendered, totalFrames, percent, estimatedSecondsRemaining }`
- Keyframe every 2s (`frameIdx % (fps * 2) === 0`)
- If `VideoEncoder` undefined: throw with user-friendly message to upgrade browser
- Codec: `avc1.42001f` (H.264 Baseline Level 3.1), 8Mbps, 30fps

## Common Pitfalls

- `video.currentTime = t` is async — await `seeked` event before calling `ctx.drawImage`
- `ctx.filter` stacks — always reset to `"none"` after each effect
- `URL.createObjectURL()` for blob URLs — always `URL.revokeObjectURL()` on cleanup
- `VideoFrame` must be `.close()`d after encoding — GPU memory leak otherwise
- `canvas.transferControlToOffscreen()` for Worker rendering — check browser support first
