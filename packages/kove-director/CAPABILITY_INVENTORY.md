# Capability Inventory

> Auto-generated audit of every editing feature in the codebase, cross-referenced
> with Kove Director action verbs. Features without a Director action verb cannot
> be triggered by the AI — they're manual-only or unreachable.

## Legend

- **alpha** — Has a Kove Director action verb + wired end-to-end
- **beta** — Engine and/or UI exists but no action verb, ready to expose
- **planned** — Placeholder or partial code, not fully built

---

## EDIT (cuts, speed, arrangement)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Split Clip | alpha | `apps/web/src/stores/project-store.ts:189` (`splitClip`) | `clip.add` (re-adds split segments) | Store method exists. Timeline UI calls it indirectly. No dedicated razor tool — split is the mechanism. |
| Trim Clip | alpha | `apps/web/src/stores/project-store.ts:163` (`trimClip`) | `clip.transform` | Supports "start" and "end" edges. ClipInspector drives trim via `updateClipField`. |
| Delete Clip | alpha | `apps/web/src/stores/project-store.ts:214` (`deleteClip`) | `clip.remove` (declared, not compiled) | Store method works. No UI button. No ripple — leaves gap. |
| Move/Reorder Clip | alpha | `apps/web/src/components/editor/TimelineEditor.tsx:73` (drag-and-drop) | `clip.reorder` (declared, not compiled) | Full pointer-based drag with beat snapping (0.2s threshold) and overlap detection. |
| Clip Speed (static) | alpha | `apps/web/src/components/editor/ClipInspector.tsx:256` + `project-store.ts` | `clip.speed` | Dropdown: 0.25x–4x. `timeline-resolver.ts:55` applies speed multiplier. |
| Speed Ramp (keyframed) | alpha | `apps/web/src/lib/executors/monet-action-executor.ts:388` + `effect-control-registry.ts:72` + `packages/kove-director/src/capabilities/edit/speed-ramp.ts` | `clip.speed-ramp` | Zod-validated capability with compile() emitting V-shaped `playbackSpeed` keyframes. Registered in compiler.ts via direct map. |
| Freeze Frame | alpha | `apps/web/src/lib/executors/monet-action-executor.ts:686` + `packages/kove-director/src/capabilities/edit/freeze-frame.ts` | `effect.custom` with `freeze_frame` | Zod-validated capability. Compile emits `effect/apply` with effectType `freeze_frame`. Mapped via effectTypeMap in compiler.ts. |
| Beat Cut | alpha | `apps/web/src/lib/executors/monet-action-executor.ts:203,699` | Implicit in EDL generation | Hard cut at beat boundary. No-op at clip level (already implicit in shot timing). |
| Posterize Time | beta | `apps/web/src/components/editor/ClipInspector.tsx:665` | None | "Lock FPS" toggle with target FPS slider (1–60). Wired in ClipInspector only. |
| Ripple Delete | planned | — | None | Not implemented. `deleteClip` removes without gap-closing. |
| Undo/Redo | beta | `apps/web/src/stores/project-store.ts:231` (`undo`/`redo`) | None | Store logic complete (50-entry history stack). **No UI buttons exist.** |

---

