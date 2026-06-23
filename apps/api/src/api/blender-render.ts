import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { executeNativeBlenderRender } from "@monet/render-adapters";

interface BlenderRenderRequest {
  assetId?: string;
  sourceVideoPath?: string;
  startFrame?: number;
  endFrame?: number;
  width?: number;
  height?: number;
  fps?: number;
}

export async function registerBlenderRenderRoute(app: FastifyInstance): Promise<void> {
  app.post("/api/render/blender", async (req, res) => {
    try {
      const body = req.body as BlenderRenderRequest;
      
      let sourceVideoPath = body.sourceVideoPath;
      const assetId = body.assetId || `blender_${Date.now()}`;

      // 1. Establish Asset Pre-Flight Routing
      if (!sourceVideoPath && body.assetId) {
        // Try to find the asset in the uploads directory
        const UPLOAD_DIR = path.resolve(process.cwd(), "storage/uploads");
        const files = fs.readdirSync(UPLOAD_DIR);
        const foundFile = files.find(f => f.startsWith(body.assetId!));
        if (foundFile) {
          sourceVideoPath = path.join(UPLOAD_DIR, foundFile);
        }
      }

      if (!sourceVideoPath) {
        return res.status(400).send({
          success: false,
          error: {
            code: "SOURCE_REQUIRED",
            message: "sourceVideoPath or a valid assetId is required"
          }
        });
      }

      if (!path.isAbsolute(sourceVideoPath)) {
        sourceVideoPath = path.resolve(process.cwd(), sourceVideoPath);
      }

      const payload = {
        assetId,
        sourceVideoPath,
        startFrame: body.startFrame ?? 1,
        endFrame: body.endFrame ?? 30,
        width: body.width ?? 1280,
        height: body.height ?? 720,
        fps: body.fps ?? 30
      };

      req.log.info({ payload }, "Starting native Blender render");

      // 2, 3, 4 are handled by the adapter
      const result = await executeNativeBlenderRender(payload);

      if (result.success) {
        return res.send({
          success: true,
          data: {
            outputPath: result.outputPath,
            url: result.outputPath ? `/uploads/${path.basename(result.outputPath)}` : null
          }
        });
      } else {
        return res.status(500).send({
          success: false,
          error: {
            code: "RENDER_FAILED",
            message: result.error,
            details: result.stdout
          }
        });
      }
    } catch (error: any) {
      req.log.error({ error }, "Blender render route failed");
      return res.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message
        }
      });
    }
  });
}
