import type { Env } from "../types/env";
import { getLocalMedia } from "../lib/local-media-cache";

/**
 * Serve media files from R2 by media item id.
 * Supports range requests for browser video seeking/scrubbing.
 */
export async function handleMedia(
  request: Request,
  env: Env | undefined
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const url = new URL(request.url);
  const clipId = url.pathname.split("/").pop();

  if (!clipId) {
    return new Response("Clip ID required", { status: 400 });
  }

  const localMedia = getLocalMedia(clipId);

  let r2Key: string | null = null;
  let mimeType = "application/octet-stream";

  if (env?.DB) {
    const mediaRow = await env.DB.prepare(
      "SELECT r2_key, mime_type FROM media_items WHERE id = ?"
    )
      .bind(clipId)
      .first<{ r2_key: string; mime_type: string | null }>();

    if (mediaRow) {
      r2Key = mediaRow.r2_key;
      mimeType = mediaRow.mime_type || mimeType;
    }
  }

  if (!r2Key && localMedia?.r2Key) {
    r2Key = localMedia.r2Key;
    mimeType = localMedia.mimeType || mimeType;
  }

  // Fallback for legacy/dev paths where clipId is actually the R2 key.
  if (!r2Key) {
    r2Key = clipId;
  }

  const rangeHeader = request.headers.get("Range");
  const parsedRange = parseRangeHeader(rangeHeader);

  let object: R2ObjectBody | null = null;
  let totalSize: number | null = null;
  let normalizedRange: { start: number; end: number } | null = null;

  if (env?.MONET_MEDIA) {
    const objectMeta = parsedRange ? await env.MONET_MEDIA.head(r2Key) : null;
    totalSize = objectMeta?.size ?? null;

    normalizedRange = parsedRange
      ? {
          start: parsedRange.start,
          end:
            totalSize !== null
              ? Math.min(parsedRange.end, Math.max(0, totalSize - 1))
              : parsedRange.end,
        }
      : null;

    object = await env.MONET_MEDIA.get(
      r2Key,
      normalizedRange
        ? {
            range: {
              offset: normalizedRange.start,
              length: normalizedRange.end - normalizedRange.start + 1,
            },
          }
        : undefined
    );
  }

  if (!object && localMedia) {
    return buildLocalMediaResponse(localMedia.data, localMedia.mimeType, parsedRange);
  }

  if (!object) {
    return new Response(
      JSON.stringify({
        error: "Media not found",
        clipId,
        r2Key,
        hasLocalFallback: Boolean(localMedia),
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const contentLength = object.size;
  const start = normalizedRange?.start ?? 0;
  const end = normalizedRange?.end ?? Math.max(0, start + contentLength - 1);

  const headers = new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "Content-Length": contentLength.toString(),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  });

  if (normalizedRange) {
    headers.set("Content-Range", `bytes ${start}-${end}/${totalSize ?? end + 1}`);
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { status: 200, headers });
}

function buildLocalMediaResponse(
  data: ArrayBuffer,
  mimeType: string,
  range: { start: number; end: number } | null
): Response {
  const totalSize = data.byteLength;

  const boundedRange = range
    ? {
        start: Math.max(0, Math.min(range.start, Math.max(0, totalSize - 1))),
        end: Math.max(0, Math.min(range.end, Math.max(0, totalSize - 1))),
      }
    : null;

  const finalRange = boundedRange && boundedRange.end >= boundedRange.start
    ? boundedRange
    : null;

  const payload = finalRange
    ? data.slice(finalRange.start, finalRange.end + 1)
    : data;

  const headers = new Headers({
    "Content-Type": mimeType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "Content-Length": payload.byteLength.toString(),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  });

  if (finalRange) {
    headers.set(
      "Content-Range",
      `bytes ${finalRange.start}-${finalRange.end}/${totalSize}`
    );
    return new Response(payload, { status: 206, headers });
  }

  return new Response(payload, { status: 200, headers });
}

function parseRangeHeader(rangeHeader: string | null): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d+)-(\d+)?$/i.exec(rangeHeader.trim());
  if (!match) return null;

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start + 1024 * 1024 - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
    return null;
  }

  return { start, end };
}
