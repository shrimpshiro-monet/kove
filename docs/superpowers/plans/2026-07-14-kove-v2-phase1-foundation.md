# Kove v2 — Phase 1: EDL Schema + Content/Music Analysis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the EDL v5.1 schema package (TypeScript + Zod), Content Analyzer (Python), and Music Analyzer (Python) — the foundation everything else builds on.

**Architecture:** TypeScript monorepo package for EDL types, Python services for AI analysis. EDL is the lingua franca — all services read/write it.

**Tech Stack:** TypeScript, Zod, Python 3.11+, librosa, PySceneDetect, OpenCV, InsightFace, MiDaS, Gemini API

## Global Constraints

- EDL version: 5.1
- No `any` in TypeScript
- Zod on every API boundary
- Python: type hints everywhere, pydantic for data models
- TDD: write failing test first, implement, verify pass
- Commit after each task
- No engine tags in runtime layer (capabilities layer handles this)
- No labels on numeric values (UI derives labels)

---

## File Structure

### EDL Schema Package (`packages/edl-v2/`)
```
packages/edl-v2/
├── src/
│   ├── index.ts                    # Re-exports
│   ├── schema.ts                   # Master EDL v5.1 Zod schema
│   ├── style.ts                    # Style layer types
│   ├── creative.ts                 # Creative layer types (moments, entities, arcs)
│   ├── editorial.ts                # Editorial layer types (sequences, relationships)
│   ├── runtime.ts                  # Runtime layer types (tracks, clips, effects)
│   ├── capabilities.ts             # Capabilities layer types
│   ├── analysis.ts                 # Analysis layer types
│   ├── refs.ts                     # Reference types ($ref, entities, recipes, detections)
│   ├── dependencies.ts             # Dependency graph types
│   ├── validators.ts               # EDL validation functions
│   └── resolvers/
│       ├── recipe-expander.ts      # Parametric recipes → concrete effects
│       ├── strength-resolver.ts    # targetStrength → numeric intensity
│       └── capability-resolver.ts  # Engine selection based on capabilities
├── tests/
│   ├── schema.test.ts
│   ├── validators.test.ts
│   └── resolvers/
│       ├── recipe-expander.test.ts
│       ├── strength-resolver.test.ts
│       └── capability-resolver.test.ts
├── package.json
└── tsconfig.json
```

### Content Analyzer (`workers/python-content-analyzer/`)
```
workers/python-content-analyzer/
├── src/
│   ├── __init__.py
│   ├── analyzer.py                 # Main ContentAnalyzer class
│   ├── face_detection.py           # InsightFace wrapper
│   ├── object_detection.py         # YOLO wrapper
│   ├── depth_estimation.py         # MiDaS/MonoDepth wrapper
│   ├── optical_flow.py             # Farneback optical flow
│   ├── scene_detection.py          # PySceneDetect wrapper
│   ├── composition.py              # Rule of thirds, leading lines
│   ├── color_analysis.py           # Color palette extraction
│   ├── semantic.py                 # Gemini vision integration
│   └── models.py                   # Pydantic data models
├── tests/
│   ├── test_analyzer.py
│   ├── test_face_detection.py
│   ├── test_object_detection.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml
```

### Music Analyzer (`workers/python-music-analyzer/`)
```
workers/python-music-analyzer/
├── src/
│   ├── __init__.py
│   ├── analyzer.py                 # Main MusicAnalyzer class
│   ├── beat_detection.py           # BPM + beat grid
│   ├── onset_detection.py          # Onset detection
│   ├── section_segmentation.py     # Verse/chorus/bridge detection
│   ├── energy_analysis.py          # Energy curve computation
│   ├── vocal_detection.py          # Vocal region detection
│   ├── frequency_analysis.py       # Frequency profile
│   └── models.py                   # Pydantic data models
├── tests/
│   ├── test_analyzer.py
│   ├── test_beat_detection.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml
```

---

## Tasks

### Task 1: EDL Schema — Style Layer Types

**Files:**
- Create: `packages/edl-v2/package.json`
- Create: `packages/edl-v2/tsconfig.json`
- Create: `packages/edl-v2/src/index.ts`
- Create: `packages/edl-v2/src/style.ts`
- Create: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `StyleLayer`, `StyleTokens`, `GenreProfile`, `Constraints`, `Recipe`, `ParametricRecipe`

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

- [ ] **Step 3: Write failing test for StyleTokens**

