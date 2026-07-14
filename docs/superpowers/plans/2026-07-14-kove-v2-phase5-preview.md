# Kove v2 — Phase 5: Real-Time Preview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebGL real-time preview so you can see effects before rendering. Test the power yourself.

**Architecture:** Canvas2D/WebGL renderer in the browser. Seek-driven deterministic playback. Effects applied in real-time.

**Tech Stack:** TypeScript, Canvas2D, WebGL, Web Audio API

## Global Constraints

- Preview must match FFmpeg output (same effects, same timing)
- Seek-driven: scrub timeline, see exact frame
- 30fps minimum on modern hardware
- Effects: all 15 effects working in preview
- Transitions: crossfade, dip_black, flash working in preview

---

## File Structure

```
apps/web/src/
├── lib/
│   ├── preview-renderer.ts        # Canvas2D/WebGL preview renderer
│   ├── media-loader.ts            # Video/audio loading + seeking
│   ├── effects-engine.ts          # Canvas2D effects implementation
│   ├── transition-engine.ts       # Canvas2D transitions
│   └── timeline-player.ts         # Seek-driven playback controller
├── components/
│   ├── PreviewCanvas.tsx          # Canvas element + controls
│   ├── Timeline.tsx               # Visual timeline with playhead
│   └── EffectControls.tsx         # Effect parameter sliders
└── ...

workers/render-worker/src/
├── preview/
│   ├── index.ts                   # Preview module exports
│   ├── canvas-effects.ts          # Canvas2D effect implementations
│   └── canvas-transitions.ts      # Canvas2D transition implementations
└── ...
```

---

## Tasks

### Task 31: Canvas2D Effects Engine

**Files:**
- Create: `apps/web/src/lib/effects-engine.ts`
- Create: `apps/web/src/lib/canvas-effects.ts`

**Interfaces:**
- Consumes: EDL effects array
- Produces: Canvas2D filter strings

- [ ] **Step 1: Write failing test**

```typescript
// tests/canvas-effects.test.ts
import { describe, it, expect } from 'vitest'
import { applyEffect, getCanvasFilter } from '../../src/lib/canvas-effects'

describe('Canvas2D Effects', () => {
  it('converts glow to canvas filter', () => {
    const filter = getCanvasFilter({ type: 'glow', targetStrength: 0.6, params: {} })
    expect(filter).toContain('blur')
  })

  it('converts vignette to canvas gradient', () => {
    const result = applyEffect(null, { type: 'vignette', targetStrength: 0.5, params: {} }, 1920, 1080)
    expect(result).toBe('gradient')  # vignette uses gradient overlay
  })

  it('converts shake to canvas transform', () => {
    const result = applyEffect(null, { type: 'shake', targetStrength: 0.3, params: {} }, 1920, 1080)
    expect(result).toBe('transform')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/canvas-effects.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement canvas effects**

```typescript
// src/lib/canvas-effects.ts
export interface CanvasEffect {
  type: string
  targetStrength: number
  params: Record<string, unknown>
}

export function getCanvasFilter(effect: CanvasEffect): string {
  const { type, targetStrength } = effect
  
  switch (type) {
    case 'glow':
    case 'blur':
    case 'gaussian_blur':
      return `blur(${targetStrength * 10}px)`
    
    case 'desaturate':
      return `grayscale(${targetStrength * 100}%)`
    
    case 'brightness':
      return `brightness(${1 + targetStrength * 0.5})`
    
    case 'contrast':
      return `contrast(${1 + targetStrength * 0.5})`
    
    case 'hue_rotate':
      return `hue-rotate(${targetStrength * 360}deg)`
    
    case 'saturate':
      return `saturate(${1 + targetStrength})`
    
    default:
      return ''
  }
}

export function applyEffect(
  ctx: CanvasRenderingContext2D | null,
  effect: CanvasEffect,
  width: number,
  height: number
): string {
  const { type, targetStrength } = effect
  
  switch (type) {
    case 'vignette':
      return 'gradient'  # needs custom drawing
    
    case 'shake':
      return 'transform'  # needs transform
    
    case 'rgb_split':
      return 'channels'  # needs channel separation
    
    case 'film_grain':
      return 'noise'  # needs noise overlay
    
    case 'glitch':
      return 'glitch'  # needs slice displacement
    
    default:
      return 'filter'  # use CSS filter
  }
}

