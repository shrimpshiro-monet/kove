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
| Color Pulse | alpha | `monet-action-executor.ts:764` + `packages/kove-director/src/capabilities/effects/color-pulse.ts` | `effect.custom` with `color_pulse` | Zod-validated capability. Saturation + brightness pump for ~250ms. Mapped via compiler.ts effectTypeMap. |
| Vignette Punch | alpha | `monet-action-executor.ts:822` + `packages/kove-director/src/capabilities/effects/vignette-punch.ts` | `effect.custom` with `vignette_punch` | Zod-validated capability. Animated vignette for dramatic emphasis. Mapped via compiler.ts effectTypeMap. |
| Chromatic Burst | alpha | `monet-action-executor.ts:832` + `packages/kove-director/src/capabilities/effects/chromatic-burst.ts` | `effect.custom` with `chromatic_burst` | Zod-validated capability. RGB channel split for glitch-energy moments. Mapped via compiler.ts effectTypeMap. |
| Background Blur | alpha | `apps/web/src/components/editor/ClipInspector.tsx:369` + `packages/kove-director/src/capabilities/effects/background-blur.ts` | `effect.custom` with `background_blur` | Zod-validated capability. ClipInspector toggle + blur radius slider. Mapped via compiler.ts effectTypeMap. |
| Player Glow (SAM) | alpha | `apps/web/src/components/editor/ClipInspector.tsx:332` + `packages/kove-director/src/capabilities/effects/player-glow.ts` | `effect.custom` with `player_glow` | Zod-validated capability. Neon glow effect with color/blur params. Mapped via compiler.ts effectTypeMap. |
| Camera Blur | alpha | `apps/web/src/components/editor/ClipInspector.tsx:395` + `packages/kove-director/src/capabilities/effects/camera-blur.ts` | `effect.custom` with `camera_blur` | Zod-validated capability. Lens-like defocus blur. Mapped via compiler.ts effectTypeMap. |
| Directional Blur | alpha | `apps/web/src/components/editor/ClipInspector.tsx:423` + `packages/kove-director/src/capabilities/effects/directional-blur.ts` | `effect.custom` with `directional_blur` | Zod-validated capability. Angle + length blur for motion sweep. Mapped via compiler.ts effectTypeMap. |
| Gaussian Blur | alpha | `apps/web/src/components/editor/ClipInspector.tsx:463` + `packages/kove-director/src/capabilities/effects/gaussian-blur.ts` | `effect.custom` with `gaussian_blur` | Zod-validated capability. Configurable blur with direction options. Mapped via compiler.ts effectTypeMap. |
| Sharpen | alpha | `apps/web/src/components/editor/ClipInspector.tsx:503` + `packages/kove-director/src/capabilities/effects/sharpen.ts` | `effect.custom` with `sharpen` | Zod-validated capability. Edge contrast enhancement. Mapped via compiler.ts effectTypeMap. |
| Unsharp Mask | alpha | `apps/web/src/components/editor/ClipInspector.tsx:529` + `packages/kove-director/src/capabilities/effects/unsharp-mask.ts` | `effect.custom` with `unsharp_mask` | Zod-validated capability. Controlled sharpening with radius + amount. Mapped via compiler.ts effectTypeMap. |
| Invert Color | alpha | `apps/web/src/components/editor/ClipInspector.tsx:595` + `packages/kove-director/src/capabilities/effects/invert-color.ts` | `effect.custom` with `invert_color` | Zod-validated capability. Per-channel color inversion. Mapped via compiler.ts effectTypeMap. |
| Echo / Motion Trails | alpha | `apps/web/src/components/editor/ClipInspector.tsx:637` + `packages/kove-director/src/capabilities/effects/echo.ts` | `effect.custom` with `echo` | Zod-validated capability. Ghost trail with configurable decay. Mapped via compiler.ts effectTypeMap. |
| 3D Parallax | alpha | `apps/web/src/components/editor/ClipInspector.tsx:693` + `packages/kove-director/src/capabilities/effects/parallax-3d.ts` | `effect.custom` with `parallax_3d` | Zod-validated capability. Fake 3D depth parallax effect. Mapped via compiler.ts effectTypeMap. |
| Reduce Interlace Flicker | alpha | `apps/web/src/components/editor/ClipInspector.tsx:569` + `packages/kove-director/src/capabilities/effects/interlace-flicker.ts` | `effect.custom` with `reduce_interlace_flicker` | Zod-validated capability. Interlace artifact reduction. Mapped via compiler.ts effectTypeMap. |
| GL Transition (effect) | alpha | `apps/web/src/components/editor/effects/effect-control-registry.ts:127` + `packages/kove-director/src/capabilities/effects/gl-transition-effect.ts` | `effect.custom` with `gl_transition` | Zod-validated capability. GPU shader transitions with presets. Mapped via compiler.ts effectTypeMap. |
| Speed Ramp (effect) | alpha | `apps/web/src/components/editor/effects/effect-control-registry.ts:72` + `packages/kove-director/src/capabilities/effects/speed-ramp-effect.ts` | `effect.custom` with `speed_ramp` | Zod-validated capability. Effect-layer speed ramp with easing. Mapped via compiler.ts effectTypeMap. |
| Color LUT | beta | `packages/kove-director/src/capabilities/effects/color-lut.ts` | `color.lut` (compiled, effect/apply) | Zod schema + compile() emits effect/apply. **Render-side NOT wired** to OpenReel's ColorGradingEngine. |
| Color Curves | beta | `packages/kove-director/src/capabilities/effects/color-curves.ts` | `color.curves` (compiled, effect/apply) | Zod schema + compile() emits effect/apply. **Render-side NOT wired** to OpenReel's ColorGradingEngine. |
| Color Wheels | beta | `packages/kove-director/src/capabilities/effects/color-wheels.ts` | `color.wheels` (compiled, effect/apply) | Zod schema + compile() emits effect/apply. **Render-side NOT wired** to OpenReel's ColorGradingEngine. |

