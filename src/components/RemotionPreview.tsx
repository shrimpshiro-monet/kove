import React from "react";
import { Player } from "@remotion/player";
import { MonetPreview } from "../remotion/MonetPreview";
import type { MonetEDL } from "../server/types/edl";

interface RemotionPreviewProps {
  edl: MonetEDL;
  mediaUrls: Record<string, string>;
  width?: number;
  height?: number;
}

function getShotEndTime(shot: MonetEDL["shots"][number]): number {
  return shot.timing.startTime + shot.timing.duration;
}

export const RemotionPreview: React.FC<RemotionPreviewProps> = ({
  edl,
  mediaUrls,
  width = 1280,
  height = 720,
}) => {
  const shotDuration = edl.shots.length > 0
    ? Math.max(...edl.shots.map(getShotEndTime))
    : 0;

  const durationInSeconds = Math.max(edl.timeline.duration ?? 0, shotDuration, 0);
  const durationInFrames = Math.max(1, Math.ceil(durationInSeconds * 30));

  if (edl.shots.length === 0) {
    return <div>No shots in EDL</div>;
  }

  return (
    <div className="remotion-player-container shadow-2xl rounded-lg overflow-hidden border border-gray-800">
      <Player
        component={MonetPreview}
        inputProps={{ edl, mediaUrls }}
        durationInFrames={durationInFrames}
        fps={30}
        compositionWidth={width}
        compositionHeight={height}
        style={{
          width: "100%",
          aspectRatio: `${width} / ${height}`,
        }}
        controls
        loop
      />
    </div>
  );
};
