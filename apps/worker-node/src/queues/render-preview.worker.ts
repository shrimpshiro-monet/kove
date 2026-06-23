import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createWorker } from "../../../api/src/services/queue";
import { renderEDL } from "@monet/render-adapters/src/router/render-router";
import type { MonetEDL } from "@monet/edl/src/schemas";

interface RenderPreviewJobData {
  edl: MonetEDL;
  outputPath?: string;
  width?: number;
  height?: number;
  fps?: number;
}

function getArtifactDir(): string {
  const value = process.env.ARTIFACT_DIR;

  return value && value.trim().length > 0 ? value : ".monet-artifacts";
}

function isRenderPreviewJobData(value: unknown): value is RenderPreviewJobData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return Boolean(record.edl) && typeof record.edl === "object";
}

createWorker("render.preview", async (job) => {
  console.log("[render.preview] received", {
    jobId: job.id
  });

  if (!isRenderPreviewJobData(job.data)) {
    throw new Error("Invalid render.preview job data");
  }

  const artifactDir = getArtifactDir();
  await mkdir(artifactDir, { recursive: true });

  const outputPath =
    typeof job.data.outputPath === "string" && job.data.outputPath.trim().length > 0
      ? job.data.outputPath
      : path.join(artifactDir, `preview-${job.id ?? Date.now()}.mp4`);

  const progressUpdate = (value: number) => {
    job.updateProgress(Math.floor(value));
  };

  const result = await renderEDL({
    edl: job.data.edl,
    outputPath,
    mode: "preview",
    width: job.data.width,
    height: job.data.height,
    fps: job.data.fps,
    onProgress: progressUpdate
  });

  progressUpdate(100);

  if (!result.success) {
    console.error("[render.preview] failed", {
      jobId: job.id,
      error: result.error
    });

    throw new Error(result.error?.message ?? "Preview render failed");
  }

  console.log("[render.preview] complete", {
    jobId: job.id,
    outputPath: result.data?.outputPath,
    duration: result.data?.duration,
    inputCount: result.data?.inputCount
  });
});
