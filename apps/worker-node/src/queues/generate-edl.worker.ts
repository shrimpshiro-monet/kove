import { createWorker } from "../../../api/src/services/queue";

createWorker("generate.edl", async (job) => {
  console.log("[generate.edl] Job received", job.data);

  const { mediaIds } = job.data;

  // ✅ Minimal valid EDL skeleton
  const edl = {
    version: 1,
    timeline: {
      tracks: [
        {
          id: "video-1",
          type: "video",
          clips: mediaIds.map((id, i) => ({
            id: `clip-${i}`,
            mediaId: id,
            startTime: i * 5,
            duration: 5,
            inPoint: 0,
            outPoint: 5,
            speed: 1,
          })),
        },
      ],
    },
  };

  console.log("[generate.edl] Generated EDL", edl);

  // In next step → store to Redis / DB / pass to enhance
});