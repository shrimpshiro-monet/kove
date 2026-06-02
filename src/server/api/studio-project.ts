import { z } from "zod";
import type { Env } from "../types/env";
import type { MonetEDL } from "../types/edl";
import { getLocalStudioSnapshot, putLocalStudioSnapshot } from "../lib/local-studio-cache";

const RequestSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
  })
  .refine((v) => !!v.projectId || !!v.threadId, {
    message: "projectId or threadId is required",
  });

interface TableInfoRow {
  name: string;
}

export interface StudioProjectResult {
  success: boolean;
  projectId?: string;
  edlId?: string;
  projectName?: string;
  edl?: MonetEDL;
  source?: "db";
  error?: string;
}

const PersistSchema = z.object({
  projectId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  edlId: z.string().min(1).optional(),
  edl: z.unknown(),
});

export async function handlePersistStudioProject(request: Request, env: Env | undefined): Promise<Response> {
  let body: z.infer<typeof PersistSchema>;

  try {
    const raw = await request.json();
    const parsed = PersistSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid project snapshot",
            details: parsed.error.flatten(),
          },
        },
        400
      );
    }
    body = parsed.data;
  } catch {
    return jsonResponse({ error: { code: "INVALID_JSON", message: "Invalid JSON" } }, 400);
  }

  const edlJson = JSON.stringify(body.edl);

  if (env?.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO projects (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at`
      )
        .bind(body.projectId, body.projectName ?? "Untitled project", Date.now(), Date.now())
        .run();

      const tableInfo = await env.DB.prepare("PRAGMA table_info(edls)").all<TableInfoRow>();
      const cols = new Set((tableInfo.results || []).map((r) => r.name));
      const isLegacy = cols.has("edl_data");
      const edlRowId = body.edlId ?? crypto.randomUUID();

      if (isLegacy) {
        await env.DB.prepare(
          `INSERT INTO edls (id, project_id, intent_id, analysis_id, version, edl_data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_id = excluded.project_id,
             version = excluded.version,
             edl_data = excluded.edl_data`
        )
          .bind(edlRowId, body.projectId, edlRowId, null, "1.0.0", edlJson, Date.now())
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO edls (id, project_id, version, data, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_id = excluded.project_id,
             version = excluded.version,
             data = excluded.data`
        )
          .bind(edlRowId, body.projectId, 1, edlJson, Date.now())
          .run();
      }

      return jsonResponse({ success: true, source: "db" });
    } catch (error) {
      console.warn("Studio DB persistence failed, falling back to local cache:", error);
    }
  }

  putLocalStudioSnapshot({
    projectId: body.projectId,
    threadId: body.threadId,
    projectName: body.projectName,
    edlId: body.edlId,
    edlJson,
    updatedAt: Date.now(),
  });

  return jsonResponse({ success: true, source: "local" });
}

export async function handleGetStudioProject(request: Request, env: Env | undefined): Promise<Response> {
  const url = new URL(request.url);

  const parsed = RequestSchema.safeParse({
    projectId: url.searchParams.get("projectId") ?? undefined,
    threadId: url.searchParams.get("threadId") ?? undefined,
  });

  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid query params",
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const candidateIds = Array.from(
    new Set([parsed.data.projectId, parsed.data.threadId].filter((v): v is string => !!v))
  );

  if (!env?.DB) {
    for (const id of candidateIds) {
      const snapshot = getLocalStudioSnapshot(id);
      if (!snapshot) continue;

      try {
        const parsedEdl = JSON.parse(snapshot.edlJson) as MonetEDL;
        return jsonResponse({
          success: true,
          projectId: snapshot.projectId,
          edlId: snapshot.edlId,
          projectName: snapshot.projectName,
          edl: parsedEdl,
          source: "db",
        } satisfies StudioProjectResult);
      } catch {
        continue;
      }
    }

    return jsonResponse(
      {
        error: {
          code: "DB_UNAVAILABLE",
          message: "Database binding is not available in this environment",
        },
      },
      503
    );
  }

  for (const id of candidateIds) {
    const latest = await getLatestEdlForProject(env.DB, id);
    if (!latest) continue;

    let parsedEdl: MonetEDL;
    try {
      parsedEdl = JSON.parse(latest.edlJson) as MonetEDL;
    } catch {
      continue;
    }

    const projectName = await getProjectName(env.DB, latest.projectId);

    return jsonResponse({
      success: true,
      projectId: latest.projectId,
      edlId: latest.edlId,
      projectName,
      edl: parsedEdl,
      source: "db",
    } satisfies StudioProjectResult);
  }

  return jsonResponse(
    {
      error: {
        code: "NOT_FOUND",
        message: "No timeline found for this project/thread",
      },
    },
    404
  );
}

async function getLatestEdlForProject(
  db: D1Database,
  projectId: string
): Promise<{ edlId: string; projectId: string; edlJson: string } | null> {
  const tableInfo = await db.prepare("PRAGMA table_info(edls)").all<TableInfoRow>();
  const cols = new Set((tableInfo.results || []).map((r) => r.name));

  const isLegacy = cols.has("edl_data");

  if (isLegacy) {
    const row = await db
      .prepare(
        `SELECT id, project_id, edl_data
         FROM edls
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .bind(projectId)
      .first<{ id: string; project_id: string; edl_data: string }>();

    if (!row) return null;
    return { edlId: row.id, projectId: row.project_id, edlJson: row.edl_data };
  }

  const row = await db
    .prepare(
      `SELECT id, project_id, data
       FROM edls
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(projectId)
    .first<{ id: string; project_id: string; data: string }>();

  if (!row) return null;
  return { edlId: row.id, projectId: row.project_id, edlJson: row.data };
}

async function getProjectName(db: D1Database, projectId: string): Promise<string | undefined> {
  const row = await db
    .prepare("SELECT name FROM projects WHERE id = ?")
    .bind(projectId)
    .first<{ name: string }>();
  return row?.name;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
