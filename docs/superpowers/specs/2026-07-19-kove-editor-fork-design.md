# Kove Editor Fork Design

## Context

Monet's AI director pipeline generates EDLs (Edit Decision Lists) but lacks a visual editing frontend. OpenReel Video is a mature, MIT-licensed browser-based video editor (~130k lines) that can serve as this frontend. The goal is to fork OpenReel into Kove, integrate it bidirectionally with Monet's EDL pipeline, and reskin it to match Monet/Kove branding.

## Approach: Move & Rename

Fork the existing vendored `openreel-video/` directory into `apps/kove-advanced/` within the Monet monorepo. Rename all packages from `@openreel/*` to `@kove/*`. No structural changes to source code — purely mechanical move + rename.

### Naming

| Before | After |
|--------|-------|
| `openreel-video/` (root) | `apps/kove-advanced/` |
| `@openreel/web` | `@kove/editor` |
| `@openreel/image` | `@kove/image` |
| `@openreel/core` | `@kove/core` |
| `@openreel/image-core` | `@kove/image-core` |
| `@openreel/ui` | `@kove/ui` |

### Files to update

- All `package.json` files in the moved tree (rename packages, update internal `workspace:*` refs)
- `pnpm-workspace.yaml` at repo root (add `apps/kove-advanced/apps/*` and `apps/kove-advanced/packages/*`)
- `tsconfig.base.json` in the moved tree (update path aliases)
- `components.json` in both apps (update `@openreel/ui` → `@kove/ui`)
- Internal imports across the codebase (`@openreel/` → `@kove/`)
- `apps/kove-advanced/start.sh` (update paths if needed)

### What stays the same

All source code, component logic, store logic, engine code — unchanged.

## EDL Integration (Bidirectional)

### Read: EDL → Kove Editor

- New bridge module in `apps/kove-advanced/apps/web/src/bridges/edl-bridge.ts`
- Translates EDL segments into timeline clips using the adapter logic
- The existing `packages/openreel-adapter/` code (`edl-to-openreel.ts`, `openreel-to-edl.ts`, `openreel-types.ts`) moves into `@kove/core` as a built-in `edl/` module
- Uses `@monet/edl` schema (Zod types) as the source of truth

### Write: Kove Editor → EDL

- User edits (trim, reorder, adjust) serialize back to EDL format
- Feeds into Monet's pipeline for re-rendering or further AI processing
- Existing `openreel-to-edl.ts` handles the translation

### Post-migration

- Remove `packages/openreel-adapter/` from the Monet repo (logic is now in `@kove/core`)
- `@kove/core` depends on `@monet/edl` for schema types

## Reskin

### Scope

CSS variable and Tailwind token changes only. No component logic changes.

### What changes

- `packages/ui/` (shadcn/ui components) — update CSS variables, color tokens, typography
- `tailwind.config.*` — new color palette matching Monet/Kove brand
- `globals.css` or equivalent — CSS custom properties for colors, spacing, fonts
- Editor shell (`apps/kove-advanced/apps/web/`) — branding elements (logo, title, loading screen)

### What stays the same

- All component structure and logic (Radix primitives, Tailwind classes)
- Layout (timeline at bottom, preview center, inspector right, toolbar top)
- All interaction patterns (drag, click, keyboard shortcuts)

### Approach

shadcn/ui components use `class-variance-authority` with theme tokens. Reskin is mostly CSS variable swaps:
1. Create a Monet/Kove brand palette (colors, grays, accents)
2. Update CSS custom properties in base styles
3. Adjust typography (font family, weights, sizes)
4. Tweak spacing/sizing if needed

## Tech Stack (inherited from OpenReel)

- React 18 + TypeScript (strict mode)
- Vite 5
- Zustand (state management)
- shadcn/ui + Radix UI + TailwindCSS 3.4
- MediaBunny (video/audio processing)
- FFmpeg.wasm (encoding/decoding)
- WebGPU with Canvas2D fallback
- GSAP + Framer Motion (animation)
- THREE.js (3D transforms)
- WASM modules (FFT, beat detection via AssemblyScript)

## Success Criteria

1. `apps/kove-advanced/` exists in the repo with all packages renamed to `@kove/*`
2. `pnpm dev` from `apps/kove-advanced/` launches the editor
3. Kove Editor can open an EDL file and display it as a timeline
4. Edits in Kove Editor can be exported back to EDL format
5. UI matches Monet/Kove brand colors and typography
6. All existing OpenReel features work (video editing, audio mixing, effects, export)
