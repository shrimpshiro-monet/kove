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
  } catch {
    return false;
  }
}

// In-memory fallback (used when fs is unavailable)
const memStore = new Map<string, { data: ArrayBuffer; mimeType: string; r2Key?: string }>();

export function putLocalMedia(
  fileId: string,
  payload: { data: ArrayBuffer; mimeType: string; r2Key?: string }
): void {
  // Try disk first
  if (ensureDir()) {
    try {
      writeFileSync(join(DEV_DIR, fileId), Buffer.from(payload.data));
      writeFileSync(
        join(DEV_DIR, `${fileId}.meta`),
        JSON.stringify({ mimeType: payload.mimeType, r2Key: payload.r2Key })
      );
      return;
    } catch {
      // Fall through to memory
    }
  }

  // Memory fallback
  memStore.set(fileId, payload);
}

export function getLocalMedia(
  fileId: string
): { data: ArrayBuffer; mimeType: string; r2Key?: string } | null {
  // Try disk
  const dataPath = join(DEV_DIR, fileId);
  const metaPath = join(DEV_DIR, `${fileId}.meta`);
  if (existsSync(dataPath) && existsSync(metaPath)) {
    try {
      const data = readFileSync(dataPath);
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
        mimeType: string;
        r2Key?: string;
      };
      // Create an exact copy of the ArrayBuffer so we don't accidentally send the Node.js shared buffer pool
      const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return { data: exactBuffer as ArrayBuffer, mimeType: meta.mimeType, r2Key: meta.r2Key };
    } catch {
      // Fall through
    }
  }

  // Memory fallback
  return memStore.get(fileId) ?? null;
}
