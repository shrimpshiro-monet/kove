---
description: "Use when building or modifying API endpoints, adding Cloudflare Worker routes, working with D1/R2/KV storage, handling file uploads, or debugging backend errors. Covers Zod validation requirements, R2 key conventions, D1 schema rules, error response shapes, and Cloudflare Workers constraints. Load when editing src/server/api/*.ts, src/server.ts, src/server/services/*.ts, or src/server/migrations/*.sql."
applyTo: "src/server/**,src/lib/api-client.ts,wrangler.jsonc"
---

# Backend — API & Cloudflare Workers

## Endpoint Contract (Required on Every Endpoint)

```typescript
// Every endpoint must have:
// 1. Zod request schema — validated FIRST, before any logic
// 2. TypeScript response interface — exported for api-client.ts
// 3. Standardized error shape: { error: { code, message, details? } }
// 4. Explicit HTTP status on every response path

const Schema = z.object({ projectId: z.string().uuid(), ... });
const body = await req.json();
const parsed = Schema.safeParse(body);
if (!parsed.success) {
  return Response.json(
    { error: { code: "INVALID_REQUEST", message: "...", details: parsed.error } },
    { status: 400 }
  );
}
```

## API Client Rule

**No raw `fetch` in UI components.** All API calls go through [api-client.ts](../../src/lib/api-client.ts).

```typescript
// ✅ Correct
import { refineEDL } from "@/lib/api-client";
const result = await refineEDL(projectId, edlId, edl, feedback);

// ❌ Wrong
const result = await fetch("/api/refine-edl", { method: "POST", ... });
```

Every new endpoint needs a corresponding typed function in api-client.ts.

## Cloudflare Workers Constraints

| Constraint | Rule |
|---|---|
| No filesystem | All media → R2. Metadata → D1. Ephemeral → KV. |
| Memory | Never buffer video in Worker memory. Use R2 multipart for files > a few MB. |
| CPU limit | 30s default. Gemini calls are async — never block sync handlers. |
| Native modules | Not supported. No FFmpeg, sharp, etc. in Workers. |
| Request body | Max 100MB in Workers. Footage uses FormData → R2 multipart. |

## R2 Key Naming Convention

```
footage/{projectId}/{fileId}.{ext}
music/{projectId}/{fileId}.{ext}
reference/{projectId}/{fileId}.{ext}
renders/{projectId}/{edlId}/{jobId}.mp4
thumbnails/{projectId}/{fileId}/{timestamp}.jpg
```

Keys are immutable. Never modify an R2 key stored in D1 — create a new key and new record.

## Bindings ([wrangler.jsonc](../../wrangler.jsonc))

| Binding | Type | Purpose |
|---|---|---|
| `MONET_MEDIA` | R2 | Video/audio/reference uploads |
| `MONET_RENDERS` | R2 | Exported MP4 outputs |
| `DB` | D1 | Projects, intents, analyses, EDLs, transcripts |
| `MONET_KV` | KV | Transcript cache (24h TTL), job status |
| `GEMINI_API_KEY` | Var | Gemini auth (in .dev.vars for local dev) |

## D1 Rules

```sql
-- ✅ Parameterized queries only
db.prepare("SELECT * FROM edls WHERE project_id = ?").bind(projectId).first()

-- ❌ Never interpolate
db.prepare(`SELECT * FROM edls WHERE project_id = '${projectId}'`)
```

- Multi-table writes → wrap in D1 transactions
- Never store binary in D1 — that's what R2 is for
- Always index on `project_id`, `edl_id` foreign keys
- Validate EDL JSON with Zod before `INSERT INTO edls`

## Migration Conventions ([src/server/migrations/](../../src/server/migrations/))

- Numbered: `NNN_description.sql`
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`
- Append-only: never modify a migration that has been run

## Caching Strategy

| Cache | Key | TTL | Purpose |
|---|---|---|---|
| Intent Cache (memory) | User prompt text | session | ~60% cost reduction on identical prompts |
| Analysis Cache (memory) | Media IDs combined | session | Refinements reuse analysis, never re-run |
| Transcript Cache (KV) | `transcript:{mediaId}` | 24h | Word-level timestamps are expensive |

The refinement loop **must** use cached analysis. Re-running analysis on refinement is a bug.

## Error Handling

```typescript
// Result<T,E> pattern for async operations
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Never swallow errors
try { ... } catch (e) {
  logger.error("Operation failed", { operation: "generateEDL", input: params, error: e });
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Generation failed" } }, { status: 500 });
}

// Retryable Gemini errors: 429, 503, 504
// Non-retryable: 400, 403, content filter
```

Never expose stack traces or raw Gemini errors to the UI.
