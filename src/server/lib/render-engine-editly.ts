// src/server/lib/render-engine-editly.ts
// The production-grade export engine powered by Editly + FFmpeg

import editly from "editly";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import type { MonetEDL } from "../types/edl";
import type { Env } from "../types/env";
import { monetEDLToEditlySpec } from "./edl-to-editly";

export interface RenderJob {
  jobId: string;
  edl: MonetEDL;
  r2OutputKey: string;
  env: Env;
  quality?: "preview" | "final";
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Render a MonetEDL to MP4 using Editly.
 */
export async function renderWithEditly(params: RenderJob): Promise<RenderResult> {
  const { jobId, edl, r2OutputKey, env, quality = "final" } = params;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `monet-render-${jobId}-`));
  const startTime = Date.now();

  try {
    console.info(`[render] Starting job ${jobId}`, { quality });
    await updateJobStatus(jobId, "processing", env);

    // 1. Resolve assets from R2
    const videoPaths: Record<string, string> = {};
    const uniqueClipIds = Array.from(new Set(edl.shots.map(s => s.source.clipId)));
    const projectId = edl.metadata?.projectId || "unknown";

    for (const clipId of uniqueClipIds) {
      const localPath = path.join(tempDir, `${clipId}.mp4`);
      const keys = [`footage/${projectId}/${clipId}.mp4`, `footage/${projectId}/${clipId}_proxy.mp4`, clipId];
      
      for (const r2Key of keys) {
        const object = await env.MONET_MEDIA.get(r2Key);
        if (object) {
          await fs.writeFile(localPath, Buffer.from(await object.arrayBuffer()));
          videoPaths[clipId] = localPath;
          break;
        }
      }
    }

    let audioPath: string | undefined;
    if (edl.music?.sourceId) {
      audioPath = path.join(tempDir, `music.mp3`);
      const keys = [`music/${projectId}/${edl.music.sourceId}.mp3`, edl.music.sourceId];
      for (const r2Key of keys) {
        const object = await env.MONET_MEDIA.get(r2Key);
        if (object) {
          await fs.writeFile(audioPath, Buffer.from(await object.arrayBuffer()));
          break;
        }
      }
    }

    // 2. Compile Spec
    const outPath = path.join(tempDir, "output.mp4");
    const spec = monetEDLToEditlySpec(edl, videoPaths, audioPath);
    spec.outPath = outPath;

    if (quality === "preview") {
      spec.width = 854;
      spec.height = 480;
      spec.fps = 24;
    }

    // 3. Exec Editly (in-process via lib)
    // @ts-ignore
    await editly(spec);

    // 4. Upload
    await env.MONET_RENDERS.put(r2OutputKey, await fs.readFile(outPath), {
      httpMetadata: { contentType: "video/mp4" }
    });

    await updateJobStatus(jobId, "done", env);
    return { success: true, durationMs: Date.now() - startTime };

  } catch (error) {
    console.error(`[render] Job ${jobId} failed:`, error);
    await updateJobStatus(jobId, "error", env, error instanceof Error ? error.message : "Unknown");
    return { success: false, error: error instanceof Error ? error.message : "Unknown" };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Quick preview render — lower resolution, faster.
 */
export async function renderPreview(params: Omit<RenderJob, "quality">): Promise<RenderResult> {
  return renderWithEditly({ ...params, quality: "preview" });
}

async function updateJobStatus(
  jobId: string, 
  status: "queued" | "processing" | "done" | "error", 
  env: Env,
  error?: string
) {
  try {
    const raw = await env.MONET_KV.get(`render:${jobId}`);
    const job = raw ? JSON.parse(raw) : { id: jobId, createdAt: Date.now() };
    job.status = status;
    if (error) job.error = error;
    await env.MONET_KV.put(`render:${jobId}`, JSON.stringify(job), { expirationTtl: 3600 });
  } catch (e) {
    console.warn(`[render] Failed to update job status for ${jobId}`, e);
  }
}
