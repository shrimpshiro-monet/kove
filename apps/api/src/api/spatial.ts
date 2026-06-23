import type { FastifyInstance } from "fastify";
import {
  estimateDepthWithPython,
  segmentSubjectWithPython,
  trackPointsWithPython,
} from "../services/python-spatial-workers";

interface SpatialAnalyzeBody {
  filePath?: unknown;
  clipId?: unknown;
  mediaId?: unknown;
  includeMask?: unknown;
  includeDepth?: unknown;
  includePointTracking?: unknown;
  outputDir?: unknown;
  commercialTrackingVerified?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function registerSpatialRoutes(app: FastifyInstance): Promise<void> {
  app.post("/spatial/analyze", async (req, res) => {
    try {
      if (!isRecord(req.body)) {
        return res.status(400).send({
          success: false,
          error: { code: "INVALID_BODY", message: "Body must be an object" },
        });
      }

      const body = req.body as SpatialAnalyzeBody;
      const filePath = stringField(body.filePath);
      const clipId = stringField(body.clipId);
      const mediaId = stringField(body.mediaId);
      const outputDir = stringField(body.outputDir) ?? ".monet-artifacts/spatial";

      if (!filePath || !clipId || !mediaId) {
        return res.status(400).send({
          success: false,
          error: {
            code: "SPATIAL_FIELDS_REQUIRED",
            message: "filePath, clipId, and mediaId are required",
          },
        });
      }

      const includeMask = booleanField(body.includeMask, true);
      const includeDepth = booleanField(body.includeDepth, true);
      const includePointTracking = booleanField(body.includePointTracking, false);
      const commercialTrackingVerified = booleanField(body.commercialTrackingVerified, false);

      const result: {
        mask?: unknown;
        depth?: unknown;
        pointTracks?: unknown;
      } = {};

      if (includeMask) {
        const maskResult = await segmentSubjectWithPython({
          filePath,
          clipId,
          mediaId,
          outputDir,
        });

        if (!maskResult.success) {
          return res.status(502).send(maskResult);
        }

        result.mask = maskResult.data;
      }

      if (includeDepth) {
        const depthResult = await estimateDepthWithPython({
          filePath,
          clipId,
          mediaId,
          outputDir,
          encoder: "vits",
        });

        if (!depthResult.success) {
          return res.status(502).send(depthResult);
        }

        result.depth = depthResult.data;
      }

      if (includePointTracking) {
        const pointResult = await trackPointsWithPython({
          filePath,
          clipId,
          mediaId,
          outputDir,
          commercialVerified: commercialTrackingVerified,
        });

        if (!pointResult.success) {
          return res.status(502).send(pointResult);
        }

        result.pointTracks = pointResult.data;
      }

      return res.send({
        success: true,
        data: result,
      });
    } catch (error) {
      req.log.error({ error }, "spatial analyze failed");

      return res.status(500).send({
        success: false,
        error: {
          code: "SPATIAL_ANALYZE_FAILED",
          message: "Failed to analyze spatial assets",
        },
      });
    }
  });
}
