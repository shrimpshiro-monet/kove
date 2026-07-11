import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEV_DIR = join(tmpdir(), "monet-studio-dev");

export interface LocalStudioSnapshot {
  projectId: string;
  threadId?: string;
  projectName?: string;
  edlId?: string;
  edlJson: string;
  updatedAt: number;
}

function ensureDir(): boolean {
  try {
    if (!existsSync(DEV_DIR)) {
      mkdirSync(DEV_DIR, { recursive: true });
    }
    return true;
  } catch (e) {
    console.warn("[studio-cache] ensureDir failed:", e);
    return false;
  }
}

function snapshotPath(projectId: string): string {
  return join(DEV_DIR, `${projectId}.json`);
}

export function putLocalStudioSnapshot(snapshot: LocalStudioSnapshot): void {
  if (!ensureDir()) return;

  try {
    writeFileSync(snapshotPath(snapshot.projectId), JSON.stringify(snapshot));
  } catch (e) {
    console.warn("[studio-cache] write failed:", e);
  }
}

export function getLocalStudioSnapshot(projectId: string): LocalStudioSnapshot | null {
  const path = snapshotPath(projectId);
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, "utf8")) as LocalStudioSnapshot;
  } catch (e) {
    console.warn("[studio-cache] read failed:", e);
    return null;
  }
}