```typescript
// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { StyleLayerSchema } from '../src/style'

describe('StyleLayer', () => {
  it('validates style tokens as numeric 0-1', () => {
    const result = StyleLayerSchema.safeParse({
      tokens: {
        aggression: 0.8,
        cinematic: 0.7,
        chaos: 0.4,
        luxury: 0.9,
        warmth: 0.6,
        nostalgia: 0.3,
        futurism: 0.5,
        intimacy: 0.7,
        epicness: 0.85,
        playfulness: 0.2,
        darkness: 0.3,
        energy: 0.9,
      },
      tokenInfluence: {},
      genre: {
        primary: 'tiktok_edit',
        platform: 'tiktok',
        styleProfile: {
          cutRate: 1.2,
          avgShotDuration: 1.2,
          effectDensity: 0.8,
          transitionStyle: 'stylized',
          colorMood: 0.8,
          textFrequency: 0.5,
          energyCurve: 'building',
        },
      },
      constraints: {
        avoidFaceOcclusion: true,
        maxTextCoverage: 0.12,
        keepSubjectVisible: true,
        preserveMotionDirection: true,
        safeArea: true,
        avoidOverEditing: true,
        maxEffectsPerShot: 5,
        minShotDuration: 0.3,
        maxTransitionDuration: 1.5,
        preserveAudioSync: true,
        maintainColorConsistency: true,
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

### Task 2: EDL Schema — Creative Layer Types

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
          type: 'person',
          role: 'hero',
          description: 'Young man in streetwear',
          detectionFrames: [0, 30, 60],
          boundingBoxes: { '0': [400, 200, 680, 900] },
          depthMask: 'r2://masks/subject_1_depth.exr',
        },
      },
      storyArc: [
        { phase: 'setup', start: 0, end: 3, emotion: 'calm' },
      ],
      emotionArc: {
        timeline: [
          { time: 0, emotion: 'calm', intensity: 0.2 },
        ],
        autoApply: { enabled: true, affects: ['effects.strength'], strength: 0.8 },
      },
      moments: [
        {
          id: 'moment_setup',
          start: 0,
          end: 3,
          purpose: 'establish',
          emotion: 'calm',
          energy: 0.2,
          shots: ['shot_1'],
          recipes: [],
          aiPrompt: 'Set the scene',
          attention: {},
          constraints: [],
        },
      ],
      intentChains: {
        global: 'High-energy edit',
        perMoment: {},
      },
      generativeSlots: [],
    })
    expect(result.success).toBe(true)
  })

  it('validates moment with focusEntity reference', () => {
    const result = CreativeLayerSchema.safeParse({
      entities: {},
      storyArc: [],
      emotionArc: { timeline: [], autoApply: { enabled: false, affects: [], strength: 0 } },
      moments: [{
        id: 'moment_reveal',
        start: 3,
        end: 6,
        purpose: 'reveal',
        emotion: 'awe',
        energy: 0.7,
        shots: ['shot_2'],
        recipes: ['streetwear_reveal_v2'],
        aiPrompt: 'Subject appears',
        focusEntity: '$ref:subject_1',
        attention: {
          '$ref:subject_1': { weight: 1.0, priority: 'focus' },
          background: { weight: 0.2, priority: 'suppress' },
        },
        constraints: ['keepSubjectVisible'],
      }],
      intentChains: { global: '', perMoment: {} },
      generativeSlots: [],
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: FAIL with "CreativeLayerSchema is not exported"

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
  phase: z.string(),
  start: z.number(),
  end: z.number(),
  emotion: z.string(),
})

export const EmotionPointSchema = z.object({
  time: z.number(),
  emotion: z.string(),
  intensity: z.number().min(0).max(1),
})

export const AutoApplySchema = z.object({
  enabled: z.boolean(),
  affects: z.array(z.string()),
  strength: z.number().min(0).max(1),
})

export const EmotionArcSchema = z.object({
  timeline: z.array(EmotionPointSchema),
  autoApply: AutoApplySchema,
})

export const AttentionEntrySchema = z.object({
  weight: z.number().min(0).max(1),
  priority: z.enum(['focus', 'maintain', 'suppress', 'ignore']),
  protectFromEffects: z.boolean().optional(),
  applyEffects: z.boolean().optional(),
})

export const MomentSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  purpose: z.string(),
  emotion: z.string(),
  energy: z.number().min(0).max(1),
  shots: z.array(z.string()),
  recipes: z.array(z.string()),
  aiPrompt: z.string(),
  focusEntity: z.string().optional(),
  attention: z.record(z.string(), AttentionEntrySchema).optional(),
  constraints: z.array(z.string()),
})

export const IntentChainPerMomentSchema = z.object({
  purpose: z.string(),
  whyThisDuration: z.string().optional(),
  whyTheseEffects: z.string().optional(),
  emotionalGoal: z.string().optional(),
})

export const IntentChainsSchema = z.object({
  global: z.string(),
  perMoment: z.record(z.string(), IntentChainPerMomentSchema),
})

export const GenerativeSlotSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  requirements: z.array(z.string()),
  duration: z.number(),
  insertAt: z.string(),
  fallbackClipId: z.string(),
  aiMayReplace: z.boolean(),
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
export type StoryPhase = z.infer<typeof StoryPhaseSchema>
export type EmotionArc = z.infer<typeof EmotionArcSchema>
export type Moment = z.infer<typeof MomentSchema>
export type IntentChains = z.infer<typeof IntentChainsSchema>
export type GenerativeSlot = z.infer<typeof GenerativeSlotSchema>
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

### Task 3: EDL Schema — Runtime Layer Types

**Files:**
- Create: `packages/edl-v2/src/runtime.ts`
- Modify: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `RuntimeLayer`, `Track`, `Clip`, `Effect`, `Transition`, `SpeedRamp`, `Transform`, `Camera`, `Compositing`, `ColorScience`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/schema.test.ts
import { RuntimeLayerSchema } from '../src/runtime'

describe('RuntimeLayer', () => {
  it('validates a complete clip with effects and transitions', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 15 },
      tracks: [{
        id: 'track_v1',
        type: 'video',
        name: 'Main',
        clips: [{
          id: 'shot_1',
          momentId: 'moment_setup',
          source: { clipId: 'clip_a', type: 'video', in: 0, out: 3 },
          timing: {
            start: 0,
            duration: 3,
            speed: 1.0,
            speedRamp: {
              keyframes: [{ time: 0, speed: 1.0, easing: 'linear' }],
            },
          },
          transform: {
            position: { keyframes: [{ time: 0, value: [0, 0] }] },
            scale: { keyframes: [{ time: 0, value: [1, 1] }] },
            opacity: { keyframes: [{ time: 0, value: 1.0 }] },
            anchor: [0.5, 0.5],
          },
          camera: { movement: 'dolly_in', intensity: 0.3 },
          effects: [{
            id: 'fx_1',
            type: 'glow',
            targetStrength: 0.6,
            params: { radius: 20 },
          }],
          transition: { type: 'flash', duration: 0.15 },
        }],
      }],
      colorScience: {
        workingSpace: 'ACES2065-1',
        inputTransform: { source: 'camera_log', cameraProfile: 'Sony_SLog3' },
        grade: {
          primary: { exposure: { keyframes: [{ time: 0, value: 0.2 }] } },
        },
        outputTransform: { target: 'Rec709', toneMapping: 'aces_filmic' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects clip without required fields', () => {
    const result = RuntimeLayerSchema.safeParse({
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 15 },
      tracks: [{
        id: 'track_v1',
        type: 'video',
        name: 'Main',
        clips: [{ id: 'shot_1' }],  // missing source, timing, etc.
      }],
      colorScience: {},
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/edl-v2 && npx vitest run tests/schema.test.ts`
Expected: FAIL with "RuntimeLayerSchema is not exported"

