import type { ProjectEDL as MonetEDL } from "@monet/edl";
import { createAudioTimelineEngine } from "./audio/audio-timeline-engine";
import type { AudioTimelineEngine } from "./audio/audio-types";
import { createBeatEngine } from "./audio/beat-engine";
import { runLayeredEffects } from "./effects/layered-effect-runner";
import { resolveFrame } from "./timeline-resolver";
import { resolveClipKeyframes } from "./keyframes/clip-keyframes";
import { getCropForFrame, ensureTrack } from "./reframe/reframe-applier";

export interface PlayerControls {
  load(): Promise<{ success: boolean; error?: any }>;
  play(): Promise<{ success: boolean; error?: any }>;
  pause(): { success: boolean };
  stop(): { success: boolean };
  seek(time: number): { success: boolean };
  setSpeed(speed: number): { success: boolean };
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  dispose(): { success: boolean };
  onTimeUpdate(cb: (t: number) => void): () => void;
}

interface VideoEntry {
  video: HTMLVideoElement;
  ready: boolean;
  error: string | null;
  tainted: boolean;
}

const FPS_CAP = 60;
const MIN_FRAME_MS = 1000 / FPS_CAP;
const SEEK_DRIFT_THRESHOLD = 0.25;

function createVideoElement(src: string): VideoEntry {
  const video = document.createElement("video");
  video.src = src;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const entry: VideoEntry = { video, ready: false, error: null, tainted: false };
  video.addEventListener("loadedmetadata", () => { entry.ready = true; });
  video.addEventListener("error", () => { entry.error = `Failed to load: ${src}`; });
  video.load();
  return entry;
}