---

## OVERLAYS (text, PiP, logos, motion graphics)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Text Overlays | alpha | `src/server/types/edl.ts:104` + `src/lib/renderer/monet-renderer.ts:780` + `edl-to-editly.ts:120` | `subtitle.auto` + `effect.custom` | Full schema (font, size, color, animation, motion tracking). Canvas2D renderer + Editly drawtext filter. |
| Kinetic Captions | alpha | `src/lib/engines/registry.ts:107` + `src/lib/engines/engine-dispatch.ts:189` + `packages/kove-director/src/capabilities/overlays/kinetic-caption.ts` | `subtitle.auto` + `subtitle.animation` | Zod-validated capability. 10 animation styles (pop, type, slide, wave, glitch, etc.). Canvas2D KineticTextEngine at `src/lib/renderer/text-engine.ts`. Mapped via compiler.ts directMap. |
| Subtitles (auto) | alpha | `packages/kove-director/src/compiler.ts:413` + `packages/kove-director/src/capabilities/overlays/subtitle-auto.ts` | `subtitle.auto` | Zod-validated capability. Auto-generate subtitles from transcription. Multiple styles. Mapped via compiler.ts directMap. |
| Title Cards | alpha | `src/lib/engines/registry.ts:111` + `packages/kove-director/src/capabilities/overlays/title-card.ts` | `effect.custom` with `title_card` | Zod-validated capability. Animated title cards with multiple styles. Mapped via compiler.ts effectTypeMap. |
| Lower Thirds | alpha | `src/lib/engines/registry.ts:112` + `packages/kove-director/src/capabilities/overlays/lower-third.ts` | `effect.custom` with `lower_third` | Zod-validated capability. Professional broadcast-style name plates. Mapped via compiler.ts effectTypeMap. |
| Lyric Text / Word Pop | planned | `src/lib/engines/registry.ts:112-113` | None | Listed in engine registry. No rendering implementation. |
| Logo / Watermark | planned | — | None | Not implemented. EDL schema supports overlay assets but no logo logic. |
| Motion Graphics | planned | `src/server/lib/engine-capabilities.ts:250` | None | Mentioned as Blender capability. No actual pipeline. |
| Face Detect Overlay | planned | `src/lib/engines/registry.ts:238` + `engine-dispatch.ts:387` | None | OpenCV browser engine declared. Requires OpenCV.js. Partially wired. |

