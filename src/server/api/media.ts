// Media serving endpoint
// TODO: Replace with actual R2 fetching once storage is set up

import type { Env } from "../types/env";

/**
 * Serve media files
 * For now, returns mock URLs or uploaded file references
 */
export async function handleMedia(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const clipId = url.pathname.split("/").pop();

  if (!clipId) {
    return new Response("Clip ID required", { status: 400 });
  }

  // TODO: Fetch from R2 storage
  // For now, return error that tells client to use local file URLs
  return new Response(
    JSON.stringify({
      error: "Media serving not yet implemented",
      message: "Use local file URLs for now (File API)",
      clipId,
    }),
    {
      status: 501,
      headers: { "Content-Type": "application/json" },
    }
  );
}
