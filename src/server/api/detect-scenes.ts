import type { Env } from "../types/env";
import { detectSceneChanges, extractSceneThumbnails } from "../lib/scene-detection";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export async function handleDetectScenes(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      fileId: string;
      threshold?: number;
    };

    const { fileId, threshold = 0.3 } = body;

    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const object = await env.MONET_MEDIA.get(fileId);
    if (!object) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const buffer = await object.arrayBuffer();
    const mimeType = object.httpMetadata?.contentType || "video/mp4";
    const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "detect-scenes-"));
    const tmpPath = path.join(tmpDir, `input${ext}`);

    try {
      await fs.writeFile(tmpPath, Buffer.from(buffer));

      const result = await detectSceneChanges(tmpPath, threshold);

      const segments: Array<{
        index: number;
        startTime: number;
        duration: number;
        endTime: number;
      }> = [];

      let accumulated = 0;
      for (let i = 0; i < result.shotDurations.length; i++) {
        const dur = result.shotDurations[i];
        segments.push({
          index: i,
          startTime: accumulated,
          duration: dur,
          endTime: accumulated + dur,
        });
        accumulated += dur;
      }

      const thumbnails = await extractSceneThumbnails(
        tmpPath,
        result.scenes,
        result.totalDuration,
      );

      return new Response(JSON.stringify({
        success: true,
        fileId,
        totalDuration: result.totalDuration,
        shotCount: result.shotCount,
        avgShotDuration: result.avgShotDuration,
        cutFrequency: result.cutFrequency,
        segments,
        cuts: result.scenes.map((s) => ({ timestamp: s.timestamp, score: s.score })),
        thumbnails,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error: any) {
    console.error("[detect-scenes] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Scene detection failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
