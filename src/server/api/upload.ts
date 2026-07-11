import { z } from "zod";
import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { isValidMediaType, type MediaType } from "../lib/media-types";
import { generateSignedUploadUrl } from "../services/upload-signing-service";
import { completeUpload, directUpload } from "../services/media-ingestion-service";

const MediaTypeSchema = z.enum(["footage", "music", "reference"]);

const ProbedMetadataSchema = z.object({
  duration: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().min(0).optional(),
  codec: z.string().optional(),
  aspectRatio: z.number().positive().optional(),
  isVertical: z.boolean().optional(),
  rotation: z.number().optional(),
  mimeType: z.string().optional(),
});

const UploadRequestSchema = z.object({
  projectId: z.string().min(1),
  type: MediaTypeSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

const CompleteUploadRequestSchema = z.object({
  projectId: z.string().min(1),
  fileId: z.string().min(1),
  type: MediaTypeSchema,
  filename: z.string().min(1),
  fileSize: z.number().positive(),
  contentType: z.string().min(1),
  metadata: ProbedMetadataSchema,
});

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch (error) {
    console.warn("[upload] Invalid JSON body", { operation: "readJsonBody", error });
    return null;
  }
}

export async function handleUploadRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === null) {
    return apiError(ApiErrorCode.InvalidRequest, "Invalid JSON body", 400);
  }

  try {
    const validation = UploadRequestSchema.safeParse(body);
    if (!validation.success) {
      return apiError(ApiErrorCode.InvalidRequest, "Invalid upload request", 400, validation.error);
    }

    const { projectId, type, filename, contentType } = validation.data;

    if (!isValidMediaType(type, contentType)) {
      return apiError(ApiErrorCode.InvalidMediaType, `Invalid content type ${contentType} for ${type}`, 400);
    }

    const fileId = crypto.randomUUID();
    const r2Key = `${projectId}/${type}/${fileId}/${filename}`;
    const uploadUrl = await generateSignedUploadUrl(env, r2Key, contentType);

    return jsonResponse({ success: true, uploadUrl, fileId });
  } catch (error) {
    console.error("Upload request error:", error);
    return apiError(ApiErrorCode.UploadFailed, error instanceof Error ? error.message : "Unknown error", 500);
  }
}

export async function handleCompleteUpload(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === null) {
    return apiError(ApiErrorCode.InvalidRequest, "Invalid JSON body", 400);
  }

  try {
    const validation = CompleteUploadRequestSchema.safeParse(body);
    if (!validation.success) {
      return apiError(ApiErrorCode.InvalidRequest, "Invalid complete upload request", 400, validation.error);
    }

    const { projectId, fileId, type, filename, fileSize, contentType, metadata } = validation.data;

    await completeUpload(env, {
      projectId,
      fileId,
      type,
      filename,
      fileSize,
      contentType,
      metadata,
    });

    return jsonResponse({ success: true, fileId, metadata });
  } catch (error) {
    console.error("Complete upload error:", error);
    return apiError(ApiErrorCode.UploadFailed, error instanceof Error ? error.message : "Unknown error", 500);
  }
}

export async function handleDirectUpload(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = formData.get("projectId");
    const type = formData.get("type");
    const metadataRaw = formData.get("metadata");

    const fieldsValidation = z
      .object({
        projectId: z.string().min(1),
        type: MediaTypeSchema,
        metadata: ProbedMetadataSchema.optional(),
      })
      .safeParse({
        projectId,
        type,
        metadata: metadataRaw ? JSON.parse(metadataRaw as string) : undefined,
      });

    if (!fieldsValidation.success) {
      return apiError(ApiErrorCode.InvalidRequest, "Missing or invalid parameters (projectId or type)", 400, fieldsValidation.error);
    }

    if (!(file instanceof File)) {
      return apiError(ApiErrorCode.InvalidRequest, "Missing file", 400);
    }

    const { projectId: validatedProjectId, type: validatedType, metadata } = fieldsValidation.data;

    const contentType = file.type || "application/octet-stream";
    if (!isValidMediaType(validatedType, contentType)) {
      return apiError(ApiErrorCode.InvalidMediaType, `Invalid content type ${contentType} for ${validatedType}`, 400);
    }

    if (file.size > 100 * 1024 * 1024) {
      return apiError(ApiErrorCode.FileTooLarge, "File too large for direct upload (max 100 MB). Use two-step upload.", 413);
    }

    const result = await directUpload(env, {
      projectId: validatedProjectId,
      type: validatedType,
      file,
      metadata,
    });

    return jsonResponse({ success: true, ...result, metadata });
  } catch (error) {
    console.error("Direct upload error:", error);
    return apiError(ApiErrorCode.UploadFailed, error instanceof Error ? error.message : "Unknown error", 500);
  }
}
