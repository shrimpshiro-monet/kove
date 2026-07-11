/**
 * Media ingestion service.
 * Handles R2 upload, D1 persistence, and local media caching.
 * Used by upload, upload-and-detect, and direct-upload routes.
 */

import type { Env } from "../types/env";
import { generateId, now } from "../types/env";
import { putLocalMedia } from "../lib/local-media-cache";
import { VALID_MEDIA_TYPES, type MediaType } from "../lib/media-types";

export interface IngestFileInput {
  projectId: string;
  type: MediaType;
  file: File;
}

export interface IngestFileResult {
  clipId: string;
  r2Key: string;
}

export interface CompleteUploadInput {
  projectId: string;
  fileId: string;
  type: MediaType;
  filename: string;
  fileSize: number;
  contentType: string;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
  };
}

export interface DirectUploadInput {
  projectId: string;
  type: MediaType;
  file: File;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
  };
}

export interface DirectUploadResult {
  fileId: string;
  r2Key: string;
  filename: string;
  size: number;
}

/**
 * Ingest a file: store to R2, register in D1, cache locally.
 * Returns the clipId and r2Key for further processing.
 */
export async function ingestFile(
  env: Env,
  input: IngestFileInput
): Promise<IngestFileResult> {
  const { projectId, type, file } = input;
  const clipId = `upload-${crypto.randomUUID()}`;
  const r2Key = `${projectId}/${type}/${clipId}/${file.name}`;
  const arrayBuffer = await file.arrayBuffer();

  if (env.MONET_MEDIA) {
    await env.MONET_MEDIA.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });
  }

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO media_items (
        id, project_id, type, r2_key, r2_bucket, filename, file_size, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        clipId,
        projectId,
        type,
        r2Key,
        "MONET_MEDIA",
        file.name,
        file.size,
        file.type,
        Date.now()
      )
      .run();
  }

  putLocalMedia(clipId, {
    data: arrayBuffer,
    mimeType: file.type,
    r2Key,
  });

  return { clipId, r2Key };
}

/**
 * Complete a two-step upload: register in D1 and enqueue proxy generation.
 */
export async function completeUpload(
  env: Env,
  input: CompleteUploadInput
): Promise<void> {
  const { projectId, fileId, type, filename, fileSize, contentType, metadata } = input;
  const r2Key = `${projectId}/${type}/${fileId}/${filename}`;

  if (env.DB) {
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
        null,
        now()
      )
    ]);

    if (env.RENDER_QUEUE) {
      await env.RENDER_QUEUE.send({
        type: "GENERATE_PROXY",
        projectId,
        fileId,
        r2Key,
      });
    }
  }
}

/**
 * Direct upload: store file to R2, register in D1, cache locally.
 * For files under 100MB sent through the Worker.
 */
export async function directUpload(
  env: Env,
  input: DirectUploadInput
): Promise<DirectUploadResult> {
  const { projectId, type, file, metadata } = input;
  const fileId = generateId();
  const r2Key = `${projectId}/${type}/${fileId}/${file.name}`;
  const contentType = file.type || "application/octet-stream";
  const arrayBuffer = await file.arrayBuffer();

  if (env.MONET_MEDIA) {
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
    console.warn("[media-ingestion] Failed to populate local cache", cacheError);
  }

  if (env.DB) {
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
        file.name,
        file.size,
        contentType,
        metadata?.duration ?? 0,
        metadata?.width ?? 0,
        metadata?.height ?? 0,
        metadata?.fps ?? null,
        metadata?.codec ?? null,
        "pending",
        null,
        now()
      )
    ]);

    if (env.RENDER_QUEUE) {
      await env.RENDER_QUEUE.send({
        type: "GENERATE_PROXY",
        projectId,
        fileId,
        r2Key,
      });
    }
  }

  return { fileId, r2Key, filename: file.name, size: file.size };
}
