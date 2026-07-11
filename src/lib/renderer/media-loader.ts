import type { MediaAsset } from "./types";
import { mediaLoaderCache } from "./media-loader-cache";

export type MediaAssetType = "video" | "audio" | "image";

export interface LoadedMediaAsset extends MediaAsset {
  id: string;
  type: MediaAssetType;
  url: string;
  duration: number;
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  loaded: boolean;
  objectUrl?: string;
  ownsObjectUrl: boolean;
  mimeType?: string;
  failed?: boolean;
  error?: string;
}

interface LoadVideoOptions {
  timeoutMs: number;
}

function isObjectUrl(url: string): boolean {
  return url.startsWith("blob:");
}

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/");
}

function normalizeMimeType(value: string | null | undefined, fallback: string): string {
  if (!value || typeof value !== "string") return fallback;
  const clean = value.trim().toLowerCase().split(";")[0];
  return clean || fallback;
}

function inferVideoMimeType(url: string, provided?: string): string {
  const normalized = normalizeMimeType(provided, "");

  if (normalized.startsWith("video/")) {
    return normalized;
  }

  const lower = url.toLowerCase().split("?")[0].split("#")[0];

  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mp4")) return "video/mp4";

  return "video/mp4";
}

function inferAudioMimeType(url: string, provided?: string): string {
  const normalized = normalizeMimeType(provided, "");

  if (normalized.startsWith("audio/")) {
    return normalized;
  }

  const lower = url.toLowerCase().split("?")[0].split("#")[0];

  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";

  return "audio/mpeg";
}

