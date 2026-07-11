import { z } from "zod";
import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { VALID_MEDIA_TYPES, type MediaType } from "../lib/media-types";
import { ingestFile } from "../services/media-ingestion-service";
import { detectBeats } from "../services/audio-analysis-service";

const UploadAndDetectSchema = z.object({
  projectId: z.string().min(1).default("default-project"),
  type: z.enum(["footage", "music", "reference"]).default("footage"),
});

export async function handleUploadAndDetect(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return apiError(ApiErrorCode.MethodNotAllowed, "Method not allowed", 405);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return apiError(ApiErrorCode.InvalidRequest, "No file provided", 400);
    }

    const parsed = UploadAndDetectSchema.safeParse({
      projectId: formData.get("projectId"),
      type: formData.get("type"),
    });

    if (!parsed.success) {
      return apiError(
        ApiErrorCode.ValidationFailed,
        `Invalid request: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const { projectId, type } = parsed.data;

    if (!VALID_MEDIA_TYPES[type]?.includes(file.type)) {
      return apiError(
        ApiErrorCode.InvalidMediaType,
        `Invalid file type "${file.type}" for ${type}. Allowed: ${VALID_MEDIA_TYPES[type]?.join(", ")}`,
        400
      );
    }

    if (file.size === 0) {
      return apiError(ApiErrorCode.InvalidRequest, "File is empty", 400);
    }

    if (file.size > 500 * 1024 * 1024) {
      return apiError(ApiErrorCode.FileTooLarge, "File exceeds 500MB limit", 400);
    }

    const { clipId } = await ingestFile(env, { projectId, type, file });
    const beats = await detectBeats(env, clipId);

    return jsonResponse({
      success: true,
      clipId,
      filename: file.name,
      beats,
    });
  } catch (error) {
    console.error("[upload-and-detect] Upload failed", error);
    return apiError(ApiErrorCode.InternalError, "Upload and detection failed", 500, error);
  }
}
