import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

async function detectScenes(buffer: ArrayBuffer, mimeType: string, threshold = 0.3) {
  const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scene-"));
  const tmpPath = path.join(tmpDir, `input${ext}`);
  try {
    await fs.writeFile(tmpPath, Buffer.from(buffer));
    const { stdout: durStr } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", tmpPath,
    ], { timeout: 30_000 });
    const totalDuration = parseFloat(durStr.trim()) || 0;

    let stderr = "";
    try {
      const r = await execFileAsync("ffmpeg", [
        "-i", tmpPath, "-vf", `select='gt(scene,${threshold})',showinfo`,
        "-vsync", "vfr", "-f", "null", "-",
      ], { timeout: 120_000 });
      stderr = r.stderr ?? "";
    } catch (err: any) {
      stderr = err.stderr ?? err.stdout ?? "";
    }

    const re = /pts_time:\s*([\d.]+)/g;
    const timestamps: number[] = [];
    let m;
    while ((m = re.exec(stderr)) !== null) timestamps.push(parseFloat(m[1]));
    const unique = [...new Set(timestamps)].sort((a, b) => a - b);
    const cuts = [0, ...unique, totalDuration];

    const shotDurations: number[] = [];
    for (let i = 0; i < cuts.length - 1; i++) shotDurations.push(cuts[i + 1] - cuts[i]);

    return {
      totalDuration,
      shotCount: shotDurations.length,
      avgShotDuration: shotDurations.length > 0 ? shotDurations.reduce((a, b) => a + b, 0) / shotDurations.length : 0,
      cutFrequency: totalDuration > 0 ? (cuts.length - 2) / totalDuration : 0,
      shotDurations,
      scenes: unique.map(t => ({ timestamp: t, score: 1 })),
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function registerDetectRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/detect-scenes", async (request, reply) => {
    try {
      const { fileId, threshold = 0.3 } = request.body as { fileId?: string; threshold?: number };
      if (!fileId) return reply.code(400).send({ error: "fileId required" });

      const env = app as any;
      const object = await env.MONET_MEDIA?.get(fileId);
      if (!object) return reply.code(404).send({ error: "File not found" });

      const buffer = await object.arrayBuffer();
      const mimeType = object.httpMetadata?.contentType || "video/mp4";
      const result = await detectScenes(buffer, mimeType, threshold);

      const segments = result.shotDurations.map((dur: number, i: number) => {
        let acc = 0;
        for (let j = 0; j < i; j++) acc += result.shotDurations[j];
        return { index: i, startTime: acc, duration: dur, endTime: acc + dur };
      });

      return {
        success: true,
        fileId,
        totalDuration: result.totalDuration,
        shotCount: result.shotCount,
        avgShotDuration: result.avgShotDuration,
        cutFrequency: result.cutFrequency,
        segments,
        cuts: result.scenes.map((s: any) => ({ timestamp: s.timestamp, score: s.score })),
      };
    } catch (error: any) {
      app.log.error(error);
      return reply.code(500).send({ error: error.message || "Scene detection failed" });
    }
  });

  app.post("/api/deep-analysis", async (request, reply) => {
    try {
      const { fileId } = request.body as { fileId?: string };
      if (!fileId) return reply.code(400).send({ error: "fileId required" });

      const env = app as any;
      const object = await env.MONET_MEDIA?.get(fileId);
      if (!object) return reply.code(404).send({ error: "File not found" });

      const buffer = await object.arrayBuffer();
      const mimeType = object.httpMetadata?.contentType || "video/mp4";
      const result = await detectScenes(buffer, mimeType, 0.3);

      const segments = result.shotDurations.map((dur: number, i: number) => {
        let acc = 0;
        for (let j = 0; j < i; j++) acc += result.shotDurations[j];
        return { index: i, startTime: acc, duration: dur, endTime: acc + dur };
      });

      return {
        success: true,
        total_duration: result.totalDuration,
        fps: 30,
        total_frames: 0,
        width: 0,
        height: 0,
        shots: segments.map((s: any) => ({
          start_time: s.startTime,
          end_time: s.endTime,
          duration: s.duration,
        })),
        velocity_curve: [],
        color_samples: [],
        flash_frames: [],
        audio: null,
        cut_frequency: result.cutFrequency,
        avg_shot_duration: result.avgShotDuration,
        shot_duration_variance: 0,
        pacing: "medium",
        dominant_palette: [],
        summary: {
          shot_count: segments.length,
          velocity_samples: 0,
          color_samples: 0,
          flash_frame_count: 0,
          has_audio: false,
          bpm: null,
          palette_colors: 0,
          fallback: true,
        },
      };
    } catch (error: any) {
      app.log.error(error);
      return reply.code(500).send({ error: error.message || "Analysis failed" });
    }
  });
}