## EFFECTS (visual filters, VFX, color)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Push-In (Ken Burns zoom in) | alpha | `packages/edl-enhancers/src/push-in-motion.ts` + `monet-action-executor.ts:746` + FFmpeg renderer | `effect.custom` with `push_in` | Scale keyframes 1.0→1.22. EDL enhancer + FFmpeg + Canvas2D all wired. |
| Pull-Out (Ken Burns zoom out) | alpha | `src/server/services/ffmpeg-renderer.ts:311` + `monet-action-executor.ts:755` | `effect.custom` with `pull_out` | Reverse zoom. FFmpeg renderer + executor wired. |
| Camera Shake | alpha | `packages/edl-enhancers/src/context-shake.ts` + `monet-action-executor.ts:780` + FFmpeg renderer | `effect.custom` with `context_shake` | 18Hz procedural jitter, exponential decay. EDL enhancer + FFmpeg + ClipInspector toggle. |
| Impact Flash | alpha | `apps/web/src/lib/executors/monet-action-executor.ts:858` + `ClipInspector.tsx:280` | `effect.custom` with `impact_flash` | White frame overlay with opacity fade. Executor + ClipInspector toggle + intensity slider. |
| Color Grade | alpha | `packages/kove-director/src/compiler.ts:369` + `monet-action-executor.ts:983` | `color.grade` | Saturation, contrast, brightness, temperature, tint, shadows, highlights. Compiler emits `effect/apply` with `kind: "color-grading"`. |
| Whip Pan (motion blur) | alpha | `monet-action-executor.ts:842` + FFmpeg renderer | `effect.custom` with `whip_pan` | Motion blur + horizontal translation at clip end. |
| Color Pulse | beta | `monet-action-executor.ts:764` | None | Saturation + brightness pump for ~250ms. Executor creates it, no Director verb. |
| Vignette Punch | beta | `monet-action-executor.ts:822` | None | Vignette amount keyframes. Executor only. |
| Chromatic Burst | beta | `monet-action-executor.ts:832` | None | RGB split effect. Executor only. |
| Background Blur | beta | `apps/web/src/components/editor/ClipInspector.tsx:369` | None | Toggle + blur radius slider (2–30). ClipInspector only, no Director verb. |
| Player Glow (SAM) | beta | `apps/web/src/components/editor/ClipInspector.tsx:332` | None | Toggle + neon color picker + blur slider. ClipInspector only. |
| Camera Blur | beta | `apps/web/src/components/editor/ClipInspector.tsx:395` | None | Toggle + radius slider. ClipInspector only. |
| Directional Blur | beta | `apps/web/src/components/editor/ClipInspector.tsx:423` | None | Toggle + angle + length sliders. ClipInspector only. |
| Gaussian Blur | beta | `apps/web/src/components/editor/ClipInspector.tsx:463` | None | Toggle + blurriness + dimensions selector. ClipInspector only. |
| Sharpen | beta | `apps/web/src/components/editor/ClipInspector.tsx:503` | None | Toggle + amount slider. ClipInspector only. |
| Unsharp Mask | beta | `apps/web/src/components/editor/ClipInspector.tsx:529` | None | Toggle + radius + amount. ClipInspector only. |
| Invert Color | beta | `apps/web/src/components/editor/ClipInspector.tsx:595` | None | Toggle + blend + channel selector. ClipInspector only. |
| Echo / Motion Trails | beta | `apps/web/src/components/editor/ClipInspector.tsx:637` | None | Toggle + decay slider. ClipInspector only. |
| 3D Parallax | beta | `apps/web/src/components/editor/ClipInspector.tsx:693` | None | Toggle + intensity slider. ClipInspector only. |
| Reduce Interlace Flicker | beta | `apps/web/src/components/editor/ClipInspector.tsx:569` | None | Toggle + softness slider. ClipInspector only. |
| GL Transition (effect) | beta | `apps/web/src/components/editor/effects/effect-control-registry.ts:127` | None | Presets: whip, directional_blur, flash_wipe. Effect registry only. |
| Speed Ramp (effect) | beta | `apps/web/src/components/editor/effects/effect-control-registry.ts:72` | None | from/to params + easing. Effect registry only. |
| Color LUT | planned | `packages/kove-director/src/contract.ts` (tier list) | `color.lut` (declared, not compiled) | Listed in pro-tier capabilities. No implementation. |
| Color Curves | planned | `packages/kove-director/src/contract.ts` (tier list) | `color.curves` (declared, not compiled) | Listed in pro-tier capabilities. No implementation. |
| Color Wheels | planned | `packages/kove-director/src/contract.ts` (tier list) | `color.wheels` (declared, not compiled) | Listed in pro-tier capabilities. No implementation. |

---

