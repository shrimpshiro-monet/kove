import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = process.env.KOVE_WORKSPACE || path.resolve(__dirname, "../../../..");


const ENGINE_PATH = path.join(WORKSPACE, "workers", "python-director", "src", "reference_engine.py");
const VIZ_SCRIPT_PATH = path.join(WORKSPACE, "scripts", "visualize_reference_analysis.py");
const UPLOAD_DIR = path.resolve(process.cwd(), "storage", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

interface ReferenceJobStatus {
  jobId: string;
  status: "queued" | "analyzing" | "generating_overlay" | "complete" | "failed";
  progress: number;
  message: string;
  tmpDir: string;
  startTime: number;
  result?: {
    overlayVideoUrl: string | null;
    report: Record<string, unknown>;
  };
  error?: string;
}

const jobs = new Map<string, ReferenceJobStatus>();
const TIMEOUT_MS = 600_000;

export async function registerAnalyzeReferenceRoute(app: FastifyInstance): Promise<void> {
  app.post("/api/analyze-reference", async (req, res) => {
    try {
      const parts = req.parts();
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
        }
      }

      if (!files.reference) {
        return res.status(400).send({ error: "reference file is required" });
      }

      const jobId = crypto.randomUUID();
      const tmpDir = path.join("/tmp", `kove-jobs`, jobId);
      fs.mkdirSync(tmpDir, { recursive: true });

      const refDst = path.join(tmpDir, "reference" + path.extname(files.reference.originalFilename));
      try {
        fs.renameSync(files.reference.filepath, refDst);
      } catch (err: unknown) {
        // rename fails across filesystems (EXDEV), fall back to copy+unlink
        fs.copyFileSync(files.reference.filepath, refDst);
        fs.unlinkSync(files.reference.filepath);
      }

      const job: ReferenceJobStatus = {
        jobId,
        status: "queued",
        progress: 0,
        message: "Queued",
        tmpDir,
        startTime: Date.now(),
      };
      jobs.set(jobId, job);

      runAnalysisPipeline(job, refDst);

      return res.send({
        jobId,
        status: "queued",
      });
    } catch (err: unknown) {
      req.log.error({ err }, "analyze-reference failed");
      return res.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/analyze-reference/status/:jobId", async (req, res) => {
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

function runAnalysisPipeline(job: ReferenceJobStatus, videoPath: string): void {
  const analysisJsonPath = path.join(job.tmpDir, "analysis.json");
  const overlayPath = path.join(job.tmpDir, "overlay.mp4");

  job.status = "analyzing";
  job.progress = 20;
  job.message = "Running reference analysis...";

  // Step 1: Run reference_engine.py analyze
  const engineArgs = [
    ENGINE_PATH,
    "analyze",
    videoPath,
    "-o",
    analysisJsonPath,
  ];

  const proc = spawn("python3", engineArgs, {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString();
    for (const line of lines.split("\n")) {
      if (line.includes("Cuts detected")) {
        job.progress = 30;
        job.message = `Reference analysis: ${line.trim()}`;
      } else if (line.includes("Segments built")) {
        job.progress = 40;
        job.message = "Built segment descriptors";
      } else if (line.includes("BPM:")) {
        job.progress = 50;
        job.message = `Reference analysis: ${line.trim()}`;
      } else if (line.includes("Analysis written to")) {
        job.progress = 60;
        job.message = "Analysis complete, generating overlay...";
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      job.status = "failed";
      job.message = `Reference analysis failed (exit ${code})`;
      job.error = stderr.slice(0, 500);
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
      return;
    }

    if (!fs.existsSync(analysisJsonPath)) {
      job.status = "failed";
      job.message = "Analysis JSON not produced";
      job.error = "reference_engine.py did not write output";
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
      return;
    }

    // Read the analysis JSON
    let report: Record<string, unknown>;
    try {
      report = JSON.parse(fs.readFileSync(analysisJsonPath, "utf-8"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = "failed";
      job.message = `Failed to read analysis JSON: ${msg}`;
      job.error = msg;
      // Cleanup
      setTimeout(() => {
        try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
        jobs.delete(job.jobId);
      }, 3600_000);
      return;
    }

    // Step 2: Generate overlay video
    job.status = "generating_overlay";
    job.progress = 70;
    job.message = "Generating overlay video...";

    runOverlayGeneration(job, videoPath, analysisJsonPath, overlayPath, report);
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.message = `Failed to start reference engine: ${err.message}`;
    job.error = err.message;
  });
}

function runOverlayGeneration(
  job: ReferenceJobStatus,
  videoPath: string,
  analysisJsonPath: string,
  overlayPath: string,
  report: Record<string, unknown>,
): void {
  const vizArgs = [
    VIZ_SCRIPT_PATH,
    videoPath,
    analysisJsonPath,
    "-o",
    overlayPath,
  ];

  const proc = spawn("python3", vizArgs, {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    job.progress = 80;
    job.message = "Rendering overlay segments...";
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on("close", (code) => {
    let overlayVideoUrl: string | null = null;

    if (code === 0 && fs.existsSync(overlayPath)) {
      // Copy overlay to storage/uploads for serving
      try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const destPath = path.join(UPLOAD_DIR, `overlay-${job.jobId}.mp4`);
        fs.copyFileSync(overlayPath, destPath);
        overlayVideoUrl = `/uploads/overlay-${job.jobId}.mp4`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        job.status = "failed";
        job.message = `Overlay copy failed: ${msg}`;
        job.error = msg;
        return;
      }
    }

    job.status = "complete";
    job.progress = 100;
    job.message = code === 0 ? "Done" : `Overlay generation had issues (exit ${code})`;
    job.result = {
      overlayVideoUrl,
      report,
    };

    // Cleanup after 1 hour
    setTimeout(() => {
      try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
      jobs.delete(job.jobId);
    }, 3600_000);
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.message = `Failed to start overlay generation: ${err.message}`;
    job.error = err.message;
  });
}