- [ ] **Step 3: Implement RuntimeLayer types**

```typescript
// src/runtime.ts
import { z } from 'zod'

// Keyframe types
export const KeyframeValueSchema = z.object({
  time: z.number(),
  value: z.union([z.number(), z.array(z.number()), z.tuple([z.number(), z.number()])]),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'bezier']).optional(),
})

export const KeyframeArraySchema = z.object({
  keyframes: z.array(KeyframeValueSchema),
})

// Speed
export const SpeedRampSchema = z.object({
  keyframes: z.array(z.object({
    time: z.number(),
    speed: z.number(),
    easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).optional(),
  })),
  interpolation: z.enum(['linear', 'smooth', 'step']).optional(),
})

// Transform
export const TransformSchema = z.object({
  position: KeyframeArraySchema,
  scale: KeyframeArraySchema,
  rotation: KeyframeArraySchema.optional(),
  opacity: KeyframeArraySchema,
  anchor: z.tuple([z.number(), z.number()]),
})

// Camera
export const CameraSchema = z.object({
  movement: z.string(),
  intensity: z.number().min(0).max(1),
  shake: z.object({
    frequency: z.number(),
    amplitude: z.number(),
    decay: z.number(),
  }).optional(),
  motionBlur: z.object({
    shutterAngle: z.number(),
    samples: z.number().int(),
  }).optional(),
})

// Effects
export const EffectSchema = z.object({
  id: z.string(),
  type: z.string(),
  targetStrength: z.number().min(0).max(1),
  targetEmotion: z.string().optional(),
  duration: z.string().optional(),  // "full_clip", "first_0.5s", "last_2.0s"
  params: z.record(z.any()),
})

// Transitions
export const TransitionSchema = z.object({
  type: z.string(),
  duration: z.number().min(0),
  params: z.record(z.any()).optional(),
})

// Compositing
export const AttentionEntrySchema = z.object({
  weight: z.number().min(0).max(1),
  protectFromEffects: z.boolean().optional(),
  applyEffects: z.boolean().optional(),
})

export const CompositingSchema = z.object({
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'soft_light', 'hard_light', 'difference', 'exclusion']),
  chromaKey: z.object({
    enabled: z.boolean(),
    color: z.string(),
    similarity: z.number(),
    blend: z.number(),
  }).optional(),
  mask: z.object({
    type: z.enum(['depth', 'chroma', 'shape', 'tracked', 'rotoscope', 'manual']),
    invert: z.boolean(),
    feather: z.number(),
  }).optional(),
  attention: z.record(z.string(), AttentionEntrySchema).optional(),
})

// Text
export const TextLayerSchema = z.object({
  content: z.string(),
  style: z.object({
    font: z.string(),
    size: z.number(),
    color: z.string(),
    stroke: z.object({ color: z.string(), width: z.number() }).optional(),
    shadow: z.object({ color: z.string(), blur: z.number(), offset: z.tuple([z.number(), z.number()]) }).optional(),
  }),
  position: KeyframeArraySchema,
  animation: z.object({
    type: z.string(),
    duration: z.number(),
    delay: z.number().optional(),
  }).optional(),
  '3dText': z.object({
    enabled: z.boolean(),
    surfaceTracking: z.object({
      method: z.string(),
      perspectiveCorrect: z.boolean(),
    }).optional(),
    extrude: z.number().optional(),
  }).optional(),
})

// Audio
export const AudioEffectSchema = z.object({
  type: z.string(),
  params: z.record(z.any()),
})

export const AudioSpatialSchema = z.object({
  space: z.object({ type: z.string() }),
  objects: z.array(z.object({
    position: KeyframeArraySchema,
    volume: KeyframeArraySchema.optional(),
    doppler: z.object({ enabled: z.boolean(), factor: z.number() }).optional(),
  })),
})

export const AudioReactiveSchema = z.object({
  feature: z.string(),
  reactions: z.array(z.object({
    target: z.string(),
    mapping: z.string(),
    threshold: z.number(),
    amount: z.number(),
    decay: z.number().optional(),
  })),
})

// Clip
export const ClipSourceSchema = z.object({
  clipId: z.string().optional(),
  type: z.enum(['video', 'image', 'color', 'gradient', 'generated']),
  in: z.number().optional(),
  out: z.number().optional(),
})

export const ClipTimingSchema = z.object({
  start: z.number(),
  duration: z.number(),
  speed: z.number(),
  speedRamp: SpeedRampSchema.optional(),
  reverse: z.boolean().optional(),
  loop: z.boolean().optional(),
})

export const ClipSchema = z.object({
  id: z.string(),
  momentId: z.string().optional(),
  source: ClipSourceSchema,
  timing: ClipTimingSchema,
  transform: TransformSchema.optional(),
  camera: CameraSchema.optional(),
  effects: z.array(EffectSchema).optional(),
  transition: TransitionSchema.optional(),
  compositing: CompositingSchema.optional(),
  text: z.object({ layers: z.array(TextLayerSchema) }).optional(),
  audioEffects: z.array(AudioEffectSchema).optional(),
  audioSpatial: AudioSpatialSchema.optional(),
  audioReactive: AudioReactiveSchema.optional(),
})

// Track
export const TrackSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'audio']),
  name: z.string(),
  clips: z.array(ClipSchema),
})

// Color Science
export const ColorScienceSchema = z.object({
  workingSpace: z.string(),
  inputTransform: z.object({
    source: z.string(),
    cameraProfile: z.string(),
    lut: z.string().nullable().optional(),
  }),
  grade: z.object({
    primary: z.record(z.any()).optional(),
    colorWheels: z.record(z.any()).optional(),
    curves: z.record(z.any()).optional(),
    hsl: z.record(z.any()).optional(),
  }).optional(),
  lutStack: z.array(z.object({
    name: z.string(),
    intensity: z.number(),
    blendMode: z.string(),
  })).optional(),
  outputTransform: z.object({
    target: z.string(),
    toneMapping: z.string(),
    gamutMapping: z.string().optional(),
  }),
})

// Runtime Layer
export const RuntimeLayerSchema = z.object({
  timeline: z.object({
    resolution: z.object({ width: z.number().int(), height: z.number().int() }),
    fps: z.number().int(),
    duration: z.number(),
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
git commit -m "feat(edl-v2): add runtime layer types (tracks, clips, effects, color science)"
```

