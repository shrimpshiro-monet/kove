import type { Env } from "../types/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

const PYTHON_WORKER_URL = process.env.PYTHON_AI_URL || "http://127.0.0.1:8102";

export async function handleDeepAnalysis(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      fileId: string;
      audioFileId?: string;
    };

    const { fileId, audioFileId } = body;
    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deep-analysis-"));

    try {
      const object = await env.MONET_MEDIA.get(fileId);
      if (!object) {
        return new Response(JSON.stringify({ error: "File not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const ext = (object.httpMetadata?.contentType || "").includes("quicktime") ? ".mov" : ".mp4";
      const videoPath = path.join(tmpDir, `input${ext}`);
      await fs.writeFile(videoPath, Buffer.from(await object.arrayBuffer()));

      let audioPath: string | undefined;
      if (audioFileId) {
        const audioObj = await env.MONET_MEDIA.get(audioFileId);
        if (audioObj) {
          audioPath = path.join(tmpDir, "audio.mp3");
          await fs.writeFile(audioPath, Buffer.from(await audioObj.arrayBuffer()));
        }
      }

      let result: any;
      try {
        const payload: Record<string, string> = { filePath: videoPath };
        if (audioPath) payload.audioPath = audioPath;

        const res = await fetch(`${PYTHON_WORKER_URL}/deep-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(300_000),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Python worker error ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json();
        result = data.data || data;
      } catch (e: any) {
        console.warn(`[deep-analysis] Python worker failed: ${e.message}, falling back to FFmpeg`);
        result = await runFallbackAnalysis(videoPath);
      }

      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error: any) {
    console.error("[deep-analysis] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Analysis failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function runFallbackAnalysis(videoPath: string): Promise<any> {
  const { detectSceneChanges } = await import("../lib/scene-detection");
  const sceneResult = await detectSceneChanges(videoPath, 0.3);

  const durations = sceneResult.shotDurations;
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const variance = durations.length > 1 ? durations.reduce((s, d) => s + Math.pow(d - avgDuration, 2), 0) / durations.length : 0;

  const shots = [];
  let accumulated = 0;
  for (let i = 0; i < durations.length; i++) {
    shots.push({
      index: i,
      start_time: accumulated,
      end_time: accumulated + durations[i],
      duration: durations[i],
      start_frame: 0,
      end_frame: 0,
    });
    accumulated += durations[i];
  }

  return {
    total_duration: sceneResult.totalDuration,
    fps: 30,
    total_frames: 0,
    width: 0,
    height: 0,
    shots,
    velocity_curve: [],
    color_samples: [],
    flash_frames: [],
    audio: null,
    cut_frequency: sceneResult.cutFrequency,
    avg_shot_duration: avgDuration,
    shot_duration_variance: variance,
    pacing: avgDuration < 1.0 ? "fast" : avgDuration < 2.0 ? "medium" : "slow",
    dominant_palette: [],
    summary: {
      shot_count: shots.length,
      velocity_samples: 0,
      color_samples: 0,
      flash_frame_count: 0,
      has_audio: false,
      bpm: null,
      palette_colors: 0,
      fallback: true,
    },
  };
}
