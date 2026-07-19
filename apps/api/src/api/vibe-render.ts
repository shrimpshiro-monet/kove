import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = process.env.KOVE_WORKSPACE || path.resolve(__dirname, "../../../..");

interface VibeRenderRequest {
  edl: unknown;
  footagePath: string;
  musicPath?: string;
}

interface RenderJob {
  renderJobId: string;
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  renderUrl?: string;
  error?: string;
  startTime: number;
}

const renderJobs = new Map<string, RenderJob>();
const RENDER_TIMEOUT_MS = 300_000;

export async function registerVibeRenderRoute(app: FastifyInstance): Promise<void> {
  // Existing vibe render endpoint (kept for backwards compat)
  app.post("/api/render/vibe", async (req, res) => {
    try {
      const body = req.body as { projectId?: string; edl?: unknown; footagePath?: string; musicPath?: string };

      // New path: accept EDL directly
      if (body.edl && body.footagePath) {
        const renderJobId = crypto.randomUUID();
        const job: RenderJob = {
          renderJobId,
          status: "queued",
          progress: 0,
          startTime: Date.now(),
        };
        renderJobs.set(renderJobId, job);

        runEditlyRender(job, body.edl, body.footagePath, body.musicPath || null);

        return res.send({ renderJobId, status: "queued" });
      }

      return res.status(400).send({ error: "edl and footagePath are required" });
    } catch (error: any) {
      req.log.error({ error }, "Vibe render route failed");
      return res.status(500).send({ error: "An error occurred while rendering video. Please try again." });
    }
  });

  // Render status
  app.get("/api/render/vibe/status/:renderJobId", async (req, res) => {
    const { renderJobId } = req.params as { renderJobId: string };
    const job = renderJobs.get(renderJobId);
    if (!job) return res.status(404).send({ error: "Render job not found" });

    const elapsed = Date.now() - job.startTime;
    if (job.status !== "complete" && job.status !== "failed" && elapsed > RENDER_TIMEOUT_MS) {
      job.status = "failed";
      job.error = "Render timeout";
    }

    return res.send({
      renderJobId: job.renderJobId,
      status: job.status,
      progress: job.progress,
      renderUrl: job.renderUrl,
      error: job.error,
    });
  });

  // Download rendered file
  app.get("/api/render/vibe/download/:renderJobId", async (req, res) => {
    const { renderJobId } = req.params as { renderJobId: string };
    const job = renderJobs.get(renderJobId);
    if (!job || job.status !== "complete" || !job.renderUrl) {
      return res.status(404).send({ error: "Render not ready" });
    }

    const filePath = path.join(WORKSPACE, job.renderUrl.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      return res.status(404).send({ error: "File not found" });
    }

    return res.type("video/mp4").sendFile(path.basename(filePath), path.dirname(filePath));
  });
}

