---
description: "Use when working on Studio route hydration, direct /studio/{id} links, project/thread mapping, or debugging blank Studio loads. Applies to Studio route files, storage mapping, and server lookup endpoints."
applyTo: "src/routes/studio.tsx,src/routes/studio_.$projectId.tsx,src/server/api/studio-project.ts,src/lib/api-client.ts,src/lib/storage.ts"
---

# Studio Link Portability Rules

## Goal
Direct Studio URLs must load a timeline consistently across browser sessions and origins when server data exists.

## Required Loading Order
1. Route param lookup (project/thread local mapping)
2. Local persisted timeline state
3. Server-backed timeline lookup (`/api/studio-project`)
4. Actionable diagnostics UI if unresolved

Never stop at step 2 without trying step 3.

## Non-Negotiables
- Do not rely on localStorage alone for Studio deep links.
- Keep route hooks unconditional; do not early-return before hooks.
- Expose clear failure reasons in UI (missing local timeline, DB unavailable, unresolved media IDs).
- Ignore `AbortError` noise from effect cleanup in diagnostics and logs.

## API Contract Requirements
- Endpoint must validate input with Zod.
- Return typed error shape with explicit status codes (`400`, `404`, `503`, `500`).
- Support both `projectId` and `threadId` lookup candidates where practical.
- Handle legacy/new EDL table schema (`edl_data` vs `data`) safely.

## Testing Checklist
- `/studio?threadId=...` opens expected timeline.
- `/studio/{id}` works from fresh session when backend bindings are present.
- Missing binding mode shows diagnostics banner (not empty editor).
- Media IDs resolve through canonical and alias keys (`id`, `r2FileId`, `dev-{name}`).

## Link, Don’t Duplicate
- Project mission and quality bar: [copilot instructions](../copilot-instructions.md)
- Backend API conventions: [backend instructions](./backend.instructions.md)
- Renderer constraints: [renderer instructions](./renderer.instructions.md)
