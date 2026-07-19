import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = process.env.KOVE_WORKSPACE || path.resolve(__dirname, "../../../..");

const APPLY_SCRIPT_PATH = path.join(WORKSPACE, "scripts", "apply_style.py");
const UPLOAD_DIR = path.resolve(process.cwd(), "storage", "uploads");

interface ApplyStyleJobStatus {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "rendering" | "complete" | "failed";
  progress: number;
  message: string;
  tmpDir: string;
  startTime: number;
  result?: {
    edl: Record<string, unknown>;
    outputVideoUrl: string | null;
  };
  error?: string;
}

const jobs = new Map<string, ApplyStyleJobStatus>();
const TIMEOUT_MS = 600_000;

export async function registerApplyStyleRoute(app: FastifyInstance): Promise<void> {
  app.post("/api/apply-style", async (req, res) => {
    try {
      const parts = req.parts();
      const files: Record<string, { filepath: string; originalFilename: string }> = {};

      for await (const part of parts) {
        if (part.type === "file") {
          const ext = path.extname(part.filename) || ".bin";
          const tmpPath = path.join("/tmp", `kove-upload-${crypto.randomUUID().slice(0, 8)}${ext}`);
          const writeStream = fs.createWriteStream(tmpPath);
          await new Promise<void>((resolve, reject) => {
            part.file.pipe(writeStream);
            part.file.on("end", resolve);
            part.file.on("error", reject);
          });
          files[part.fieldname] = { filepath: tmpPath, originalFilename: part.filename };
        }
      }

    if (!files.profile || !files.footage) {
      return res.status(400).send({ error: "profile and footage files are required" });
    }
    if (!files.profile.originalFilename?.endsWith(".json")) {
      return res.status(400).send({ error: "profile must be a .json file" });
    }

      const jobId = crypto.randomUUID();
      const tmpDir = path.join("/tmp", `kove-jobs`, jobId);
      fs.mkdirSync(tmpDir, { recursive: true });

      const profileDst = path.join(tmpDir, "profile.json");
      const footageDst = path.join(tmpDir, "footage" + path.extname(files.footage.originalFilename));
      try {
        fs.renameSync(files.profile.filepath, profileDst);
      } catch (err: unknown) {
        fs.copyFileSync(files.profile.filepath, profileDst);
        fs.unlinkSync(files.profile.filepath);
      }
      try {
        fs.renameSync(files.footage.filepath, footageDst);
      } catch (err: unknown) {
        fs.copyFileSync(files.footage.filepath, footageDst);
        fs.unlinkSync(files.footage.filepath);
      }

      const job: ApplyStyleJobStatus = {
        jobId,
        status: "queued",
        progress: 0,
        message: "Queued",
        tmpDir,
        startTime: Date.now(),
      };
      jobs.set(jobId, job);

      runApplyPipeline(job, profileDst, footageDst);

      return res.send({
        jobId,
        status: "queued",
      });
    } catch (err: unknown) {
      req.log.error({ err }, "apply-style failed");
      return res.status(500).send({ error: "An error occurred while applying style. Please try again." });
    }
  });

  app.get("/api/apply-style/status/:jobId", async (req, res) => {
    const { jobId } = req.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) return res.status(404).send({ error: "Job not found" });

    const elapsed = Date.now() - job.startTime;
    if (job.status !== "complete" && job.status !== "failed" && elapsed > TIMEOUT_MS) {
      job.status = "failed";
      job.message = "Pipeline timeout";
      job.error = "timeout";
    }

    return res.send({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      message: job.message,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
    });
  });
}

function runApplyPipeline(job: ApplyStyleJobStatus, profilePath: string, footagePath: string): void {
  const outputBase = path.join(job.tmpDir, "output");
  const edlPath = outputBase + "-edl.json";
  const renderPath = outputBase + ".mp4";

  job.status = "generating";
  job.progress = 10;
  job.message = "Bridging ReferenceStyleProfile to DNA format...";

  const args = [
    APPLY_SCRIPT_PATH,
    profilePath,
    footagePath,
    "-o", outputBase,
    "--render",
  ];

  const proc = spawn("python3", args, {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString();
    for (const line of lines.split("\n")) {
      if (line.includes("Bridging ReferenceStyleProfile")) {
        job.progress = 20;
        job.message = "Converting profile to DNA...";
      } else if (line.includes("Generating EDL")) {
        job.progress = 40;
        job.message = "Generating EDL from DNA + footage...";
      } else if (line.includes("Rendering")) {
        job.status = "rendering";
        job.progress = 70;
        job.message = "Rendering video...";
      } else if (line.includes("Render complete") || line.includes("EDL saved")) {
        job.progress = 90;
        job.message = "Finalizing...";
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      job.status = "failed";
      job.message = `Apply style pipeline failed (exit ${code})`;
      job.error = stderr.slice(0, 500);
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
      return;
    }

    try {
      let edl: Record<string, unknown> | null = null;
      if (fs.existsSync(edlPath)) {
        edl = JSON.parse(fs.readFileSync(edlPath, "utf-8"));
      }

      let outputVideoUrl: string | null = null;
      if (fs.existsSync(renderPath)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const destPath = path.join(UPLOAD_DIR, `apply-${job.jobId}.mp4`);
        fs.copyFileSync(renderPath, destPath);
        outputVideoUrl = `/uploads/apply-${job.jobId}.mp4`;
      }

      job.status = "complete";
      job.progress = 100;
      job.message = "Done";
      job.result = {
        edl: edl || {},
        outputVideoUrl,
      };

      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
    } catch (err: unknown) {
      job.status = "failed";
      job.message = `Failed to read pipeline outputs: ${err instanceof Error ? err.message : String(err)}`;
      job.error = String(err);
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
    }
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.message = `Failed to start apply pipeline: ${err.message}`;
    job.error = err.message;
  });
}