---

### Task 4: EDL Schema — Master Schema + Validation

**Files:**
- Create: `packages/edl-v2/src/schema.ts`
- Create: `packages/edl-v2/src/validators.ts`
- Create: `packages/edl-v2/src/refs.ts`
- Create: `packages/edl-v2/src/dependencies.ts`
- Modify: `packages/edl-v2/tests/schema.test.ts`

**Interfaces:**
- Produces: `EDLSchema`, `validateEDL()`, `resolveRefs()`, `checkDependencies()`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/schema.test.ts
import { EDLSchema, validateEDL } from '../src/schema'

describe('EDL v5.1 Master Schema', () => {
  const validEDL = {
    version: '5.1',
    id: 'edl_test_001',
    created: '2026-07-14T00:00:00Z',
    duration: 15,
    refs: { entities: {}, recipes: {}, detections: {} },
    style: {
      tokens: { aggression: 0.8, cinematic: 0.7, chaos: 0.4, luxury: 0.9, warmth: 0.6, nostalgia: 0.3, futurism: 0.5, intimacy: 0.7, epicness: 0.85, playfulness: 0.2, darkness: 0.3, energy: 0.9 },
      tokenInfluence: {},
      genre: { primary: 'tiktok_edit', platform: 'tiktok', styleProfile: { cutRate: 1.2, avgShotDuration: 1.2, effectDensity: 0.8, transitionStyle: 'stylized', colorMood: 0.8, textFrequency: 0.5, energyCurve: 'building' } },
      constraints: { avoidFaceOcclusion: true, maxTextCoverage: 0.12, keepSubjectVisible: true, preserveMotionDirection: true, safeArea: true, avoidOverEditing: true, maxEffectsPerShot: 5, minShotDuration: 0.3, maxTransitionDuration: 1.5, preserveAudioSync: true, maintainColorConsistency: true },
    },
    creative: {
      entities: {},
      storyArc: [],
      emotionArc: { timeline: [], autoApply: { enabled: false, affects: [], strength: 0 } },
      moments: [],
      intentChains: { global: '', perMoment: {} },
      generativeSlots: [],
    },
    editorial: {
      sequences: [],
      shotRelationships: [],
      rhythm: { pattern: 'building', musicalPhraseAlignment: [] },
    },
    runtime: {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 15 },
      tracks: [],
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

  it('validates EDL with business rules', () => {
    const errors = validateEDL(validEDL)
    expect(errors).toHaveLength(0)
  })

  it('rejects EDL with overlapping shots', () => {
    const edl = {
      ...validEDL,
      runtime: {
        ...validEDL.runtime,
        tracks: [{
          id: 'track_v1', type: 'video', name: 'Main',
          clips: [
            { id: 'shot_1', source: { type: 'video' }, timing: { start: 0, duration: 3, speed: 1 } },
            { id: 'shot_2', source: { type: 'video' }, timing: { start: 2, duration: 3, speed: 1 } },  // overlaps
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
Expected: FAIL with "EDLSchema is not exported"

- [ ] **Step 3: Implement master schema + validators**

```typescript
// src/schema.ts
import { z } from 'zod'
import { StyleLayerSchema } from './style'
import { CreativeLayerSchema } from './creative'
import { RuntimeLayerSchema } from './runtime'

export const CapabilitiesSchema = z.record(z.any())
export const DependenciesSchema = z.record(z.any())
export const AnalysisSchema = z.record(z.any())

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
    rhythm: z.object({
      pattern: z.string(),
      musicalPhraseAlignment: z.array(z.any()),
    }),
  }),
  runtime: RuntimeLayerSchema,
  capabilities: CapabilitiesSchema,
  dependencies: DependenciesSchema,
  analysis: AnalysisSchema,
})

export type EDL = z.infer<typeof EDLSchema>
```

```typescript
// src/validators.ts
import type { EDL } from './schema'

export function validateEDL(edl: EDL): string[] {
  const errors: string[] = []

  // 1. Duration match
  const trackDuration = edl.runtime.tracks.reduce((max, track) => {
    const trackEnd = track.clips.reduce((m, clip) => Math.max(m, clip.timing.start + clip.timing.duration), 0)
    return Math.max(max, trackEnd)
  }, 0)
  if (Math.abs(trackDuration - edl.duration) > 0.1) {
    errors.push(`Track duration ${trackDuration} does not match EDL duration ${edl.duration}`)
  }

  // 2. No overlapping clips on same track
  for (const track of edl.runtime.tracks) {
    const sorted = [...track.clips].sort((a, b) => a.timing.start - b.timing.start)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (curr.timing.start < prev.timing.start + prev.timing.duration) {
        errors.push(`Clips ${prev.id} and ${curr.id} overlap on track ${track.id}`)
      }
    }
  }

  // 3. Shot duration ceiling (max 30s per clip)
  for (const track of edl.runtime.tracks) {
    for (const clip of track.clips) {
      if (clip.timing.duration > 30) {
        errors.push(`Clip ${clip.id} exceeds 30s duration ceiling`)
      }
    }
  }

  // 4. Non-empty tracks
  if (edl.runtime.tracks.length === 0) {
    errors.push('EDL has no tracks')
  }

  // 5. Moment references valid
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
git add packages/edl-v2/src/schema.ts packages/edl-v2/src/validators.ts
git commit -m "feat(edl-v2): add master EDL schema and business rule validators"
```

---

### Task 5: Content Analyzer — Data Models

**Files:**
- Create: `workers/python-content-analyzer/pyproject.toml`
- Create: `workers/python-content-analyzer/src/__init__.py`
- Create: `workers/python-content-analyzer/src/models.py`
- Create: `workers/python-content-analyzer/tests/test_models.py`

**Interfaces:**
- Produces: `FaceDetection`, `ObjectDetection`, `DepthMap`, `OpticalFlow`, `SceneChange`, `CompositionAnalysis`, `ColorPalette`, `SemanticUnderstanding`, `ContentAnalysis`

- [ ] **Step 1: Scaffold Python project**

```bash
cd workers/python-content-analyzer
python -m venv .venv
source .venv/bin/activate
pip install pydantic pytest
```

- [ ] **Step 2: Write failing test**

```python
# tests/test_models.py
from src.models import ContentAnalysis, FaceDetection, SceneChange

def test_content_analysis_creation():
    analysis = ContentAnalysis(
        faces=[FaceDetection(
            frame=0,
            bbox=[400, 200, 680, 900],
            landmarks={"left_eye": [480, 320], "right_eye": [560, 320], "nose": [520, 380]},
            confidence=0.98,
        )],
        objects=[],
        depth=[],
        motion=[],
        scenes=[SceneChange(
            frame=30,
            timestamp=1.0,
            score=0.85,
        )],
        brightness=[0.5],
        composition={},
        color_palette=[],
        semantic="Young man walking in hallway",
    )
    assert len(analysis.faces) == 1
    assert analysis.faces[0].confidence == 0.98
    assert len(analysis.scenes) == 1
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_models.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'src.models'"

- [ ] **Step 4: Implement data models**

```python
# src/models.py
from pydantic import BaseModel
from typing import Optional

class FaceDetection(BaseModel):
    frame: int
    bbox: list[int]  # [x1, y1, x2, y2]
    landmarks: Optional[dict[str, list[int]]] = None
    confidence: float

class ObjectDetection(BaseModel):
    frame: int
    label: str
    bbox: list[int]
    confidence: float

class DepthMap(BaseModel):
    frame: int
    map_path: str  # R2 path
    method: str  # "midas", "monodepth2"

class OpticalFlow(BaseModel):
    frame: int
    magnitude: float  # average motion magnitude
    direction: float  # average motion direction in degrees

class SceneChange(BaseModel):
    frame: int
    timestamp: float
    score: float  # 0-1, higher = more significant change

class CompositionAnalysis(BaseModel):
    rule_of_thirds: float  # 0-1, how well subject aligns with thirds
    leading_lines: bool
    symmetry: float  # 0-1
    depth_of_field: float  # 0-1, estimated DoF

class ColorPalette(BaseModel):
    dominant_colors: list[str]  # hex codes
    warmth: float  # 0-1
    saturation: float  # 0-1
    contrast: float  # 0-1

class SemanticUnderstanding(BaseModel):
    description: str  # Gemini's natural language description
    mood: str
    setting: str
    action: str
    confidence: float

class ContentAnalysis(BaseModel):
    faces: list[FaceDetection]
    objects: list[ObjectDetection]
    depth: list[DepthMap]
    motion: list[OpticalFlow]
    scenes: list[SceneChange]
    brightness: list[float]
    composition: CompositionAnalysis
    color_palette: ColorPalette
    semantic: SemanticUnderstanding
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/python-content-analyzer/
git commit -m "feat(content-analyzer): add Pydantic data models for content analysis"
```

---

### Task 6: Content Analyzer — Face Detection

**Files:**
- Create: `workers/python-content-analyzer/src/face_detection.py`
- Create: `workers/python-content-analyzer/tests/test_face_detection.py`

**Interfaces:**
- Consumes: Video frames (numpy arrays)
- Produces: `list[FaceDetection]`

- [ ] **Step 1: Write failing test**

```python
# tests/test_face_detection.py
from unittest.mock import MagicMock, patch
from src.face_detection import FaceDetector

def test_face_detector_initialization():
    with patch('insightface.app.FaceAnalysis') as mock:
        detector = FaceDetector()
        mock.assert_called_once()

def test_detect_faces_returns_list():
    detector = FaceDetector()
    # Mock the underlying model
    detector.app.get = MagicMock(return_value=[
        MagicMock(bbox=[400, 200, 680, 900], kps=[[480, 320], [560, 320], [520, 380], [500, 400], [540, 400]], det_score=0.98)
    ])
    
    import numpy as np
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    results = detector.detect(frame, frame_index=0)
    
    assert len(results) == 1
    assert results[0].confidence == 0.98
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_face_detection.py -v`
Expected: FAIL with "ModuleNotFoundError" or "ImportError"

- [ ] **Step 3: Implement face detection**

```python
# src/face_detection.py
import numpy as np
from .models import FaceDetection

class FaceDetector:
    def __init__(self):
        from insightface.app import FaceAnalysis
        self.app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        self.app.prepare(ctx_id=0, det_size=(640, 640))
    
    def detect(self, frame: np.ndarray, frame_index: int) -> list[FaceDetection]:
        faces = self.app.get(frame)
        results = []
        for face in faces:
            bbox = face.bbox.astype(int).tolist()
            landmarks = {}
            if face.kps is not None:
                landmarks = {
                    "left_eye": face.kps[0].astype(int).tolist(),
                    "right_eye": face.kps[1].astype(int).tolist(),
                    "nose": face.kps[2].astype(int).tolist(),
                }
            results.append(FaceDetection(
                frame=frame_index,
                bbox=bbox,
                landmarks=landmarks if landmarks else None,
                confidence=float(face.det_score),
            ))
        return results
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-content-analyzer && python -m pytest tests/test_face_detection.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-content-analyzer/src/face_detection.py workers/python-content-analyzer/tests/test_face_detection.py
git commit -m "feat(content-analyzer): add face detection with InsightFace"
```

---

### Task 7: Music Analyzer — Data Models + Beat Detection

**Files:**
- Create: `workers/python-music-analyzer/pyproject.toml`
- Create: `workers/python-music-analyzer/src/__init__.py`
- Create: `workers/python-music-analyzer/src/models.py`
- Create: `workers/python-music-analyzer/src/beat_detection.py`
- Create: `workers/python-music-analyzer/tests/test_models.py`
- Create: `workers/python-music-analyzer/tests/test_beat_detection.py`

**Interfaces:**
- Produces: `BeatGrid`, `MusicAnalysis`

- [ ] **Step 1: Scaffold Python project**

```bash
cd workers/python-music-analyzer
python -m venv .venv
source .venv/bin/activate
pip install pydantic pytest librosa numpy
```

- [ ] **Step 2: Write failing test for models**

```python
# tests/test_models.py
from src.models import MusicAnalysis, BeatGrid

def test_music_analysis_creation():
    analysis = MusicAnalysis(
        bpm=140.0,
        beat_grid=BeatGrid(
            beats=[0.0, 0.429, 0.857],
            downbeats=[0.0, 1.714],
        ),
        onsets=[0.0, 0.42, 0.86],
        sections=[{"name": "intro", "start": 0, "end": 3, "energy": 0.3}],
        energy_curve=[(0, 0.2), (3, 0.5), (6, 1.0)],
        vocal_regions=[(2.0, 5.0)],
        frequency_profile={"low": 0.6, "mid": 0.4, "high": 0.3},
    )
    assert analysis.bpm == 140.0
    assert len(analysis.beat_grid.beats) == 3
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_models.py -v`
Expected: FAIL

- [ ] **Step 4: Implement data models**

```python
# src/models.py
from pydantic import BaseModel

class BeatGrid(BaseModel):
    beats: list[float]
    downbeats: list[float]

class MusicAnalysis(BaseModel):
    bpm: float
    beat_grid: BeatGrid
    onsets: list[float]
    sections: list[dict]
    energy_curve: list[tuple[float, float]]
    vocal_regions: list[tuple[float, float]]
    frequency_profile: dict[str, float]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 6: Write failing test for beat detection**

```python
# tests/test_beat_detection.py
import numpy as np
from src.beat_detection import BeatDetector

def test_detect_beats():
    detector = BeatDetector()
    # Create synthetic audio signal with clear beats
    sr = 22050
    duration = 4.0
    t = np.linspace(0, duration, int(sr * duration))
    # Simulate 140 BPM beat
    beat_freq = 140 / 60
    signal = 0.5 * np.sin(2 * np.pi * beat_freq * t)
    
    result = detector.detect(signal, sr)
    
    assert 135 < result.bpm < 145  # should detect ~140 BPM
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
from .models import BeatGrid

class BeatDetector:
    def detect(self, y: np.ndarray, sr: int) -> BeatGrid:
        # Detect tempo
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        
        # Convert frames to times
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        
        # Detect downbeats (every 4 beats)
        downbeats = beat_times[::4]
        
        return BeatGrid(
            beats=beat_times,
            downbeats=downbeats,
        )
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd workers/python-music-analyzer && python -m pytest tests/test_beat_detection.py -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add workers/python-music-analyzer/
git commit -m "feat(music-analyzer): add data models and beat detection with librosa"
```

---

### Task 8: Recipe Expander + Strength Resolver

**Files:**
- Create: `packages/edl-v2/src/resolvers/recipe-expander.ts`
- Create: `packages/edl-v2/src/resolvers/strength-resolver.ts`
- Create: `packages/edl-v2/tests/resolvers/recipe-expander.test.ts`
- Create: `packages/edl-v2/tests/resolvers/strength-resolver.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `StyleTokens`, `EmotionArc`
- Produces: `Effect[]`, `Transition`, `Camera`

- [ ] **Step 1: Write failing test for recipe expander**

```typescript
// tests/resolvers/recipe-expander.test.ts
import { describe, it, expect } from 'vitest'
import { expandRecipe } from '../../src/resolvers/recipe-expander'

describe('RecipeExpander', () => {
  it('expands parametric recipe with style tokens', () => {
    const recipe = {
      version: '2.0',
      description: 'Test recipe',
      applicableWhen: {},
      parametric: {
        glow: { base: 0.6, emotionScale: { awe: 1.0, calm: 0.5 }, aggressionScale: 0.4 },
        shake: { base: 0.3, emotionScale: { awe: 1.0 }, aggressionScale: 0.5 },
      },
      transition: { type: 'flash', baseDuration: 0.15 },
      camera: { movement: 'steadicam', baseIntensity: 0.5 },
    }

    const tokens = { aggression: 0.8, energy: 0.9 }
    const emotion = 'awe'

    const result = expandRecipe(recipe, tokens, emotion)

    expect(result.effects).toHaveLength(2)
    expect(result.effects[0].type).toBe('glow')
    expect(result.effects[0].targetStrength).toBeCloseTo(0.6 * 1.0 + 0.8 * 0.4)  // base * emotionScale + aggression * aggressionScale
    expect(result.transition.type).toBe('flash')
    expect(result.camera.movement).toBe('steadicam')
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

export function expandRecipe(
  recipe: Recipe,
  tokens: StyleTokens,
  emotion: string
): ExpandedRecipe {
  const aggression = tokens.aggression ?? 0.5

  // Expand effects from parametric definitions
  const effects: ExpandedEffect[] = Object.entries(recipe.parametric).map(([type, param]) => {
    const emotionScale = param.emotionScale?.[emotion] ?? 1.0
    const aggressionContribution = (param.aggressionScale ?? 0) * aggression
    
    // targetStrength = base * emotionScale + aggression contribution
    const targetStrength = Math.min(1, Math.max(0, 
      param.base * emotionScale + aggressionContribution
    ))

    return {
      type,
      targetStrength,
      params: {},  // filled by capability resolver
    }
  })

  return {
    effects,
    transition: {
      type: recipe.transition.type,
      duration: recipe.transition.baseDuration,
    },
    camera: {
      movement: recipe.camera.movement,
      intensity: recipe.camera.baseIntensity,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/edl-v2 && npx vitest run tests/resolvers/recipe-expander.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/edl-v2/src/resolvers/ packages/edl-v2/tests/resolvers/
git commit -m "feat(edl-v2): add recipe expander with parametric resolution"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 1 | EDL Style Layer | 30 min |
| 2 | EDL Creative Layer | 45 min |
| 3 | EDL Runtime Layer | 60 min |
| 4 | EDL Master Schema + Validators | 45 min |
| 5 | Content Analyzer Models | 20 min |
| 6 | Face Detection | 30 min |
| 7 | Music Analyzer + Beat Detection | 45 min |
| 8 | Recipe Expander + Strength Resolver | 45 min |
| **Total** | | **~5.5 hours** |

## After Phase 1

Phase 2 builds on this foundation:
- Content Analyzer: object detection, depth estimation, optical flow, scene detection, composition analysis, color analysis, semantic understanding
- Music Analyzer: onset detection, section segmentation, energy analysis, vocal detection, frequency analysis
- Creative Planner: story arc generation, moment creation, shot selection
- Critic + Refiner: self-evaluation, iterative improvement
