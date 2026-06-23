import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { processVibeEngine, type VibeTimeline } from "@monet/render-adapters";

interface VibeRenderRequest {
  projectId: string;
  engineTarget: "freecut" | "mlt" | "blender";
  settings: {
    width: number;
    height: number;
    fps: number;
  };
  tracks: {
    id: string;
    type: "video" | "audio";
    assetId: string; // Resolvable to a file in storage/uploads
    startFrame: number;
    endFrame: number;
    speed?: number;
  }[];
}

export async function registerVibeRenderRoute(app: FastifyInstance): Promise<void> {
  app.post("/api/render/vibe", async (req, res) => {
    try {
      const body = req.body as VibeRenderRequest;
      const UPLOAD_DIR = path.resolve(process.cwd(), "storage/uploads");

      // 1. Establish Asset Pre-Flight Routing
      const resolvedTracks = body.tracks.map(track => {
        const files = fs.readdirSync(UPLOAD_DIR);
        const foundFile = files.find(f => f.startsWith(track.assetId));
        
        if (!foundFile) {
          throw new Error(`Asset not found: ${track.assetId}`);
        }

        return {
          ...track,
          source: path.join(UPLOAD_DIR, foundFile)
        };
      });

      const timeline: VibeTimeline = {
        projectId: body.projectId,
        engineTarget: body.engineTarget,
        settings: body.settings,
        tracks: resolvedTracks
      };

      req.log.info({ 
        projectId: timeline.projectId, 
        engine: timeline.engineTarget,
        trackCount: timeline.tracks.length 
      }, "Starting Vibe Multi-Engine Render");

      const result = await processVibeEngine(timeline);

      if (result.success && result.data) {
        return res.send({
          success: true,
          data: {
            outputPath: result.data.outputPath,
            url: `/uploads/${path.basename(result.data.outputPath)}`,
            duration: result.data.duration,
            engine: timeline.engineTarget
          }
        });
      } else {
        return res.status(500).send({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      req.log.error({ error }, "Vibe render route failed");
      return res.status(500).send({
        success: false,
        error: {
          code: "VIBE_RENDER_FAILED",
          message: error.message
        }
      });
    }
  });
}
