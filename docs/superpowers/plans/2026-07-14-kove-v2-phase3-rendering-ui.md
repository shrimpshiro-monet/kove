# Kove v2 — Phase 3: Rendering + UI (The Body)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the brain drive real pixels. 20+ effects, 10+ transitions, WebGL preview, minimal frontend.

**Architecture:** Expand the FFmpeg renderer with more effects/transitions. Add a WebGL real-time preview. Build a minimal frontend that triggers the full pipeline.

**Tech Stack:** TypeScript, FFmpeg, WebGL, React, Vite

## Global Constraints

- Output: EDL v5.1 (validated by edl-v2 package)
- Effects: FFmpeg filter chains for export, WebGL shaders for preview
- TDD: write failing test first, implement, verify pass
- Commit after each task
- Frontend: minimal, functional, not pretty

---

## File Structure

```
workers/render-worker/
├── src/
│   ├── edl-to-ffmpeg.ts            # EDL → FFmpeg command (existing)
│   ├── effects/
│   │   ├── index.ts                 # Effect registry
│   │   ├── color.ts                 # Color effects (grade, vignette, desaturate)
│   │   ├── blur.ts                  # Blur effects (gaussian, radial, directional)
│   │   ├── distortion.ts            # Distortion (shake, rgb_split, glitch)
│   │   ├── time.ts                  # Time effects (speed_ramp, echo, reverse)
│   │   ├── stylistic.ts             # Stylistic (glow, bloom, film_grain, halftone)
│   │   └── overlay.ts               # Overlay (light_leak, lens_flare, particle)
│   ├── transitions/
│   │   ├── index.ts                 # Transition registry
│   │   ├── crossfade.ts             # Crossfade, dip_black, flash
│   │   ├── wipe.ts                  # Linear wipe, radial wipe, gradient wipe
│   │   ├── morph.ts                 # Morph cut, optical flow
│   │   └── stylized.ts              # Glitch, film_burn, whip_pan
│   └── renderer.ts                  # Execute FFmpeg, produce MP4
├── tests/
│   ├── effects/
│   │   ├── color.test.ts
│   │   ├── blur.test.ts
│   │   └── distortion.test.ts
│   ├── transitions/
│   │   ├── crossfade.test.ts
│   │   └── wipe.test.ts
│   └── e2e.test.ts
├── package.json
└── tsconfig.json

apps/web/
├── src/
│   ├── App.tsx                      # Main app
│   ├── components/
│   │   ├── UploadPanel.tsx          # File upload
│   │   ├── PromptInput.tsx          # Text prompt
│   │   ├── PreviewCanvas.tsx        # WebGL preview
│   │   ├── Timeline.tsx             # Simple timeline
│   │   └── ExportButton.tsx         # Export to MP4
│   ├── lib/
│   │   ├── api-client.ts            # API calls to director
│   │   └── webgl-renderer.ts        # WebGL effects renderer
│   └── main.tsx
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Tasks

### Task 17: Effect Registry + Color Effects

**Files:**
- Create: `workers/render-worker/src/effects/index.ts`
- Create: `workers/render-worker/src/effects/color.ts`
- Create: `workers/render-worker/tests/effects/color.test.ts`

**Interfaces:**
- Produces: `EffectFilter` type, color effect functions

- [ ] **Step 1: Write failing test**

```typescript
// tests/effects/color.test.ts
import { describe, it, expect } from 'vitest'
import { colorGrade, vignette, desaturate } from '../../src/effects/color'

