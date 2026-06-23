import type { ActionResult } from "./audio-types";

export class AudioBufferCache {
  private readonly context: AudioContext;
  private readonly cache = new Map<string, Promise<AudioBuffer>>();

  public constructor(context: AudioContext) {
    this.context = context;
  }

  public async getBuffer(src: string): Promise<ActionResult<AudioBuffer>> {
    try {
      if (!src || src.trim().length === 0) {
        return {
          success: false,
          error: {
            code: "AUDIO_SRC_REQUIRED",
            message: "Audio source path is required",
          },
        };
      }

      const normalizedSrc = src.trim();

      if (!this.cache.has(normalizedSrc)) {
        this.cache.set(normalizedSrc, this.fetchAndDecode(normalizedSrc));
      }

      const buffer = await this.cache.get(normalizedSrc);

      if (!buffer) {
        return {
          success: false,
          error: {
            code: "AUDIO_BUFFER_CACHE_MISS",
            message: `Audio buffer cache failed for ${normalizedSrc}`,
          },
        };
      }

      return {
        success: true,
        data: buffer,
      };
    } catch (error) {
      console.error("[AudioBufferCache] getBuffer failed", {
        error,
        src,
      });

      return {
        success: false,
        error: {
          code: "AUDIO_BUFFER_LOAD_FAILED",
          message: "Failed to load and decode audio buffer",
        },
      };
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  private async fetchAndDecode(src: string): Promise<AudioBuffer> {
    const response = await fetch(src);

    if (!response.ok) {
      throw new Error(`Failed to fetch audio ${src}: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength === 0) {
      throw new Error(`Audio file is empty: ${src}`);
    }

    return await this.context.decodeAudioData(arrayBuffer.slice(0));
  }
}
