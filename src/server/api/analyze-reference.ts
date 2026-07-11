import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { analyzeReference } from "../services/reference-analysis-service";
import { getLocalMediaPath } from "../lib/local-media-cache";

export async function handleAnalyzeReference(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      referenceFileId: string;
    };

    const { projectId, referenceFileId } = body;

    // Try R2 first, then local filesystem
    let buffer: ArrayBuffer;
    let mimeType = "video/mp4";

    const object = env.MONET_MEDIA ? await env.MONET_MEDIA.get(referenceFileId) : null;
    if (object) {
      buffer = await object.arrayBuffer();
      mimeType = object.httpMetadata?.contentType || "video/mp4";
      console.log(`[analyze-reference] Fetched from R2: ${referenceFileId} (${buffer.byteLength} bytes)`);
    } else {
      // Fallback: check local filesystem (Fastify upload storage)
      const localPath = getLocalMediaPath(referenceFileId);
      if (!localPath) {
        // Also try the apps/api/storage/uploads path
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const altPath = path.resolve(process.cwd(), "apps/api/storage/uploads", `${referenceFileId}*`);
        const files = await fs.readdir(path.resolve(process.cwd(), "apps/api/storage/uploads")).catch(() => []);
        const match = files.find(f => f.startsWith(referenceFileId));
        if (match) {
          const fullPath = path.resolve(process.cwd(), "apps/api/storage/uploads", match);
          const data = await fs.readFile(fullPath);
          buffer = data.buffer;
          mimeType = match.endsWith(".mp4") || match.endsWith(".MP4") ? "video/mp4" : "video/quicktime";
          console.log(`[analyze-reference] Fetched from local storage: ${fullPath} (${buffer.byteLength} bytes)`);
        } else {
          return apiError(ApiErrorCode.MediaNotFound, `Reference file not found: ${referenceFileId}`, 404);
        }
      } else {
        const fs = await import("node:fs/promises");
        const data = await fs.readFile(localPath);
        buffer = data.buffer;
        mimeType = localPath.endsWith(".mp4") || localPath.endsWith(".MP4") ? "video/mp4" : "video/quicktime";
        console.log(`[analyze-reference] Fetched from local cache: ${localPath} (${buffer.byteLength} bytes)`);
      }
    }

    const { style, totalDuration } = await analyzeReference(env, referenceFileId, buffer, mimeType);

    if (totalDuration <= 0) {
      return apiError(
        ApiErrorCode.AnalysisFailed,
        "Reference video could not be processed. Ensure the file is a valid video with audio.",
        422
      );
    }

    if (style.confidence < 0.3) {
      console.warn(
        `[analyze-reference] Low confidence analysis (${style.confidence.toFixed(2)}). ` +
        `This may indicate the reference video lacks detectable editing patterns.`
      );
    }

    const referenceStyleId = crypto.randomUUID();
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO analysis_results (id, project_id, analysis_data, created_at) VALUES (?, ?, ?, ?)`
        )
          .bind(referenceStyleId, projectId, JSON.stringify(style), Date.now())
          .run();
      } catch (e) {
        console.warn("[analyze-reference] D1 insert failed:", (e as Error).message);
      }
    }

    return jsonResponse({
      success: true,
      referenceStyleId,
      style,
    });
  } catch (error: any) {
    console.error("[analyze-reference] Error:", error);
    return apiError(ApiErrorCode.InternalError, error.message || "Reference analysis failed", 500);
  }
}