export function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
): void {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, width * 0.3,
    width / 2, height / 2, width * 0.7
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`)
  
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

export function applyShake(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  time: number
): void {
  const shakeX = Math.sin(time * 30) * intensity * 10
  const shakeY = Math.cos(time * 25) * intensity * 10
  ctx.translate(shakeX, shakeY)
}

export function drawFilmGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity * 50
    data[i] += noise
    data[i + 1] += noise
    data[i + 2] += noise
  }
  
  ctx.putImageData(imageData, 0, 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/canvas-effects.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add Canvas2D effects engine for real-time preview"
```

---

### Task 32: Media Loader + Seek

**Files:**
- Create: `apps/web/src/lib/media-loader.ts`
- Create: `apps/web/src/lib/timeline-player.ts`

**Interfaces:**
- Consumes: Video/audio files
- Produces: Seekable video element + audio context

- [ ] **Step 1: Write failing test**

```typescript
// tests/media-loader.test.ts
import { describe, it, expect } from 'vitest'
import { MediaLoader } from '../../src/lib/media-loader'

describe('MediaLoader', () => {
  it('creates loader with video element', () => {
    const loader = new MediaLoader()
    expect(loader.video).toBeDefined()
    expect(loader.video.tagName).toBe('VIDEO')
  })

  it('seeks to specific time', async () => {
    const loader = new MediaLoader()
    await loader.seekTo(5.0)
    expect(loader.currentTime).toBe(5.0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/media-loader.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement media loader**

```typescript
// src/lib/media-loader.ts
export class MediaLoader {
  video: HTMLVideoElement
  audioContext: AudioContext
  audioSource: MediaElementAudioSourceNode | null = null
  
  constructor() {
    this.video = document.createElement('video')
    this.video.crossOrigin = 'anonymous'
    this.video.preload = 'auto'
    this.audioContext = new AudioContext()
  }
  
  async loadVideo(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.video.onloadeddata = () => resolve()
      this.video.onerror = () => reject(new Error('Failed to load video'))
      this.video.src = url
    })
  }
  
  async loadAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio')
      audio.onloadeddata = () => {
        this.audioSource = this.audioContext.createMediaElementSource(audio)
        this.audioSource.connect(this.audioContext.destination)
        resolve()
      }
      audio.onerror = () => reject(new Error('Failed to load audio'))
      audio.src = url
    })
  }
  
  async seekTo(time: number): Promise<void> {
    return new Promise((resolve) => {
      this.video.onseeked = () => resolve()
      this.video.currentTime = time
    })
  }
  
  get currentTime(): number {
    return this.video.currentTime
  }
  
  get duration(): number {
    return this.video.duration
  }
  
  play(): void {
    this.video.play()
    this.audioContext?.resume()
  }
  
  pause(): void {
    this.video.pause()
    this.audioContext?.suspend()
  }
}
```

- [ ] **Step 4: Implement timeline player**

```typescript
// src/lib/timeline-player.ts
import { MediaLoader } from './media-loader'

export interface TimelineState {
  currentTime: number
  duration: number
  isPlaying: boolean
  fps: number
}

export class TimelinePlayer {
  private loader: MediaLoader
  private state: TimelineState
  private animationFrame: number | null = null
  private onStateChange: (state: TimelineState) => void
  
  constructor(loader: MediaLoader, onStateChange: (state: TimelineState) => void) {
    this.loader = loader
    this.onStateChange = onStateChange
    this.state = {
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      fps: 30,
    }
  }
  
  async load(videoUrl: string, audioUrl: string): Promise<void> {
    await this.loader.loadVideo(videoUrl)
    await this.loader.loadAudio(audioUrl)
    this.state.duration = this.loader.duration
    this.emitState()
  }
  
  play(): void {
    this.state.isPlaying = true
    this.loader.play()
    this.tick()
    this.emitState()
  }
  
  pause(): void {
    this.state.isPlaying = false
    this.loader.pause()
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.emitState()
  }
  
  async seekTo(time: number): Promise<void> {
    await this.loader.seekTo(time)
    this.state.currentTime = time
    this.emitState()
  }
  
  private tick(): void {
    if (!this.state.isPlaying) return
    
    this.state.currentTime = this.loader.currentTime
    this.emitState()
    
    this.animationFrame = requestAnimationFrame(() => this.tick())
  }
  
  private emitState(): void {
    this.onStateChange({ ...this.state })
  }
  
