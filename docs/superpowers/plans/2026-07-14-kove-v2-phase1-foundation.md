# Kove v2 — Vertical Slice: Ugly Edit → Real Render

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One B-tier edit from real footage, end-to-end, that a creator would post. Ugly, hardcoded, one clip, one song — but real pixels on screen.

**Architecture:** EDL schema → hardcoded analysis → dumb planner → FFmpeg render. No AI, no Rust, no Go. Just enough to see if the pipeline produces something watchable.

**Tech Stack:** TypeScript, Zod, Python 3.11+, FFmpeg (via shell), Node.js

## Global Constraints

- EDL version: 5.1
- TDD: write failing test first, implement, verify pass
- Commit after each task
- No AI calls — everything hardcoded or deterministic
- No Rust/WASM — FFmpeg only for rendering
- No Go/WebSocket — single-user, no real-time

---

## File Structure

```
packages/edl-v2/
├── src/
│   ├── index.ts
│   ├── schema.ts                   # Master EDL v5.1 Zod schema
│   ├── style.ts                    # Style layer types
│   ├── creative.ts                 # Creative layer types
│   ├── runtime.ts                  # Runtime layer types
│   ├── validators.ts               # Business rule validators
│   └── resolvers/
│       ├── recipe-expander.ts      # Parametric recipes → concrete effects
│       └── strength-resolver.ts    # targetStrength → numeric intensity
├── tests/
│   ├── schema.test.ts
│   ├── validators.test.ts
│   └── resolvers/
│       ├── recipe-expander.test.ts
│       └── strength-resolver.test.ts
├── package.json
└── tsconfig.json

workers/python-content-analyzer/
├── src/
│   ├── __init__.py
│   ├── analyzer.py                 # Stub: returns hardcoded analysis
│   └── models.py                   # Pydantic data models
├── tests/
│   ├── test_analyzer.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml

workers/python-music-analyzer/
├── src/
│   ├── __init__.py
│   ├── analyzer.py                 # Stub: returns hardcoded analysis
│   ├── beat_detection.py           # Real beat detection (librosa)
│   └── models.py                   # Pydantic data models
├── tests/
│   ├── test_analyzer.py
│   ├── test_beat_detection.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml

workers/render-worker/
├── src/
│   ├── __init__.py
│   ├── edl-to-ffmpeg.ts            # EDL → FFmpeg command builder
│   └── renderer.ts                 # Executes FFmpeg, produces MP4
├── tests/
│   ├── edl-to-ffmpeg.test.ts
│   └── renderer.test.ts
├── package.json
└── tsconfig.json
```

---

## Tasks

### Task 1: EDL Schema — Style Layer

**Files:**
- Create: `packages/edl-v2/package.json`
- Create: `packages/edl-v2/tsconfig.json`
- Create: `packages/edl-v2/src/index.ts`
- Create: `packages/edl-v2/src/style.ts`
- Create: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `StyleLayer`, `StyleTokens`, `GenreProfile`, `Constraints`, `Recipe`

- [ ] **Step 1: Scaffold package**

```bash
cd packages/edl-v2
npm init -y
npm install zod
npm install -D typescript @types/node vitest
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write failing test**

```typescript
// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { StyleLayerSchema } from '../src/style'

