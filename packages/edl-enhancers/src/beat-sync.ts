import { MonetEDL } from "@monet/edl/src/schemas";

export function applyBeatCuts(
  edl: MonetEDL,
  beats: number[]
): MonetEDL {
  if (!beats.length) return edl;

  const videoTrack = edl.timeline.tracks.find(
    (t) => t.type === "video"
  );

  if (!videoTrack) return edl;

  const newClips = [];

  let index = 0;

  for (const beatTime of beats) {
    const clip = videoTrack.clips[index % videoTrack.clips.length];

    newClips.push({
      ...clip,
      id: `${clip.id}-beat-${index}`,
      startTime: beatTime,
      duration: 0.4,
    });

    index++;
  }

  videoTrack.clips = newClips;

  return edl;
}