// Media Asset Loader
// Preloads video/audio/image assets and manages playback

import type { MediaAsset } from "./types";

export class MediaLoader {
  private assets: Map<string, MediaAsset> = new Map();
  private loadingPromises: Map<string, Promise<MediaAsset>> = new Map();

  /**
   * Load a media asset (video, audio, or image)
   */
  async loadAsset(
    id: string,
    url: string,
    type: "video" | "audio" | "image"
  ): Promise<MediaAsset> {
    // Return cached if already loaded
    if (this.assets.has(id)) {
      return this.assets.get(id)!;
    }

    // Return in-progress load
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id)!;
    }

    // Start new load
    const promise = this.loadAssetInternal(id, url, type);
    this.loadingPromises.set(id, promise);

    try {
      const asset = await promise;
      this.assets.set(id, asset);
      return asset;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  private async loadAssetInternal(
    id: string,
    url: string,
    type: "video" | "audio" | "image"
  ): Promise<MediaAsset> {
    if (type === "video") {
      return this.loadVideo(id, url);
    } else if (type === "audio") {
      return this.loadAudio(id, url);
    } else {
      return this.loadImage(id, url);
    }
  }

  private async loadVideo(id: string, url: string): Promise<MediaAsset> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true; // Muted for preview (audio handled separately)

      video.onloadedmetadata = () => {
        resolve({
          id,
          type: "video",
          url,
          duration: video.duration,
          element: video,
          loaded: true,
        });
      };

      video.onerror = () => {
        reject(new Error(`Failed to load video: ${url}`));
      };

      video.src = url;
    });
  }

  private async loadAudio(id: string, url: string): Promise<MediaAsset> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";

      audio.onloadedmetadata = () => {
        resolve({
          id,
          type: "audio",
          url,
          duration: audio.duration,
          element: audio,
          loaded: true,
        });
      };

      audio.onerror = () => {
        reject(new Error(`Failed to load audio: ${url}`));
      };

      audio.src = url;
    });
  }

  private async loadImage(id: string, url: string): Promise<MediaAsset> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        resolve({
          id,
          type: "image",
          url,
          duration: 0, // Images don't have duration
          element: img,
          loaded: true,
        });
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Get a loaded asset
   */
  getAsset(id: string): MediaAsset | undefined {
    return this.assets.get(id);
  }

  /**
   * Seek video to specific time
   */
  async seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - time) < 0.05) {
        resolve();
        return;
      }

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };

      video.addEventListener("seeked", onSeeked);
      video.currentTime = time;
    });
  }

  /**
   * Cleanup all loaded assets
   */
  cleanup() {
    for (const asset of this.assets.values()) {
      if (asset.element instanceof HTMLMediaElement) {
        asset.element.pause();
        asset.element.src = "";
        asset.element.load();
      }
    }
    this.assets.clear();
    this.loadingPromises.clear();
  }
}