---

## AUDIO

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Volume Control | alpha | `apps/web/src/engine/audio/audio-engine.ts:33` + `audio-timeline-engine.ts:310` | `audio.set-volume` | Master/music/voice/sfx gain chain. Per-clip `audio.gain` applied to GainNode. |
| Audio Fade In/Out | alpha | `src/server/lib/audio-mixer.ts:107` + `compiler.ts:357` + `apps/web/src/engine/audio/audio-timeline-engine.ts` | `audio.fade` | Compiler emits `clip/update` with `fade: { fadeIn, fadeOut }`. Server applies FFmpeg `afade`. Browser AudioTimelineEngine now applies gain ramps via `linearRampToValueAtTime()`. |
| Beat Sync | alpha | `apps/web/src/engine/audio/beat-engine.ts` + `beat-resolver.ts` + `compiler.ts:112` | `audio.beat-sync` | BeatEngine reads EDL markers, provides `getNearestBeat()`/`isBeatHit()`/`getBeatPulse()`. Effects pulse with beat. |
| Audio Ducking | alpha | `apps/web/src/engine/audio/audio-engine.ts:261` + `compiler.ts:114` + `src/server/lib/audio-mixer.ts:178` | `audio.ducking` | Browser: simplified gain ramp (music→0.22 on voice). Server: full FFmpeg volume automation envelopes. |
| Audio Mixing (server) | alpha | `src/server/lib/audio-mixer.ts` + `packages/kove-director/src/capabilities/audio/audio-mixing.ts` | `audio.mixing` | Zod-validated capability. Multi-track volume balancing with stereo positioning. Mapped via compiler.ts. |
| SFX Synthesis | alpha | `apps/web/src/engine/audio/audio-engine.ts:189` + `sfx-engine.ts` + `packages/kove-director/src/capabilities/audio/sfx-synthesis.ts` | `effect.custom` with `sfx_synthesis` | Zod-validated capability. Web Audio API whoosh/hit/bass_drop. Mapped via compiler.ts effectTypeMap. |
| Dynamic SFX Injection | planned | `packages/edl-enhancers/src/sfx-injection.ts` + `feature-registry:217` | None | Feature registered v-beta-1. Adds hardcoded "impact-hit" clips. Full pipeline not connected. |
| Audio EQ | beta | `packages/kove-director/src/capabilities/audio/audio-eq.ts` | `audio.eq` (compiled, effect/apply) | Zod schema + compile() emits effect/apply. **Render-side NOT wired** to OpenReel's AudioEffectsEngine. |
| Audio Dynamics | beta | `packages/kove-director/src/capabilities/audio/audio-dynamics.ts` | `audio.dynamics` (compiled, effect/apply) | Zod schema + compile() emits effect/apply. **Render-side NOT wired** to OpenReel's AudioEffectsEngine. |

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
| Stabilize | alpha | `packages/kove-director/src/capabilities/camera/stabilize.ts` | `clip.update` with `stabilization` | Zod-validated capability. Strength/cropMode params. Routes through compiler compileStabilize. |
| Reframe | alpha | `packages/kove-director/src/capabilities/camera/reframe.ts` | `clip.update` with `reframe` | Zod-validated capability. Target ratio + subject lock. Routes through compiler compileReframe. |
| Face/Subject Tracking Crop | planned | `packages/feature-registry/src/features.ts:184` + `src/server/types/edl.ts:75` (`MotionTrackSchema`) | None | EDL defines motion tracking keyframes. Feature registered v-beta-1. No tracker implementation. |
| Ken Burns Pan (horizontal) | planned | `src/server/lib/editly-renderer.ts:6` | None | Zoom works (push_in/pull_out). No position keyframes for horizontal panning in renderer. |

---

## COMPOSITION (multi-cam, split, B-roll)