function checkDockerRunning(): boolean {
  try {
    execSync("docker ps", { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function parseRatio(s: string): { w: number; h: number } {
  const [w, h] = s.split(":").map(Number);
  return { w, h };
}

async function runEditlyRender(
  job: RenderJob,
  edl: unknown,
  footagePath: string,
  musicPath: string | null
): Promise<void> {
  if (!checkDockerRunning()) {
    job.status = "failed";
    job.error = "Docker not running. Start Docker Desktop and try again.";
    return;
  }

  job.status = "rendering";
  job.progress = 10;

  // Write EDL to temp file for the render
  const edlTmp = path.join("/tmp", `render-edl-${job.renderJobId}.json`);
  fs.writeFileSync(edlTmp, JSON.stringify(edl, null, 2));

  const outputTmp = path.join("/tmp", `render-output-${job.renderJobId}.mp4`);

  // Subject-tracked reframe support
  const cropsTmp = path.join("/tmp", `crops-${job.renderJobId}.f64`);
  const cropsMetaTmp = path.join("/tmp", `crops-${job.renderJobId}.json`);

  try {
    const edlObj = typeof edl === "string" ? JSON.parse(edl) : edl;
    for (const track of edlObj.timeline?.tracks ?? []) {
      for (const clip of track.clips ?? []) {
        if (clip.reframe && clip.reframe.lockSubject !== "center") {
          const sourceAssetId = clip.sourceAssetId ?? clip.mediaId ?? clip.id;
          const trackResponse = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/subject-track/${encodeURIComponent(sourceAssetId)}`);

          if (trackResponse.ok) {
            const subjectTrack = await trackResponse.json();
            const { buildPath, resolvePath, DEFAULT_SMOOTH_CFG } = await import("@monet/edl");

            const ratio = parseRatio(clip.reframe.targetRatio ?? "9:16");
            // TODO: pass sourceAspectRatio from clip/source dimensions once available in export pipeline
            // Default 16/9 is used as most user content is landscape
            const path = buildPath(subjectTrack, ratio, DEFAULT_SMOOTH_CFG, clip.reframe.lockedTrackId);

            const totalDuration = edlObj.timeline.duration ?? 60;
            const fps = 30;
            const frameCount = Math.ceil(totalDuration * fps);
            const crops = new Float64Array(frameCount * 4);

            for (let i = 0; i < frameCount; i++) {
              const t = i / fps;
              const crop = resolvePath(path, t, fps);
              if (crop) {
                crops[i * 4] = crop.x;
                crops[i * 4 + 1] = crop.y;
                crops[i * 4 + 2] = crop.width;
                crops[i * 4 + 3] = crop.height;
              }
            }

            fs.writeFileSync(cropsTmp, Buffer.from(crops.buffer));
            fs.writeFileSync(cropsMetaTmp, JSON.stringify({
              schema: "crops.v1",
              fps,
              frameCount,
              sourceAssetId,
              targetRatio: clip.reframe.targetRatio,
              lockSubject: clip.reframe.lockSubject,
            }, null, 2));
          }
          break; // only one clip with reframe for now
        }
      }
    }
  } catch (e) {
    console.warn("[vibe-render] Subject track fetch failed, rendering center-crop:", e);
  }

  // Use the monet_pipeline.py render_native via a small wrapper
  const renderScript = `
import json, sys
sys.path.insert(0, "${path.join(WORKSPACE, "scripts")}")
from monet_pipeline import render_native
edl = json.load(open("${edlTmp}"))
success = render_native(edl, "${outputTmp}", ${musicPath ? `"${musicPath}"` : "None"})
print("RENDER_RESULT:", "OK" if success else "FAIL")
`.trim();

  const scriptTmp = path.join("/tmp", `render-script-${job.renderJobId}.py`);
  fs.writeFileSync(scriptTmp, renderScript);

  const env = { ...process.env };
  if (fs.existsSync(cropsTmp)) {
    env.CROPS_PATH = cropsTmp;
    env.CROPS_META_PATH = cropsMetaTmp;
  }
  const proc = spawn("python3", [scriptTmp], {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });

  proc.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    if (line.includes("Segment")) job.progress = Math.min(90, job.progress + 5);
    if (line.includes("concat")) job.progress = 92;
    if (line.includes("Adding music")) job.progress = 95;
  });

  proc.on("close", (code) => {
    // Cleanup temp files
    try { fs.unlinkSync(edlTmp); } catch {}
    try { fs.unlinkSync(scriptTmp); } catch {}
    try { fs.unlinkSync(cropsTmp); } catch {}
    try { fs.unlinkSync(cropsMetaTmp); } catch {}

    if (code !== 0 || !fs.existsSync(outputTmp)) {
      job.status = "failed";
      job.error = `Render failed (exit ${code})`;
      return;
    }

    // Move to storage
    const storageDir = path.join(WORKSPACE, "apps", "api", "storage", "uploads");
    fs.mkdirSync(storageDir, { recursive: true });
    const finalName = `render-${job.renderJobId}.mp4`;
    fs.renameSync(outputTmp, path.join(storageDir, finalName));

    job.status = "complete";
    job.progress = 100;
    job.renderUrl = `/uploads/${finalName}`;
    // Cleanup after 1 hour
    setTimeout(() => { renderJobs.delete(job.renderJobId); }, 3600_000);
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.error = `Failed to start render: ${err.message}`;
    setTimeout(() => { renderJobs.delete(job.renderJobId); }, 3600_000);
  });
}
