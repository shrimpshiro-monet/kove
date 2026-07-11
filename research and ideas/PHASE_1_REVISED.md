# Phase 1 Revised — Reverse EDL Adapter + Kove Skill Registry

## Context

The capability audit revealed Kove has 37 alpha-wired capabilities. Nemotron currently only sees 12 action verbs via the compiler. This mismatch means refinement will silently drop capabilities Nemotron doesn't know about. Phase 1 fixes both the round-trip integrity AND the capability discovery layer.

Ship in three runs. Verify each before starting the next.

## Run Status

- [x] Run 1 — Reverse EDL Adapter (DONE: 43/43 tests passing)
- [ ] Run 2 — Skill Registry (capability files)
- [ ] Run 3 — Compiler + Nemotron Manifest Integration

---

## RUN 1 — REVERSE EDL ADAPTER ✅

**Status:** Complete
**Files:**
- `packages/openreel-adapter/src/openreel-to-edl.ts` — reverse adapter (250 lines)
- `packages/openreel-adapter/src/__tests__/round-trip.test.ts` — 43/43 tests passing
- `packages/openreel-adapter/src/index.ts` — exports updated

**Also fixed:** Forward adapter meta loss bug (clip.meta was being dropped)

---

## RUN 2 — SKILL REGISTRY (capability files only)

**Goal:** Create the capability registry with one file per capability from CAPABILITY_INVENTORY.md.

### Directory structure:

```
packages/kove-director/src/capabilities/
  types.ts          — Capability interface, CapabilityStatus type, Category enum
  registry.ts       — Runtime registry + manifest builder
  index.ts          — exports all capabilities and the registry

  edit/
    split.ts, trim.ts, delete.ts, move.ts, speed-static.ts, beat-cut.ts  → alpha
    speed-ramp.ts, freeze-frame.ts, posterize-time.ts, undo-redo.ts     → beta
    ripple-delete.ts                                                     → planned

  effects/
    push-in.ts, pull-out.ts, shake.ts, flash.ts, whip-pan.ts, color-grade.ts → alpha
    color-pulse.ts, vignette-punch.ts, chromatic-burst.ts, background-blur.ts,
    player-glow.ts, camera-blur.ts, directional-blur.ts, gaussian-blur.ts,
    sharpen.ts, unsharp-mask.ts, invert-color.ts, echo.ts, parallax-3d.ts,
    interlace-flicker.ts, gl-transition-effect.ts, speed-ramp-effect.ts → beta
    color-lut.ts, color-curves.ts, color-wheels.ts, motion-track-effect.ts → planned

  overlays/
    text.ts → alpha
    kinetic-caption.ts, subtitle-auto.ts, title-card.ts, lower-third.ts → beta
    lyric-text.ts, logo-watermark.ts, motion-graphics.ts, face-detect.ts → planned

  audio/
    volume.ts, fade.ts, beat-sync.ts, ducking.ts → alpha
    audio-mixing.ts, sfx-synthesis.ts → beta
    audio-eq.ts, audio-dynamics.ts, dynamic-sfx.ts → planned

  transitions/
    crossfade.ts, dip-to-black.ts, flash-transition.ts, slide.ts, glitch.ts,
    whip-pan.ts, zoom-blur.ts, radial-wipe.ts, linear-wipe.ts,
    gradient-wipe.ts, barn-doors.ts, morph.ts, iris.ts, pinwheel.ts,
    film-burn.ts, spin.ts, blur.ts, pixelate.ts, dissolve.ts → alpha (19)
    gl-transition-experimental.ts → beta
    custom-transition.ts → planned

  camera/
    crop.ts → alpha
    stabilize.ts, reframe.ts, face-track.ts, ken-burns-pan.ts → planned

  composition/
    multi-track.ts → alpha
    split-screen.ts, broll.ts, multi-cam.ts, pip.ts, mask-composite.ts,
    subject-isolation.ts, depth-parallax.ts, text-behind-subject.ts → planned
```

### Each capability file exports:

```typescript
export const XCapability: Capability = {
  id: "cut",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Short semantic description Nemotron reads",
  triggerPhrases: [
    "cut to the next shot",
    "shorten this clip",
  ],
  params: { /* Zod or TS type */ },
  compile: (input, context) => OpenReelAction[],
  examples: [
    { input: "shorten this clip by 1 second", output: [/* actions */] },
  ],
};
```

### registry.ts requirements:
- Registers every capability at module load
- `buildManifest({ minStatus })` → Nemotron-readable markdown string
- `lookupCapability(id)` → Capability | undefined
- `searchByTrigger(query)` → Capability[]
- Zero circular imports

### Acceptance:
- All 62 alpha+beta capability files exist
- buildManifest({ minStatus: "alpha" }) returns 37 capabilities
- buildManifest({ minStatus: "beta" }) returns 62 capabilities
- Manifest fits under 4000 tokens
- Zero `any` types, no circular imports

---

## RUN 3 — COMPILER + NEMOTRON MANIFEST INTEGRATION

**Goal:** Teach the compiler to consult the registry, teach Nemotron what it can do.

### A. Compiler refactor:
- Import registry
- For each action, look up capability by id
- If alpha → proceed with capability.compile()
- If beta/planned → log warning, skip
- Legacy path for capabilities without registry entries

### B. Nemotron manifest injection:
- Export capabilities to `scripts/capabilities.json`
- Inject into Nemotron system prompt
- Instructions: "Only use alpha capabilities. Beta/planned = coming soon."

### C. Export script:
- `scripts/export-capabilities-manifest.ts`
- Reads registry, writes JSON

### Acceptance:
- Compiler consults registry for every action
- Beta/planned correctly skipped with warnings
- Nemotron receives manifest in system prompt
- Existing generation still works
