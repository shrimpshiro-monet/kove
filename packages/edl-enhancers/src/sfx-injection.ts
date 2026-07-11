import { ProjectEDL as MonetEDL } from "@monet/edl/src/schemas";

export function injectSFX(edl: MonetEDL) {
  const audioTrack = edl.timeline.tracks.find(
    (t) => t.type === "audio"
  );

  if (!audioTrack) return;

  for (const clip of edl.timeline.tracks[0].clips) {
    audioTrack.clips.push({
      id: `sfx-${clip.id}`,
      mediaId: "impact-hit",

      startTime: clip.startTime,
      duration: 0.5,

      inPoint: 0,
      outPoint: 0.5,
      speed: 1,

      transforms: {
        position: [],
        scale: [],
        rotation: [],
      },

      audio: {
        gain: 1,
      },

      effects: [],
    });
  }
}