async function fetchAsObjectUrl(params: {
  url: string;
  fallbackMimeType: string;
}): Promise<{ objectUrl: string; mimeType: string }> {
  const response = await fetch(params.url, {
    method: "GET",
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch media: HTTP ${response.status}`);
  }

  const contentType = normalizeMimeType(
    response.headers.get("content-type"),
    params.fallbackMimeType
  );

  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);

  return {
    objectUrl,
    mimeType: contentType,
  };
}

function waitForVideoReady(
  video: HTMLVideoElement,
  options: LoadVideoOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) {
      resolve();
      return;
    }

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      clearTimeout(timeoutId);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`metadata timeout after 30s for ${video.src.slice(0, 80)}`));
    }, 30000);

    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };

    video.onerror = (e) => {
      cleanup();
      reject(new Error(`video error: ${(e as any)?.message ?? "unknown"}`));
    };

    // Force a play attempt to nudge metadata loading on stubborn browsers
    video.play().then(() => video.pause()).catch(() => {});
  });
}

function waitForAudioReady(
  audio: HTMLAudioElement,
  options: LoadVideoOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      window.clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("abort", handleAbort);
    };

    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const handleReady = (): void => {
      if (
        Number.isFinite(audio.duration) ||
        audio.readyState >= HTMLMediaElement.HAVE_METADATA
      ) {
        finish();
      }
    };

    const handleError = (): void => {
      const mediaError = audio.error;
      fail(mediaError?.message || "Audio load error");
    };

    const handleAbort = (): void => {
      fail("Audio load aborted");
    };

    const timer = window.setTimeout(() => {
      fail(`timeout after ${options.timeoutMs}ms`);
    }, options.timeoutMs);

    audio.addEventListener("loadedmetadata", handleReady);
    audio.addEventListener("canplay", handleReady);
    audio.addEventListener("error", handleError);
    audio.addEventListener("abort", handleAbort);

    if (
      Number.isFinite(audio.duration) ||
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
    ) {
      finish();
      return;
    }

    audio.load();
  });
}

function waitForImageReady(image: HTMLImageElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }

    let settled = false;

    const cleanup = (): void => {
      window.clearTimeout(timer);
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    const handleLoad = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const handleError = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Image load error"));
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
  });
}

export class MediaLoader {
  private readonly assets = new Map<string, LoadedMediaAsset>();
  private readonly loadPromises = new Map<string, Promise<LoadedMediaAsset>>();
  private readonly videoElementCache = new Map<string, HTMLVideoElement>();
  private readonly audioElementCache = new Map<string, HTMLAudioElement>();
  private readonly imageElementCache = new Map<string, HTMLImageElement>();

  async loadAsset(
    id: string,
    url: string,
    type: MediaAssetType,
    mimeType?: string
  ): Promise<LoadedMediaAsset> {
    // Defensive guard: never load reference or music videos as renderable assets.
    // These have no business being rendered to canvas.
    if (type !== "video" && type !== "image") {
      console.warn(`[MediaLoader] Refusing to load non-renderable type "${type}" for ${id}`);
      return { id, type, url, duration: 0, loaded: false, ownsObjectUrl: false, element: null as any, failed: true, error: `Non-renderable type: ${type}` } as any;
    }

    // Tag the URL pattern: if the id is explicitly a reference, skip
    if (id.startsWith("ref-") || id.startsWith("music-")) {
      console.warn(`[MediaLoader] Refusing to load reference/music id: ${id}`);
      return { id, type, url, duration: 0, loaded: false, ownsObjectUrl: false, element: null as any, failed: true, error: `Reference/music id rejected: ${id}` } as any;
    }

    // Prevent duplicate loads for the same asset
    const existing = this.assets.get(id);
    if (existing && !existing.failed) {
      return existing;
    }

    const existingPromise = this.loadPromises.get(id);
    if (existingPromise) {
      return existingPromise;
    }

    return mediaLoaderCache.getOrLoad(id, url, async (resolvedUrl) => {
      const promise = this.loadAssetInternal(id, resolvedUrl, type, mimeType)
        .then((asset) => {
          this.assets.set(id, asset);
          return asset;
        })
        .catch((error) => {
          const failedAsset: LoadedMediaAsset = {
            id,
            type,
            url: resolvedUrl,
            duration: 0,
            loaded: false,
            ownsObjectUrl: false,
            element: null as any,
            mimeType,
            failed: true,
            error: error instanceof Error ? error.message : String(error),
          };

          this.assets.set(id, failedAsset);
          throw error;
        })
        .finally(() => {
          this.loadPromises.delete(id);
        });

      this.loadPromises.set(id, promise);
      return promise;
    });
  }

  // Define original fallback loader logic internally for cache misses
  async loadAssetOriginal(
    id: string,
    url: string,
    type: MediaAssetType,
    mimeType?: string
  ): Promise<LoadedMediaAsset> {
    const existing = this.assets.get(id);
    if (existing && !existing.failed) {
      return existing;
    }

    const existingPromise = this.loadPromises.get(id);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = this.loadAssetInternal(id, url, type, mimeType)
      .then((asset) => {
        this.assets.set(id, asset);
        return asset;
      })
      .catch((error) => {
        const failedAsset: LoadedMediaAsset = {
          id,
          type,
          url,
          duration: 0,
          loaded: false,
          ownsObjectUrl: false,
          element: null as any,
          mimeType,
          failed: true,
          error: error instanceof Error ? error.message : String(error),
        };

        this.assets.set(id, failedAsset);
        throw error;
      })
      .finally(() => {
        this.loadPromises.delete(id);
      });

    this.loadPromises.set(id, promise);
    return promise;
  }

  private async loadAssetInternal(
    id: string,
    url: string,
    type: MediaAssetType,
    mimeType?: string
  ): Promise<LoadedMediaAsset> {
    if (!url || typeof url !== "string") {
      throw new Error(`Missing media URL for asset ${id}`);
    }

    const shouldFetch =
      isHttpUrl(url) && !isObjectUrl(url) && !isDataUrl(url);

    let src = url;
    let resolvedMimeType = mimeType;
    let ownsObjectUrl = false;
    let objectUrl: string | undefined;

    if (shouldFetch) {
      const fallbackMimeType =
        type === "video"
          ? inferVideoMimeType(url, mimeType)
          : type === "audio"
            ? inferAudioMimeType(url, mimeType)
            : normalizeMimeType(mimeType, "image/jpeg");

      let fetched;
      try {
        fetched = await fetchAsObjectUrl({
          url,
          fallbackMimeType,
        });
      } catch (err) {
        if (url.includes("_proxy")) {
          const fallbackUrl = url.replace("_proxy", "");
          console.warn(`[MediaLoader] Failed to fetch proxy: ${url}, falling back to original: ${fallbackUrl}`, err);
          try {
            fetched = await fetchAsObjectUrl({
              url: fallbackUrl,
              fallbackMimeType,
            });
            url = fallbackUrl;
          } catch (fallbackErr) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      src = fetched.objectUrl;
      objectUrl = fetched.objectUrl;
      ownsObjectUrl = true;
      resolvedMimeType = fetched.mimeType;
    } else {
      resolvedMimeType =
        type === "video"
          ? inferVideoMimeType(url, mimeType)
          : type === "audio"
            ? inferAudioMimeType(url, mimeType)
            : mimeType;
    }

    if (type === "video") {
      let video = this.videoElementCache.get(src);

      if (!video) {
        video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        if (!isObjectUrl(src) && !isDataUrl(src)) {
          video.crossOrigin = "anonymous";
        }

        // Detect rotation that the browser applies from MP4/MOV metadata.
        // Modern browsers auto-apply rotation to <video> elements via CSS transform,
        // but ctx.drawImage() does NOT respect it. We detect the browser's applied
        // rotation so the renderer can manually apply it to the canvas.
        video.addEventListener("loadeddata", () => {
          try {
            const el = video as any;

            // Method 1: Some browsers (Safari, Chrome) set a CSS transform on the video
            const computedStyle = window.getComputedStyle(video);
            const transform = computedStyle.transform || video.style.transform || "";
            const rotateMatch = transform.match(/rotate\((\d+)deg\)/);
            if (rotateMatch) {
              const deg = parseInt(rotateMatch[1], 10);
              if (deg === 90 || deg === 180 || deg === 270) {
                el.__monetRotationCached = deg;
                console.log("[media-loader] detected browser-applied rotation:", deg + "°");
                return;
              }
            }

            // Method 2: Check video dimensions vs natural orientation
            // Phone videos shot in portrait have videoWidth < videoHeight.
            // If the browser reports swapped dimensions, it already applied 90° rotation.
            // For 180°, we need to detect inverted content.
            const w = video.videoWidth;
            const h = video.videoHeight;

            // Default: no rotation needed
            el.__monetRotationCached = 0;
          } catch {}
        }, { once: true });

        this.videoElementCache.set(src, video);
      }

      console.log("[MediaLoader] loading video src:", src.slice(0, 120));
      video.src = src;

      await waitForVideoReady(video, { timeoutMs: 120000 });

      // Force play/pause to fully initialize some browsers' decoding pipeline
      try {
        await video.play();
        video.pause();
      } catch {}

      console.log("[MediaLoader] Loaded video asset", {
        id,
        mimeType: resolvedMimeType,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        srcKind: isObjectUrl(src) ? "blob" : "url",
        ownsObjectUrl,
      });

      return {
        id,
        type,
        url,
        duration: video.duration,
        loaded: true,
        objectUrl,
        ownsObjectUrl,
        element: video,
        mimeType: resolvedMimeType,
      };
    }

    if (type === "audio") {
      let audio = this.audioElementCache.get(src);

      if (!audio) {
        audio = document.createElement("audio");
        audio.preload = "auto";
        if (!isObjectUrl(src) && !isDataUrl(src)) {
          audio.crossOrigin = "anonymous";
        }
        this.audioElementCache.set(src, audio);
      }

      console.log("[MediaLoader] loading audio src:", src.slice(0, 120));
      audio.src = src;

      await waitForAudioReady(audio, { timeoutMs: 120000 });

      return {
        id,
        type,
        url,
        duration: audio.duration,
        loaded: true,
        objectUrl,
        ownsObjectUrl,
        element: audio,
        mimeType: resolvedMimeType,
      };
    }

    const existingImage = this.imageElementCache.get(src);
    let image = existingImage;

    if (!image) {
      image = new Image();
      image.crossOrigin = "anonymous";
      this.imageElementCache.set(src, image);
    }

    console.log("[MediaLoader] loading image src:", src.slice(0, 120));
    image.src = src;

    await waitForImageReady(image, 120000);

    return {
      id,
      type,
      url,
      duration: 0,
      loaded: true,
      objectUrl,
      ownsObjectUrl,
      element: image,
      mimeType: resolvedMimeType,
    };
  }

  getAsset(id: string): LoadedMediaAsset | null {
    return this.assets.get(id) ?? null;
  }

  async seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    const targetTime = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? video.duration : time));

    if (Math.abs(video.currentTime - targetTime) < 0.03) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        window.clearTimeout(timer);
        window.clearInterval(pollInterval);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
      };

      const finish = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      const handleSeeked = (): void => {
        finish();
      };

      const handleError = (): void => {
        fail(video.error?.message || "Video seek failed");
      };

      // Poll to check if seek finished even if event didn't fire (background tab, throttled timers)
      const pollInterval = window.setInterval(() => {
        if (!video.seeking || Math.abs(video.currentTime - targetTime) < 0.1) {
          finish();
        }
      }, 50);

      const timer = window.setTimeout(() => {
        if (Math.abs(video.currentTime - targetTime) < 0.5) {
          console.warn("[MediaLoader] Seek timeout but currentTime is close enough, resolving anyway.", {
            currentTime: video.currentTime,
            targetTime,
          });
          finish();
        } else {
          fail("Video seek timeout");
        }
      }, 2000);

      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);

      try {
        video.currentTime = targetTime;
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  }

  cleanup(): void {
    for (const asset of this.assets.values()) {
      if (asset.element instanceof HTMLMediaElement) {
        asset.element.pause();
        asset.element.removeAttribute("src");
        asset.element.load();
      }

      if (asset.ownsObjectUrl && asset.objectUrl) {
        URL.revokeObjectURL(asset.objectUrl);
      }
    }

    this.assets.clear();
    this.loadPromises.clear();
    this.videoElementCache.clear();
    this.audioElementCache.clear();
    this.imageElementCache.clear();
  }
}
