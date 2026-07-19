import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ProjectEDL } from "@monet/edl";
import { refineEdlTypeScript } from "./refine-edl-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = process.env.KOVE_WORKSPACE || path.resolve(__dirname, "../../../..");

interface RefineJobStatus {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "complete" | "failed";
  progress: number;
  message: string;
  tmpDir: string;
  startTime: number;
  result?: { edl: unknown };
  error?: string;
}

const jobs = new Map<string, RefineJobStatus>();
const TIMEOUT_MS = 120_000;
const CLEANUP_MS = 3_600_000;

const RefineRequestSchema = z.object({
  currentEdl: z.unknown(),
  prompt: z.string().min(1),
  scopeClipIds: z.array(z.string()).optional(),
  projectName: z.string().optional(),
  referenceDnaPath: z.string().optional(),
});

const RefineStatusParamsSchema = z.object({
  jobId: z.string().uuid(),
});

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function sweepStaleJobs(): void {
  const baseDir = "/tmp/kove-refine-jobs";
  try {
    if (!fs.existsSync(baseDir)) return;
    const entries = fs.readdirSync(baseDir);
    let swept = 0;
    for (const entry of entries) {
      const entryPath = path.join(baseDir, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory() && Date.now() - stat.mtimeMs > STALE_THRESHOLD_MS) {
          fs.rmSync(entryPath, { recursive: true, force: true });
          swept++;
        }
      } catch {
        // Skip entries we can't stat
      }
    }
    if (swept > 0) {
      console.log(`[vibe-refine] swept ${swept} stale job directories`);
    }
  } catch {
    // Non-fatal — log and continue
  }
}

export async function registerVibeRefineRoute(app: FastifyInstance): Promise<void> {
  // GAP-007: Sweep orphaned refine job dirs older than 24h on startup
  sweepStaleJobs();

  // POST /api/vibe-refine — start a refinement job
  app.post("/api/vibe-refine", async (req, res) => {
    try {
      const parsed = RefineRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const body = parsed.data;
      const projectName = body.projectName || `refine-${Date.now()}`;
      const jobId = crypto.randomUUID();
      const tmpDir = path.join("/tmp", "kove-refine-jobs", jobId);
      fs.mkdirSync(tmpDir, { recursive: true });

      // Save inputs to temp files
      fs.writeFileSync(path.join(tmpDir, "current-edl.json"), JSON.stringify(body.currentEdl, null, 2));
      fs.writeFileSync(path.join(tmpDir, "refine-prompt.txt"), body.prompt);
      if (body.scopeClipIds) {
        fs.writeFileSync(path.join(tmpDir, "scope.json"), JSON.stringify(body.scopeClipIds));
      }
      if (body.referenceDnaPath) {
        fs.writeFileSync(path.join(tmpDir, "reference-dna-path.txt"), body.referenceDnaPath);
      }

      const job: RefineJobStatus = {
        jobId,
        status: "queued",
        progress: 0,
        message: "Queued",
        tmpDir,
        startTime: Date.now(),
      };
      jobs.set(jobId, job);

      // Run refinement in background
      runRefinement(job, projectName);

      return res.send({ jobId, status: "queued" });
    } catch (err: unknown) {
      req.log.error({ err }, "vibe-refine failed");
      return res.status(500).send({ error: "An error occurred while refining EDL. Please try again." });
    }
  });

  // GET /api/vibe-refine/status/:jobId — poll job status
  app.get("/api/vibe-refine/status/:jobId", async (req, res) => {
    const paramsParsed = RefineStatusParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).send({ error: "Invalid jobId" });
    }
    const { jobId } = paramsParsed.data;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).send({ error: "Job not found" });

    const elapsed = Date.now() - job.startTime;
    if (job.status !== "complete" && job.status !== "failed" && elapsed > TIMEOUT_MS) {
      const edlPath = path.join(job.tmpDir, "refined-edl.json");
      if (fs.existsSync(edlPath)) {
        try {
          const edl = JSON.parse(fs.readFileSync(edlPath, "utf-8"));
          job.status = "complete";
          job.progress = 100;
          job.message = "Done";
          job.result = { edl };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          job.status = "failed";
          job.message = `Failed to read output: ${msg}`;
          job.error = msg;
        }
      } else {
        job.status = "failed";
        job.message = "Refinement timeout";
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

async function runRefinement(job: RefineJobStatus, projectName: string): Promise<void> {
  job.status = "analyzing";
  job.progress = 10;
  job.message = "Analyzing current edit...";

  try {
    // Load current EDL
    const edlPath = path.join(job.tmpDir, "current-edl.json");
    const edl: ProjectEDL = JSON.parse(fs.readFileSync(edlPath, "utf-8"));

    // Load prompt
    const prompt = fs.readFileSync(path.join(job.tmpDir, "refine-prompt.txt"), "utf-8").trim();

    // Load scope if present
    let scopeClipIds: string[] | undefined;
    const scopePath = path.join(job.tmpDir, "scope.json");
    if (fs.existsSync(scopePath)) {
      scopeClipIds = JSON.parse(fs.readFileSync(scopePath, "utf-8"));
    }

    job.progress = 30;
    job.message = "Calling LLM for refinement actions...";

    // Run TypeScript refinement (GAP-002: unified path)
    const result = await refineEdlTypeScript(edl, prompt, scopeClipIds);

    job.progress = 90;
    job.message = `Applied ${result.actions.length} refinement actions`;

    // Save refined EDL
    const outputPath = path.join(job.tmpDir, "refined-edl.json");
    fs.writeFileSync(outputPath, JSON.stringify(result.edl, null, 2));

    job.status = "complete";
    job.progress = 100;
    job.message = "Refinement complete (TypeScript path)";
    job.result = { edl: result.edl };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    job.status = "failed";
    job.message = `Refinement failed: ${msg}`;
    job.error = msg;
    console.error("[vibe-refine] TypeScript refinement failed:", err);
  }

  // Schedule cleanup
  setTimeout(() => {
    try {
      fs.rmSync(job.tmpDir, { recursive: true, force: true });
    } catch {}
    jobs.delete(job.jobId);
  }, CLEANUP_MS);
}