## OVERLAYS (text, PiP, logos, motion graphics)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Text Overlays | alpha | `src/server/types/edl.ts:104` + `src/lib/renderer/monet-renderer.ts:780` + `edl-to-editly.ts:120` | `subtitle.auto` + `effect.custom` | Full schema (font, size, color, animation, motion tracking). Canvas2D renderer + Editly drawtext filter. |
| Kinetic Captions | beta | `src/lib/engines/registry.ts:107` + `src/lib/engines/engine-dispatch.ts:189` | `subtitle.auto` (partial) | Engine declared (`kinetic_caption`, `subtitle`, `title_card`, `lower_third`). Feature registry at v-beta-1. Runtime implementation incomplete. |
| Subtitles (auto) | beta | `packages/kove-director/src/compiler.ts:413` + `contract.ts:229` | `subtitle.auto` | Compiler emits `subtitle/add` with style, language, maxCharsPerLine. Consumer on timeline not clearly connected. |
| Title Cards | beta | `src/lib/engines/registry.ts:111` | `effect.custom` with `title_card` | Listed as text-engine capability. No dedicated rendering found. |
| Lower Thirds | beta | `src/lib/engines/registry.ts:112` + `src/server/types/reference-style.ts:115` | `effect.custom` with `lower_third` | Engine declared. Reference style system supports `lower_third` positioning. |
| Lyric Text / Word Pop | planned | `src/lib/engines/registry.ts:112-113` | None | Listed in engine registry. No rendering implementation. |
| Logo / Watermark | planned | — | None | Not implemented. EDL schema supports overlay assets but no logo logic. |
| Motion Graphics | planned | `src/server/lib/engine-capabilities.ts:250` | None | Mentioned as Blender capability. No actual pipeline. |
| Face Detect Overlay | planned | `src/lib/engines/registry.ts:238` + `engine-dispatch.ts:387` | None | OpenCV browser engine declared. Requires OpenCV.js. Partially wired. |

---

## AUDIO

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Volume Control | alpha | `apps/web/src/engine/audio/audio-engine.ts:33` + `audio-timeline-engine.ts:310` | `audio.set-volume` | Master/music/voice/sfx gain chain. Per-clip `audio.gain` applied to GainNode. |
| Audio Fade In/Out | alpha | `src/server/lib/audio-mixer.ts:107` + `compiler.ts:357` | `audio.fade` | Compiler emits `clip/update` with `fade: { fadeIn, fadeOut }`. Server applies FFmpeg `afade`. Browser AudioTimelineEngine does NOT read fade values. |
| Beat Sync | alpha | `apps/web/src/engine/audio/beat-engine.ts` + `beat-resolver.ts` + `compiler.ts:112` | `audio.beat-sync` | BeatEngine reads EDL markers, provides `getNearestBeat()`/`isBeatHit()`/`getBeatPulse()`. Effects pulse with beat. |
| Audio Ducking | alpha | `apps/web/src/engine/audio/audio-engine.ts:261` + `compiler.ts:114` + `src/server/lib/audio-mixer.ts:178` | `audio.ducking` | Browser: simplified gain ramp (music→0.22 on voice). Server: full FFmpeg volume automation envelopes. |
| Audio Mixing (server) | beta | `src/server/lib/audio-mixer.ts` | None (partial `audio.set-volume`) | Music trimming, volume balancing, final FFmpeg render. No dedicated Director verb for "mix". |
| SFX Synthesis | beta | `apps/web/src/engine/audio/audio-engine.ts:189` + `sfx-engine.ts` | None | Web Audio API whoosh/hit/bass_drop. `triggerSFX()` exists but no Director verb. No UI control. |
| Dynamic SFX Injection | planned | `packages/edl-enhancers/src/sfx-injection.ts` + `feature-registry:217` | None | Feature registered v-beta-1. Adds hardcoded "impact-hit" clips. Full pipeline not connected. |
| Audio EQ | planned | `packages/kove-director/src/contract.ts` (pro tier) | `audio.eq` (declared, not compiled) | Listed in pro-tier capabilities. No implementation. |
| Audio Dynamics | planned | `packages/kove-director/src/contract.ts` (pro tier) | `audio.dynamics` (declared, not compiled) | Listed in pro-tier capabilities. No implementation. |

---