| Capability | Status | Code Location | Action Verb | Notes |
|-----------|--------|---------------|-------------|-------|
| Multi-Track Timeline | alpha | `packages/edl/src/schemas.ts:40` (5 track types) + `compiler.ts:151` | `timeline.build` | EDL supports video/audio/text/fx/mask tracks. Compiler creates video-main + audio-music. AudioTimelineEngine reads all audio tracks. |
| Split Screen | alpha | `packages/kove-director/src/capabilities/composition/split-screen.ts` | `effect.custom` with `split_screen` | Zod-validated capability. Horizontal/vertical/quad layouts with configurable gaps. Mapped via compiler.ts effectTypeMap. |
| B-Roll | planned | — | None | Not implemented. Single `video-main` track. No cutaway logic. |
| Multi-Cam | alpha | `packages/kove-director/src/capabilities/composition/multi-cam.ts` | `effect.custom` with `multi_cam` | Zod-validated capability. Angle grouping with audio waveform/timecode/manual sync. Mapped via compiler.ts effectTypeMap. |
| Picture-in-Picture | alpha | `packages/kove-director/src/capabilities/composition/pip.ts` | `effect.custom` with `pip` | Zod-validated capability. Configurable position, size, and border. Mapped via compiler.ts effectTypeMap. |
| Mask Compositing | planned | `packages/edl/src/effect-types.ts:8` + `contract.ts:64` | `clip.mask` (declared, not compiled) | `mask_composite` effect type + `"mask"` track type in EDL. No renderer. |
| Subject Isolation | planned | `src/lib/engines/registry.ts:148` (sam-vfx engine) | None | Engine declares `subject_isolation`, `bg_dim`, `bg_blur`. No SAM 2 integration found. |
| Depth Parallax | planned | `apps/web/src/engine/depth/depth-runtime.ts` + `feature-registry:173` | None | Runtime file exists. Feature registered v-beta-2. Actual depth estimation status unknown. |
| Text Behind Subject | planned | `packages/feature-registry/src/features.ts:173` | None | Feature registered v-beta-1, `requiresGpu: true`. References `workers/python-ai/masks/sam2`. Not implemented. |

---

## SUMMARY

| Category | Alpha | Beta | Planned |
|----------|-------|------|---------|
| Edit | 9 | 1 | 0 |
| Effects | 17 | 4 | 3 |
| Overlays | 6 | 0 | 3 |
| Audio | 6 | 2 | 1 |
| Transitions | 19 | 1 | 1 |
| Camera | 3 | 0 | 2 |
| Composition | 4 | 0 | 5 |
| **Total** | **72** | **6** | **12** |

---

## TOP 5 BETA CAPABILITIES TO FLIP TO ALPHA

These are the highest-impact beta features — real code, real user value, just missing a Director action verb.

### ~~1. Speed Ramp (keyframed slow-mo)~~ ✅ DONE
**Status:** Alpha. Flipped from beta → alpha in commit `4bb391a`. Zod-validated capability with compile() emitting V-shaped `playbackSpeed` keyframes. Registered in compiler.ts via direct map.

### ~~2. Freeze Frame~~ ✅ DONE
**Status:** Alpha. Flipped from beta → alpha in commit `0fc8ba3`. Zod-validated capability emitting `effect/apply` with `freeze_frame` effectType. Mapped via compiler.ts effectTypeMap.

### ~~3. Background Blur (subject isolation lite)~~ ✅ DONE
**Status:** Alpha. Zod-validated capability emitting `effect/apply` with `background_blur` effectType. ClipInspector toggle + blur radius slider. Mapped via compiler.ts effectTypeMap.

### ~~4. Audio Fade In/Out (browser-side)~~ ✅ DONE
**Status:** Alpha. Browser AudioTimelineEngine now reads `fadeIn`/`fadeOut` from clip audio properties and applies gain ramps via `linearRampToValueAtTime()`. Server-side FFmpeg `afade` also works.

### ~~5. Kinetic Captions (word-by-word highlight)~~ ✅ DONE
**Status:** Alpha. Zod-validated capability with 4 subtitle styles. KineticTextEngine at `src/lib/renderer/text-engine.ts` with 10 animation styles (pop, type, slide, wave, glitch, etc.). Wired via engine dispatch system.
