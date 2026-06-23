// src/server/api/render-preview.ts
// POST /api/render-preview — trigger a preview render and return poll URL

import type { Env } from "../types/env";
import type { MonetEDL } from "../types/edl";

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleRenderPreview(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const { edl, projectId } = (await request.json()) as {
      edl: MonetEDL;
      projectId: string;
    };

    if (!edl || !projectId) {
      return jsonRes({ success: false, error: "Missing edl or projectId" }, 400);
    }

    const jobId = `preview-${crypto.randomUUID().slice(0, 8)}`;
    const r2Key = `previews/${projectId}/${jobId}.mp4`;

    // Store initial job status
    await env.MONET_KV.put(
      `render:${jobId}`,
      JSON.stringify({
        id: jobId,
        status: "queued",
        createdAt: Date.now(),
        r2Key,
      }),
      { expirationTtl: 3600 }
    );

    // Fire render (Server-side rendering is delegated to apps/worker-node in production)
    // BUT since we are testing Editly locally right now, we will fire it async directly!
    console.info("[render-preview] Firing renderPreview with Editly asynchronously...");
    import("../lib/render-engine-editly").then((m) => {
      m.renderPreview({
        jobId,
        edl,
        r2OutputKey: r2Key,
        env,
      }).catch(console.error);
    });

    return jsonRes({
      success: true,
      jobId,
      pollUrl: `/api/render-status/${jobId}`,
    });
  } catch (error) {
    return jsonRes(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

export async function handleRenderStatus(
  jobId: string,
  env: Env
): Promise<Response> {
  const raw = await env.MONET_KV.get(`render:${jobId}`);
  if (!raw) {
    return jsonRes({ status: "not_found" }, 404);
  }

  const job = JSON.parse(raw);
  return jsonRes({
    status: job.status,
    downloadUrl: job.status === "done" ? `/api/renders/${job.r2Key}` : undefined,
    error: job.error,
  });
}