## TRANSITIONS

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Crossfade | alpha | `src/lib/renderer/transitions.ts:83` + `editly-transitions.ts:23` | `transition.apply` | Canvas2D alpha blending + Editly gl-transition "fade". |
| Dip to Black | alpha | `src/lib/renderer/transitions.ts:24` | `transition.apply` | Canvas2D fade-through-black. |
| Flash | alpha | `src/lib/renderer/transitions.ts:27` + `editly-transitions.ts:30` | `transition.apply` | Canvas2D + Editly "fadeBlack". |
| Slide | alpha | `src/lib/renderer/transitions.ts:30` | `transition.apply` | Canvas2D directional slide. |
| Glitch | alpha | `src/lib/renderer/transitions.ts:61` + `editly-transitions.ts:29` | `transition.apply` | Canvas2D + Editly "GlitchMemories". |
| Whip Pan | alpha | `src/lib/renderer/transitions.ts:64` + `editly-transitions.ts:27` | `transition.apply` | Canvas2D + Editly "Directional". |
| Zoom Blur | alpha | `src/lib/renderer/transitions.ts:46` + `editly-transitions.ts:28` | `transition.apply` | Canvas2D + Editly "CrossZoom". |
| Radial Wipe | alpha | `src/lib/renderer/transitions.ts:33` | `transition.apply` | Canvas2D implementation. |
| Linear Wipe | alpha | `src/lib/renderer/transitions.ts:37` | `transition.apply` | Canvas2D implementation. |
| Gradient Wipe | alpha | `src/lib/renderer/transitions.ts:40` | `transition.apply` | Canvas2D implementation. |
| Barn Doors | alpha | `src/lib/renderer/transitions.ts:43` | `transition.apply` | Canvas2D implementation. |
| Morph | alpha | `src/lib/renderer/transitions.ts:49` + `editly-transitions.ts:35` | `transition.apply` | Canvas2D + Editly "morph". |
| Iris | alpha | `src/lib/renderer/transitions.ts:52` | `transition.apply` | Canvas2D implementation. |
| Pinwheel | alpha | `src/lib/renderer/transitions.ts:55` | `transition.apply` | Canvas2D implementation. |
| Film Burn | alpha | `src/lib/renderer/transitions.ts:58` | `transition.apply` | Canvas2D implementation. |
| Spin | alpha | `src/lib/renderer/transitions.ts:67` | `transition.apply` | Canvas2D implementation. |
| Blur | alpha | `src/lib/renderer/transitions.ts:70` | `transition.apply` | Canvas2D implementation. |
| Pixelate | alpha | `src/lib/renderer/transitions.ts:73` | `transition.apply` | Canvas2D implementation. |
| Dissolve | alpha | `src/lib/renderer/transitions.ts:21` + `editly-transitions.ts:31` | `transition.apply` | Alias for crossfade. |
| Cube / Mosaic / Ripple / Swirl / Dreamy / Wind / Radial / Doorway / Heart / Kaleidoscope | beta | `src/server/lib/editly-transitions.ts:34-47` | `transition.apply` | Mapped to gl-transition names. Depend on gl-transitions package in Editly runtime. Canvas2D fallback may not exist. |
| Custom Transition | planned | `packages/kove-director/src/contract.ts` (creator+ tier) | `transition.custom` (declared, not compiled) | Listed in tier capabilities. No compiler implementation. |

---

## CAMERA (framing, movement, zoom)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Crop | alpha | `packages/edl/src/schemas.ts:88` (`CropKeyframe`) + `edl-to-editly.ts:335` | `clip.transform` with `crop` | EDL schema supports crop keyframes. Editly generates `crop=iw*(1-L-R):ih*(1-T-B)` FFmpeg filter. |
| Stabilize | planned | `packages/kove-director/src/compiler.ts:427` | `stabilize` (compiled) | Compiler emits `clip/update` with `stabilization: { enabled, strength, cropMode }`. **No FFmpeg vidstab or browser implementation found.** |
| Reframe | planned | `packages/kove-director/src/compiler.ts:443` + `feature-registry:74` | `reframe` (compiled) | Compiler emits `clip/update` with `reframe: { targetRatio, lockSubject }`. Feature registry v-beta-1. **No actual reframing implementation.** |
| Face/Subject Tracking Crop | planned | `packages/feature-registry/src/features.ts:184` + `src/server/types/edl.ts:75` (`MotionTrackSchema`) | None | EDL defines motion tracking keyframes. Feature registered v-beta-1. No tracker implementation. |
| Ken Burns Pan (horizontal) | planned | `src/server/lib/editly-renderer.ts:6` | None | Zoom works (push_in/pull_out). No position keyframes for horizontal panning in renderer. |

---

