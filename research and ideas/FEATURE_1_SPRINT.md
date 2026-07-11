# Kove Feature #1 — Reference-Driven Cut Generation with Bidirectional EDL Round-Trip

## Overview

Ship real bidirectional EDL round-trip so refinement never loses user's manual edits. 4 phases, each in a separate session. Verify acceptance criteria before starting the next.

## Context

Kove is an AI-directed video editor. Users upload footage + reference video, Kove analyzes the reference's editing grammar, generates an editable EDL, and hydrates it into an OpenReel-based NLE. Users can manually edit in the NLE OR ask Kove Director (chat) to refine sections. Both paths must round-trip without data loss.

Current state:
- Backend: monet_pipeline.py works end-to-end, Nemotron fires, editly renders MP4
- Forward adapter (MonetEDL → OpenReel): production-ready in packages/openreel-adapter/src/edl-to-openreel.ts
- Reverse adapter (OpenReel → MonetEDL): fake bidirectional stub in apps/web/src/stores/edl-adapter.ts — drops audio, keyframes, transitions, audio effects. Untyped. Untrusted.
- @openreel/core package is a phantom workspace dependency — referenced but does not exist.

## Phases

### Phase 0 — Schema Audit & Type Definition (Day 1 morning)

**Goal:** Define the OpenReel Project type ourselves since @openreel/core doesn't exist.

**Steps:**
1. Search the repo for every read/write of OpenReel project data. List every file path.
2. Grep every field name used from an OpenReel project object. Build an inventory.
3. Read packages/edl/src/schemas.ts and packages/edl/src/monet-edl.ts fully. Understand the MonetEDL shape.
4. Read packages/openreel-adapter/src/edl-to-openreel.ts fully. Understand every field the forward adapter writes into OpenReel.
5. Read the existing hydrateFromOpenReelProject in apps/web/src/stores/edl-adapter.ts. Note every field it reads.
6. Read any OpenReel timeline component code in apps/web/src/components/editor/ to see what shape the timeline actually manipulates at runtime.

**Deliverable:**
- Create packages/openreel-adapter/src/openreel-types.ts
- Export TypeScript types describing the actual OpenReel Project shape as observed in the codebase
- Every type must reflect what actually exists in the current codebase — not a wishlist
- Add JSDoc comments explaining any field with ambiguous meaning
- Fix the phantom @openreel/core reference in package.json

**Acceptance criteria:**
- packages/openreel-adapter/src/openreel-types.ts exists and exports the full type surface
- Zero `any` types
- A comment at the top of the file lists every file where OpenReel data is currently read or written
- No new package dependencies added
- Fix the phantom @openreel/core reference in package.json

---

### Phase 1 — Write the Real Reverse Adapter (Day 1 afternoon → Day 2)

**Goal:** Replace the fake reverse adapter with a real, tested, lossless one.

**Steps:**
1. Create packages/openreel-adapter/src/openreel-to-edl.ts
2. Export function openReelProjectToMonetEDL(project: OpenReelProject): MonetEDL
3. Implement full mapping: every track type, every clip's effects/transitions/keyframes, speed changes, color grades, media references, metadata preservation
4. Implement round-trip safety
5. Add debug helper: openReelProjectToMonetEDL(project, { debug: true }) logs any field it couldn't map
6. Create round-trip test suite

**Acceptance criteria:**
- packages/openreel-adapter/src/openreel-to-edl.ts implemented with zero `any`
- All round-trip tests pass
- Debug mode logs zero dropped fields on production EDL fixtures
- Manual edits (trim, split, effect add, keyframe add, audio track add) survive round-trip

---

### Phase 2 — Wire Round-Trip Into the App + Refinement Endpoint (Day 2 → Day 3)

**Goal:** Replace fake adapter usage with real one, add refinement API, wire refinement to preserve user's manual edits.

**Steps:**
1. Replace hydrateFromOpenReelProject with real adapter import
2. Build POST /api/vibe-refine endpoint
3. Create scripts/monet_refine.py
4. Wire frontend refinement flow

**Acceptance criteria:**
- Old fake hydrateFromOpenReelProject removed
- All hydration paths use new bidirectional adapter
- POST /api/vibe-refine works with curl test
- Manual edits survive refinement
- timelineDirty flag flips correctly

---

### Phase 3 — Restyle OpenReel to Kove Design Language (Day 3 → Day 4)

**Goal:** Make the OpenReel-derived NLE feel like Kove, not like OpenReel.

**Design tokens:**
- Concrete Black: #0D0D0D
- Wet Asphalt: #121212
- Studio Grey: #1E1E1E
- Chain Link: #3A3A3A
- Newsprint: #6B6B6B
- Torn Paper: #A0A0A0
- Kove Orange: #FF4E00
- Fonts: Grotesk (UI), JetBrains Mono (values/timecodes)

**Acceptance criteria:**
- Zero visible OpenReel branding
- Every clip, panel, control uses Kove design tokens
- Timeline looks calm, dark, functional
- Existing OpenReel functionality unbroken

---

### Phase 4 — Ship the Alpha Loop (Day 4 → Day 5)

**Goal:** End-to-end user flow from empty project → generated cut → manual edit → chat refinement → export.

**Steps:**
1. Build MonetGeneratePanel (Kove-branded upload + generation)
2. Build progress pipeline UI (terminal-style typing animation)
3. Wire timeline hydration
4. Build Kove Director chat panel
5. Implement Director/Studio mode switching
6. Wire export
7. Cleanup dead code

**Acceptance criteria (end-to-end demo):**
1. Open Kove in browser
2. Upload footage + reference
3. Generate first cut (progress pipeline types out)
4. Timeline hydrates, preview auto-plays
5. Switch to Studio, manually edit clip
6. Switch to Director, type refinement
7. Switch back to Studio — manual edits survive
8. Export MP4
9. No console errors or silent data loss

---

## Hard Rules Across All Phases

- Every phase must be verified before starting the next
- If any acceptance criterion fails, fix before moving on
- No `any` types anywhere in new code
- No silent data loss in round-trip
- Preserve existing OpenReel functionality
- Do not modify: monet_pipeline.py, analyzers, edl schemas core types, render.js
- No heavy new dependencies without justification

## Timeline

- Session 1 — Phase 0 (2-3 hours)
- Session 2 — Phase 1 (4-6 hours)
- Session 3 — Phase 2 (5-7 hours)
- Session 4 — Phase 3 (6-8 hours)
- Session 5 — Phase 4 (5-7 hours)

**Total:** 22-31 focused hours across 5 sessions.
