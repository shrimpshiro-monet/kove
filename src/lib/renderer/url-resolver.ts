// src/lib/renderer/url-resolver.ts

export interface MediaUrlOptions {
  blob?: string;       // blob: URL (volatile, may be dead)
  url?: string;        // http(s) URL (always reliable)
  preferred?: "auto" | "blob" | "url";
}

/**
 * Returns the best URL to load media from.
 * Priority: explicit preferred > HTTP URL > blob (with health check).
 *
 * Why: blob URLs hang forever if the originating context is gone.
 * HTTP URLs support range requests and are more reliable.
 */
export async function resolveMediaUrl(opts: MediaUrlOptions): Promise<{
  url: string; kind: "blob" | "url"; blobHealthy?: boolean;
}> {
  if (opts.preferred === "url" && opts.url) {
    return { url: opts.url, kind: "url" };
  }
  if (opts.preferred === "blob" && opts.blob) {
    return { url: opts.blob, kind: "blob" };
  }

  // Auto: prefer HTTP URL — it's always more reliable
  if (opts.url) {
    return { url: opts.url, kind: "url" };
  }

  // Only HTTP URL not available — health-check the blob with short timeout
  if (opts.blob) {
    const healthy = await checkBlobHealth(opts.blob, 1500);
    if (healthy) {
      return { url: opts.blob, kind: "blob", blobHealthy: true };
    }
    throw new Error(`Blob URL is dead and no HTTP URL fallback available`);
  }

  throw new Error("No media URL provided");
}

async function checkBlobHealth(blobUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(blobUrl, {
      method: "HEAD", signal: ac.signal,
    }).catch(() => null);
    clearTimeout(to);
    return !!r && r.ok;
  } catch {
    return false;
  }
}
