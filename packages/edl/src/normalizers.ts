import { ProjectEDL as MonetEDL, Track, Clip } from "./schemas";

export function normalizeEDL(edl: MonetEDL): MonetEDL {
  let maxDuration = 0;

  edl.timeline.tracks.forEach((track: Track) => {
    track.clips.forEach((clip: Clip) => {
      const end = clip.startTime + clip.duration;
      if (end > maxDuration) maxDuration = end;
    });
  });

  edl.timeline.duration = maxDuration;

  return edl;
}