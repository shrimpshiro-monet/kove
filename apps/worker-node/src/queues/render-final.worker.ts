import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createWorker } from "../../../api/src/services/queue";
import { renderEDL } from "@monet/render-adapters/src/router/render-router";
import type { MonetEDL } from "@monet/edl/src/schemas";

interface RenderFinalJobData {
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

function isRenderFinalJobData(value: unknown): value is RenderFinalJobData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return Boolean(record.edl) && typeof record.edl === "object";
}

createWorker("render.final", async (job) => {
  console.log("[render.final] received", {
    jobId: job.id
  });

  if (!isRenderFinalJobData(job.data)) {
    throw new Error("Invalid render.final job data");
  }

  const artifactDir = getArtifactDir();
  await mkdir(artifactDir, { recursive: true });

  const outputPath =
    typeof job.data.outputPath === "string" && job.data.outputPath.trim().length > 0
      ? job.data.outputPath
      : path.join(artifactDir, `final-${job.id ?? Date.now()}.mp4`);

  const result = await renderEDL({
    edl: job.data.edl,
    outputPath,
    mode: "final",
    width: job.data.width,
    height: job.data.height,
    fps: job.data.fps
  });

  if (!result.success) {
    console.error("[render.final] failed", {
      jobId: job.id,
      error: result.error
    });

    throw new Error(result.error?.message ?? "Final render failed");
  }

  console.log("[render.final] complete", {
    jobId: job.id,
    outputPath: result.data?.outputPath,
    duration: result.data?.duration,
    inputCount: result.data?.inputCount
  });
});
