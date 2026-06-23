import type { FastifyInstance } from "fastify";
import { getQueue } from "../services/queue";

interface RouteParams {
  jobId: string;
}

export async function registerRenderStatusRoute(app: FastifyInstance): Promise<void> {
  app.get("/render-status/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params as RouteParams;

      if (!jobId || typeof jobId !== "string") {
        return res.status(400).send({
          success: false,
          error: {
            code: "INVALID_JOB_ID",
            message: "jobId is required"
          }
        });
      }

      const previewQueue = getQueue("render.preview");
      const finalQueue = getQueue("render.final");

      const job =
        (await previewQueue.getJob(jobId)) ??
        (await finalQueue.getJob(jobId));

      if (!job) {
        return res.status(404).send({
          success: false,
          error: {
            code: "JOB_NOT_FOUND",
            message: `No job found for id ${jobId}`
          }
        });
      }

      const state = await job.getState();
      const progress = job.progress ?? 0;

      return res.send({
        success: true,
        data: {
          jobId,
          state,
          progress,
          returnvalue: job.returnvalue ?? null,
          failedReason: job.failedReason ?? null
        }
      });
    } catch (error) {
      req.log.error({ error }, "render-status failed");

      return res.status(500).send({
        success: false,
        error: {
          code: "RENDER_STATUS_FAILED",
          message: "Failed to fetch render status"
        }
      });
    }
  });
}
