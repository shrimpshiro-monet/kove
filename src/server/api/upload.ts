// POST /api/upload - Upload media files to R2 and extract metadata

import type { Env } from "../types/env";
import { generateId, now } from "../types/env";
import { putLocalMedia } from "../lib/local-media-cache";

interface UploadRequest {
  projectId: string;
  type: "footage" | "music" | "reference";
  filename: string;
  contentType: string;
}

interface UploadResponse {
  success: boolean;
  uploadUrl?: string;
  fileId?: string;
  error?: string;
}

interface CompleteUploadRequest {
  projectId: string;
  fileId: string;
  type: "footage" | "music" | "reference";
  filename: string;
  fileSize: number;
  contentType: string;
}

interface CompleteUploadResponse {
  success: boolean;
  fileId?: string;
  metadata?: MediaMetadata;
  error?: string;
}

interface MediaMetadata {
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

/**
 * Generate a signed upload URL for direct client → R2 upload
 *
 * Flow:
 * 1. Client requests upload URL
 * 2. Server generates signed URL with R2 key
 * 3. Client uploads directly to R2
 * 4. Client calls /api/upload/complete with fileId
 * 5. Server extracts metadata and stores in DB
 */
export async function handleUploadRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: UploadRequest = await request.json();

    // Validate input
    if (!body.projectId || !body.type || !body.filename || !body.contentType) {
      return jsonResponse({ success: false, error: "Missing required fields" }, 400);
    }

    // Validate file type
    if (!isValidMediaType(body.type, body.contentType)) {
      return jsonResponse(
        { success: false, error: `Invalid content type ${body.contentType} for ${body.type}` },
        400
      );
    }

    // Generate file ID and R2 key
    const fileId = generateId();
    const r2Key = `${body.projectId}/${body.type}/${fileId}/${body.filename}`;

    // Generate signed upload URL (valid for 1 hour)
    const uploadUrl = await generateSignedUploadUrl(env.MONET_MEDIA, r2Key);

    return jsonResponse({
      success: true,
      uploadUrl,
      fileId,
    });
  } catch (error) {
    console.error("Upload request error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
}

/**
 * Complete the upload after client has uploaded to R2
 * Extract metadata and store in database
 */
export async function handleCompleteUpload(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: CompleteUploadRequest = await request.json();

    // Validate input
    if (!body.projectId || !body.fileId || !body.type || !body.filename) {
      return jsonResponse({ success: false, error: "Missing required fields" }, 400);
    }

    // Construct R2 key
    const r2Key = `${body.projectId}/${body.type}/${body.fileId}/${body.filename}`;

    // Verify file exists in R2
    const r2Object = await env.MONET_MEDIA.get(r2Key);
    if (!r2Object) {
      return jsonResponse({ success: false, error: "File not found in storage" }, 404);
    }

    // Extract metadata (basic for MVP - full extraction in Phase 2)
    const metadata = await extractBasicMetadata(r2Object, body.contentType);

    // Store in database
    const insertResult = await env.DB.prepare(
      `INSERT INTO media_items (
        id, project_id, type, r2_key, r2_bucket, filename, file_size, mime_type,
        duration, width, height, fps, codec, gemini_upload_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.fileId,
        body.projectId,
        body.type,
        r2Key,
        "MONET_MEDIA",
        body.filename,
        body.fileSize,
        body.contentType,
        metadata.duration || null,
        metadata.width || null,
        metadata.height || null,
        metadata.fps || null,
        metadata.codec || null,
        "pending",
        now()
      )
      .run();

    if (!insertResult.success) {
      return jsonResponse({ success: false, error: "Database insert failed" }, 500);
    }

    return jsonResponse({
      success: true,
      fileId: body.fileId,
      metadata,
    });
  } catch (error) {
    console.error("Complete upload error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
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
async function generateSignedUploadUrl(_bucket: R2Bucket, key: string): Promise<string> {
  // Placeholder - direct upload is preferred for MVP
  return `https://monet-media-dev.r2.cloudflarestorage.com/${key}`;
}

/**
 * Direct upload: client sends file as FormData, we put it into R2 and register it.
 * Simpler than presigned URLs for MVP — no CORS setup required.
 *
 * POST /api/upload/direct
 * FormData fields:
 *   file       - the binary file
 *   projectId  - project ID
 *   type       - "footage" | "music" | "reference"
 */
export async function handleDirectUpload(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;
    const type = formData.get("type") as string | null;

    if (!file || !projectId || !type) {
      return jsonResponse(
        { success: false, error: "Missing file, projectId, or type" },
        400
      );
    }

    if (!["footage", "music", "reference"].includes(type)) {
      return jsonResponse({ success: false, error: "Invalid type" }, 400);
    }

    const contentType = file.type || "application/octet-stream";
    if (!isValidMediaType(type, contentType)) {
      return jsonResponse(
        { success: false, error: `Invalid content type ${contentType} for ${type}` },
        400
      );
    }

    // Max 500 MB safety guard
    if (file.size > 500 * 1024 * 1024) {
      return jsonResponse({ success: false, error: "File too large (max 500 MB)" }, 413);
    }

    const fileId = generateId();
    const r2Key = `${projectId}/${type}/${fileId}/${file.name}`;

    // Stream file into R2
    const arrayBuffer = await file.arrayBuffer();

    if (env?.MONET_MEDIA) {
      await env.MONET_MEDIA.put(r2Key, arrayBuffer, {
        httpMetadata: { contentType },
      });
    } else {
      console.warn("No R2 bucket bound — skipping R2 write (dev mode)");
    }

    // Store in D1
    if (env?.DB) {
      await env.DB.prepare(
        `INSERT INTO media_items (
          id, project_id, type, r2_key, r2_bucket, filename, file_size, mime_type,
          gemini_upload_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          fileId,
          projectId,
          type,
          r2Key,
          "MONET_MEDIA",
          file.name,
          file.size,
          contentType,
          "pending",
          Date.now()
        )
        .run();
    } else {
      console.warn("No D1 DB bound — skipping metadata write (dev mode)");
    }

    // Dev resiliency: keep a process-local copy when bindings are unavailable,
    // so /api/media/{fileId} still works across chat and advanced studio.
    if (!env?.MONET_MEDIA || !env?.DB) {
      putLocalMedia(fileId, {
        data: arrayBuffer,
        mimeType: contentType,
        r2Key,
      });
    }

    return jsonResponse({
      success: true,
      fileId,
      r2Key,
      filename: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Direct upload error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
}

// Helper: Extract basic metadata from file
async function extractBasicMetadata(
  r2Object: R2ObjectBody,
  contentType: string
): Promise<MediaMetadata> {
  // For MVP, we'll extract very basic info
  // Full metadata extraction (duration, resolution, codec) happens in Phase 2 with Gemini

  const metadata: MediaMetadata = {};

  // For video files, we could use a library like mp4box.js or similar
  // For MVP, we'll rely on Gemini to extract this during analysis phase

  // Placeholder for future implementation
  if (contentType.startsWith("video/")) {
    // TODO: Extract video metadata
    // For now, client can optionally provide these during upload
  }

  if (contentType.startsWith("audio/")) {
    // TODO: Extract audio metadata
  }

  return metadata;
}

// Helper: JSON response
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // TODO: Restrict in production
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
