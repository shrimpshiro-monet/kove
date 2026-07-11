import React from "react";
import {
  AbsoluteFill,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Sequence,
  Audio,
} from "remotion";

interface Shot {
  id: string;
  source: { clipId: string; inPoint: number; outPoint: number };
  timing: { startTime: number; duration: number; speed?: number };
  effects?: Array<{
    type: string;
    startTime?: number;
    duration?: number;
    intensity?: number;
    params?: Record<string, unknown>;
  }>;
  transition?: { type: string; duration?: number };
  meta?: Record<string, unknown>;
}

interface MonetEDL {
  version: number | string;
  timeline: {
    duration: number;
    tracks: Array<{
      id: string;
      type: string;
      clips: Array<{
        id: string;
        mediaId: string;
        startTime: number;
        duration: number;
        inPoint: number;
        outPoint: number;
        speed?: number;
        effects?: Array<{
          id: string;
          type: string;
          start: number;
          duration: number;
          params?: Record<string, unknown>;
        }>;
      }>;
    }>;
  };
  assets: {
    media: Record<string, { id: string; path: string; duration: number }>;
  };
  shots?: Shot[];
}

const EasingMap: Record<string, (t: number) => number> = {
  linear: Easing.linear,
  "ease-in": Easing.in(Easing.quad),
  "ease-out": Easing.out(Easing.quad),
  "ease-in-out": Easing.inOut(Easing.quad),
};

