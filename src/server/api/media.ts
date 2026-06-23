import { z } from "zod";
import type { Env } from "../types/env";
import { getLocalMedia, putLocalMedia } from "../lib/local-media-cache";
import { apiError, ApiErrorCode } from "../lib/api-response";
import { ok, err, type Result } from "../lib/result";

const MediaParamsSchema = z.object({
  clipId: z.string().min(1).max(512),
});

type MediaMetadata = {
  r2Key: string;
  mimeType: string;
};

function inferContentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "video/mp4"; // Default fallback for Monet clips
}

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

  if (request.method !== "GET") {
    return apiError(ApiErrorCode.MethodNotAllowed, "Method not allowed", 405, undefined, {
      Allow: "GET, OPTIONS",
    });
  }

  const url = new URL(request.url);
  const rawClipId = url.pathname.split("/").pop();

  const validation = MediaParamsSchema.safeParse({ clipId: rawClipId });
  if (!validation.success) {
    return apiError(
      ApiErrorCode.InvalidRequest,
      "Invalid or missing Clip ID",
      400,
      validation.error
    );
  }

  const { clipId } = validation.data;
  const rangeHeader = request.headers.get("Range");
  const parsedRange = parseRangeHeader(rangeHeader);

  let localMedia = getLocalMedia(clipId);
  let r2Key: string | null = null;
  let mimeType = "application/octet-stream";

  if (env?.DB) {
    const dbResult = await fetchMediaMetadata(env.DB, clipId);
    if (dbResult.ok) {
      r2Key = dbResult.value.r2Key;
      mimeType = dbResult.value.mimeType;

      // HEAL: If we have a DB record but no local cache, rehydrate from R2.
      if (!localMedia && !parsedRange && env.MONET_MEDIA) {
        const healResult = await healLocalCache(
          env.MONET_MEDIA,
          clipId,
          r2Key,
          mimeType
        );
        if (healResult.ok) {
          localMedia = healResult.value;
          mimeType = localMedia.mimeType;
        }
      }
    } else if (dbResult.error !== ApiErrorCode.MediaNotFound) {
      console.warn("[media/db] Metadata lookup failed; using fallback path", {
        clipId,
        error: dbResult.error,
      });
    }
  }

  if (localMedia) {
    return buildLocalMediaResponse(
      localMedia.data,
      localMedia.mimeType,
      parsedRange
    );
  }

  // Fallback for legacy/dev paths where clipId is actually the R2 key.
  if (!r2Key) {
    r2Key = clipId;
  }

  // Final check: if mimeType is still generic, infer it from the key (R2 or clipId)
  if (mimeType === "application/octet-stream") {
    mimeType = inferContentTypeFromKey(r2Key || clipId);
  }

  let object: R2ObjectBody | null = null;
  let totalSize: number | null = null;
  let normalizedRange: { start: number; end: number } | null = null;

  if (env && "MONET_MEDIA" in env && env.MONET_MEDIA) {
    try {
      const objectMeta = parsedRange ? await env.MONET_MEDIA.head(r2Key) : null;
      totalSize = objectMeta?.size ?? null;

      if (parsedRange && totalSize !== null) {
        if (totalSize <= 0 || parsedRange.start >= totalSize) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${Math.max(0, totalSize)}`,
              "Accept-Ranges": "bytes",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Expose-Headers":
                "Accept-Ranges, Content-Length, Content-Range, Content-Type",
            },
          });
        }

        normalizedRange = {
          start: parsedRange.start,
          end: Math.min(parsedRange.end, totalSize - 1),
        };
      } else if (parsedRange) {
        normalizedRange = {
          start: parsedRange.start,
          end: parsedRange.end,
        };
      }

      if (normalizedRange && normalizedRange.end < normalizedRange.start) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": totalSize !== null ? `bytes */${totalSize}` : "bytes */*",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Expose-Headers":
              "Accept-Ranges, Content-Length, Content-Range, Content-Type",
          },
        });
      }

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

      if (
        object?.httpMetadata?.contentType &&
        (mimeType === "application/octet-stream" || mimeType === "video/mp4")
      ) {
        // Prefer explicit R2 metadata if available
        mimeType = object.httpMetadata.contentType;
      }
    } catch (r2Error) {
      console.warn(
        `[media] Failed to fetch R2 object for ${clipId} from ${r2Key}`,
        r2Error
      );
    }
  }

  if (!object) {
    return apiError(ApiErrorCode.MediaNotFound, "Media not found", 404, {
      clipId,
      r2Key,
      hasLocalFallback: Boolean(localMedia),
    });
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
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  });

  if (normalizedRange) {
    headers.set(
      "Content-Range", `bytes ${start}-${end}/${totalSize ?? end + 1}`
    );

    return new Response(object.body, {
      status: 206,
      headers,
    });
  }

  return new Response(object.body, {
    status: 200,
    headers,
  });
}


/**
 * Internal helper to fetch media metadata from D1.
 */
async function fetchMediaMetadata(
  db: D1Database,
  clipId: string
): Promise<Result<MediaMetadata, ApiErrorCode>> {
  try {
    const mediaRow = await db
      .prepare("SELECT r2_key, mime_type FROM media_items WHERE id = ?")
      .bind(clipId)
      .first<{ r2_key: string; mime_type: string | null }>();

    if (mediaRow) {
      return ok({
        r2Key: mediaRow.r2_key,
        mimeType: mediaRow.mime_type || "application/octet-stream",
      });
    }
    return err(ApiErrorCode.MediaNotFound);
  } catch (e) {
    console.error("[media/db] Metadata fetch failed", e);
    return err(ApiErrorCode.DatabaseUnavailable);
  }
}

/**
 * Internal helper to heal local cache from R2.
 */
async function healLocalCache(
  bucket: R2Bucket,
  clipId: string,
  r2Key: string,
  defaultMimeType: string
): Promise<
  Result<{ data: ArrayBuffer; mimeType: string; r2Key: string }, Error>
> {
  try {
    console.info(`[media/heal] Rehydrating cache for ${clipId} from R2 key ${r2Key}`);
    const r2Object = await bucket.get(r2Key);

    if (r2Object) {
      const mimeType = r2Object.httpMetadata?.contentType || defaultMimeType;
      const data = await r2Object.arrayBuffer();

      putLocalMedia(clipId, {
        data,
        mimeType,
        r2Key,
      });

      console.info(`[media/heal] Rehydrated cache for ${clipId}`);
      return ok({ data, mimeType, r2Key });
    }
    return err(new Error("R2 object not found"));
  } catch (e) {
    console.warn(`[media/heal] Failed to rehydrate cache for ${clipId}`, e);
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

function buildLocalMediaResponse(
  data: ArrayBuffer,
  mimeType: string,
  range: { start: number; end: number } | null
): Response {
  const totalSize = data.byteLength;

  if (totalSize === 0) {
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": "0",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Expose-Headers":
          "Accept-Ranges, Content-Length, Content-Range, Content-Type",
      },
    });
  }

  if (range && range.start >= totalSize) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalSize}`,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Expose-Headers":
          "Accept-Ranges, Content-Length, Content-Range, Content-Type",
      },
    });
  }

  const boundedRange = range
    ? {
        start: Math.max(0, Math.min(range.start, totalSize - 1)),
        end: Math.max(0, Math.min(range.end, totalSize - 1)),
      }
    : null;

  const finalRange =
    boundedRange && boundedRange.end >= boundedRange.start
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
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  });

  if (finalRange) {
    headers.set(
      "Content-Range",
      `bytes ${finalRange.start}-${finalRange.end}/${totalSize}`
    );

    return new Response(payload, {
      status: 206,
      headers,
    });
  }

  return new Response(payload, {
    status: 200,
    headers,
  });
}

function parseRangeHeader(
  rangeHeader: string | null
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d+)-(\d+)?$/i.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2]
    ? Number.parseInt(match[2], 10)
    : start + 1024 * 1024 - 1;

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    end < start
  ) {
    return null;
  }

  return {
    start,
    end,
  };
}