export function createWebPlayer(canvas: HTMLCanvasElement, edl: MonetEDL): PlayerControls {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const videos = new Map<string, VideoEntry>();
  const audioEngineResult = createAudioTimelineEngine({ edl });
  const audioEngine: AudioTimelineEngine | null = audioEngineResult.success
    ? audioEngineResult.data ?? null
    : null;
  const beatEngine = createBeatEngine(edl);

  let playing = false;
  let disposed = false;
  let manualTime = 0;
  let speed = 1;
  let lastFrameTimestamp = 0;
  let lastRenderMs = 0;
  let animationFrameId: number | null = null;
  let currentClipId: string | null = null;
  let lastCropResult: { key: string; crop: { x: number; y: number; width: number; height: number } | null } | null = null;

  const timeListeners = new Set<(t: number) => void>();

  function readCurrentTime(): number {
    if (audioEngine) return audioEngine.getTimelineTime();
    return manualTime;
  }

  function getVideo(mediaId: string, src: string): VideoEntry {
    const existing = videos.get(mediaId);
    if (existing) return existing;
    const created = createVideoElement(src);
    videos.set(mediaId, created);
    return created;
  }

  function pruneVideos() {
    const referenced = new Set<string>();
    for (const track of edl.timeline.tracks) {
      if (track.type !== "video") continue;
      for (const clip of track.clips) referenced.add(clip.mediaId ?? (clip as any).assetId);
    }
    for (const [id, entry] of videos) {
      if (!referenced.has(id)) {
        try {
          entry.video.pause();
          entry.video.removeAttribute("src");
          entry.video.load();
        } catch { /* Video may already be disposed */ }
        videos.delete(id);
      }
    }
  }

  function detectTaint(entry: VideoEntry): boolean {
    if (entry.tainted) return true;
    try {
      ctx.getImageData(0, 0, 1, 1);
      return false;
    } catch {
      entry.tainted = true;
      return true;
    }
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
      drawPlaceholder("Loading…");
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
    if (!playing || disposed) return;
    animationFrameId = requestAnimationFrame(render);

    if (timestamp - lastRenderMs < MIN_FRAME_MS) return;
    lastRenderMs = timestamp;

    if (!audioEngine) {
      const delta = lastFrameTimestamp === 0 ? 0 : (timestamp - lastFrameTimestamp) / 1000;
      manualTime += delta * speed;
    }
    lastFrameTimestamp = timestamp;

    const timelineTime = readCurrentTime();
    timeListeners.forEach((cb) => cb(timelineTime));

    const frame = resolveFrame(edl, timelineTime);
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!frame) {
      drawPlaceholder("No active clip");
      ctx.restore();
      currentClipId = null;
      return;
    }

    const asset = edl.assets.media[frame.clip.mediaId] ?? edl.assets.media[(frame.clip as any).assetId];
    if (!asset) {
      drawPlaceholder(`Missing asset: ${frame.clip.mediaId ?? (frame.clip as any).assetId}`);
      ctx.restore();
      return;
    }
    const assetPath = asset.path ?? (asset as any).src ?? "";
    const entry = getVideo(asset.id, assetPath);
    if (entry.error) {
      drawPlaceholder(entry.error);
      ctx.restore();
      return;
    }

    const clipChanged = currentClipId !== frame.clip.id;
    currentClipId = frame.clip.id;

    const safeLocalTime = Math.max(
      0,
      Math.min(frame.localTime, Math.max(0, asset.duration - 0.02))
    );
    if (Number.isFinite(safeLocalTime)) {
      const drift = Math.abs(entry.video.currentTime - safeLocalTime);
      const shouldSeek = clipChanged || drift > SEEK_DRIFT_THRESHOLD;
      if (shouldSeek) {
        try {
          entry.video.currentTime = safeLocalTime;
        } catch (error) {
          console.error("[WebPlayer] seek failed", { error, id: asset.id });
        }
      }
      if (playing && entry.video.paused && entry.ready) {
        entry.video.playbackRate = clipProps.playbackSpeed * speed;
        entry.video.play().catch(() => {});
      } else if (entry.ready) {
        entry.video.playbackRate = clipProps.playbackSpeed * speed;
      }
    }

    const layers = runLayeredEffects(frame.clip.effects ?? [], {
      time: timelineTime,
      localTime: frame.localTime,
      duration: frame.clip.duration,
      ctx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      beatEngine,
    });
    layers.runBackground();

    // Resolve clip-level keyframes (push_in, pull_out, shake, color_pulse, etc.)
    const clipProps = resolveClipKeyframes(frame.clip, frame.localTime);

    ctx.save();

    // Apply transform keyframes
    if (clipProps.scaleX !== 1 || clipProps.scaleY !== 1 || clipProps.x !== 0 || clipProps.y !== 0 || clipProps.rotation !== 0) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((clipProps.rotation * Math.PI) / 180);
      ctx.scale(clipProps.scaleX, clipProps.scaleY);
      ctx.translate(clipProps.x, clipProps.y);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }

    // Apply opacity
    if (clipProps.opacity < 1) {
      ctx.globalAlpha = clipProps.opacity;
    }

    // Apply color saturation/brightness via CSS filter
    if (clipProps.saturation !== 1 || clipProps.brightness !== 0) {
      const satStr = `saturate(${clipProps.saturation})`;
      const brightStr = clipProps.brightness !== 0 ? ` brightness(${1 + clipProps.brightness})` : "";
      ctx.filter = `${satStr}${brightStr}`;
    }

    // Subject-tracked reframe
    let reframeCrop: { x: number; y: number; width: number; height: number } | undefined;
    const reframeParams = (frame.clip as any).reframe;
    if (reframeParams) {
      const cropKey = `${frame.clip.id}:${frame.localTime.toFixed(3)}`;
      if (lastCropResult?.key === cropKey) {
        reframeCrop = lastCropResult.crop ?? undefined;
      } else {
        getCropForFrame(
          (frame.clip as any).sourceAssetId ?? frame.clip.id,
          reframeParams.targetRatio,
          frame.localTime,
          reframeParams.lockedTrackId,
        ).then((crop) => {
          lastCropResult = { key: cropKey, crop };
        }).catch(() => {
          lastCropResult = { key: cropKey, crop: null };
        });
      }
    }

    if (reframeCrop) {
      drawVideoFrame(entry.video, reframeCrop);
    } else {
      drawVideoFrame(entry.video, frame.clip.transforms?.crop?.[0]);
    }

    // Apply vignette
    if (clipProps.vignetteAmount > 0) {
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${clipProps.vignetteAmount})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Apply chromatic aberration
    if (clipProps.chromaticAberration > 0) {
      const offset = clipProps.chromaticAberration;
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.3;
      ctx.drawImage(canvas, -offset, 0);
      ctx.drawImage(canvas, offset, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (detectTaint(entry)) {
      console.warn("[WebPlayer] canvas tainted — CORS missing on", asset.path);
    }
    layers.runForeground();
    ctx.restore();
  }

  return {
    async load() {
      pruneVideos();

      // Kick off subject-track analysis for clips with reframe params
      for (const track of edl.timeline.tracks) {
        for (const clip of track.clips) {
          const reframe = (clip as any).reframe;
          if (reframe && reframe.lockSubject !== "center") {
            const mediaId = (clip as any).sourceAssetId ?? clip.mediaId ?? (clip as any).assetId;
            const mediaAsset = edl.assets.media[mediaId];
            if (mediaAsset) {
              ensureTrack(mediaId, clip.id, mediaAsset.path ?? "", mediaAsset.duration).catch(() => {});
            }
          }
        }
      }

      return { success: true };
    },

    async play() {
      if (disposed) return { success: false, error: { code: "DISPOSED" } };
      playing = true;
      lastFrameTimestamp = 0;
      lastRenderMs = 0;
      if (audioEngine) await audioEngine.play();
      animationFrameId = requestAnimationFrame(render);
      return { success: true };
    },

    pause() {
      playing = false;
      if (audioEngine) audioEngine.pause();
      for (const e of videos.values()) e.video.pause();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return { success: true };
    },

    stop() {
      playing = false;
      manualTime = 0;
      if (audioEngine) {
        audioEngine.pause();
        audioEngine.seek(0);
      }
      for (const e of videos.values()) {
        e.video.pause();
        try { e.video.currentTime = 0; } catch { /* Video may not be ready */ }
      }
      currentClipId = null;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      drawPlaceholder("Stopped");
      return { success: true };
    },

    seek(time: number) {
      manualTime = Math.max(0, time);
      if (audioEngine) audioEngine.seek(time);
      if (!playing) {
        playing = true;
        animationFrameId = requestAnimationFrame((ts) => {
          render(ts);
          playing = false;
        });
      }
      return { success: true };
    },

    setSpeed(s: number) {
      speed = Math.max(0.1, Math.min(4, s));
      if (audioEngine) (audioEngine as any).setPlaybackRate?.(speed);
      return { success: true };
    },

    getCurrentTime: readCurrentTime,
    getDuration: () => edl.timeline.duration ?? 0,
    isPlaying: () => playing,

    dispose() {
      disposed = true;
      playing = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (audioEngine) audioEngine.dispose?.();
      for (const e of videos.values()) {
        try {
          e.video.pause();
          e.video.removeAttribute("src");
          e.video.load();
        } catch { /* Video may already be disposed */ }
      }
      videos.clear();
      timeListeners.clear();
      return { success: true };
    },

    onTimeUpdate(cb) {
      timeListeners.add(cb);
      return () => timeListeners.delete(cb);
    },
  };
}
