// packages/engine-freecut/src/executor/assetResolver.ts
import fs from "fs/promises";
import path from "path";

export interface AssetEntry {
  mediaId: string;            // canonical id passed to actions
  semanticName?: string;      // human-readable, for prompt context
  filePath: string;           // ABSOLUTE path on disk
  kind: "video" | "audio" | "image";
  durationSec?: number;
}

export class AssetResolver {
  private byId = new Map<string, AssetEntry>();

  constructor(entries: AssetEntry[] = []) {
    for (const e of entries) this.byId.set(e.mediaId, e);
  }

  register(entry: AssetEntry) {
    this.byId.set(entry.mediaId, entry);
  }

  resolve(mediaId: string): AssetEntry | undefined {
    return this.byId.get(mediaId);
  }

  async assertAllExist(mediaIds: string[]): Promise<{
    resolved: Record<string, string>;
    unresolved: string[];
  }> {
    const resolved: Record<string, string> = {};
    const unresolved: string[] = [];

    for (const id of mediaIds) {
      const entry = this.byId.get(id);
      if (!entry) {
        unresolved.push(id);
        continue;
      }
      try {
        await fs.access(entry.filePath);
        resolved[id] = entry.filePath;
      } catch {
        unresolved.push(`${id} (missing file: ${entry.filePath})`);
      }
    }
    return { resolved, unresolved };
  }

  /** Used by the planner to give Gemini ONLY real asset ids */
  toPromptContext(): string {
    const lines = ["AVAILABLE ASSETS (use these exact mediaId values):"];
    for (const e of this.byId.values()) {
      lines.push(
        `- mediaId="${e.mediaId}" kind=${e.kind}` +
          (e.semanticName ? ` description="${e.semanticName}"` : "") +
          (e.durationSec ? ` duration=${e.durationSec.toFixed(2)}s` : "")
      );
    }
    return lines.join("\n");
  }
}