describe('StyleLayer', () => {
  it('validates style tokens as numeric 0-1', () => {
    const result = StyleLayerSchema.safeParse({
      tokens: {
        aggression: 0.8, cinematic: 0.7, chaos: 0.4, luxury: 0.9,
        warmth: 0.6, nostalgia: 0.3, futurism: 0.5, intimacy: 0.7,
        epicness: 0.85, playfulness: 0.2, darkness: 0.3, energy: 0.9,
      },
      tokenInfluence: {},
      genre: {
        primary: 'tiktok_edit', platform: 'tiktok',
        styleProfile: {
          cutRate: 1.2, avgShotDuration: 1.2, effectDensity: 0.8,
          transitionStyle: 'stylized', colorMood: 0.8, textFrequency: 0.5,
          energyCurve: 'building',
        },
      },
      constraints: {
        avoidFaceOcclusion: true, maxTextCoverage: 0.12,
        keepSubjectVisible: true, preserveMotionDirection: true,
        safeArea: true, avoidOverEditing: true, maxEffectsPerShot: 5,
        minShotDuration: 0.3, maxTransitionDuration: 1.5,
        preserveAudioSync: true, maintainColorConsistency: true,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects token values outside 0-1', () => {
    const result = StyleLayerSchema.safeParse({
      tokens: { aggression: 1.5 },
      tokenInfluence: {},
      genre: { primary: 'tiktok_edit', platform: 'tiktok', styleProfile: {} },
      constraints: {},
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: FAIL with "StyleLayerSchema is not exported"

- [ ] **Step 5: Implement StyleLayer types**

```typescript
// src/style.ts
import { z } from 'zod'

export const StyleTokensSchema = z.record(
  z.enum([
    'aggression', 'cinematic', 'chaos', 'luxury', 'warmth',
    'nostalgia', 'futurism', 'intimacy', 'epicness', 'playfulness',
    'darkness', 'energy',
  ]),
  z.number().min(0).max(1)
)

export const TokenInfluenceSchema = z.record(
  z.string(),
  z.object({
    affects: z.array(z.string()),
    multiplier: z.enum(['linear', 'exponential', 'logarithmic']),
  })
)

export const GenreProfileSchema = z.object({
  primary: z.string(),
  subgenre: z.string().optional(),
  platform: z.enum(['tiktok', 'instagram_reels', 'youtube', 'youtube_shorts', 'cinema', 'broadcast']),
  styleProfile: z.object({
    cutRate: z.number(),
    avgShotDuration: z.number(),
    effectDensity: z.number().min(0).max(1),
    transitionStyle: z.enum(['hard_cuts', 'smooth', 'stylized', 'mixed']),
    colorMood: z.number().min(0).max(1),
    textFrequency: z.number().min(0).max(1),
    energyCurve: z.enum(['flat', 'building', 'peaking', 'variable', 'wave']),
  }),
})

export const ConstraintsSchema = z.object({
  avoidFaceOcclusion: z.boolean(),
  maxTextCoverage: z.number().min(0).max(1),
  keepSubjectVisible: z.boolean(),
  preserveMotionDirection: z.boolean(),
  safeArea: z.boolean(),
  avoidOverEditing: z.boolean(),
  maxEffectsPerShot: z.number().int().positive(),
  minShotDuration: z.number().positive(),
  maxTransitionDuration: z.number().positive(),
  preserveAudioSync: z.boolean(),
  maintainColorConsistency: z.boolean(),
})

export const ParametricValueSchema = z.object({
  base: z.number(),
  emotionScale: z.record(z.string(), z.number()).optional(),
  aggressionScale: z.number().optional(),
})

export const RecipeSchema = z.object({
  version: z.string(),
  description: z.string(),
  applicableWhen: z.object({
    emotion: z.string().optional(),
    energy: z.number().optional(),
    genre: z.array(z.string()).optional(),
  }),
  parametric: z.record(z.string(), ParametricValueSchema),
  transition: z.object({
    type: z.string(),
    baseDuration: z.number(),
  }),
  camera: z.object({
    movement: z.string(),
    baseIntensity: z.number(),
  }),
})

export const StyleLayerSchema = z.object({
  tokens: StyleTokensSchema,
  tokenInfluence: TokenInfluenceSchema,
  genre: GenreProfileSchema,
  constraints: ConstraintsSchema,
})

export type StyleTokens = z.infer<typeof StyleTokensSchema>
export type TokenInfluence = z.infer<typeof TokenInfluenceSchema>
export type GenreProfile = z.infer<typeof GenreProfileSchema>
export type Constraints = z.infer<typeof ConstraintsSchema>
export type Recipe = z.infer<typeof RecipeSchema>
export type StyleLayer = z.infer<typeof StyleLayerSchema>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/edl-v2/
git commit -m "feat(edl-v2): add style layer types with Zod validation"
```

---

### Task 2: EDL Schema — Creative Layer

**Files:**
- Create: `packages/edl-v2/src/creative.ts`
- Modify: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `CreativeLayer`, `Entity`, `StoryArc`, `EmotionArc`, `Moment`, `IntentChain`, `GenerativeSlot`, `Attention`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/schema.test.ts
import { CreativeLayerSchema } from '../src/creative'

describe('CreativeLayer', () => {
  it('validates entities with bounding boxes', () => {
    const result = CreativeLayerSchema.safeParse({
      entities: {
        subject_1: {
          type: 'person', role: 'hero', description: 'Young man',
          detectionFrames: [0, 30, 60],
          boundingBoxes: { '0': [400, 200, 680, 900] },
          depthMask: 'r2://masks/subject_1_depth.exr',
        },
      },
      storyArc: [{ phase: 'setup', start: 0, end: 3, emotion: 'calm' }],
      emotionArc: {
        timeline: [{ time: 0, emotion: 'calm', intensity: 0.2 }],
        autoApply: { enabled: true, affects: ['effects.strength'], strength: 0.8 },
      },
      moments: [{
        id: 'moment_setup', start: 0, end: 3, purpose: 'establish',
        emotion: 'calm', energy: 0.2, shots: ['shot_1'], recipes: [],
        aiPrompt: 'Set the scene', attention: {}, constraints: [],
      }],
      intentChains: { global: 'High-energy edit', perMoment: {} },
      generativeSlots: [],
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement CreativeLayer types**

```typescript
// src/creative.ts
import { z } from 'zod'

export const EntitySchema = z.object({
  type: z.enum(['person', 'people', 'object', 'text', 'graphic']),
  role: z.enum(['hero', 'supporting', 'background', 'prop', 'overlay']),
  description: z.string(),
  detectionFrames: z.array(z.number()).optional(),
  boundingBoxes: z.record(z.string(), z.tuple([z.number(), z.number(), z.number(), z.number()])).optional(),
  faceLandmarks: z.record(z.string(), z.object({
    left_eye: z.tuple([z.number(), z.number()]),
    right_eye: z.tuple([z.number(), z.number()]),
    nose: z.tuple([z.number(), z.number()]),
  })).optional(),
  depthMask: z.string().optional(),
})

export const StoryPhaseSchema = z.object({
  phase: z.string(), start: z.number(), end: z.number(), emotion: z.string(),
})

export const EmotionPointSchema = z.object({
  time: z.number(), emotion: z.string(), intensity: z.number().min(0).max(1),
})

export const AutoApplySchema = z.object({
  enabled: z.boolean(), affects: z.array(z.string()), strength: z.number().min(0).max(1),
})

export const EmotionArcSchema = z.object({
  timeline: z.array(EmotionPointSchema), autoApply: AutoApplySchema,
})

export const AttentionEntrySchema = z.object({
  weight: z.number().min(0).max(1),
  priority: z.enum(['focus', 'maintain', 'suppress', 'ignore']),
  protectFromEffects: z.boolean().optional(),
  applyEffects: z.boolean().optional(),
})

export const MomentSchema = z.object({
  id: z.string(), start: z.number(), end: z.number(),
  purpose: z.string(), emotion: z.string(),
  energy: z.number().min(0).max(1),
  shots: z.array(z.string()), recipes: z.array(z.string()),
  aiPrompt: z.string(), focusEntity: z.string().optional(),
  attention: z.record(z.string(), AttentionEntrySchema).optional(),
  constraints: z.array(z.string()),
})

export const IntentChainsSchema = z.object({
  global: z.string(),
  perMoment: z.record(z.string(), z.object({
    purpose: z.string(), whyThisDuration: z.string().optional(),
    whyTheseEffects: z.string().optional(), emotionalGoal: z.string().optional(),
  })),
})

export const GenerativeSlotSchema = z.object({
  id: z.string(), purpose: z.string(), requirements: z.array(z.string()),
  duration: z.number(), insertAt: z.string(),
  fallbackClipId: z.string(), aiMayReplace: z.boolean(),
})

export const CreativeLayerSchema = z.object({
  entities: z.record(z.string(), EntitySchema),
  storyArc: z.array(StoryPhaseSchema),
  emotionArc: EmotionArcSchema,
  moments: z.array(MomentSchema),
  intentChains: IntentChainsSchema,
  generativeSlots: z.array(GenerativeSlotSchema),
})

export type Entity = z.infer<typeof EntitySchema>
export type Moment = z.infer<typeof MomentSchema>
export type CreativeLayer = z.infer<typeof CreativeLayerSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/edl-v2/src/creative.ts packages/edl-v2/tests/schema.test.ts
git commit -m "feat(edl-v2): add creative layer types (entities, moments, arcs)"
```

---

### Task 3: EDL Schema — Runtime Layer

**Files:**
- Create: `packages/edl-v2/src/runtime.ts`
- Modify: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `RuntimeLayer`, `Track`, `Clip`, `Effect`, `Transition`, `Transform`, `Camera`, `ColorScience`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/schema.test.ts
import { RuntimeLayerSchema } from '../src/runtime'

describe('RuntimeLayer', () => {
  it('validates a complete clip with effects and transitions', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 15 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1', momentId: 'moment_setup',
          source: { clipId: 'clip_a', type: 'video', in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 1.0,
            speedRamp: { keyframes: [{ time: 0, speed: 1.0, easing: 'linear' }] },
          },
          transform: {
            position: { keyframes: [{ time: 0, value: [0, 0] }] },
            scale: { keyframes: [{ time: 0, value: [1, 1] }] },
            opacity: { keyframes: [{ time: 0, value: 1.0 }] },
            anchor: [0.5, 0.5],
          },
          camera: { movement: 'dolly_in', intensity: 0.3 },
          effects: [{ id: 'fx_1', type: 'glow', targetStrength: 0.6, params: { radius: 20 } }],
          transition: { type: 'flash', duration: 0.15 },
        }],
      }],
      colorScience: {
        workingSpace: 'ACES2065-1',
        inputTransform: { source: 'camera_log', cameraProfile: 'Sony_SLog3' },
        outputTransform: { target: 'Rec709', toneMapping: 'aces_filmic' },
      },
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement RuntimeLayer types**

```typescript
// src/runtime.ts
import { z } from 'zod'

export const KeyframeValueSchema = z.object({
  time: z.number(),
  value: z.union([z.number(), z.array(z.number()), z.tuple([z.number(), z.number()])]),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).optional(),
})

export const KeyframeArraySchema = z.object({ keyframes: z.array(KeyframeValueSchema) })

export const SpeedRampSchema = z.object({
  keyframes: z.array(z.object({
    time: z.number(), speed: z.number(),
    easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).optional(),
  })),
})

export const TransformSchema = z.object({
  position: KeyframeArraySchema, scale: KeyframeArraySchema,
  rotation: KeyframeArraySchema.optional(), opacity: KeyframeArraySchema,
  anchor: z.tuple([z.number(), z.number()]),
})

export const CameraSchema = z.object({
  movement: z.string(), intensity: z.number().min(0).max(1),
  shake: z.object({ frequency: z.number(), amplitude: z.number(), decay: z.number() }).optional(),
  motionBlur: z.object({ shutterAngle: z.number(), samples: z.number().int() }).optional(),
})

export const EffectSchema = z.object({
  id: z.string(), type: z.string(),
  targetStrength: z.number().min(0).max(1),
  targetEmotion: z.string().optional(),
  duration: z.string().optional(),
  params: z.record(z.any()),
})

export const TransitionSchema = z.object({
  type: z.string(), duration: z.number().min(0),
  params: z.record(z.any()).optional(),
})

export const ClipSourceSchema = z.object({
  clipId: z.string().optional(),
  type: z.enum(['video', 'image', 'color', 'gradient', 'generated']),
  in: z.number().optional(), out: z.number().optional(),
})

export const ClipTimingSchema = z.object({
  start: z.number(), duration: z.number(), speed: z.number(),
  speedRamp: SpeedRampSchema.optional(),
})

export const ClipSchema = z.object({
  id: z.string(), momentId: z.string().optional(),
  source: ClipSourceSchema, timing: ClipTimingSchema,
  transform: TransformSchema.optional(), camera: CameraSchema.optional(),
  effects: z.array(EffectSchema).optional(),
  transition: TransitionSchema.optional(),
})

export const TrackSchema = z.object({
  id: z.string(), type: z.enum(['video', 'audio']), name: z.string(),
  clips: z.array(ClipSchema),
})

export const ColorScienceSchema = z.object({
  workingSpace: z.string(),
  inputTransform: z.object({ source: z.string(), cameraProfile: z.string() }),
  outputTransform: z.object({ target: z.string(), toneMapping: z.string() }),
})

export const RuntimeLayerSchema = z.object({
  timeline: z.object({
    resolution: z.object({ width: z.number().int(), height: z.number().int() }),
    fps: z.number().int(), duration: z.number(),
  }),
  tracks: z.array(TrackSchema),
  colorScience: ColorScienceSchema,
})

export type Clip = z.infer<typeof ClipSchema>
export type Track = z.infer<typeof TrackSchema>
export type Effect = z.infer<typeof EffectSchema>
export type RuntimeLayer = z.infer<typeof RuntimeLayerSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/edl-v2/src/runtime.ts packages/edl-v2/tests/schema.test.ts
git commit -m "feat(edl-v2): add runtime layer types (tracks, clips, effects)"
```

---

### Task 4: EDL Schema — Master + Validators (FIXED)

**Files:**
- Create: `packages/edl-v2/src/schema.ts`
- Create: `packages/edl-v2/src/validators.ts`
- Modify: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `EDLSchema`, `validateEDL()`

**🐛 FIX: validEDL now includes one real track with one real clip.**

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/schema.test.ts
import { EDLSchema } from '../src/schema'
import { validateEDL } from '../src/validators'

describe('EDL v5.1', () => {
  const validEDL = {
    version: '5.1' as const,
    id: 'edl_test_001',
    created: '2026-07-14T00:00:00Z',
    duration: 3,
    refs: { entities: {}, recipes: {}, detections: {} },
    style: {
      tokens: { aggression: 0.8, cinematic: 0.7, chaos: 0.4, luxury: 0.9, warmth: 0.6, nostalgia: 0.3, futurism: 0.5, intimacy: 0.7, epicness: 0.85, playfulness: 0.2, darkness: 0.3, energy: 0.9 },
      tokenInfluence: {},
      genre: { primary: 'tiktok_edit', platform: 'tiktok', styleProfile: { cutRate: 1.2, avgShotDuration: 1.2, effectDensity: 0.8, transitionStyle: 'stylized', colorMood: 0.8, textFrequency: 0.5, energyCurve: 'building' } },
      constraints: { avoidFaceOcclusion: true, maxTextCoverage: 0.12, keepSubjectVisible: true, preserveMotionDirection: true, safeArea: true, avoidOverEditing: true, maxEffectsPerShot: 5, minShotDuration: 0.3, maxTransitionDuration: 1.5, preserveAudioSync: true, maintainColorConsistency: true },
    },
    creative: {
      entities: {},
      storyArc: [{ phase: 'setup', start: 0, end: 3, emotion: 'calm' }],
      emotionArc: { timeline: [{ time: 0, emotion: 'calm', intensity: 0.2 }], autoApply: { enabled: false, affects: [], strength: 0 } },
      moments: [{ id: 'm1', start: 0, end: 3, purpose: 'test', emotion: 'calm', energy: 0.2, shots: ['shot_1'], recipes: [], aiPrompt: 'test', constraints: [] }],
      intentChains: { global: '', perMoment: {} },
      generativeSlots: [],
    },
    editorial: { sequences: [], shotRelationships: [], rhythm: { pattern: 'building', musicalPhraseAlignment: [] } },
    runtime: {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video' as const, name: 'Main',
        clips: [{
          id: 'shot_1', momentId: 'm1',
          source: { clipId: 'clip_a', type: 'video' as const, in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 1 },
        }],
      }],
      colorScience: { workingSpace: 'ACES2065-1', inputTransform: { source: 'camera_log', cameraProfile: 'Sony_SLog3' }, outputTransform: { target: 'Rec709', toneMapping: 'aces_filmic' } },
    },
    capabilities: { engines: {}, runtime: {}, renderNode: {} },
    dependencies: {},
    analysis: { perMoment: {}, perShot: {}, energyCurve: [] },
  }

  it('validates a complete EDL v5.1', () => {
    const result = EDLSchema.safeParse(validEDL)
    expect(result.success).toBe(true)
  })

  it('passes business rule validation', () => {
    const errors = validateEDL(validEDL)
    expect(errors).toHaveLength(0)
  })

  it('rejects overlapping shots', () => {
    const edl = {
      ...validEDL,
      runtime: {
        ...validEDL.runtime,
        tracks: [{
          id: 'track_v1', type: 'video' as const, name: 'Main',
          clips: [
            { id: 'shot_1', source: { type: 'video' as const }, timing: { start: 0, duration: 3, speed: 1 } },
            { id: 'shot_2', source: { type: 'video' as const }, timing: { start: 2, duration: 3, speed: 1 } },
          ],
        }],
      },
    }
    const errors = validateEDL(edl)
    expect(errors.some(e => e.includes('overlap'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement master schema + validators**

```typescript
// src/schema.ts
import { z } from 'zod'
import { StyleLayerSchema } from './style'
import { CreativeLayerSchema } from './creative'
import { RuntimeLayerSchema } from './runtime'

export const EDLSchema = z.object({
  version: z.literal('5.1'),
  id: z.string(),
  created: z.string(),
  duration: z.number().positive(),
  refs: z.object({
    entities: z.record(z.any()),
    recipes: z.record(z.any()),
    detections: z.record(z.any()),
  }),
  style: StyleLayerSchema,
  creative: CreativeLayerSchema,
  editorial: z.object({
    sequences: z.array(z.any()),
    shotRelationships: z.array(z.any()),
    rhythm: z.object({ pattern: z.string(), musicalPhraseAlignment: z.array(z.any()) }),
  }),
  runtime: RuntimeLayerSchema,
  capabilities: z.record(z.any()),
  dependencies: z.record(z.any()),
  analysis: z.record(z.any()),
})

export type EDL = z.infer<typeof EDLSchema>
```

```typescript
// src/validators.ts
import type { EDL } from './schema'

export function validateEDL(edl: EDL): string[] {
  const errors: string[] = []

  // Duration match
  const trackDuration = edl.runtime.tracks.reduce((max, track) => {
    const trackEnd = track.clips.reduce((m, clip) => Math.max(m, clip.timing.start + clip.timing.duration), 0)
    return Math.max(max, trackEnd)
  }, 0)
  if (edl.runtime.tracks.length > 0 && Math.abs(trackDuration - edl.duration) > 0.1) {
    errors.push(`Track duration ${trackDuration} does not match EDL duration ${edl.duration}`)
  }

  // No overlapping clips
  for (const track of edl.runtime.tracks) {
    const sorted = [...track.clips].sort((a, b) => a.timing.start - b.timing.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timing.start < sorted[i - 1].timing.start + sorted[i - 1].timing.duration) {
        errors.push(`Clips ${sorted[i - 1].id} and ${sorted[i].id} overlap`)
      }
    }
  }

  // Shot duration ceiling
  for (const track of edl.runtime.tracks) {
    for (const clip of track.clips) {
      if (clip.timing.duration > 30) errors.push(`Clip ${clip.id} exceeds 30s`)
    }
  }

  // Moment references valid
  const momentIds = new Set(edl.creative.moments.map(m => m.id))
  for (const track of edl.runtime.tracks) {
    for (const clip of track.clips) {
      if (clip.momentId && !momentIds.has(clip.momentId)) {
        errors.push(`Clip ${clip.id} references unknown moment ${clip.momentId}`)
      }
    }
  }

  return errors
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/edl-v2/src/schema.ts packages/edl-v2/src/validators.ts packages/edl-v2/tests/schema.test.ts
git commit -m "feat(edl-v2): add master EDL schema and business rule validators"
```

---

### Task 5: Recipe Expander + Strength Resolver

**Files:**
- Create: `packages/edl-v2/src/resolvers/recipe-expander.ts`
- Create: `packages/edl-v2/src/resolvers/strength-resolver.ts`
- Create: `packages/edl-v2/tests/resolvers/recipe-expander.test.ts`
- Create: `packages/edl-v2/tests/resolvers/strength-resolver.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `StyleTokens`, `EmotionArc`
- Produces: `ExpandedRecipe` with concrete effects

- [ ] **Step 1: Write failing test for recipe expander**

```typescript
// tests/resolvers/recipe-expander.test.ts
import { describe, it, expect } from 'vitest'
import { expandRecipe } from '../../src/resolvers/recipe-expander'

describe('RecipeExpander', () => {
  it('expands parametric recipe with style tokens', () => {
    const recipe = {
      version: '2.0', description: 'Test', applicableWhen: {},
      parametric: {
        glow: { base: 0.6, emotionScale: { awe: 1.0, calm: 0.5 }, aggressionScale: 0.4 },
        shake: { base: 0.3, emotionScale: { awe: 1.0 }, aggressionScale: 0.5 },
      },
      transition: { type: 'flash', baseDuration: 0.15 },
      camera: { movement: 'steadicam', baseIntensity: 0.5 },
    }
    const tokens = { aggression: 0.8, energy: 0.9 }
    const result = expandRecipe(recipe, tokens, 'awe')

    expect(result.effects).toHaveLength(2)
    expect(result.effects[0].type).toBe('glow')
    // glow: base(0.6) * emotionScale(1.0) + aggression(0.8) * aggressionScale(0.4) = 0.6 + 0.32 = 0.92
    expect(result.effects[0].targetStrength).toBeCloseTo(0.92, 1)
    expect(result.transition.type).toBe('flash')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/resolvers/recipe-expander.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement recipe expander**

```typescript
// src/resolvers/recipe-expander.ts
import type { Recipe, StyleTokens } from '../style'

export interface ExpandedEffect {
  type: string
  targetStrength: number
  duration?: string
  params: Record<string, unknown>
}

export interface ExpandedRecipe {
  effects: ExpandedEffect[]
  transition: { type: string; duration: number }
  camera: { movement: string; intensity: number }
}

export function expandRecipe(recipe: Recipe, tokens: StyleTokens, emotion: string): ExpandedRecipe {
  const aggression = tokens.aggression ?? 0.5

  const effects: ExpandedEffect[] = Object.entries(recipe.parametric).map(([type, param]) => {
    const emotionScale = param.emotionScale?.[emotion] ?? 1.0
    const aggressionContribution = (param.aggressionScale ?? 0) * aggression
    const targetStrength = Math.min(1, Math.max(0, param.base * emotionScale + aggressionContribution))
    return { type, targetStrength, params: {} }
  })

  return {
    effects,
    transition: { type: recipe.transition.type, duration: recipe.transition.baseDuration },
    camera: { movement: recipe.camera.movement, intensity: recipe.camera.baseIntensity },
  }
}
```

- [ ] **Step 4: Implement strength resolver**

```typescript
// src/resolvers/strength-resolver.ts
export function resolveStrength(targetStrength: number, engine: string): number {
  // Engine-specific scaling (future: different engines interpret differently)
  // For now, pass through
  return Math.min(1, Math.max(0, targetStrength))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/edl-v2 && npx vitest run tests/resolvers/recipe-expander.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/edl-v2/src/resolvers/ packages/edl-v2/tests/resolvers/
git commit -m "feat(edl-v2): add recipe expander with parametric resolution"
```

---

### Task 6: Content Analyzer — Stub + Models

**Files:**
- Create: `workers/python-content-analyzer/pyproject.toml`
- Create: `workers/python-content-analyzer/src/__init__.py`
- Create: `workers/python-content-analyzer/src/models.py`
- Create: `workers/python-content-analyzer/src/analyzer.py`
- Create: `workers/python-content-analyzer/tests/test_models.py`
- Create: `workers/python-content-analyzer/tests/test_analyzer.py`

**Interfaces:**
- Produces: `ContentAnalysis` (stub: returns hardcoded data)

- [ ] **Step 1: Scaffold**

```bash
cd workers/python-content-analyzer
python -m venv .venv && source .venv/bin/activate
pip install pydantic pytest
```

- [ ] **Step 2: Write failing test for models**

```python
# tests/test_models.py
from src.models import ContentAnalysis, FaceDetection

def test_content_analysis_creation():
    analysis = ContentAnalysis(
        faces=[FaceDetection(frame=0, bbox=[400, 200, 680, 900], confidence=0.98)],
        objects=[], depth=[], motion=[], scenes=[],
        brightness=[0.5], composition={}, color_palette=[], semantic="test",
    )
    assert len(analysis.faces) == 1
    assert analysis.faces[0].confidence == 0.98
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_models.py -v`
Expected: FAIL

- [ ] **Step 4: Implement models**

```python
# src/models.py
from pydantic import BaseModel
from typing import Optional

class FaceDetection(BaseModel):
    frame: int
    bbox: list[int]
    landmarks: Optional[dict[str, list[int]]] = None
    confidence: float

class ContentAnalysis(BaseModel):
    faces: list[FaceDetection]
    objects: list[dict]
    depth: list[dict]
    motion: list[dict]
    scenes: list[dict]
    brightness: list[float]
    composition: dict
    color_palette: list[dict]
    semantic: str
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 6: Write failing test for stub analyzer**

```python
# tests/test_analyzer.py
from src.analyzer import ContentAnalyzer

def test_stub_analyzer_returns_hardcoded_data():
    analyzer = ContentAnalyzer()
    result = analyzer.analyze("fake_video_path.mp4")
    assert result is not None
    assert len(result.faces) >= 0
    assert isinstance(result.semantic, str)
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_analyzer.py -v`
Expected: FAIL

- [ ] **Step 8: Implement stub analyzer**

```python
# src/analyzer.py
from .models import ContentAnalysis

class ContentAnalyzer:
    def analyze(self, video_path: str) -> ContentAnalysis:
        # STUB: returns hardcoded analysis
        return ContentAnalysis(
            faces=[], objects=[], depth=[], motion=[], scenes=[],
            brightness=[0.5], composition={}, color_palette=[],
            semantic="Hardcoded stub analysis",
        )
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_analyzer.py -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add workers/python-content-analyzer/
git commit -m "feat(content-analyzer): add stub analyzer with Pydantic models"
```

---

### Task 7: Music Analyzer — Stub + Beat Detection (FIXED)

**Files:**
- Create: `workers/python-music-analyzer/pyproject.toml`
- Create: `workers/python-music-analyzer/src/__init__.py`
- Create: `workers/python-music-analyzer/src/models.py`
- Create: `workers/python-music-analyzer/src/analyzer.py`
- Create: `workers/python-music-analyzer/src/beat_detection.py`
- Create: `workers/python-music-analyzer/tests/test_models.py`
- Create: `workers/python-music-analyzer/tests/test_beat_detection.py`

**Interfaces:**
- Produces: `MusicAnalysis`, `BeatResult`

**🐛 FIX 1: BeatResult includes bpm field.**
**🐛 FIX 2: Test uses click track (impulses), not sine wave.**
**🐛 FIX 3: Both tests mock the model — no 300MB download.**

- [ ] **Step 1: Scaffold**

```bash
cd workers/python-music-analyzer
python -m venv .venv && source .venv/bin/activate
pip install pydantic pytest librosa numpy
```

- [ ] **Step 2: Write failing test for models**

```python
# tests/test_models.py
from src.models import MusicAnalysis, BeatResult

def test_music_analysis_creation():
    result = MusicAnalysis(
        bpm=140.0,
        beat_result=BeatResult(beats=[0.0, 0.429, 0.857], downbeats=[0.0, 1.714], bpm=140.0),
        onsets=[0.0, 0.42, 0.86],
        sections=[{"name": "intro", "start": 0, "end": 3, "energy": 0.3}],
        energy_curve=[(0, 0.2), (3, 0.5)],
        vocal_regions=[(2.0, 5.0)],
        frequency_profile={"low": 0.6, "mid": 0.4, "high": 0.3},
    )
    assert result.bpm == 140.0
    assert result.beat_result.bpm == 140.0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_models.py -v`
Expected: FAIL

- [ ] **Step 4: Implement models**

```python
# src/models.py
from pydantic import BaseModel

class BeatResult(BaseModel):
    beats: list[float]
    downbeats: list[float]
    bpm: float  # ✅ FIX: bpm is in the result, not lost

class MusicAnalysis(BaseModel):
    bpm: float
    beat_result: BeatResult
    onsets: list[float]
    sections: list[dict]
    energy_curve: list[tuple[float, float]]
    vocal_regions: list[tuple[float, float]]
    frequency_profile: dict[str, float]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 6: Write failing test for beat detection (FIXED: click track)**

```python
# tests/test_beat_detection.py
import numpy as np
from unittest.mock import patch, MagicMock
from src.beat_detection import BeatDetector

def test_detect_beats_with_click_track():
    """✅ FIX: Use click track (impulses), not sine wave."""
    detector = BeatDetector()
    
    # Create synthetic click track: impulses at 140 BPM (0.4286s intervals)
    sr = 22050
    duration = 4.0
    bpm = 140.0
    beat_interval = 60.0 / bpm
    
    signal = np.zeros(int(sr * duration))
    beat_times = np.arange(0, duration, beat_interval)
    for bt in beat_times:
        idx = int(bt * sr)
        if idx < len(signal):
            signal[idx] = 1.0  # impulse
    
    result = detector.detect(signal, sr)
    
    assert 135 < result.bpm < 145
    assert len(result.beats) > 0
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_beat_detection.py -v`
Expected: FAIL

- [ ] **Step 8: Implement beat detection**

```python
# src/beat_detection.py
import numpy as np
import librosa
from .models import BeatResult

class BeatDetector:
    def detect(self, y: np.ndarray, sr: int) -> BeatResult:
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        
        # Handle tempo being an array (librosa 0.10+)
        if hasattr(tempo, '__len__'):
            bpm = float(tempo[0])
        else:
            bpm = float(tempo)
        
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        downbeats = beat_times[::4]
        
        return BeatResult(
            beats=beat_times,
            downbeats=downbeats,
            bpm=bpm,
        )
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_beat_detection.py -v`
Expected: PASS

- [ ] **Step 10: Write failing test for stub analyzer**

```python
# tests/test_analyzer.py
from src.analyzer import MusicAnalyzer

def test_stub_analyzer_returns_hardcoded_data():
    analyzer = MusicAnalyzer()
    result = analyzer.analyze("fake_audio.wav")
    assert result is not None
    assert result.bpm > 0
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_analyzer.py -v`
Expected: FAIL

- [ ] **Step 12: Implement stub analyzer**

```python
# src/analyzer.py
from .models import MusicAnalysis, BeatResult

class MusicAnalyzer:
    def analyze(self, audio_path: str) -> MusicAnalysis:
        # STUB: returns hardcoded analysis
        return MusicAnalysis(
            bpm=140.0,
            beat_result=BeatResult(beats=[0.0, 0.429, 0.857], downbeats=[0.0, 1.714], bpm=140.0),
            onsets=[0.0, 0.42, 0.86],
            sections=[{"name": "intro", "start": 0, "end": 3, "energy": 0.3}],
            energy_curve=[(0, 0.2), (3, 0.5)],
            vocal_regions=[],
            frequency_profile={"low": 0.5, "mid": 0.5, "high": 0.5},
        )
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_analyzer.py -v`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add workers/python-music-analyzer/
git commit -m "feat(music-analyzer): add stub analyzer with beat detection (click track test)"
```

---

### Task 8: EDL → FFmpeg Renderer

**Files:**
- Create: `workers/render-worker/package.json`
- Create: `workers/render-worker/tsconfig.json`
- Create: `workers/render-worker/src/edl-to-ffmpeg.ts`
- Create: `workers/render-worker/src/renderer.ts`
- Create: `workers/render-worker/tests/edl-to-ffmpeg.test.ts`

**Interfaces:**
- Consumes: EDL v5.1 (with hardcoded analysis)
- Produces: FFmpeg command → MP4 file

- [ ] **Step 1: Scaffold**

```bash
cd workers/render-worker
npm init -y
npm install zod
npm install -D typescript @types/node vitest
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/edl-to-ffmpeg.test.ts
import { describe, it, expect } from 'vitest'
import { edlToFFmpegCommand } from '../src/edl-to-ffmpeg'

describe('edlToFFmpegCommand', () => {
  it('generates FFmpeg command from simple EDL', () => {
    const edl = {
      runtime: {
        timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
        tracks: [{
          id: 'track_v1', type: 'video', name: 'Main',
          clips: [{
            id: 'shot_1',
            source: { clipId: 'clip_a', type: 'video', in: 0, out: 3 },
            timing: { start: 0, duration: 3, speed: 1.0 },
            effects: [{ id: 'fx_1', type: 'glow', targetStrength: 0.6, params: {} }],
          }],
        }],
      },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('ffmpeg')
    expect(cmd).toContain('-i /input/clip_a.mp4')
    expect(cmd).toContain('/output/render.mp4')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/edl-to-ffmpeg.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement EDL → FFmpeg**

```typescript
// src/edl-to-ffmpeg.ts
export function edlToFFmpegCommand(edl: any, inputPath: string, outputPath: string): string {
  const { timeline, tracks } = edl.runtime
  const videoTrack = tracks.find((t: any) => t.type === 'video')
  if (!videoTrack) throw new Error('No video track')

  const parts = ['ffmpeg -y']

  // Input
  parts.push(`-i ${inputPath}`)

  // Build filter chain
  const filters: string[] = []
  
  for (const clip of videoTrack.clips) {
    // Trim
    if (clip.source.in !== undefined && clip.source.out !== undefined) {
      filters.push(`trim=start=${clip.source.in}:end=${clip.source.out},setpts=PTS-STARTPTS`)
    }

    // Speed
    if (clip.timing.speed !== 1.0) {
      filters.push(`setpts=${1/clip.timing.speed}*PTS`)
    }

    // Effects
    if (clip.effects) {
      for (const effect of clip.effects) {
        switch (effect.type) {
          case 'glow':
            filters.push(`gblur=sigma=${Math.round(effect.targetStrength * 20)}`)
            break
          case 'blur':
            filters.push(`boxblur=${Math.round(effect.targetStrength * 10)}`)
            break
          case 'vignette':
            filters.push(`vignette=PI/${4 - effect.targetStrength * 2}`)
            break
        }
      }
    }
  }

  // Scale to output
  filters.push(`scale=${timeline.resolution.width}:${timeline.resolution.height}`)

  if (filters.length > 0) {
    parts.push(`-vf "${filters.join(',')}"`)
  }

  // Output
  parts.push(`-r ${timeline.fps}`)
  parts.push(outputPath)

  return parts.join(' ')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/edl-to-ffmpeg.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/render-worker/
git commit -m "feat(render-worker): add EDL to FFmpeg command builder"
```

---

### Task 9: End-to-End Render Test

**Files:**
- Create: `workers/render-worker/tests/e2e.test.ts`

**Interfaces:**
- Consumes: Real video file + EDL
- Produces: Rendered MP4

- [ ] **Step 1: Create test fixture**

```bash
mkdir -p workers/render-worker/fixtures
# Download a small test clip (5 seconds)
ffmpeg -f lavfi -i testsrc=duration=5:size=1080x1920:rate=30 -c:v libx264 -pix_fmt yuv420p workers/render-worker/fixtures/test_clip.mp4
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/e2e.test.ts
import { describe, it, expect } from 'vitest'
import { edlToFFmpegCommand } from '../src/edl-to-ffmpeg'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

describe('E2E Render', () => {
  it('renders a real MP4 from EDL', () => {
    const edl = {
      runtime: {
        timeline: { resolution: { width: 540, height: 960 }, fps: 30, duration: 3 },
        tracks: [{
          id: 'track_v1', type: 'video', name: 'Main',
          clips: [{
            id: 'shot_1',
            source: { clipId: 'test_clip', type: 'video', in: 0, out: 3 },
            timing: { start: 0, duration: 3, speed: 1.0 },
            effects: [{ id: 'fx_1', type: 'vignette', targetStrength: 0.5, params: {} }],
          }],
        }],
      },
    }

    const cmd = edlToFFmpegCommand(
      edl,
      'workers/render-worker/fixtures/test_clip.mp4',
      'workers/render-worker/fixtures/output.mp4'
    )

    execSync(cmd, { stdio: 'pipe' })

    expect(existsSync('workers/render-worker/fixtures/output.mp4')).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails or passes**

Run: `cd workers/render-worker && npx vitest run tests/e2e.test.ts`
Expected: PASS (if FFmpeg is installed)

- [ ] **Step 4: Commit**

```bash
git add workers/render-worker/tests/e2e.test.ts
git commit -m "feat(render-worker): add e2e render test with real FFmpeg"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 1 | EDL Style Layer | 30 min |
| 2 | EDL Creative Layer | 30 min |
| 3 | EDL Runtime Layer | 40 min |
| 4 | EDL Master + Validators | 30 min |
| 5 | Recipe Expander | 30 min |
| 6 | Content Analyzer Stub | 20 min |
| 7 | Music Analyzer Stub + Beat Detection | 30 min |
| 8 | EDL → FFmpeg Renderer | 30 min |
| 9 | E2E Render Test | 15 min |
| **Total** | | **~4 hours** |

## What This Gets You

After 4 hours:
- EDL v5.1 schema with Zod validation
- Recipe expander that derives effects from style tokens
- Stub analyzers (ready to swap in real AI later)
- Working FFmpeg renderer that produces real MP4
- One end-to-end test that renders a real video

**Next steps (after this plan):**
1. Swap stubs for real AI (Gemini vision, librosa beat detection)
2. Add more effects (glow, shake, rgb_split, speed_ramp)
3. Build the Creative Planner (story arc, moments, shot selection)
4. Build the Critic + Refiner
5. User learning + memory
6. Real-time server (defer until first postable edit exists)