describe('Color Effects', () => {
  it('generates color grade filter', () => {
    const result = colorGrade({ preset: 'teal_orange', intensity: 0.7 })
    expect(result).toContain('curves')
    expect(result).toContain('0.7')
  })

  it('generates vignette filter', () => {
    const result = vignette({ intensity: 0.5 })
    expect(result).toContain('vignette')
  })

  it('generates desaturate filter', () => {
    const result = desaturate({ intensity: 0.3, preserveSkinTones: true })
    expect(result).toContain('eq')
    expect(result).toContain('saturation')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/effects/color.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement color effects**

```typescript
// src/effects/color.ts
export interface ColorGradeParams {
  preset: string
  intensity: number
}

export interface VignetteParams {
  intensity: number
}

export interface DesaturateParams {
  intensity: number
  preserveSkinTones: boolean
}

export function colorGrade(params: ColorGradeParams): string {
  const { preset, intensity } = params
  switch (preset) {
    case 'teal_orange':
      return `curves=r='0/0 0.5/0.45 1/0.9':g='0/0 0.5/0.5 1/0.85':b='0/0.1 0.5/0.55 1/0.8',eq=saturation=${1 + intensity * 0.3}`
    case 'cinematic_warm':
      return `curves=r='0/0 0.5/0.55 1/0.95':g='0/0 0.5/0.5 1/0.85':b='0/0.05 0.5/0.45 1/0.75',eq=saturation=${1 + intensity * 0.2}`
    case 'cold_blue':
      return `curves=r='0/0 0.5/0.4 1/0.8':g='0/0 0.5/0.5 1/0.85':b='0/0.1 0.5/0.6 1/0.95',eq=saturation=${1 + intensity * 0.1}`
    default:
      return `eq=saturation=${1 + intensity * 0.2}`
  }
}

export function vignette(params: VignetteParams): string {
  const angle = Math.PI / (4 - params.intensity * 2)
  return `vignette=PI/${angle.toFixed(2)}`
}

export function desaturate(params: DesaturateParams): string {
  const saturation = 1 - params.intensity
  return `eq=saturation=${saturation.toFixed(2)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/effects/color.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/render-worker/
git commit -m "feat(render-worker): add color effects (grade, vignette, desaturate)"
```

---

### Task 18: Blur + Distortion Effects

**Files:**
- Create: `workers/render-worker/src/effects/blur.ts`
- Create: `workers/render-worker/src/effects/distortion.ts`
- Create: `workers/render-worker/tests/effects/blur.test.ts`
- Create: `workers/render-worker/tests/effects/distortion.test.ts`

**Interfaces:**
- Produces: blur and distortion effect functions

- [ ] **Step 1: Write failing test**

```typescript
// tests/effects/blur.test.ts
import { describe, it, expect } from 'vitest'
import { gaussianBlur, radialBlur, directionalBlur } from '../../src/effects/blur'

describe('Blur Effects', () => {
  it('generates gaussian blur', () => {
    const result = gaussianBlur({ radius: 10, quality: 'high' })
    expect(result).toContain('gblur')
  })

  it('generates radial blur', () => {
    const result = radialBlur({ center: [0.5, 0.5], strength: 15 })
    expect(result).toContain('zoompan')
  })
})
```

```typescript
// tests/effects/distortion.test.ts
import { describe, it, expect } from 'vitest'
import { shake, rgbSplit, glitch } from '../../src/effects/distortion'

describe('Distortion Effects', () => {
  it('generates shake filter', () => {
    const result = shake({ frequency: 30, amplitude: 5 })
    expect(result).toContain('crop')
  })

  it('generates rgb split', () => {
    const result = rgbSplit({ offset: 3, angle: 45 })
    expect(result).toContain('rgbashift')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/effects/`
Expected: FAIL

- [ ] **Step 3: Implement blur effects**

```typescript
// src/effects/blur.ts
export interface GaussianBlurParams { radius: number; quality: string }
export interface RadialBlurParams { center: [number, number]; strength: number }
export interface DirectionalBlurParams { angle: number; length: number }

export function gaussianBlur(params: GaussianBlurParams): string {
  return `gblur=sigma=${params.radius}`
}

export function radialBlur(params: RadialBlurParams): string {
  return `zoompan=z='min(zoom+0.0015,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
}

export function directionalBlur(params: DirectionalBlurParams): string {
  return `convolution='0 1 0 1 -4 1 0 1 0':0 1 0 1 -4 1 0 1 0':0 1 0 1 -4 1 0 1 0':0 1 0 1 -4 1 0 1 0'`
}
```

- [ ] **Step 4: Implement distortion effects**

```typescript
// src/effects/distortion.ts
export interface ShakeParams { frequency: number; amplitude: number }
export interface RGBSplitParams { offset: number; angle: number }
export interface GlitchParams { intensity: number; blockWidth: number }

export function shake(params: ShakeParams): string {
  const w = 1920 - params.amplitude * 2
  const h = 1080 - params.amplitude * 2
  return `crop=${w}:${h}:${params.amplitude}:${params.amplitude},scale=1920:1080`
}

export function rgbSplit(params: RGBSplitParams): string {
  return `rgbashift=rh=${params.offset}:bh=-${params.offset}`
}

export function glitch(params: GlitchParams): string {
  return `rgbashift=rh=${params.intensity * 2}:bh=-${params.intensity * 2},noise=alls=${params.intensity * 10}:allf=t`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/effects/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/render-worker/
git commit -m "feat(render-worker): add blur and distortion effects"
```

---

### Task 19: Stylistic + Overlay Effects

**Files:**
- Create: `workers/render-worker/src/effects/stylistic.ts`
- Create: `workers/render-worker/src/effects/overlay.ts`
- Create: `workers/render-worker/tests/effects/stylistic.test.ts`

**Interfaces:**
- Produces: stylistic and overlay effect functions

- [ ] **Step 1: Write failing test**

```typescript
// tests/effects/stylistic.test.ts
import { describe, it, expect } from 'vitest'
import { glow, bloom, filmGrain, halftone } from '../../src/effects/stylistic'

describe('Stylistic Effects', () => {
  it('generates glow', () => {
    const result = glow({ radius: 20, threshold: 0.7, color: '#FFD700' })
    expect(result).toContain('gblur')
    expect(result).toContain('blend')
  })

  it('generates film grain', () => {
    const result = filmGrain({ type: 'kodak_5219', size: 'medium' })
    expect(result).toContain('noise')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/effects/stylistic.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement stylistic effects**

```typescript
// src/effects/stylistic.ts
export interface GlowParams { radius: number; threshold: number; color?: string }
export interface BloomParams { threshold: number; radius: number }
export interface FilmGrainParams { type: string; size: string }
export interface HalftoneParams { dotSize: number; angle: number }

export function glow(params: GlowParams): string {
  const sigma = params.radius * 0.5
  return `gblur=sigma=${sigma},colorbalance=rs=${params.threshold * 0.1}`
}

export function bloom(params: BloomParams): string {
  return `gblur=sigma=${params.radius},curves=m='0/0 0.5/${0.5 + params.threshold * 0.3} 1/1'`
}

export function filmGrain(params: FilmGrainParams): string {
  const amount = params.size === 'heavy' ? 30 : params.size === 'medium' ? 15 : 8
  return `noise=alls=${amount}:allf=t+u`
}

export function halftone(params: HalftoneParams): string {
  return `edgedetect=mode=threshold,curves=m='0/0 0.5/0.2 1/1'`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/effects/stylistic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/render-worker/
git commit -m "feat(render-worker): add stylistic effects (glow, bloom, film_grain, halftone)"
```

---

### Task 20: Transition Effects

**Files:**
- Create: `workers/render-worker/src/transitions/index.ts`
- Create: `workers/render-worker/src/transitions/crossfade.ts`
- Create: `workers/render-worker/src/transitions/wipe.ts`
- Create: `workers/render-worker/src/transitions/stylized.ts`
- Create: `workers/render-worker/tests/transitions/crossfade.test.ts`
- Create: `workers/render-worker/tests/transitions/wipe.test.ts`

**Interfaces:**
- Produces: transition effect functions

- [ ] **Step 1: Write failing test**

```typescript
// tests/transitions/crossfade.test.ts
import { describe, it, expect } from 'vitest'
import { crossfade, dipBlack, flash } from '../../src/transitions/crossfade'

describe('Crossfade Transitions', () => {
  it('generates crossfade filter', () => {
    const result = crossfade({ duration: 0.5 })
    expect(result).toContain('xfade')
  })

  it('generates dip to black', () => {
    const result = dipBlack({ duration: 1.0 })
    expect(result).toContain('xfade')
    expect(result).toContain('fade')
  })

  it('generates flash', () => {
    const result = flash({ duration: 0.15, color: '#FFFFFF' })
    expect(result).toContain('fade')
  })
})
```

```typescript
// tests/transitions/wipe.test.ts
import { describe, it, expect } from 'vitest'
import { linearWipe, radialWipe, gradientWipe } from '../../src/transitions/wipe'

describe('Wipe Transitions', () => {
  it('generates linear wipe', () => {
    const result = linearWipe({ duration: 0.5, direction: 'left' })
    expect(result).toContain('xfade')
    expect(result).toContain('wipeleft')
  })

  it('generates radial wipe', () => {
    const result = radialWipe({ duration: 0.5 })
    expect(result).toContain('xfade')
    expect(result).toContain('radial')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/transitions/`
Expected: FAIL

- [ ] **Step 3: Implement crossfade transitions**

```typescript
// src/transitions/crossfade.ts
export interface CrossfadeParams { duration: number }
export interface DipBlackParams { duration: number; holdBlack?: number }
export interface FlashParams { duration: number; color: string }

export function crossfade(params: CrossfadeParams): string {
  const offset = Math.round(params.duration * 30)  # assume 30fps
  return `xfade=transition=fade:duration=${params.duration}:offset=0`
}

export function dipBlack(params: DipBlackParams): string {
  return `xfade=transition=fade:duration=${params.duration}:offset=0`
}

export function flash(params: FlashParams): string {
  return `fade=t=in:st=0:d=${params.duration}:color=${params.color},fade=t=out:st=${params.duration}:d=${params.duration}`
}
```

- [ ] **Step 4: Implement wipe transitions**

```typescript
// src/transitions/wipe.ts
export interface LinearWipeParams { duration: number; direction: string }
export interface RadialWipeParams { duration: number }
export interface GradientWipeParams { duration: number; gradient: string }

const directionMap: Record<string, string> = {
  left: 'wipeleft', right: 'wiperight', up: 'wipeup', down: 'wipedown',
}

export function linearWipe(params: LinearWipeParams): string {
  const transition = directionMap[params.direction] || 'wipeleft'
  return `xfade=transition=${transition}:duration=${params.duration}:offset=0`
}

export function radialWipe(params: RadialWipeParams): string {
  return `xfade=transition=radial:duration=${params.duration}:offset=0`
}

export function gradientWipe(params: GradientWipeParams): string {
  return `xfade=transition=smoothleft:duration=${params.duration}:offset=0`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/transitions/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/render-worker/
git commit -m "feat(render-worker): add transition effects (crossfade, wipe, flash, dip_black)"
```

---

### Task 21: Effect Registry + Updated Renderer

**Files:**
- Modify: `workers/render-worker/src/effects/index.ts`
- Modify: `workers/render-worker/src/edl-to-ffmpeg.ts`
- Create: `workers/render-worker/tests/effects/registry.test.ts`

**Interfaces:**
- Consumes: All effect functions
- Produces: Updated `effectToFilter` that handles 20+ effects

- [ ] **Step 1: Write failing test**

```typescript
// tests/effects/registry.test.ts
import { describe, it, expect } from 'vitest'
import { effectToFilter } from '../../src/effects/index'

describe('Effect Registry', () => {
  it('handles color effects', () => {
    expect(effectToFilter({ type: 'color_grade', targetStrength: 0.7, params: { preset: 'teal_orange' } })).toContain('curves')
    expect(effectToFilter({ type: 'vignette', targetStrength: 0.5, params: {} })).toContain('vignette')
    expect(effectToFilter({ type: 'desaturate', targetStrength: 0.3, params: {} })).toContain('eq')
  })

  it('handles blur effects', () => {
    expect(effectToFilter({ type: 'blur', targetStrength: 0.5, params: {} })).toContain('gblur')
    expect(effectToFilter({ type: 'glow', targetStrength: 0.6, params: {} })).toContain('gblur')
  })

  it('handles distortion effects', () => {
    expect(effectToFilter({ type: 'shake', targetStrength: 0.3, params: {} })).toContain('crop')
    expect(effectToFilter({ type: 'rgb_split', targetStrength: 0.2, params: {} })).toContain('rgbashift')
  })

  it('handles stylistic effects', () => {
    expect(effectToFilter({ type: 'film_grain', targetStrength: 0.2, params: {} })).toContain('noise')
    expect(effectToFilter({ type: 'bloom', targetStrength: 0.4, params: {} })).toContain('gblur')
  })

  it('returns null for unknown effects', () => {
    expect(effectToFilter({ type: 'unknown_effect', targetStrength: 0.5, params: {} })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/effects/registry.test.ts`
Expected: FAIL (effectToFilter doesn't exist yet)

- [ ] **Step 3: Implement effect registry**

```typescript
// src/effects/index.ts
import { colorGrade, vignette, desaturate } from './color'
import { gaussianBlur, radialBlur } from './blur'
import { shake, rgbSplit, glitch } from './distortion'
import { glow, bloom, filmGrain, halftone } from './stylistic'

export interface EffectParams {
  type: string
  targetStrength: number
  params: Record<string, unknown>
}

export function effectToFilter(effect: EffectParams): string | null {
  const { type, targetStrength, params } = effect

  switch (type) {
    // Color
    case 'color_grade':
      return colorGrade({ preset: (params.preset as string) || 'teal_orange', intensity: targetStrength })
    case 'vignette':
      return vignette({ intensity: targetStrength })
    case 'desaturate':
      return desaturate({ intensity: targetStrength, preserveSkinTones: (params.preserveSkinTones as boolean) || false })

    // Blur
    case 'blur':
    case 'gaussian_blur':
      return gaussianBlur({ radius: targetStrength * 20, quality: 'medium' })
    case 'glow':
      return glow({ radius: (params.radius as number) || 20, threshold: targetStrength })
    case 'bloom':
      return bloom({ threshold: targetStrength, radius: (params.radius as number) || 15 })

    // Distortion
    case 'shake':
      return shake({ frequency: 30, amplitude: targetStrength * 10 })
    case 'rgb_split':
      return rgbSplit({ offset: targetStrength * 5, angle: 45 })
    case 'glitch':
      return glitch({ intensity: targetStrength, blockWidth: 10 })

    // Stylistic
    case 'film_grain':
      return filmGrain({ type: (params.type as string) || 'kodak_5219', size: 'medium' })
    case 'halftone':
      return halftone({ dotSize: 4, angle: 45 })

    // Radial
    case 'radial_zoom_blur':
      return radialBlur({ center: [0.5, 0.5], strength: targetStrength * 20 })

    default:
      console.warn(`[effects] Unhandled effect type "${type}" — skipping`)
      return null
  }
}
```

- [ ] **Step 4: Update renderer to use effect registry**

```typescript
// Update src/edl-to-ffmpeg.ts
import { effectToFilter } from './effects'

// Replace the old effectToFilter function with the import
// Remove the local effectToFilter function
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/effects/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/render-worker/
git commit -m "feat(render-worker): add effect registry with 13 effect types"
```

---

### Task 22: E2E Render with Effects

**Files:**
- Modify: `workers/render-worker/tests/e2e.test.ts`

**Interfaces:**
- Consumes: EDL with real effects
- Produces: Rendered MP4 with effects applied

- [ ] **Step 1: Write failing test**

```typescript
// tests/e2e.test.ts (add test)
import { describe, it, expect } from 'vitest'
import { edlToFFmpegCommand } from '../src/edl-to-ffmpeg'
import { execSync } from 'child_process'
import { existsSync, unlinkSync } from 'fs'

describe('E2E Render with Effects', () => {
  it('renders MP4 with color grade + vignette + film grain', () => {
    const edl = {
      timeline: { resolution: { width: 540, height: 960 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'test_clip', type: 'video', in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 1.0 },
          effects: [
            { id: 'fx_1', type: 'color_grade', targetStrength: 0.7, params: { preset: 'teal_orange' } },
            { id: 'fx_2', type: 'vignette', targetStrength: 0.5, params: {} },
            { id: 'fx_3', type: 'film_grain', targetStrength: 0.2, params: {} },
          ],
        }],
      }],
    }

    const outputPath = 'workers/render-worker/fixtures/output_effects.mp4'
    const cmd = edlToFFmpegCommand(edl, 'workers/render-worker/fixtures/test_clip.mp4', outputPath)
    
    execSync(cmd, { stdio: 'pipe' })
    expect(existsSync(outputPath)).toBe(true)
    
    // Cleanup
    if (existsSync(outputPath)) unlinkSync(outputPath)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/e2e.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add workers/render-worker/tests/e2e.test.ts
git commit -m "feat(render-worker): add e2e render test with effects pipeline"
```

---

### Task 23: Minimal Frontend

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/components/UploadPanel.tsx`
- Create: `apps/web/src/components/PromptInput.tsx`
- Create: `apps/web/src/components/ExportButton.tsx`
- Create: `apps/web/src/lib/api-client.ts`

**Interfaces:**
- Consumes: Director API (Python)
- Produces: Minimal UI for upload → prompt → export

- [ ] **Step 1: Scaffold frontend**

```bash
cd apps/web
npm create vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Create minimal App**

```tsx
// src/App.tsx
import { useState } from 'react'
import { UploadPanel } from './components/UploadPanel'
import { PromptInput } from './components/PromptInput'
import { ExportButton } from './components/ExportButton'
import { generateEDL } from './lib/api-client'

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [prompt, setPrompt] = useState('')
  const [edl, setEdl] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!videoFile || !audioFile || !prompt) return
    setLoading(true)
    try {
      const result = await generateEDL(videoFile, audioFile, prompt)
      setEdl(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Kove v2</h1>
      <UploadPanel
        videoFile={videoFile}
        audioFile={audioFile}
        onVideoChange={setVideoFile}
        onAudioChange={setAudioFile}
      />
      <PromptInput value={prompt} onChange={setPrompt} />
      <button onClick={handleGenerate} disabled={loading || !videoFile || !audioFile || !prompt}>
        {loading ? 'Generating...' : 'Generate Edit'}
      </button>
      {edl && <ExportButton edl={edl} />}
      {edl && (
        <pre style={{ maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 10 }}>
          {JSON.stringify(edl, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default App
```

- [ ] **Step 3: Create components**

```tsx
// src/components/UploadPanel.tsx
interface Props {
  videoFile: File | null
  audioFile: File | null
  onVideoChange: (f: File) => void
  onAudioChange: (f: File) => void
}

export function UploadPanel({ videoFile, audioFile, onVideoChange, onAudioChange }: Props) {
  return (
    <div style={{ margin: '20px 0' }}>
      <div>
        <label>Video: </label>
        <input type="file" accept="video/*" onChange={e => e.target.files?.[0] && onVideoChange(e.target.files[0])} />
        {videoFile && <span> {videoFile.name}</span>}
      </div>
      <div>
        <label>Audio: </label>
        <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && onAudioChange(e.target.files[0])} />
        {audioFile && <span> {audioFile.name}</span>}
      </div>
    </div>
  )
}
```

```tsx
// src/components/PromptInput.tsx
interface Props {
  value: string
  onChange: (v: string) => void
}

export function PromptInput({ value, onChange }: Props) {
  return (
    <div style={{ margin: '20px 0' }}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Describe your edit... (e.g., 'Make a hype TikTok edit with fast cuts and glow effects')"
        rows={3}
        style={{ width: '100%', padding: 10 }}
      />
    </div>
  )
}
```

```tsx
// src/components/ExportButton.tsx
interface Props {
  edl: unknown
}

export function ExportButton({ edl }: Props) {
  const handleExport = async () => {
    // TODO: call export API
    alert('Export coming soon!')
  }

  return (
    <button onClick={handleExport} style={{ marginTop: 20, padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4 }}>
      Export MP4
    </button>
  )
}
```

```typescript
// src/lib/api-client.ts
export async function generateEDL(video: File, audio: File, prompt: string): Promise<unknown> {
  // TODO: upload files and call director API
  // For now, return mock
  return {
    version: '5.1',
    id: 'mock_edl',
    duration: 15,
    style: { tokens: { aggression: 0.8, energy: 0.9 } },
    creative: { moments: [{ id: 'm1', purpose: 'reveal', emotion: 'awe' }] },
    runtime: { tracks: [] },
  }
}
```

- [ ] **Step 4: Run dev server**

```bash
cd apps/web && npm run dev
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add minimal frontend with upload, prompt, export"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 17 | Color Effects | 30 min |
| 18 | Blur + Distortion Effects | 30 min |
| 19 | Stylistic + Overlay Effects | 30 min |
| 20 | Transition Effects | 30 min |
| 21 | Effect Registry + Updated Renderer | 20 min |
| 22 | E2E Render with Effects | 15 min |
| 23 | Minimal Frontend | 45 min |
| **Total** | | **~3 hours** |

## After Phase 3

Phase 4 adds the differentiators:
- User learning + memory
- Bandit exploration
- Real-time co-editing (deferred)
- Multi-track compositing
- WebGL real-time preview
