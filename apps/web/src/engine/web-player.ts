import type { ProjectEDL as MonetEDL } from "@monet/edl";
import { createAudioTimelineEngine } from "./audio/audio-timeline-engine";
import type { AudioTimelineEngine } from "./audio/audio-types";
import { createBeatEngine } from "./audio/beat-engine";
import { runLayeredEffects } from "./effects/layered-effect-runner";
import { resolveFrame } from "./timeline-resolver";

export interface PlayerControls {
  load(): Promise<{ success: boolean; error?: { code: string; message: string } }>;
  play(): Promise<{ success: boolean; error?: { code: string; message: string } }>;
  pause(): { success: boolean; error?: { code: string; message: string } };
  seek(time: number): { success: boolean; error?: { code: string; message: string } };
  dispose(): { success: boolean; error?: { code: string; message: string } };
  getCurrentTime(): number;
}

interface VideoEntry {
  video: HTMLVideoElement;
  ready: boolean;
  error: string | null;
}

function createVideoElement(src: string): VideoEntry {
  const video = document.createElement("video");

  video.src = src;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const entry: VideoEntry = {
    video,
    ready: false,
    error: null,
  };

  video.addEventListener("loadedmetadata", () => {
    entry.ready = true;
  });

  video.addEventListener("error", () => {
    entry.error = `Failed to load video: ${src}`;
  });

  video.load();

  return entry;
}