## COMPOSITION (multi-cam, split, B-roll)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Multi-Track Timeline | alpha | `packages/edl/src/schemas.ts:40` (5 track types) + `compiler.ts:151` | `timeline.build` | EDL supports video/audio/text/fx/mask tracks. Compiler creates video-main + audio-music. AudioTimelineEngine reads all audio tracks. |
| Split Screen | planned | `src/server/lib/effect-vocabulary.ts:34,387,440` | None | Defined as `EffectType` in vocabulary extraction. Priority 1.5 multiplier. **No rendering implementation.** |
| B-Roll | planned | — | None | Not implemented. Single `video-main` track. No cutaway logic. |
| Multi-Cam | planned | — | None | Not implemented. No angle selection or multi-cam sync. |
| Picture-in-Picture | planned | `src/server/lib/engine-capabilities.ts:79` | None | Mentioned as MLT capability. No implementation. |
| Mask Compositing | planned | `packages/edl/src/effect-types.ts:8` + `contract.ts:64` | `clip.mask` (declared, not compiled) | `mask_composite` effect type + `"mask"` track type in EDL. No renderer. |
| Subject Isolation | planned | `src/lib/engines/registry.ts:148` (sam-vfx engine) | None | Engine declares `subject_isolation`, `bg_dim`, `bg_blur`. No SAM 2 integration found. |
| Depth Parallax | planned | `apps/web/src/engine/depth/depth-runtime.ts` + `feature-registry:173` | None | Runtime file exists. Feature registered v-beta-2. Actual depth estimation status unknown. |
| Text Behind Subject | planned | `packages/feature-registry/src/features.ts:173` | None | Feature registered v-beta-1, `requiresGpu: true`. References `workers/python-ai/masks/sam2`. Not implemented. |

---

## SUMMARY

| Category | Alpha | Beta | Planned |
|----------|-------|------|---------|
| Edit | 7 | 2 | 1 |
| Effects | 6 | 14 | 4 |
| Overlays | 1 | 4 | 4 |
| Audio | 4 | 2 | 3 |
| Transitions | 19 | 1 | 1 |
| Camera | 1 | 0 | 4 |
| Composition | 1 | 0 | 7 |
| **Total** | **39** | **23** | **24** |

---

## TOP 5 BETA CAPABILITIES TO FLIP TO ALPHA

These are the highest-impact beta features — real code, real user value, just missing a Director action verb.

### ~~1. Speed Ramp (keyframed slow-mo)~~ ✅ DONE
**Status:** Alpha. Flipped from beta → alpha in commit `4bb391a`. Zod-validated capability with compile() emitting V-shaped `playbackSpeed` keyframes. Registered in compiler.ts via direct map.

### ~~2. Freeze Frame~~ ✅ DONE
**Status:** Alpha. Flipped from beta → alpha in commit `0fc8ba3`. Zod-validated capability emitting `effect/apply` with `freeze_frame` effectType. Mapped via compiler.ts effectTypeMap.

### 3. Background Blur (subject isolation lite)
**Why:** "Blur the background" is a top-3 TikTok editing request. ClipInspector already has toggle + blur radius slider (2–30). Missing: Director verb. The blur effect is already wired to the render pipeline.

**Effort:** ~1 hour. Add `effect.custom` with `bg_blur` type to the Director prompt. No engine changes needed — the effect already works.

### 4. Audio Fade In/Out (browser-side)
**Why:** Fades are fundamental. The compiler emits `audio.fade` actions. Server applies FFmpeg `afade`. But the browser `AudioTimelineEngine` does NOT read `fadeIn`/`fadeOut` from clips — so preview has no fades. Missing: browser-side fade reading in `audio-timeline-engine.ts`.

**Effort:** ~4 hours. Add fade envelope computation in `AudioTimelineEngine` using `GainNode.setTargetAtTime()`. Server-side already works.

### 5. Kinetic Captions (word-by-word highlight)
**Why:** Kinetic captions are the #1 requested feature for short-form content. The engine registry declares `kinetic_caption` support. The Director contract defines subtitle styles (`word-highlight`, `word-by-word`, `karaoke`, `typewriter`). The compiler emits `subtitle/add` actions. Missing: the actual `KineticTextEngine` rendering implementation and timeline consumer.

**Effort:** ~8 hours. Build the `KineticTextEngine` renderer (Canvas2D word-by-word timing from transcript), wire to `subtitle/add` action consumer.
