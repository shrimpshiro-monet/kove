import { ProjectEDL as MonetEDL } from "./schemas";
import { normalizeEDL } from "./normalizers";

export function createBaseEDL(mediaIds: string[]): MonetEDL {
  const now = Date.now();

  const edl: MonetEDL = {
    version: 1,
    id: `edl-${now}`,

    meta: {
      createdAt: now,
      updatedAt: now,
      aspectRatio: "16:9",
      fps: 30,
      sampleRate: 48000,
    },

    assets: {
      media: {},
      audio: {},
      overlays: {},
    },

    timeline: {
      duration: 0,
      markers: [],
      tracks: [
        {
          id: "video-main",
          type: "video",
          order: 0,
          locked: false,
          hidden: false,
          clips: mediaIds.map((id, index) => ({
            id: `clip-${index}`,
            mediaId: id,

            startTime: index * 5,
            duration: 5,

            inPoint: 0,
            outPoint: 5,
            speed: 1,

            transforms: {
              position: [{ time: 0, x: 0, y: 0 }],
              scale: [{ time: 0, value: 1 }],
              rotation: [{ time: 0, value: 0 }],
            },

            audio: {
              gain: 1,
            },

            effects: [],
          })),
        },
      ],
    },
  };

  return normalizeEDL(edl);
}