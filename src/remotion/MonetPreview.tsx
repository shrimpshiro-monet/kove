import React from "react";
import {
  AbsoluteFill,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import type { MonetEDL, Shot, Keyframe } from "../server/types/edl";

interface MonetPreviewProps {
  edl: MonetEDL;
  mediaUrls: Record<string, string>;
}

const EasingMap = {
  linear: Easing.linear,
  "ease-in": Easing.in(Easing.quad),
  "ease-out": Easing.out(Easing.quad),
  "ease-in-out": Easing.inOut(Easing.quad),
  bezier: Easing.bezier(0.42, 0, 0.58, 1),
  elastic: Easing.elastic(1),
  bounce: Easing.bounce,
};

function getShotStart(shot: Shot): number {
  return shot.timing.startTime;
}

function getShotEnd(shot: Shot): number {
  return shot.timing.startTime + shot.timing.duration;
}

export const MonetPreview: React.FC<MonetPreviewProps> = ({ edl, mediaUrls }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {[...edl.shots]
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
        .map((shot) => (
          <ShotLayer
            key={shot.id}
            shot={shot}
            currentTime={currentTime}
            url={mediaUrls[shot.source.clipId]}
          />
        ))}
    </AbsoluteFill>
  );
};

const ShotLayer: React.FC<{
  shot: Shot;
  currentTime: number;
  url?: string;
}> = ({ shot, currentTime, url }) => {
  const shotStart = getShotStart(shot);
  const shotEnd = getShotEnd(shot);
  const isVisible = currentTime >= shotStart && currentTime <= shotEnd;

  if (!isVisible || !url) return null;

  const shotTime = currentTime - shotStart;

  const scale = interpolateKeyframes(shot.transform?.scale, shotTime, 1);
  const rotation = interpolateKeyframes(shot.transform?.rotation, shotTime, 0);
  const opacity = interpolateKeyframes(shot.transform?.opacity, shotTime, 1);
  const position = interpolateKeyframesXY(shot.transform?.position, shotTime, { x: 0, y: 0 });

  const style: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    transform: `translate(${position.x * 100}%, ${position.y * 100}%) scale(${scale}) rotate(${rotation}deg)`,
    opacity,
    mixBlendMode: (shot.compositing?.blendMode as React.CSSProperties["mixBlendMode"]) || "normal",
    filter: renderEffects(shot.effects, shotTime),
  };

  return (
    <AbsoluteFill style={style}>
      <Video
        src={url}
        startFrom={Math.max(0, Math.ceil(shot.source.inPoint * 30))}
        endAt={Math.max(0, Math.ceil(shot.source.outPoint * 30))}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted
      />
    </AbsoluteFill>
  );
};

function interpolateKeyframes<T extends number>(
  keyframeable: unknown,
  time: number,
  defaultValue: T
): number {
  if (keyframeable === undefined || keyframeable === null) return defaultValue;
  if (typeof keyframeable === "number" && Number.isFinite(keyframeable)) return keyframeable;
  if (!Array.isArray(keyframeable)) return defaultValue;

  const keyframes = (keyframeable as Keyframe<number>[])
    .filter((k) => typeof k.time === "number" && typeof k.value === "number")
    .sort((a, b) => a.time - b.time);

  if (keyframes.length === 0) return defaultValue;
  if (keyframes.length === 1) return keyframes[0].value;

  const nextIdx = keyframes.findIndex((k) => k.time > time);
  if (nextIdx === -1) return keyframes[keyframes.length - 1].value;
  if (nextIdx === 0) return keyframes[0].value;

  const prev = keyframes[nextIdx - 1];
  const next = keyframes[nextIdx];

  const easing = EasingMap[(next.easing as keyof typeof EasingMap) || "linear"] || Easing.linear;

  return interpolate(time, [prev.time, next.time], [prev.value, next.value], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function interpolateKeyframesXY(
  keyframeable: unknown,
  time: number,
  defaultValue: { x: number; y: number }
): { x: number; y: number } {
  if (!keyframeable) return defaultValue;

  if (typeof keyframeable === "object" && !Array.isArray(keyframeable)) {
    const point = keyframeable as { x?: unknown; y?: unknown };
    if (typeof point.x === "number" && typeof point.y === "number") {
      return { x: point.x, y: point.y };
    }
  }

  if (!Array.isArray(keyframeable)) return defaultValue;

  const keyframes = keyframeable as Keyframe<{ x: number; y: number }>[];
  if (keyframes.length === 0) return defaultValue;

  const xVal = interpolateKeyframes(
    keyframes.map((k) => ({ ...k, value: k.value.x })),
    time,
    defaultValue.x
  );

  const yVal = interpolateKeyframes(
    keyframes.map((k) => ({ ...k, value: k.value.y })),
    time,
    defaultValue.y
  );

  return { x: xVal, y: yVal };
}

function renderEffects(effects: Shot["effects"] | undefined, time: number): string {
  if (!effects || effects.length === 0) return "";

  return effects
    .filter((effect) => {
      const start = effect.startTime ?? 0;
      const duration = effect.duration ?? Number.POSITIVE_INFINITY;
      return time >= start && time <= start + duration;
    })
    .map((effect) => {
      const intensity = effect.intensity ?? 0;
      switch (effect.type) {
        case "blur":
          return `blur(${intensity * 20}px)`;
        case "brightness":
          return `brightness(${1 + intensity})`;
        case "contrast":
          return `contrast(${1 + intensity})`;
        case "saturation":
          return `saturate(${1 + intensity})`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}
