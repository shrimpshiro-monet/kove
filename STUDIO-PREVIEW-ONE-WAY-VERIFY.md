# STUDIO-PREVIEW-ONE-WAY-VERIFY.md

**Phase 6 verification**
**Date:** 2026-07-07

## What Changed
- `apps/web/src/components/editor/AdvancedEditor.tsx` renamed label from "Studio" to "Studio Preview"
- Added yellow warning banner: "Studio manual edits are not yet synced back to Kove. Use Kove AI controls to make persistent changes."
- Component already reads EDL from Zustand via `useEDL()` and sends to OpenReel via `postMessage`
- Component re-sends EDL when Zustand state changes (via useEffect on `edl`)

## Files Changed
- `apps/web/src/components/editor/AdvancedEditor.tsx`

## Flow Tested
- TypeScript compilation: PASS (no errors)
- EDL flows: Zustand → `useEDL()` → `postMessage({ type: "kove:load-edl", edl })` → OpenReel iframe ✅
- Re-send on EDL change: useEffect watches `edl` dependency ✅
- Manual edit warning: Yellow banner visible at bottom of Studio Preview ✅

## Pass/Fail
**PASS** — Studio Preview is one-way consumer of Zustand ProjectContext

## Known Warnings
- OpenReel iframe URL (`VITE_OPENREEL_URL`) must be configured for Studio Preview to load
- If OpenReel is not running, iframe will show connection error — acceptable for now
- No EDL → OpenReel project conversion in this component (uses direct EDL postMessage)