export function createWebPlayer(canvas: HTMLCanvasElement, edl: MonetEDL): PlayerControls {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }

  const videos = new Map<string, VideoEntry>();
  const audioEngineResult = createAudioTimelineEngine({ edl });
  const audioEngine: AudioTimelineEngine | null = audioEngineResult.success
    ? audioEngineResult.data ?? null
    : null;
  const beatEngine = createBeatEngine(edl);

  if (!audioEngineResult.success) {
    console.error("[WebPlayer] audio engine unavailable; video will use manual clock", {
      error: audioEngineResult.error,
    });
  }

  let playing = false;
  let manualTime = 0;
  let lastFrameTimestamp = 0;
  let animationFrameId: number | null = null;
  let disposed = false;

  function getCurrentTime(): number {
    if (audioEngine) {
      return audioEngine.getTimelineTime();
    }

    return manualTime;
  }

  function getVideo(mediaId: string, src: string): VideoEntry {
    const existing = videos.get(mediaId);

    if (existing) {
      return existing;
    }

    const created = createVideoElement(src);
    videos.set(mediaId, created);
    return created;
  }

  function drawPlaceholder(message: string): void {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "600 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  function drawVideoFrame(
    video: HTMLVideoElement,
    clipCrop: { x: number; y: number; width: number; height: number } | undefined
  ): void {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      drawPlaceholder("Loading video frame...");
      return;
    }

    if (clipCrop) {
      const sx = video.videoWidth * clipCrop.x;
      const sy = video.videoHeight * clipCrop.y;
      const sw = video.videoWidth * clipCrop.width;
      const sh = video.videoHeight * clipCrop.height;

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  function render(timestamp: number): void {
    if (!playing || disposed) {
      return;
    }

    if (!audioEngine) {
      const delta = lastFrameTimestamp === 0 ? 0 : (timestamp - lastFrameTimestamp) / 1000;
      manualTime += delta;
    }

    lastFrameTimestamp = timestamp;

    const timelineTime = getCurrentTime();
    const frame = resolveFrame(edl, timelineTime);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!frame) {
      drawPlaceholder("No active video clip");
      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const asset = edl.assets.media[frame.clip.mediaId];

    if (!asset) {
      drawPlaceholder(`Missing asset: ${frame.clip.mediaId}`);
      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const entry = getVideo(asset.id, asset.path);

    if (entry.error) {
      drawPlaceholder(entry.error);
      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const safeLocalTime = Math.max(0, Math.min(frame.localTime, Math.max(0, asset.duration - 0.02)));

    if (Number.isFinite(safeLocalTime)) {
      const drift = Math.abs(entry.video.currentTime - safeLocalTime);

      if (drift > 0.06) {
        try {
          entry.video.currentTime = safeLocalTime;
        } catch (error) {
          console.error("[WebPlayer] video seek failed", {
            error,
            mediaId: asset.id,
            safeLocalTime,
          });
        }
      }
    }

    const layers = runLayeredEffects(frame.clip.effects, {
      time: timelineTime,
      localTime: frame.localTime,
      duration: frame.clip.duration,
      ctx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      beatEngine,
    });

    layers.runBackground();

    drawVideoFrame(entry.video, frame.clip.transforms.crop?.[0]);

    layers.runForeground();

    ctx.restore();

    animationFrameId = requestAnimationFrame(render);
  }

  return {
    async load(): Promise<{ success: boolean; error?: { code: string; message: string } }> {
      try {
        if (disposed) {
          return {
            success: false,
            error: {
              code: "PLAYER_DISPOSED",
              message: "Player has been disposed",
            },
          };
        }

        if (!audioEngine) {
          return {
            success: true,
          };
        }

        const result = await audioEngine.load();

        if (!result.success) {
          return {
            success: false,
            error: result.error,
          };
        }

        return {
          success: true,
        };
      } catch (error) {
        console.error("[WebPlayer] load failed", { error });

        return {
          success: false,
          error: {
            code: "PLAYER_LOAD_FAILED",
            message: "Failed to load player",
          },
        };
      }
    },

    async play(): Promise<{ success: boolean; error?: { code: string; message: string } }> {
      try {
        if (disposed) {
          return {
            success: false,
            error: {
              code: "PLAYER_DISPOSED",
              message: "Player has been disposed",
            },
          };
        }

        if (playing) {
          return {
            success: true,
          };
        }

        if (audioEngine) {
          const result = await audioEngine.play();

          if (!result.success) {
            return {
              success: false,
              error: result.error,
            };
          }
        }

        playing = true;
        lastFrameTimestamp = performance.now();

        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }

        animationFrameId = requestAnimationFrame(render);

        return {
          success: true,
        };
      } catch (error) {
        console.error("[WebPlayer] play failed", { error });

        return {
          success: false,
          error: {
            code: "PLAYER_PLAY_FAILED",
            message: "Failed to play timeline",
          },
        };
      }
    },

    pause(): { success: boolean; error?: { code: string; message: string } } {
      try {
        playing = false;

        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }

        if (audioEngine) {
          const result = audioEngine.pause();

          if (!result.success) {
            return {
              success: false,
              error: result.error,
            };
          }
        }

        manualTime = getCurrentTime();

        return {
          success: true,
        };
      } catch (error) {
        console.error("[WebPlayer] pause failed", { error });

        return {
          success: false,
          error: {
            code: "PLAYER_PAUSE_FAILED",
            message: "Failed to pause timeline",
          },
        };
      }
    },

    seek(time: number): { success: boolean; error?: { code: string; message: string } } {
      try {
        const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
        manualTime = safeTime;

        if (audioEngine) {
          const result = audioEngine.seek(safeTime);

          if (!result.success) {
            return {
              success: false,
              error: result.error,
            };
          }
        }

        return {
          success: true,
        };
      } catch (error) {
        console.error("[WebPlayer] seek failed", { error, time });

        return {
          success: false,
          error: {
            code: "PLAYER_SEEK_FAILED",
            message: "Failed to seek timeline",
          },
        };
      }
    },

    dispose(): { success: boolean; error?: { code: string; message: string } } {
      try {
        disposed = true;
        playing = false;

        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }

        for (const entry of videos.values()) {
          entry.video.pause();
          entry.video.removeAttribute("src");
          entry.video.load();
        }

        videos.clear();

        if (audioEngine) {
          const result = audioEngine.dispose();

          if (!result.success) {
            return {
              success: false,
              error: result.error,
            };
          }
        }

        return {
          success: true,
        };
      } catch (error) {
        console.error("[WebPlayer] dispose failed", { error });

        return {
          success: false,
          error: {
            code: "PLAYER_DISPOSE_FAILED",
            message: "Failed to dispose player",
          },
        };
      }
    },

    getCurrentTime(): number {
      return getCurrentTime();
    },
  };
}
