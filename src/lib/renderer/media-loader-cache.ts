// src/lib/renderer/media-loader-cache.ts

interface CachedAsset {
  asset: any;          // loaded media asset object
  loadedAt: number;
  url: string;
}

class MediaLoaderCache {
  private cache = new Map<string, CachedAsset>();
  private inFlight = new Map<string, Promise<any>>();
  private maxAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Get from cache or load. Coalesces concurrent loads of the same id.
   */
  async getOrLoad(
    clipId: string, url: string, loader: (url: string) => Promise<any>,
  ): Promise<any> {
    const key = `${clipId}::${url}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < this.maxAge) {
      return cached.asset;
    }

    // Coalesce: if a load is already in flight for this key, await it
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = loader(url).then((asset) => {
      this.cache.set(key, { asset, loadedAt: Date.now(), url });
      this.inFlight.delete(key);
      return asset;
    }).catch((e) => {
      this.inFlight.delete(key);
      throw e;
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate(clipId?: string) {
    if (!clipId) { this.cache.clear(); return; }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${clipId}::`)) this.cache.delete(key);
    }
  }

  size() { return this.cache.size; }
}

export const mediaLoaderCache = new MediaLoaderCache();