  getState(): TimelineState {
    return { ...this.state }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/media-loader.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add media loader and timeline player for preview"
```

---

### Task 33: Preview Canvas Component

**Files:**
- Create: `apps/web/src/components/PreviewCanvas.tsx`
- Create: `apps/web/src/components/Timeline.tsx`

**Interfaces:**
- Consumes: EDL, media files
- Produces: Real-time preview with effects

- [ ] **Step 1: Write failing test**

```typescript
// tests/preview-canvas.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreviewCanvas } from '../../src/components/PreviewCanvas'

describe('PreviewCanvas', () => {
  it('renders canvas element', () => {
    render(<PreviewCanvas edl={null} />)
    expect(screen.getByTestId('preview-canvas')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/preview-canvas.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PreviewCanvas**

```tsx
// src/components/PreviewCanvas.tsx
import { useRef, useEffect, useState } from 'react'
import { MediaLoader } from '../lib/media-loader'
import { TimelinePlayer, TimelineState } from '../lib/timeline-player'
import { getCanvasFilter, drawVignette, applyShake, drawFilmGrain } from '../lib/canvas-effects'

interface Props {
  edl: unknown
  videoUrl?: string
  audioUrl?: string
}

export function PreviewCanvas({ edl, videoUrl, audioUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [player, setPlayer] = useState<TimelinePlayer | null>(null)
  const [state, setState] = useState<TimelineState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    fps: 30,
  })

  useEffect(() => {
    if (!videoUrl || !audioUrl) return

    const loader = new MediaLoader()
    const timelinePlayer = new TimelinePlayer(loader, setState)
    
    timelinePlayer.load(videoUrl, audioUrl)
    setPlayer(timelinePlayer)

    return () => {
      timelinePlayer.pause()
    }
  }, [videoUrl, audioUrl])

  useEffect(() => {
    if (!player || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const renderFrame = () => {
      const video = player['loader'].video
      if (!video || video.readyState < 2) return

      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Apply effects from EDL
      const edlData = edl as any
      if (edlData?.runtime?.tracks) {
        for (const track of edlData.runtime.tracks) {
          for (const clip of track.clips || []) {
            if (clip.effects) {
              for (const effect of clip.effects) {
                applyCanvasEffect(ctx, effect, canvas.width, canvas.height, state.currentTime)
              }
            }
          }
        }
      }
    }

    // Render loop
    let animFrame: number
    const loop = () => {
      renderFrame()
      animFrame = requestAnimationFrame(loop)
    }
    loop()

    return () => cancelAnimationFrame(animFrame)
  }, [player, edl, state.currentTime])

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        width={1920}
        height={1080}
        style={{ width: '100%', maxWidth: 640, background: '#000' }}
      />
      <div style={{ marginTop: 10 }}>
        <button onClick={() => player?.play()} disabled={state.isPlaying}>Play</button>
        <button onClick={() => player?.pause()} disabled={!state.isPlaying}>Pause</button>
        <span> {state.currentTime.toFixed(1)}s / {state.duration.toFixed(1)}s</span>
      </div>
    </div>
  )
}

function applyCanvasEffect(
  ctx: CanvasRenderingContext2D,
  effect: { type: string; targetStrength: number; params: Record<string, unknown> },
  width: number,
  height: number,
  time: number
): void {
  const { type, targetStrength } = effect

  switch (type) {
    case 'vignette':
      drawVignette(ctx, width, height, targetStrength)
      break
    case 'shake':
      applyShake(ctx, width, height, targetStrength, time)
      break
    case 'film_grain':
      drawFilmGrain(ctx, width, height, targetStrength)
      break
    case 'glow':
    case 'blur':
      ctx.filter = getCanvasFilter(effect)
      break
    default:
      break
  }
}
```

- [ ] **Step 4: Implement Timeline**

```tsx
// src/components/Timeline.tsx
interface Props {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

export function Timeline({ currentTime, duration, onSeek }: Props) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    const time = percent * duration
    onSeek(time)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        width: '100%',
        height: 40,
        background: '#333',
        borderRadius: 4,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${(currentTime / duration) * 100}%`,
          top: 0,
          width: 2,
          height: '100%',
          background: '#007bff',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${(currentTime / duration) * 100}%`,
          height: '100%',
          background: 'rgba(0,123,255,0.3)',
          borderRadius: 4,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/preview-canvas.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add PreviewCanvas and Timeline components"
```

---

### Task 34: Wire Preview into KoveApp

**Files:**
- Modify: `apps/web/src/components/KoveApp.tsx`

**Interfaces:**
- Consumes: EDL from Director
- Produces: Preview with real-time effects

- [ ] **Step 1: Update KoveApp to include preview**

```tsx
// Update KoveApp.tsx
import { PreviewCanvas } from './PreviewCanvas'
import { Timeline } from './Timeline'

// Add state for preview
const [videoUrl, setVideoUrl] = useState<string | null>(null)
const [audioUrl, setAudioUrl] = useState<string | null>(null)

// After file upload, create object URLs
useEffect(() => {
  if (videoFile) setVideoUrl(URL.createObjectURL(videoFile))
  if (audioFile) setAudioUrl(URL.createObjectURL(audioFile))
}, [videoFile, audioFile])

// Add preview section after generate
{edl && videoUrl && audioUrl && (
  <div style={{ marginTop: 20 }}>
    <h3>Preview</h3>
    <PreviewCanvas edl={edl} videoUrl={videoUrl} audioUrl={audioUrl} />
  </div>
)}
```

- [ ] **Step 2: Run dev server to verify**

Run: `cd apps/web && npm run dev`
Expected: Preview canvas visible with video

- [ ] **Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): wire preview into KoveApp"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 31 | Canvas2D Effects Engine | 45 min |
| 32 | Media Loader + Seek | 45 min |
| 33 | Preview Canvas Component | 45 min |
| 34 | Wire Preview into KoveApp | 15 min |
| **Total** | | **~2.5 hours** |

## After Phase 5

You can:
1. Upload video + song
2. Type prompt
3. See real-time preview with effects
4. Scrub timeline to see exact frames
5. Export to MP4

**Test it yourself. Show a friend. If they don't believe it's AI — we've won.**
