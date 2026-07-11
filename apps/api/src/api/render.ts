import type { FastifyInstance } from "fastify";
import { enqueueJob } from "../services/queue";
import type { ProjectEDL as MonetEDL } from "@monet/edl/src/schemas";

interface RenderBody {
  edl?: unknown;
  outputPath?: unknown;
  mode?: unknown;
  width?: unknown;
  height?: unknown;
  fps?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMonetEDL(value: unknown): value is MonetEDL {
  if (!isRecord(value)) {
    return false;
  }

  return value.version === 1 && isRecord(value.timeline);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function registerRenderRoutes(app: FastifyInstance): Promise<void> {
  app.post("/render", async (req, res) => {
    try {
      if (!isRecord(req.body)) {
        return res.status(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "Body must be an object"
          }
        });
      }

      const body = req.body as RenderBody;

      if (!isMonetEDL(body.edl)) {
        return res.status(400).send({
          success: false,
          error: {
            code: "INVALID_EDL",
            message: "A valid MonetEDL version 1 is required"
          }
        });
      }

      const mode = body.mode === "final" ? "final" : "preview";
      const queueName = mode === "final" ? "render.final" : "render.preview";

      const job = await enqueueJob(queueName, {
        edl: body.edl,
        outputPath:
          typeof body.outputPath === "string" && body.outputPath.trim().length > 0
            ? body.outputPath
            : "",
        width: optionalNumber(body.width),
        height: optionalNumber(body.height),
        fps: optionalNumber(body.fps)
      });

      return res.send({
        success: true,
        data: {
          jobId: job.id,
          queue: queueName
        }
      });
    } catch (error) {
      req.log.error({ error }, "render enqueue failed");

      return res.status(500).send({
        success: false,
        error: {
          code: "RENDER_ENQUEUE_FAILED",
          message: "Failed to enqueue render job"
        }
      });
    }
  });
}