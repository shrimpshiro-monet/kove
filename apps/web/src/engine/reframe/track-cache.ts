import type { SubjectTrack } from "@monet/edl";

const DB_NAME = "monet-reframe";
const STORE_NAME = "subject-tracks";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class TrackCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memCache = new Map<string, SubjectTrack>();
  private pendingJobs = new Map<string, Promise<void>>();

  private async db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB();
    }
    return this.dbPromise;
  }

  async get(key: string): Promise<SubjectTrack | null> {
    const mem = this.memCache.get(key);
    if (mem) return mem;

    try {
      const db = await this.db();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          const track = req.result as SubjectTrack | undefined;
          if (track) {
            this.memCache.set(key, track);
            resolve(track);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async set(key: string, track: SubjectTrack): Promise<void> {
    this.memCache.set(key, track);
    try {
      const db = await this.db();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(track, key);
    } catch {
      // IndexedDB write failure is non-fatal
    }
  }

  async ensureTrack(
    key: string,
    clipId: string,
    sourceAssetId: string,
    mediaUrl: string,
    duration: number,
  ): Promise<SubjectTrack | null> {
    const existing = await this.get(key);
    if (existing) return existing;

    const jobKey = `analyze:${key}`;
    if (this.pendingJobs.has(jobKey)) {
      await this.pendingJobs.get(jobKey)!;
      return this.get(key);
    }

    const job = this.runAnalysis(clipId, sourceAssetId, mediaUrl, duration, key);
    this.pendingJobs.set(jobKey, job);
    try {
      await job;
    } finally {
      this.pendingJobs.delete(jobKey);
    }
    return this.get(key);
  }

  private async runAnalysis(
    clipId: string,
    sourceAssetId: string,
    mediaUrl: string,
    duration: number,
    cacheKey: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });

      worker.onmessage = async (e) => {
        const msg = e.data;
        switch (msg.type) {
          case "track":
            await this.set(cacheKey, msg.track as SubjectTrack);
            try {
              await fetch("/api/subject-track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(msg.track),
              });
            } catch {
              // Server persistence is best-effort
            }
            worker.terminate();
            resolve();
            break;
          case "fallback":
          case "error":
            worker.terminate();
            resolve();
            break;
          case "progress":
            self.postMessage({ type: "reframe-progress", percent: msg.percent });
            break;
        }
      };

      worker.onerror = () => {
        worker.terminate();
        resolve();
      };

      worker.postMessage({ type: "analyze", clipId, sourceAssetId, mediaUrl, fps: 30, duration });
    });
  }
}
