/**
 * ImpactZoomComposition — React/Remotion component
 * Applies scale pop on beat drops with exponential decay.
 *
 * Usage in Remotion:
 * <ImpactZoomComposition currentFrame={frame} beatFrame={30}>
 *   <YourClip />
 * </ImpactZoomComposition>
 */

import React from "react";

interface ZoomProps {
  currentFrame: number;
  beatFrame: number;
  peakIntensity?: number;
  decayRate?: number;
  baseScale?: number;
  children: React.ReactNode;
}

export const ImpactZoomComposition: React.FC<ZoomProps> = ({
  currentFrame,
  beatFrame,
  peakIntensity = 0.12,
  decayRate = 0.3,
  baseScale = 1.05,
  children,
}) => {
  let scale = baseScale;

  if (currentFrame >= beatFrame) {
    const elapsed = currentFrame - beatFrame;

    // Rapidly peaks on target frame, then exponentially decays
    if (elapsed < 12) {
      const decay = Math.exp(-decayRate * elapsed);
      scale = baseScale + peakIntensity * decay;
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};

/**
 * Multi-beat impact zoom — applies zoom on multiple beat frames.
 */
interface MultiBeatZoomProps {
  currentFrame: number;
  beatFrames: number[];
  peakIntensity?: number;
  decayRate?: number;
  baseScale?: number;
  children: React.ReactNode;
}

export const MultiBeatZoom: React.FC<MultiBeatZoomProps> = ({
  currentFrame,
  beatFrames,
  peakIntensity = 0.12,
  decayRate = 0.3,
  baseScale = 1.05,
  children,
}) => {
  let scale = baseScale;

  for (const beatFrame of beatFrames) {
    if (currentFrame >= beatFrame) {
      const elapsed = currentFrame - beatFrame;
      if (elapsed < 12) {
        const decay = Math.exp(-decayRate * elapsed);
        scale = Math.max(scale, baseScale + peakIntensity * decay);
      }
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};
