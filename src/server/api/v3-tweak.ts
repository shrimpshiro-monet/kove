/**
 * V3 Refinement API — text-based tweaks via conversational flow.
 *
 * POST /api/v3/tweak — send feedback, get clarification or updated EDL
 * POST /api/v3/ask — ask a question about the video
 */
import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { refineEDL, type RefinementRequest } from "../lib/refinement-chat";
import { askAboutClip } from "../lib/vision-analyzer";
import type { ShotEDL } from "@monet/edl-v3";

// ── POST /api/v3/tweak ──────────────────────────────────────────────────────

export async function handleV3Tweak(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      edl: ShotEDL;
      feedback: string;
      clipAnalyses?: RefinementRequest["clipAnalyses"];
    };

    if (!body.edl || !body.feedback) {
      return apiError(ApiErrorCode.InvalidRequest, "edl and feedback are required", 400);
    }

    console.log(`[v3/tweak] Feedback: "${body.feedback}"`);

    const result = await refineEDL(env, {
      edl: body.edl,
      feedback: body.feedback,
      clipAnalyses: body.clipAnalyses,
    });

    if (result.type === "clarification") {
      return jsonResponse({
        success: true,
        type: "clarification",
        message: result.message,
        clarification: result.clarification,
      });
    }

    if (result.type === "error") {
      return apiError(ApiErrorCode.EDLGenerationFailed, result.message, 400);
    }

    // Store refined EDL
    if (env.DB && result.updatedEdl) {
      try {
        await env.DB.prepare(
          `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            `tweak-${Date.now()}`,
            "current", // TODO: pass projectId from frontend
            JSON.stringify(result.updatedEdl),
            0, 0, 1, 0, body.feedback, Date.now(),
          )
          .run();
      } catch (e) {
        console.warn(`[v3/tweak] D1 insert failed: ${(e as Error).message}`);
      }
    }

    return jsonResponse({
      success: true,
      type: "applied",
      message: result.message,
      edl: result.updatedEdl,
      changes: result.changes,
    });
  } catch (error: any) {
    console.error("[v3/tweak] Error:", error);
    return apiError(ApiErrorCode.InternalError, error.message || "Tweak failed", 500);
  }
}

// ── POST /api/v3/ask ────────────────────────────────────────────────────────

export async function handleV3Ask(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      clipId: string;
      videoPath: string;
      question: string;
      duration: number;
    };

    if (!body.question) {
      return apiError(ApiErrorCode.InvalidRequest, "question is required", 400);
    }

    // Extract frames for vision analysis
    const frames = await extractFrames(body.videoPath, 4);

    const answer = await askAboutClip(
      env,
      body.question,
      frames,
      body.clipId,
      body.duration,
    );

    return jsonResponse({
      success: true,
      answer,
    });
  } catch (error: any) {
    console.error("[v3/ask] Error:", error);
    return apiError(ApiErrorCode.InternalError, error.message || "Ask failed", 500);
  }
}

// ── Frame Extraction ────────────────────────────────────────────────────────

async function extractFrames(videoPath: string, count: number): Promise<Uint8Array[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const fs = await import("node:fs/promises");
  const pathMod = await import("node:path");
  const os = await import("node:os");

  const execFileAsync = promisify(execFile);
  const tmpDir = await fs.mkdtemp(pathMod.join(os.tmpdir(), "ask-frames-"));
  const framesDir = pathMod.join(tmpDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  try {
    const { stdout: durStr } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ], { timeout: 10_000 });
    const duration = parseFloat(durStr.trim());
    if (isNaN(duration) || duration <= 0) return [];

    const frames: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * duration;
      const framePath = pathMod.join(framesDir, `frame_${i}.jpg`);
      try {
        await execFileAsync("ffmpeg", [
          "-ss", String(t),
          "-i", videoPath,
          "-frames:v", "1",
          "-q:v", "2",
          framePath,
        ], { timeout: 10_000 });
        const data = await fs.readFile(framePath);
        frames.push(new Uint8Array(data));
      } catch {}
    }

    return frames;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
