/**
 * POST /api/export
 *
 * Server-side export fallback for browsers without WebCodecs (Safari, Firefox).
 * Enqueues a render job and returns a jobId immediately.
 * Client polls GET /api/export?jobId=... for status.
 *
 * Render job format (sent to RENDER_QUEUE):
 *   { jobId, edlJson, r2OutputKey, requestedAt }
 *
 * In production the queue consumer would use editly + FFmpeg on a Node.js Worker.
 * In dev (no RENDER_QUEUE binding) it returns a descriptive 503.
 */

import { z } from "zod";
import type { Env } from "../types/env";

// ─── Request schema ───────────────────────────────────────────────────────────

const ExportRequestSchema = z.object({
  edl: z.unknown(),
  projectId: z.string().optional(),
});

// ─── Response types ───────────────────────────────────────────────────────────

export interface ServerExportJobResult {
  jobId: string;
  status: "queued" | "processing" | "done" | "error";
  downloadUrl?: string;
  error?: string;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleQueueExport(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.RENDER_QUEUE) {
    return Response.json(
      {
        success: false,
        error: "Server-side export is not available in this environment. Use Chrome or Edge for client-side export.",
        code: "NO_RENDER_QUEUE",
      },
      { status: 503 }
    );
  }

  let body: z.infer<typeof ExportRequestSchema>;
  try {
    const raw = await request.json();
    const parsed = ExportRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const r2OutputKey = `renders/${body.projectId ?? "unknown"}/${jobId}.mp4`;

  // Write initial status to KV
  await env.MONET_KV.put(
    `export:${jobId}`,
    JSON.stringify({ jobId, status: "queued", r2OutputKey, requestedAt: Date.now() }),
    { expirationTtl: 60 * 60 * 24 } // 24h TTL
  );

  // Enqueue the render job
  await env.RENDER_QUEUE.send({
    jobId,
    edlJson: JSON.stringify(body.edl),
    r2OutputKey,
    requestedAt: Date.now(),
  });

  return Response.json({ success: true, jobId } satisfies { success: boolean; jobId: string }, { status: 202 });
}

export async function handleGetExportStatus(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ success: false, error: "Missing jobId" }, { status: 400 });
  }

  const raw = await env.MONET_KV.get(`export:${jobId}`);
  if (!raw) {
    return Response.json({ success: false, error: "Job not found" }, { status: 404 });
  }

  const job = JSON.parse(raw) as {
    jobId: string;
    status: "queued" | "processing" | "done" | "error";
    r2OutputKey: string;
    requestedAt: number;
    completedAt?: number;
  };

  let downloadUrl: string | undefined;
  if (job.status === "done" && env.MONET_RENDERS) {
    // Generate a signed R2 URL valid for 1 hour
    const object = await env.MONET_RENDERS.get(job.r2OutputKey);
    if (object) {
      // Cloudflare R2 Workers binding returns objects directly — no signed URL API in Workers.
      // Return the R2 key and let the client call /api/media/{key} to download.
      downloadUrl = `/api/media/render/${encodeURIComponent(job.r2OutputKey)}`;
    }
  }

  return Response.json({
    jobId: job.jobId,
    status: job.status,
    downloadUrl,
  } satisfies ServerExportJobResult);
}
