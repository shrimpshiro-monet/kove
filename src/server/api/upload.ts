// POST /api/upload - Upload media files to R2 and register them
// This version is optimized for Cloudflare Workers: 
// - No local filesystem usage (node:fs)
// - No subprocess spawning (ffmpeg)
// - Metadata is provided by the client after client-side probing

import { z } from "zod";
import type { Env } from "../types/env";
import { generateId, now } from "../types/env";
import { putLocalMedia } from "../lib/local-media-cache";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

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
    console.warn("[upload] Invalid JSON body", {
      operation: "readJsonBody",
      error,
    });
    return null;
  }
}

/**
 * Generate a signed upload URL for direct client → R2 upload
 * Note: In production, this should use real AWS SigV4 signing.
 */
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
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid upload request",
        400,
        validation.error
      );
    }

    const { projectId, type, filename, contentType } = validation.data;

    if (!isValidMediaType(type, contentType)) {
      return apiError(
        ApiErrorCode.InvalidMediaType,
        `Invalid content type ${contentType} for ${type}`,
        400
      );
    }

    const fileId = generateId();
    const r2Key = `${projectId}/${type}/${fileId}/${filename}`;
    
    // In dev we return a direct R2 URL (assumes public or local R2 dev)
    // In prod, use real signing logic
    const uploadUrl = await generateSignedUploadUrl(env, r2Key, contentType);

    return jsonResponse({
      success: true,
      uploadUrl,
      fileId,
    });
  } catch (error) {
    console.error("Upload request error:", error);
    return apiError(
      ApiErrorCode.UploadFailed,
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
}

/**
 * Complete the upload after client has uploaded to R2
 */
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
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid complete upload request",
        400,
        validation.error
      );
    }

    const { projectId, fileId, type, filename, fileSize, contentType, metadata } =
      validation.data;

    const r2Key = `${projectId}/${type}/${fileId}/${filename}`;

    // Ensure the project and media_item exist in a single transaction (batch)
    if (env.DB) {
      console.log("[upload/complete] Running batch insert for project + media item:", {
        projectId,
        fileId,
      });

      try {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO projects (id, name, created_at, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`
          ).bind(projectId, "Untitled Project", now(), now()),
          env.DB.prepare(
            `INSERT INTO media_items (
              id, project_id, type, r2_key, r2_bucket, filename, file_size, mime_type,
              duration, width, height, fps, codec, gemini_upload_status, proxy_r2_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            fileId,
            projectId,
            type,
            r2Key,
            "MONET_MEDIA",
            filename,
            fileSize,
            contentType,
            metadata?.duration ?? 0,
            metadata?.width ?? 0,
            metadata?.height ?? 0,
            metadata?.fps ?? null,
            metadata?.codec ?? null,
            "pending",
            null, // Proxy generated asynchronously
            now()
          )
        ]);

        // Enqueue proxy generation job
        if (env.RENDER_QUEUE) {
          await env.RENDER_QUEUE.send({
            type: "GENERATE_PROXY",
            projectId,
            fileId,
            r2Key,
          });
          console.log("[upload/complete] Enqueued proxy generation job", { fileId });
        }
      } catch (batchError) {
        console.error("[upload/complete] Batch insert failed:", batchError);
        return apiError(
          ApiErrorCode.DatabaseInsertFailed,
          batchError instanceof Error ? batchError.message : "Database insert failed",
          500
        );
      }
    }

    return jsonResponse({
      success: true,
      fileId,
      metadata,
    });
  } catch (error) {
    console.error("Complete upload error:", error);
    return apiError(
      ApiErrorCode.UploadFailed,
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
}

// Helper: Validate media type matches content type
function isValidMediaType(type: string, contentType: string): boolean {
  const validTypes: Record<string, string[]> = {
    footage: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
    music: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"],
    reference: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
  };

  return validTypes[type]?.includes(contentType) ?? false;
}

// Helper: Generate signed upload URL for R2
async function generateSignedUploadUrl(
  _env: Env,
  key: string,
  _contentType: string
): Promise<string> {
  // TODO: Implement real SigV4 signing using aws4fetch or similar
  return `https://monet-media-dev.r2.cloudflarestorage.com/${key}`;
}

/**
 * Direct upload: client sends file as FormData, we put it into R2 and register it.
 * Note: This puts file bytes through the Worker memory. Recommending two-step upload for production.
 */
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
        metadata: metadataRaw ? JSON.parse(metadataRaw as string) : undefined 
      });

    if (!fieldsValidation.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Missing or invalid parameters (projectId or type)",
        400,
        fieldsValidation.error
      );
    }

    if (!(file instanceof File)) {
      return apiError(ApiErrorCode.InvalidRequest, "Missing file", 400);
    }

    const { projectId: validatedProjectId, type: validatedType, metadata } =
      fieldsValidation.data;

    const contentType = file.type || "application/octet-stream";
    if (!isValidMediaType(validatedType, contentType)) {
      return apiError(
        ApiErrorCode.InvalidMediaType,
        `Invalid content type ${contentType} for ${validatedType}`,
        400
      );
    }

    if (file.size > 100 * 1024 * 1024) {
      return apiError(
        ApiErrorCode.FileTooLarge,
        "File too large for direct upload (max 100 MB). Use two-step upload.",
        413
      );
    }

    const fileId = generateId();
    const r2Key = `${validatedProjectId}/${validatedType}/${fileId}/${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    if (env?.MONET_MEDIA) {
      await env.MONET_MEDIA.put(r2Key, arrayBuffer, {
        httpMetadata: { contentType },
      });
    }

    try {
      putLocalMedia(fileId, {
        data: arrayBuffer,
        mimeType: contentType,
        r2Key,
      });
    } catch (cacheError) {
      console.warn("[upload/direct] Failed to populate local cache", cacheError);
    }

    if (env?.DB) {
      console.log("[upload/direct] Running batch insert for project + media item:", {
        validatedProjectId,
        fileId,
      });

      try {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO projects (id, name, created_at, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`
          ).bind(validatedProjectId, "Untitled Project", now(), now()),
          env.DB.prepare(
            `INSERT INTO media_items (
              id, project_id, type, r2_key, r2_bucket, filename, file_size, mime_type,
              duration, width, height, fps, codec, gemini_upload_status, proxy_r2_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            fileId,
            validatedProjectId,
            validatedType,
            r2Key,
            "MONET_MEDIA",
            file.name,
            file.size,
            contentType,
            metadata?.duration ?? 0,
            metadata?.width ?? 0,
            metadata?.height ?? 0,
            metadata?.fps ?? null,
            metadata?.codec ?? null,
            "pending",
            null, // Proxy generated asynchronously
            now()
          )
        ]);

        // Enqueue proxy generation job
        if (env.RENDER_QUEUE) {
          await env.RENDER_QUEUE.send({
            type: "GENERATE_PROXY",
            projectId: validatedProjectId,
            fileId,
            r2Key,
          });
        }
      } catch (batchError) {
        console.error("[upload/direct] Batch insert failed:", batchError);
        return apiError(
          ApiErrorCode.DatabaseInsertFailed,
          batchError instanceof Error ? batchError.message : "Database insert failed",
          500
        );
      }
    }

    return jsonResponse({
      success: true,
      fileId,
      r2Key,
      filename: file.name,
      size: file.size,
      metadata,
    });
  } catch (error) {
    console.error("Direct upload error:", error);
    return apiError(
      ApiErrorCode.UploadFailed,
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
}
