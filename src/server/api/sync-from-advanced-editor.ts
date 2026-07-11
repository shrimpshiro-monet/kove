import type { Env } from "../types/env";
import { apiError, ApiErrorCode } from "../lib/api-response";

/**
 * POST /api/sync-from-advanced-editor
 * DEPRECATED: OpenReel iframe editor has been removed.
 * This endpoint is kept as a stub to avoid breaking server.ts route registration.
 */
export async function handleSyncFromAdvancedEditor(
  _request: Request,
  _env: Env
): Promise<Response> {
  return apiError(
    ApiErrorCode.InternalError,
    "OpenReel sync is deprecated. Use the apps/web editor instead.",
    501
  );
}
