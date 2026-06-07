import { z } from "zod";
import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { MonetEDLSchema } from "../types/edl";
import { convertOpenReelProjectToMonetEDL } from "../../lib/openreel/openreel-to-edl";

const SyncRequestSchema = z.object({
  projectId: z.string(),
  openReelProject: z.any(), // OpenReel project structure
  originalEdl: MonetEDLSchema.optional(),
  intentId: z.string().optional(),
  analysisId: z.string().optional(),
});

/**
 * POST /api/sync-from-advanced-editor
 * Receives an OpenReel project, converts it back to MonetEDL,
 * and summarizes changes for Gemini.
 */
export async function handleSyncFromAdvancedEditor(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return apiError(ApiErrorCode.MethodNotAllowed, "Method not allowed", 405);
  }

  try {
    const body = await request.json();
    const validation = SyncRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiError(ApiErrorCode.InvalidRequest, "Invalid sync request", 400, validation.error);
    }

    const { projectId, openReelProject, originalEdl, intentId, analysisId } = validation.data;

    // 1. Convert OpenReel -> MonetEDL
    const { edl, changes } = convertOpenReelProjectToMonetEDL(openReelProject, originalEdl);

    // 2. Persist to DB if available
    let edlId = `edl-sync-${Date.now()}`;
    if (env.DB) {
      try {
        await env.DB.prepare(
          "INSERT INTO edls (id, project_id, content, intent_id, analysis_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
          .bind(
            edlId,
            projectId,
            JSON.stringify(edl),
            intentId || null,
            analysisId || null,
            Date.now()
          )
          .run();
      } catch (dbError) {
        console.error("[sync] Failed to persist synced EDL", dbError);
      }
    }

    return jsonResponse({
      success: true,
      edlId,
      edl,
      changes,
    });

  } catch (error) {
    console.error("[sync-from-advanced-editor] Sync failed", error);
    return apiError(ApiErrorCode.InternalError, "Sync failed", 500, error);
  }
}
