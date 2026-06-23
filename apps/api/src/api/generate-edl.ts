import { enqueueJob } from "../services/queue";
import { FastifyInstance } from "fastify";

export async function registerGenerateEDLRoute(app: FastifyInstance) {
  app.post("/generate-edl", async (req, res) => {
    try {
      const body = req.body as {
        projectId?: string;
        mediaIds?: string[];
        prompt?: string;
      };

      if (!body?.mediaIds || body.mediaIds.length === 0) {
        return res.status(400).send({
          success: false,
          error: { code: "INVALID_INPUT", message: "mediaIds required" },
        });
      }

      const job = await enqueueJob("generate.edl", {
        projectId: body.projectId ?? "unknown",
        mediaIds: body.mediaIds,
        prompt: body.prompt,
      });

      return res.send({
        success: true,
        jobId: job.id,
      });
    } catch (error) {
      console.error("[generate-edl] error", error);

      return res.status(500).send({
        success: false,
        error: { code: "INTERNAL", message: "Failed to enqueue EDL job" },
      });
    }
  });
}