function ShotLayer({
  clip,
  assetUrl,
  totalDuration,
}: {
  clip: MonetEDL["timeline"]["tracks"][0]["clips"][0];
  assetUrl: string;
  totalDuration: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const shotStart = clip.startTime;
  const shotEnd = clip.startTime + clip.duration;
  const isVisible = currentTime >= shotStart && currentTime < shotEnd;

  if (!isVisible || !assetUrl) return null;

  const shotTime = currentTime - shotStart;
  const inPoint = clip.inPoint ?? 0;

  // Compute CSS filter from effects
  const filters = (clip.effects ?? [])
    .filter((fx) => {
      const fxStart = fx.start ?? 0;
      const fxDuration = fx.duration ?? clip.duration;
      return shotTime >= fxStart && shotTime < fxStart + fxDuration;
    })
    .map((fx) => {
      const intensity = (fx.params?.intensity as number) ?? 0.5;
      switch (fx.type) {
        case "blur":
          return `blur(${intensity * 10}px)`;
        case "brightness":
        case "brightness_contrast":
          return `brightness(${1 + intensity * 0.5})`;
        case "contrast":
          return `contrast(${1 + intensity * 0.5})`;
        case "saturation":
        case "vibrance":
          return `saturate(${1 + intensity})`;
        case "sepia":
          return `sepia(${intensity})`;
        case "hue-rotate":
        case "hue_saturation":
          return `hue-rotate(${intensity * 360}deg)`;
        case "grayscale":
        case "noise_film":
          return `grayscale(${intensity})`;
        case "invert":
          return `invert(${intensity})`;
        case "glow":
        case "bloom_highlights":
          return `brightness(${1 + intensity * 0.3}) saturate(${1 + intensity * 0.5})`;
        case "glitch":
        case "lifestyle_glitch":
          return `hue-rotate(${Math.sin(shotTime * 20) * intensity * 90}deg) saturate(${1 + intensity})`;
        case "vignette_pro":
          return `brightness(${1 - intensity * 0.2})`;
        case "posterize_time":
          return `contrast(${1 + intensity * 0.3}) saturate(${1 + intensity * 0.5})`;
        case "chromatic_aberration":
        case "chromatic_burst":
          return `hue-rotate(${shotTime * 180}deg) saturate(${1 + intensity})`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ");

  // Compute transform from effects (zoom, shake)
  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  for (const fx of clip.effects ?? []) {
    const fxStart = fx.start ?? 0;
    const fxDuration = fx.duration ?? clip.duration;
    if (shotTime < fxStart || shotTime >= fxStart + fxDuration) continue;

    const progress = (shotTime - fxStart) / fxDuration;
    const intensity = (fx.params?.intensity as number) ?? 0.5;

    switch (fx.type) {
      case "zoom_in":
      case "zoom_pulse":
      case "push_in":
        scale = 1 + progress * intensity * 0.3;
        break;
      case "zoom_out":
      case "pull_out":
        scale = 1 + (1 - progress) * intensity * 0.3;
        break;
      case "shake":
      case "context_shake":
        translateX = Math.sin(shotTime * 30) * intensity * 5;
        translateY = Math.cos(shotTime * 25) * intensity * 5;
        break;
      case "flash_white":
      case "impact_hit":
        scale = 1 + Math.sin(progress * Math.PI) * intensity * 0.1;
        break;
    }
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          filter: filters || undefined,
        }}
      >
        <Video
          src={assetUrl}
          startFrom={Math.max(0, Math.ceil(inPoint * fps))}
          endAt={Math.max(0, Math.ceil((clip.outPoint ?? inPoint + clip.duration) * fps))}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </div>
    </AbsoluteFill>
  );
}

function TransitionOverlay({
  clip,
  nextClip,
  assetUrl,
  nextAssetUrl,
}: {
  clip: MonetEDL["timeline"]["tracks"][0]["clips"][0];
  nextClip?: MonetEDL["timeline"]["tracks"][0]["clips"][0];
  assetUrl: string;
  nextAssetUrl?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const transitionDuration = 0.3;
  const transitionStart = clip.startTime + clip.duration - transitionDuration;
  const transitionEnd = clip.startTime + clip.duration;

  if (currentTime < transitionStart || currentTime > transitionEnd) return null;
  if (!nextClip || !nextAssetUrl) return null;

  const progress = (currentTime - transitionStart) / transitionDuration;

  return (
    <AbsoluteFill style={{ opacity: progress }}>
      <Video
        src={nextAssetUrl}
        startFrom={Math.max(0, Math.ceil((nextClip.inPoint ?? 0) * fps))}
        endAt={Math.max(0, Math.ceil(((nextClip.outPoint ?? 0) + 1) * fps))}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted
      />
    </AbsoluteFill>
  );
}

export function RemotionPreviewInline({
  edl,
  mediaUrls,
  width = 1280,
  height = 720,
}: {
  edl: MonetEDL;
  mediaUrls: Record<string, string>;
  width?: number;
  height?: number;
}) {
  const clips = edl?.timeline?.tracks?.[0]?.clips ?? [];
  const totalDuration = edl?.timeline?.duration ?? 0;
  const fps = 30;

  if (clips.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black text-white/50">
        No clips in timeline
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black flex items-center justify-center">
      <div
        style={{
          width: "100%",
          maxWidth: `${width}px`,
          aspectRatio: `${width} / ${height}`,
          position: "relative",
        }}
      >
        {/* Black background */}
        <AbsoluteFill style={{ backgroundColor: "black" }} />

        {/* Render each clip as a Sequence */}
        {clips.map((clip, idx) => {
          const asset = edl.assets.media[clip.mediaId];
          const assetUrl = asset?.path ?? "";
          if (!assetUrl) return null;

          const startFrame = Math.max(0, Math.round(clip.startTime * fps));
          const durationFrames = Math.max(1, Math.round(clip.duration * fps));

          return (
            <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames}>
              <ShotLayer
                clip={clip}
                assetUrl={assetUrl}
                totalDuration={totalDuration}
              />
            </Sequence>
          );
        })}

        {/* Render crossfade transitions */}
        {clips.map((clip, idx) => {
          if (idx >= clips.length - 1) return null;
          const nextClip = clips[idx + 1];
          const asset = edl.assets.media[clip.mediaId];
          const nextAsset = edl.assets.media[nextClip.mediaId];
          if (!asset?.path || !nextAsset?.path) return null;

          const transitionDuration = 0.3;
          const transStart = clip.startTime + clip.duration - transitionDuration;
          const startFrame = Math.max(0, Math.round(transStart * fps));
          const durationFrames = Math.max(1, Math.round(transitionDuration * fps));

          return (
            <Sequence key={`trans-${clip.id}`} from={startFrame} durationInFrames={durationFrames}>
              <TransitionOverlay
                clip={clip}
                nextClip={nextClip}
                assetUrl={asset.path}
                nextAssetUrl={nextAsset.path}
              />
            </Sequence>
          );
        })}
      </div>
    </div>
  );
}
