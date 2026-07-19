import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = process.env.KOVE_WORKSPACE || path.resolve(__dirname, "../../../..");
console.log("[api] WORKSPACE:", WORKSPACE);

interface JobStatus {
  jobId: string;
  projectName: string;
  status: "queued" | "analyzing" | "generating" | "rendering" | "complete" | "failed";
  progress: number;
  message: string;
  tmpDir: string;
  startTime: number;
  result?: {
    projectId: string;
    openReelProject: unknown;
    edl: unknown;
    dnaPath: string;
    renderPreviewUrl: string | null;
  };
  error?: string;
}

const jobs = new Map<string, JobStatus>();
const TIMEOUT_MS = 600_000;

export async function registerVibeGenerateRoute(app: FastifyInstance): Promise<void> {
  app.post("/api/vibe-generate", async (req, res) => {
    try {
      const parts = req.parts();
      const fields: Record<string, string> = {};
      const files: Record<string, { filepath: string; originalFilename: string }> = {};

      for await (const part of parts) {
        if (part.type === "file") {
          const ext = path.extname(part.filename) || ".mp4";
          const tmpPath = path.join("/tmp", `kove-upload-${crypto.randomUUID().slice(0, 8)}${ext}`);
          const writeStream = fs.createWriteStream(tmpPath);
          await new Promise<void>((resolve, reject) => {
            part.file.pipe(writeStream);
            part.file.on("end", resolve);
            part.file.on("error", reject);
          });
          files[part.fieldname] = { filepath: tmpPath, originalFilename: part.filename };
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      if (!files.footage || !files.reference) {
        return res.status(400).send({ error: "footage and reference files are required" });
      }

      const projectName = fields.projectName || `vibe-${Date.now()}`;
      const jobId = crypto.randomUUID();
      const tmpDir = path.join("/tmp", `kove-jobs`, jobId);
      fs.mkdirSync(tmpDir, { recursive: true });

      // Move uploaded files into job dir
      const footageDst = path.join(tmpDir, "footage" + path.extname(files.footage.originalFilename));
      const refDst = path.join(tmpDir, "reference" + path.extname(files.reference.originalFilename));
      fs.renameSync(files.footage.filepath, footageDst);
      fs.renameSync(files.reference.filepath, refDst);

      let musicPath: string | null = null;
      if (files.music) {
        musicPath = path.join(tmpDir, "music" + path.extname(files.music.originalFilename));
        fs.renameSync(files.music.filepath, musicPath!);
      }

      const job: JobStatus = {
        jobId,
        projectName,
        status: "queued",
        progress: 0,
        message: "Queued",
        tmpDir,
        startTime: Date.now(),
      };
      jobs.set(jobId, job);

      // Run pipeline in background
      runPipeline(job, footageDst, refDst, musicPath, projectName);

      return res.send({
        jobId,
        status: "queued",
        estimatedTime: 90,
      });
    } catch (err: any) {
      req.log.error({ err }, "vibe-generate failed");
      return res.status(500).send({ error: "An error occurred while generating EDL. Please try again." });
    }
  });

  app.get("/api/vibe-generate/status/:jobId", async (req, res) => {
    const { jobId } = req.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) return res.status(404).send({ error: "Job not found" });

    const elapsed = Date.now() - job.startTime;
    if (job.status !== "complete" && job.status !== "failed" && elapsed > TIMEOUT_MS) {
      // Check if outputs actually exist — pipeline may have finished but close handler was slow
      const outputDir = path.join(WORKSPACE, "output");
      const edlPath = path.join(outputDir, `${job.projectName}-edl.json`);
      if (fs.existsSync(edlPath)) {
        // Outputs exist — read them now
        try {
          const edl = JSON.parse(fs.readFileSync(edlPath, "utf-8"));
          const openreelPath = path.join(outputDir, `${job.projectName}-openreel.json`);
          const dnaPath = path.join(outputDir, `${job.projectName}-dna.json`);
          let openReelProject = null;
          if (fs.existsSync(openreelPath)) {
            openReelProject = JSON.parse(fs.readFileSync(openreelPath, "utf-8"));
          }
          job.status = "complete";
          job.progress = 100;
          job.message = "Done";
          job.result = {
            projectId: job.projectName,
            openReelProject,
            edl,
            dnaPath,
            renderPreviewUrl: null,
          };
        } catch (err: any) {
          job.status = "failed";
          job.message = `Failed to read outputs: ${err.message}`;
          job.error = err.message;
        }
      } else {
        job.status = "failed";
        job.message = "Pipeline timeout — try shorter footage";
        job.error = "timeout";
      }
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

function runPipeline(
  job: JobStatus,
  footagePath: string,
  referencePath: string,
  musicPath: string | null,
  projectName: string
): void {
  const args = [
    path.join(WORKSPACE, "scripts", "monet_pipeline.py"),
    "--reference", referencePath,
    "--footage", footagePath,
    "--name", projectName,
  ];
  if (musicPath) args.push("--music", musicPath);

  job.status = "analyzing";
  job.progress = 10;
  job.message = "Analyzing footage semantics...";

  const proc = spawn("python3", args, {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    if (line.includes("Analyzing footage")) {
      job.status = "analyzing";
      job.progress = 20;
      job.message = "Analyzing footage semantics...";
    } else if (line.includes("Generating EDL")) {
      job.status = "generating";
      job.progress = 50;
      job.message = "Generating EDL from reference grammar...";
    } else if (line.includes("Final clip order")) {
      job.status = "generating";
      job.progress = 70;
      job.message = "Applying narrative arc...";
    } else if (line.includes("Rendering")) {
      job.status = "rendering";
      job.progress = 80;
      job.message = "Rendering video...";
    } else if (line.includes("Docker render complete") || line.includes("Render complete")) {
      job.progress = 95;
      job.message = "Finalizing...";
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      job.status = "failed";
      job.message = `Pipeline failed (exit ${code})`;
      job.error = stderr.slice(0, 500);
      return;
    }

    // Read outputs from pipeline's default output directory
    const outputDir = path.join(WORKSPACE, "output");
    const edlPath = path.join(outputDir, `${projectName}-edl.json`);
    const openreelPath = path.join(outputDir, `${projectName}-openreel.json`);
    const dnaPath = path.join(outputDir, `${projectName}-dna.json`);

    try {
      const edl = JSON.parse(fs.readFileSync(edlPath, "utf-8"));
      let openReelProject = null;
      if (fs.existsSync(openreelPath)) {
        openReelProject = JSON.parse(fs.readFileSync(openreelPath, "utf-8"));
      }

      job.status = "complete";
      job.progress = 100;
      job.message = "Done";
      job.result = {
        projectId: projectName,
        openReelProject,
        edl,
        dnaPath,
        renderPreviewUrl: null,
      };
      // Cleanup job dir after 1 hour
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
    } catch (err: any) {
      job.status = "failed";
      job.message = `Failed to read pipeline outputs: ${err.message}`;
      job.error = err.message;
      // Cleanup on failure too
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
    }
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.message = `Failed to start pipeline: ${err.message}`;
    job.error = err.message;
  });
}
