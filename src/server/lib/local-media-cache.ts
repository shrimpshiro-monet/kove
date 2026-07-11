/**
 * Local media cache for dev environments where R2/D1 bindings are absent.
 *
 * Strategy (in priority order):
 *  1. Disk store  — persists across server restarts, survives HMR.
 *  2. Memory store — used if the process has no fs access (e.g. edge runtime).
 *
 * The disk store writes each file as two sibling files:
 *   {dir}/{fileId}        — raw binary
 *   {dir}/{fileId}.meta   — JSON with mimeType + r2Key
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEV_DIR = join(tmpdir(), "monet-media-dev");

function ensureDir(): boolean {
  try {
    if (!existsSync(DEV_DIR)) {
      mkdirSync(DEV_DIR, { recursive: true });
    }
    return true;
  } catch (e) {
    console.warn("[media-cache] ensureDir failed:", e);
    return false;
  }
}

export interface LocalMediaRecord {
  data: ArrayBuffer;
  mimeType: string;
  r2Key: string;
  fileName?: string;
  originalName?: string;
}

// In-memory fallback (used when fs is unavailable)
const memStore = new Map<string, LocalMediaRecord>();

export function putLocalMedia(
  fileId: string,
  payload: LocalMediaRecord
): void {
  // Try disk first
  if (ensureDir()) {
    try {
      writeFileSync(join(DEV_DIR, fileId), Buffer.from(payload.data));
      writeFileSync(
        join(DEV_DIR, `${fileId}.meta`),
        JSON.stringify({
          mimeType: payload.mimeType,
          r2Key: payload.r2Key,
          fileName: payload.fileName,
          originalName: payload.originalName,
        })
      );
      return;
    } catch (e) {
      console.warn("[media-cache] disk write failed, falling back to memory:", e);
    }
  }

  // Memory fallback
  memStore.set(fileId, payload);
}

/**
 * Return the on-disk path for a cached file (for passing to external workers).
 * Returns null if the file doesn't exist on disk.
 */
export function getLocalMediaPath(fileId: string): string | null {
  const dataPath = join(DEV_DIR, fileId);
  if (existsSync(dataPath)) {
    return dataPath;
  }
  return null;
}

export function getLocalMedia(
  fileId: string
): LocalMediaRecord | null {
  // Try disk
  const dataPath = join(DEV_DIR, fileId);
  const metaPath = join(DEV_DIR, `${fileId}.meta`);
  if (existsSync(dataPath) && existsSync(metaPath)) {
    try {
      const data = readFileSync(dataPath);
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
        mimeType: string;
        r2Key: string;
        fileName?: string;
        originalName?: string;
      };
      return {
        data: data.buffer as ArrayBuffer,
        mimeType: meta.mimeType,
        r2Key: meta.r2Key,
        fileName: meta.fileName,
        originalName: meta.originalName,
      };
    } catch (e) {
      console.warn("[media-cache] disk read failed, falling back to memory:", e);
    }
  }

  // Memory fallback
  return memStore.get(fileId) ?? null;
}
