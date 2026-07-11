# Kove Full Stack — All Modified Files (Copy-Paste Ready)

## Table of Contents
1. `apps/api/src/server.ts` — API server entry
2. `apps/api/src/api/vibe-generate.ts` — Pipeline generation endpoint (NEW)
3. `apps/api/src/api/vibe-render.ts` — Render endpoint (rewritten)
4. `apps/web/src/lib/api-client.ts` — API client methods
5. `apps/web/src/components/editor/MonetGeneratePanel.tsx` — Upload UI + progress
6. `apps/web/src/stores/edl-adapter.ts` — EDL hydration from OpenReel
7. `apps/web/src/components/editor/ClipInspector.tsx` — AI Analysis panel (diff only)
8. `scripts/analyzers/footage_analyzer.py` — Footage analysis
9. `scripts/monet_pipeline.py` — EDL generator (diff only)

---

## 1. apps/api/src/server.ts

```typescript
import "dotenv/config";
import path from "node:path";
import cors from "@fastify/cors";
import fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { registerAnalyzeRoutes } from "./api/analyze";
import { registerCreateHeavyEditRoute } from "./api/create-heavy-edit";
import { registerRenderRoutes } from "./api/render";
import { registerRenderStatusRoute } from "./api/render-status";
import { registerSpatialRoutes } from "./api/spatial";
import { registerUploadDirectRoutes } from "./api/upload-direct";
import { registerBlenderRenderRoute } from "./api/blender-render";
import { registerVibeRenderRoute } from "./api/vibe-render";
import { registerNativeExecutorRoutes } from "./api/native-executor";
import { registerVibeGenerateRoute } from "./api/vibe-generate";

async function start(): Promise<void> {
  const app = fastify({
    logger: true,
    bodyLimit: 256 * 1024 * 1024
  });

  await app.register(cors, {
    origin: true
  });

  const UPLOAD_DIR = path.resolve(process.cwd(), "storage/uploads");

  await app.register(multipart, {
    limits: {
      files: 8,
      fileSize: 1024 * 1024 * 1024 // 1GB local dev ceiling
    }
  });

  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: "/uploads/",
    decorateReply: false
  });

  await registerAnalyzeRoutes(app);
  await registerCreateHeavyEditRoute(app);
  await registerRenderRoutes(app);
  await registerRenderStatusRoute(app);
  await registerSpatialRoutes(app);
  await registerUploadDirectRoutes(app);
  await registerBlenderRenderRoute(app);
  await registerVibeRenderRoute(app);
  await registerNativeExecutorRoutes(app);
  await registerVibeGenerateRoute(app);

  app.get("/health", async () => ({
    status: "ok"
  }));

  const portRaw = process.env.MONET_API_PORT;
  const port = portRaw ? Number(portRaw) : 3000;

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Invalid MONET_API_PORT");
  }

  await app.listen({
    port,
    host: "0.0.0.0"
  });
}

start().catch((error) => {
  console.error("[api] failed to start", error);
  process.exit(1);
});
```

---

## 2. apps/api/src/api/vibe-generate.ts (NEW)

```typescript
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

interface JobStatus {
  jobId: string;
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
const WORKSPACE = path.resolve(process.cwd(), "../..");
const TIMEOUT_MS = 180_000;

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
      return res.status(500).send({ error: err.message });
    }
  });

  app.get("/api/vibe-generate/status/:jobId", async (req, res) => {
    const { jobId } = req.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) return res.status(404).send({ error: "Job not found" });

    const elapsed = Date.now() - job.startTime;
    if (job.status !== "complete" && job.status !== "failed" && elapsed > TIMEOUT_MS) {
      job.status = "failed";
      job.message = "Pipeline timeout — try shorter footage";
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

    // Read outputs
    const edlPath = path.join(job.tmpDir, `${projectName}-edl.json`);
    const openreelPath = path.join(job.tmpDir, `${projectName}-openreel.json`);
    const dnaPath = path.join(job.tmpDir, `${projectName}-dna.json`);

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
    } catch (err: any) {
      job.status = "failed";
      job.message = `Failed to read pipeline outputs: ${err.message}`;
      job.error = err.message;
    }
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.message = `Failed to start pipeline: ${err.message}`;
    job.error = err.message;
  });
}
```

---

## 3. apps/api/src/api/vibe-render.ts

```typescript
import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

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
const WORKSPACE = path.resolve(process.cwd(), "../..");
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
      return res.status(500).send({ error: error.message });
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

    return res.type("video/mp4").sendFile(path.basename(filePath), { root: path.dirname(filePath) });
  });
}

function runEditlyRender(
  job: RenderJob,
  edl: unknown,
  footagePath: string,
  musicPath: string | null
): void {
  job.status = "rendering";
  job.progress = 10;

  // Write EDL to temp file for the render
  const edlTmp = path.join("/tmp", `render-edl-${job.renderJobId}.json`);
  fs.writeFileSync(edlTmp, JSON.stringify(edl, null, 2));

  const outputTmp = path.join("/tmp", `render-output-${job.renderJobId}.mp4`);

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

  const proc = spawn("python3", [scriptTmp], {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
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
  });

  proc.on("error", (err) => {
    job.status = "failed";
    job.error = `Failed to start render: ${err.message}`;
  });
}
```

---

## 4. apps/web/src/lib/api-client.ts

```typescript
// Re-export refineEDL from root api-client with local type resolution
import type { ProjectEDL as MonetEDL } from "@monet/edl";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// ─── Vibe Generate ───────────────────────────────────────────

export interface VibeGenerateStatus {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "rendering" | "complete" | "failed";
  progress: number;
  message: string;
  result?: {
    projectId: string;
    openReelProject: unknown;
    edl: MonetEDL;
    dnaPath: string;
  };
  error?: string;
}

export async function generateVibeEdit(
  files: { footage: File; reference: File; music?: File },
  projectName: string
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("footage", files.footage);
  formData.append("reference", files.reference);
  if (files.music) formData.append("music", files.music);
  formData.append("projectName", projectName);

  const res = await fetch(`${API_BASE}/api/vibe-generate`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
  return res.json();
}

export async function getVibeGenerateStatus(jobId: string): Promise<VibeGenerateStatus> {
  const res = await fetch(`${API_BASE}/api/vibe-generate/status/${jobId}`);
  if (!res.ok) throw new Error(`Status failed: ${res.status}`);
  return res.json();
}

// ─── Render Export ───────────────────────────────────────────

export interface RenderStatus {
  renderJobId: string;
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  renderUrl?: string;
  error?: string;
}

export async function renderExport(
  edl: MonetEDL,
  footagePath: string,
  musicPath?: string
): Promise<{ renderJobId: string }> {
  const res = await fetch(`${API_BASE}/api/render/vibe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edl, footagePath, musicPath }),
  });
  if (!res.ok) throw new Error(`Render failed: ${res.status}`);
  return res.json();
}

export async function getRenderStatus(renderJobId: string): Promise<RenderStatus> {
  const res = await fetch(`${API_BASE}/api/render/vibe/status/${renderJobId}`);
  if (!res.ok) throw new Error(`Render status failed: ${res.status}`);
  return res.json();
}

interface PreviewFrame {
  timestamp: number;
  imageUrl: string;
}

export interface RefineEDLStreamEvents {
  onChunk?: (text: string) => void;
  onClarification?: (q: string) => void;
  onDone?: (payload: { edl: any; edlId: string; scores: any }) => void;
  onError?: (err: { code: string; message: string }) => void;
}

export async function refineEDL(
  params: {
    projectId: string;
    edlId?: string;
    edl: any;
    feedback: string;
    intentId?: string;
    analysisId?: string;
    annotations?: any;
    referenceStyle?: any;
    referenceMode?: "strict_replication" | "inspired";
  },
  events: RefineEDLStreamEvents = {},
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/refine-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referenceMode: "strict_replication",
      ...params,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    events.onError?.({
      code: "HTTP_ERROR",
      message: `Server returned ${res.status}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const obj = JSON.parse(payload);
            if (obj.chunk) events.onChunk?.(obj.chunk);
            else if (obj.clarification) events.onClarification?.(obj.clarification);
            else if (obj.error)
              events.onError?.({ code: obj.error, message: obj.message ?? "" });
            else if (obj.done)
              events.onDone?.({ edl: obj.edl, edlId: obj.edlId, scores: obj.scores });
          } catch {
            // ignore parse errors on partial frames
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      events.onError?.({ code: "ABORTED", message: "User cancelled" });
    } else {
      events.onError?.({ code: "STREAM_ERROR", message: String(err) });
    }
  } finally {
    reader.releaseLock();
  }
}
```

---

## 5. apps/web/src/components/editor/MonetGeneratePanel.tsx

```tsx
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useProjectStore } from "../../stores/project-store";
import { LivePreview } from "./LivePreview";
import { TimelineEditor } from "./TimelineEditor";
import { ClipInspector } from "./ClipInspector";
import { SpatialVFXPanel } from "./SpatialVFXPanel";

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface JobStatus {
  jobId: string;
  status: string;
  progress: number;
  message: string;
  result?: {
    projectId: string;
    openReelProject: unknown;
    edl: unknown;
    dnaPath: string;
  };
  error?: string;
}

export function MonetGeneratePanel(): React.JSX.Element {
  const getStore = useProjectStore.getState;
  const setStore = useProjectStore.setState;
  const project = useProjectStore((s: any) => s.project);

  const [footageFile, setFootageFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState(`kove-${Date.now()}`);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<{ status: string; progress: number; renderUrl?: string; error?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!footageFile || !referenceFile) return;

    setIsGenerating(true);
    setJobStatus(null);

    const formData = new FormData();
    formData.append("footage", footageFile);
    formData.append("reference", referenceFile);
    if (musicFile) formData.append("music", musicFile);
    formData.append("projectName", projectName);

    try {
      const res = await fetch(`${API_BASE}/api/vibe-generate`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { jobId } = await res.json();

      setJobStatus({ jobId, status: "queued", progress: 0, message: "Queued" });

      // Poll status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/vibe-generate/status/${jobId}`);
          if (!statusRes.ok) return;
          const data: JobStatus = await statusRes.json();
          setJobStatus(data);

          if (data.status === "complete" || data.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setIsGenerating(false);

            if (data.status === "complete" && data.result) {
              hydrateProject(data.result);
            }
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      setJobStatus({
        jobId: "",
        status: "failed",
        progress: 0,
        message: err.message || "Failed to start generation",
        error: err.message,
      });
      setIsGenerating(false);
    }
  }, [footageFile, referenceFile, musicFile, projectName]);

  function hydrateProject(result: NonNullable<JobStatus["result"]>) {
    const existing = getStore().project;
    const edl = result.edl as any;
    const openReel = result.openReelProject as any;

    const mediaItems = openReel?.mediaLibrary?.items?.map((item: any) => ({
      id: item.id,
      path: item.path || "",
      duration: item.metadata?.duration || 0,
      type: (item.type || "video") as "video",
    })) || [];

    setStore({
      project: {
        ...existing,
        id: result.projectId,
        name: result.projectId,
        edl: edl,
        mediaLibrary: { items: mediaItems },
        modifiedAt: Date.now(),
      },
    });
  }

  const handleExport = useCallback(async () => {
    const currentEdl = getStore().project?.edl;
    if (!currentEdl) return;

    const footagePath = getStore().project?.mediaLibrary?.items?.[0]?.path || "";

    try {
      const res = await fetch(`${API_BASE}/api/render/vibe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edl: currentEdl,
          footagePath,
          musicPath: null,
        }),
      });

      if (!res.ok) throw new Error(`Render error ${res.status}`);
      const { renderJobId: rid } = await res.json();
      setRenderJobId(rid);
      setRenderStatus({ status: "queued", progress: 0 });

      const pollRender = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/render/vibe/status/${rid}`);
          if (!statusRes.ok) return;
          const data = await statusRes.json();
          setRenderStatus(data);
          if (data.status === "complete" || data.status === "failed") {
            clearInterval(pollRender);
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      setRenderStatus({ status: "failed", progress: 0, error: err.message });
    }
  }, [getStore, setStore]);

  const statusColor = jobStatus?.status === "complete"
    ? "border-emerald-500 text-emerald-600"
    : jobStatus?.status === "failed"
    ? "border-destructive text-destructive"
    : "";

  return (
    <aside className="flex w-full max-w-md flex-col gap-4 rounded border bg-background p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Kove Vibe Edit</h2>
        <p className="text-xs text-muted-foreground">
          Upload footage + reference, get an AI-edited timeline you can tweak and export.
        </p>
      </header>

      {/* File inputs */}
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Footage (required)</span>
        <input
          type="file"
          accept="video/*"
          className="rounded border bg-background px-2 py-1"
          onChange={(e) => setFootageFile(e.target.files?.[0] || null)}
        />
        {footageFile && <span className="text-muted-foreground truncate">{footageFile.name}</span>}
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Reference (required)</span>
        <input
          type="file"
          accept="video/*"
          className="rounded border bg-background px-2 py-1"
          onChange={(e) => setReferenceFile(e.target.files?.[0] || null)}
        />
        {referenceFile && <span className="text-muted-foreground truncate">{referenceFile.name}</span>}
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Music (optional)</span>
        <input
          type="file"
          accept="audio/*"
          className="rounded border bg-background px-2 py-1"
          onChange={(e) => setMusicFile(e.target.files?.[0] || null)}
        />
        {musicFile && <span className="text-muted-foreground truncate">{musicFile.name}</span>}
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Project name</span>
        <input
          className="rounded border bg-background px-2 py-1"
          value={projectName}
          onChange={(e) => setProjectName(e.currentTarget.value)}
        />
      </label>

      {/* Generate button */}
      <button
        className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
        type="button"
        disabled={isGenerating || !footageFile || !referenceFile}
        onClick={handleGenerate}
      >
        {isGenerating ? "Generating..." : "Generate Vibe Edit"}
      </button>

      {/* Job progress */}
      {jobStatus && (
        <div className={`rounded border px-3 py-2 text-xs ${statusColor}`}>
          <div className="font-medium">{jobStatus.message}</div>
          <div className="w-full h-2 bg-muted rounded overflow-hidden mt-2">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${jobStatus.progress}%` }}
            />
          </div>
          <div className="text-right mt-1">{jobStatus.progress}%</div>
          {jobStatus.error && (
            <div className="text-destructive mt-1 break-all">{jobStatus.error}</div>
          )}
        </div>
      )}

      {/* Export */}
      {jobStatus?.status === "complete" && (
        <div className="flex gap-2">
          <button
            className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground"
            type="button"
            onClick={handleExport}
          >
            Export MP4
          </button>
        </div>
      )}

      {/* Render status */}
      {renderStatus && (
        <div className={`rounded border px-3 py-2 text-xs ${
          renderStatus.status === "complete" ? "border-emerald-500 text-emerald-600" :
          renderStatus.status === "failed" ? "border-destructive text-destructive" : ""
        }`}>
          <div className="font-medium">
            {renderStatus.status === "complete" ? "Render Complete" :
             renderStatus.status === "failed" ? "Render Failed" :
             `Rendering... ${renderStatus.progress}%`}
          </div>
          {renderStatus.renderUrl && (
            <a
              href={`${API_BASE}${renderStatus.renderUrl}`}
              target="_blank"
              rel="noopener"
              className="text-primary underline mt-1 inline-block"
            >
              Download MP4
            </a>
          )}
          {renderStatus.error && (
            <div className="text-destructive mt-1">{renderStatus.error}</div>
          )}
        </div>
      )}

      <LivePreview />

      <TimelineEditor
        selectedClipId={selectedClipId}
        onSelectClip={setSelectedClipId}
      />

      {selectedClipId && (
        <ClipInspector
          selectedClipId={selectedClipId}
          onClose={() => setSelectedClipId(null)}
        />
      )}

      <SpatialVFXPanel
        selectedClipId={selectedClipId}
        apiBaseUrl={API_BASE}
      />
    </aside>
  );
}
```

---

## 6. apps/web/src/stores/edl-adapter.ts

```typescript
import type { ProjectEDL as MonetEDL } from "@monet/edl";

interface ActionResult {
  success: boolean;
  error?: { code: string; message: string };
}

export async function applyEDLToProject(
  edl: MonetEDL,
  get: any,
  set: any
): Promise<ActionResult> {
  try {
    if (!edl) {
      return {
        success: false,
        error: { code: "INVALID_EDL", message: "EDL missing" },
      };
    }

    const existing = get().project;
    set({
      project: {
        ...existing,
        edl,
        modifiedAt: Date.now(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[EDL Adapter] Failed", error);
    return {
      success: false,
      error: {
        code: "ADAPTER_FAIL",
        message: "Failed to apply EDL to project",
      },
    };
  }
}

export function hydrateFromOpenReelProject(
  openReelProject: any,
  get: any,
  set: any
): ActionResult {
  try {
    if (!openReelProject || typeof openReelProject !== "object") {
      return { success: false, error: { code: "INVALID_PROJECT", message: "OpenReel project missing" } };
    }

    const existing = get().project;

    // Extract media items
    const mediaItems = (openReelProject.mediaLibrary?.items || []).map((item: any) => ({
      id: item.id,
      path: item.path || "",
      duration: item.metadata?.duration || 0,
      type: (item.type || "video") as "video",
    }));

    // Extract timeline from OpenReel format
    const openReelTracks = openReelProject.timeline?.tracks || [];
    const videoTrack = openReelTracks.find((t: any) => t.type === "video");

    // Build EDL-compatible clips from OpenReel clips
    const clips = (videoTrack?.clips || []).map((clip: any) => ({
      id: clip.id,
      mediaId: clip.mediaId || "footage-main",
      startTime: clip.startTime || 0,
      duration: clip.duration || 1,
      inPoint: clip.inPoint || clip.startTime || 0,
      outPoint: clip.outPoint || (clip.startTime + clip.duration) || 1,
      speed: clip.speed || 1,
      colorGrade: clip.meta?.colorGrade || "normal",
      transforms: clip.transform || {
        position: [{ time: 0, x: 0, y: 0 }],
        scale: [{ time: 0, value: 1 }],
        rotation: [{ time: 0, value: 0 }],
      },
      audio: { gain: clip.volume || 1 },
      effects: clip.effects || [],
      transition: clip.transition || undefined,
      meta: clip.meta || {},
    }));

    // Build MonetEDL
    const edl: MonetEDL = {
      version: 1,
      id: openReelProject.id || `edl-${Date.now()}`,
      meta: {
        createdAt: openReelProject.createdAt || Date.now(),
        updatedAt: Date.now(),
        aspectRatio: "9:16",
        fps: openReelProject.settings?.frameRate || 30,
        sampleRate: openReelProject.settings?.sampleRate || 44100,
      },
      assets: { media: {}, audio: {}, overlays: {} },
      timeline: {
        duration: openReelProject.timeline?.duration || 0,
        tracks: [
          {
            id: "video-main",
            type: "video",
            clips,
            order: 0,
            locked: false,
            hidden: false,
          },
        ],
        markers: [],
      },
    } as MonetEDL;

    set({
      project: {
        ...existing,
        id: openReelProject.id || existing?.id || `project-${Date.now()}`,
        name: openReelProject.name || existing?.name || "Kove Project",
        edl,
        mediaLibrary: { items: mediaItems },
        modifiedAt: Date.now(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[EDL Adapter] Hydrate failed", error);
    return { success: false, error: { code: "HYDRATE_FAIL", message: "Failed to hydrate from OpenReel project" } };
  }
}
```

---

## 7. apps/web/src/components/editor/ClipInspector.tsx — AI Analysis Panel (diff)

Add this block after the Track Type display (after line 173, before `{/* Start Time */}`):

```tsx
{/* AI Analysis Panel */}
{selectedClip.meta?.semanticEvent ? (
  <div className="border rounded bg-muted/20 p-2 mt-1">
    <span className="font-semibold text-primary block mb-1">AI Analysis</span>
    <div className="flex flex-col gap-1 text-[10px]">
      {selectedClip.meta.shotType && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shot Type:</span>
          <span className="capitalize">{selectedClip.meta.shotType}</span>
        </div>
      )}
      {selectedClip.meta.cameraMotion && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Camera Motion:</span>
          <span className="capitalize">{selectedClip.meta.cameraMotion}</span>
        </div>
      )}
      {selectedClip.meta.semanticEvent.description && (
        <div className="mt-1">
          <span className="text-muted-foreground">Description:</span>
          <p className="mt-0.5 italic">{selectedClip.meta.semanticEvent.description}</p>
        </div>
      )}
      {selectedClip.meta.semanticEvent.emotion && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Emotion:</span>
          <span className="capitalize">{selectedClip.meta.semanticEvent.emotion}</span>
        </div>
      )}
      {selectedClip.meta.semanticEvent.event_type && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Event Type:</span>
          <span className="capitalize">{selectedClip.meta.semanticEvent.event_type}</span>
        </div>
      )}
      {selectedClip.meta.semanticEvent.narrative_role && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Narrative Role:</span>
          <span className="capitalize font-medium">{selectedClip.meta.semanticEvent.narrative_role}</span>
        </div>
      )}
      {selectedClip.meta.semanticEvent.importance != null && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Importance:</span>
          <span>{selectedClip.meta.semanticEvent.importance}/10</span>
        </div>
      )}
    </div>
  </div>
) : (
  <div className="border rounded bg-muted/10 p-2 mt-1 text-[10px] text-muted-foreground italic">
    No AI analysis — manually added
  </div>
)}
```

---

## 8. scripts/analyzers/footage_analyzer.py

```python
"""
Footage Analyzer
Analyzes the USER'S footage to find its own segments, motion peaks,
semantic events, and beat alignment.

This is separate from the reference DNA — the reference provides STYLE,
the footage provides CONTENT.
"""

import json
import os
import subprocess
import tempfile
import logging
from typing import Dict, List

from llm_provider import call_vision_llm

logger = logging.getLogger(__name__)


def analyze_footage(video_path: str, music_path: str = None) -> Dict:
    """
    Analyze user footage to extract segments, motion, semantics, beats.
    Returns footage_analysis dict with: segments[], beats[], motion_peaks[].
    """
    print("\n  Analyzing footage for edit segments...")
    
    info = _get_video_info(video_path)
    
    # 1. Detect natural scene cuts in footage (higher threshold to avoid 200 tiny segments)
    print("    [1/5] Detecting footage cuts...")
    threshold = 0.25 if info["duration"] > 30 else 0.15
    cuts = _detect_cuts(video_path, threshold=threshold)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    
    segments = []
    for i in range(len(cut_times) - 1):
        start = cut_times[i]
        end = cut_times[i + 1]
        dur = end - start
        if dur < 0.05:
            continue
        segments.append({
            "index": len(segments),
            "start": start,
            "end": end,
            "duration": dur,
        })
    print(f"    Found {len(segments)} footage segments")
    
    # 2. Analyze motion per segment
    print("    [2/5] Analyzing motion...")
    from motion_analyzer import analyze_motion, compute_motion_stats
    motion_data = analyze_motion(video_path, fps=5.0)
    
    motion_peaks = []
    for seg in segments:
        seg_motion = [m for m in motion_data if seg["start"] <= m["time"] <= seg["end"]]
        if seg_motion:
            stats = compute_motion_stats(seg_motion)
            seg["motion_magnitude"] = stats["avg_magnitude"]
            seg["motion_peak"] = stats["peak_magnitude"]
        else:
            seg["motion_magnitude"] = 0
            seg["motion_peak"] = 0
        
        # Track motion peaks (top 20% by peak magnitude)
        motion_peaks.append({
            "time": seg["start"] + seg["duration"] / 2,
            "magnitude": seg["motion_peak"],
        })
    
    # 3. Classify shot types for each segment
    print("    [3/5] Classifying shot types...")
    from shot_type_classifier import classify_shot_type
    shot_type_results = classify_shot_type(video_path, segments)
    for i, seg in enumerate(segments):
        if i < len(shot_type_results):
            seg["shotType"] = shot_type_results[i]["shotType"]
        else:
            seg["shotType"] = "medium"
    
    # 4. Semantic analysis per segment (batch via LLM)
    print("    [4/5] Semantic analysis of footage...")
    _analyze_footage_semantics(video_path, segments)
    
    # 5. Detect beats from music
    print("    [5/5] Detecting beats...")
    beats = []
    if music_path and os.path.exists(music_path):
        from beat_detector import detect_beats
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run([
            "ffmpeg", "-y", "-i", music_path, "-vn",
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp
        ], capture_output=True, timeout=30)
        
        if os.path.exists(audio_tmp) and os.path.getsize(audio_tmp) > 1000:
            beat_result = detect_beats(audio_tmp)
            beats = beat_result.get("beats", [])
            print(f"    Music: {beat_result.get('tempo_bpm', 0):.0f} BPM, {len(beats)} beats")
        os.remove(audio_tmp)
    elif info.get("has_audio"):
        # Extract audio from footage itself
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path, "-vn",
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp
        ], capture_output=True, timeout=30)
        
        if os.path.exists(audio_tmp) and os.path.getsize(audio_tmp) > 1000:
            from beat_detector import detect_beats
            beat_result = detect_beats(audio_tmp)
            raw_beats = beat_result.get("beats", [])
            beats = [b["time"] if isinstance(b, dict) else b for b in raw_beats]
            print(f"    Audio: {beat_result.get('tempo_bpm', 0):.0f} BPM, {len(beats)} beats")
        os.remove(audio_tmp)
    
    # Rank segments by combined score
    _rank_segments(segments, beats)
    
    return {
        "segments": segments,
        "beats": beats,
        "motion_peaks": motion_peaks,
        "duration": info["duration"],
        "resolution": {"width": info["width"], "height": info["height"]},
        "fps": info["fps"],
    }


def _get_video_info(path: str) -> dict:
    """Get video metadata."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        video = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), None)
        audio = next((s for s in data.get("streams", []) if s["codec_type"] == "audio"), None)
        fps = 30
        if video and video.get("r_frame_rate"):
            try:
                n, d = video["r_frame_rate"].split("/")
                fps = int(n) / int(d)
            except:
                pass
        return {
            "duration": float(fmt.get("duration", 0)),
            "width": video.get("width", 0) if video else 0,
            "height": video.get("height", 0) if video else 0,
            "fps": fps,
            "has_audio": audio is not None,
        }
    except:
        return {"duration": 0, "width": 0, "height": 0, "fps": 30, "has_audio": False}


def _detect_cuts(video_path: str, threshold: float = 0.15) -> list:
    """Detect cut points in footage."""
    import re
    try:
        result = subprocess.run([
            "ffmpeg", "-hide_banner", "-y", "-i", video_path,
            "-vf", f"select='gt(scene,{threshold})',showinfo",
            "-vsync", "vfr", "-f", "null", "-"
        ], capture_output=True, text=True, timeout=120)
        
        cuts = []
        for line in result.stderr.split("\n"):
            if "showinfo" in line and "pts_time" in line:
                pts_match = re.search(r'pts_time:(\S+)', line)
                score_match = re.search(r'lavfi\.scene_score=(\S+)', line)
                if pts_match:
                    cuts.append({
                        "time": float(pts_match.group(1)),
                        "score": float(score_match.group(1)) if score_match else 0,
                    })
        return cuts
    except:
        return []


def _analyze_footage_semantics(video_path: str, segments: list):
    """Run LLM semantic analysis on footage segments."""
    import tempfile
    
    # Extract middle frame for each segment
    tmpdir = tempfile.mkdtemp(prefix="footage-sem-")
    frames = {}
    
    for seg in segments[:20]:
        mid = seg["start"] + seg["duration"] / 2
        out = os.path.join(tmpdir, f"seg_{seg['index']:03d}.jpg")
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(mid), "-i", video_path,
            "-vframes", "1", "-q:v", "2", out
        ], capture_output=True, timeout=10)
        if os.path.exists(out):
            frames[seg["index"]] = out
    
    if not frames:
        for seg in segments:
            seg["semantic_importance"] = 5
            seg["semantic_event_type"] = "action"
            seg["semantic_emotion"] = "neutral"
            seg["semantic_description"] = ""
        return
    
    # Batch in chunks of 5
    BATCH = 5
    items = list(frames.items())
    chunks = [items[i:i+BATCH] for i in range(0, len(items), BATCH)]
    
    import time as _time
    
    all_results = {}
    for chunk in chunks:
        chunk_dict = dict(chunk)
        chunk_segs = [s for s in segments if s["index"] in chunk_dict]
        
        prompt = _build_footage_prompt(chunk_segs)
        result = call_vision_llm(prompt, list(chunk_dict.values()))
        
        if result:
            parsed = _parse_footage_semantics(result, chunk_segs)
            all_results.update(parsed)
        
        _time.sleep(0.5)
    
    # Fill in defaults for segments without results
    for seg in segments:
        if seg["index"] in all_results:
            r = all_results[seg["index"]]
            seg["semantic_importance"] = r.get("importance", 5)
            seg["semantic_event_type"] = r.get("event_type", "action")
            seg["semantic_emotion"] = r.get("emotion", "neutral")
            seg["semantic_description"] = r.get("description", "")
        else:
            seg["semantic_importance"] = 5
            seg["semantic_event_type"] = "action"
            seg["semantic_emotion"] = "neutral"
            seg["semantic_description"] = ""
    
    # Cleanup
    for f in frames.values():
        if os.path.exists(f):
            os.remove(f)
    os.rmdir(tmpdir)


def _build_footage_prompt(segments: list) -> str:
    """Build prompt for footage semantic analysis."""
    seg_desc = []
    for s in segments:
        seg_desc.append(f"Segment {s['index']}: {s['start']:.1f}s-{s['end']:.1f}s ({s['duration']:.1f}s, {s.get('shotType','?')})")
    
    return f"""Analyze these video footage segments and rate each for editing potential.

SEGMENTS:
{chr(10).join(seg_desc)}

For each segment provide:
1. "importance": How visually interesting for an edit (1-10). Action/exciting moments score higher.
2. "event_type": What's happening (setup/action/reaction/celebration/transition)
3. "emotion": Emotional tone (excitement/tension/joy/neutral/calm)
4. "description": Brief 1-sentence description

Return ONLY a JSON array:
[{{"shotIndex": 0, "importance": 7, "event_type": "action", "emotion": "excitement", "description": "Player dribbles past defender"}}]"""


def _parse_footage_semantics(result: str, segments: list) -> dict:
    """Parse LLM response into segment semantics."""
    import re
    try:
        match = re.search(r'\[[\s\S]*\]', result)
        if match:
            events = json.loads(match.group())
            return {e.get("shotIndex", -1): e for e in events}
    except Exception as e:
        logger.warning(f"Footage semantics parse error: {e}")
    return {}


def _rank_segments(segments: list, beats: list):
    """
    Rank segments by combined score for editing potential.
    
    Scoring formula (total 0-1):
      35% semantic importance (1-10 from LLM)
      30% motion intensity (peak magnitude, normalized)
      20% beat proximity (distance to nearest music beat)
      15% duration fitness (penalize very short/long segments)
    """
    if not segments:
        return
    
    # Normalize motion across all segments for relative ranking
    max_motion = max((s.get("motion_peak", 0) for s in segments), default=1) or 1
    
    for seg in segments:
        # Semantic importance (1-10 → 0-1)
        sem_score = seg.get("semantic_importance", 5) / 10.0
        
        # Motion intensity (normalized against max in footage)
        motion_raw = seg.get("motion_peak", 0)
        motion_score = min(1.0, motion_raw / max_motion)
        
        # Beat proximity (closer to beat = higher, 200ms tolerance)
        beat_score = 0
        if beats and len(beats) > 0:
            min_dist = min(abs(seg["start"] - b) for b in beats)
            beat_score = max(0, 1.0 - min_dist / 0.3)
        
        # Duration fitness: penalize segments <0.5s or >4s
        dur = seg.get("duration", 1)
        if dur < 0.5:
            dur_score = dur / 0.5 * 0.5
        elif dur > 4.0:
            dur_score = max(0.3, 1.0 - (dur - 4.0) / 4.0)
        else:
            dur_score = 1.0
        
        # Combined score
        seg["edit_score"] = (
            sem_score * 0.35 +
            motion_score * 0.30 +
            beat_score * 0.20 +
            dur_score * 0.15
        )
    
    # Sort by edit score (best first)
    segments.sort(key=lambda s: s.get("edit_score", 0), reverse=True)
    
    # Log top 5 for debugging
    print(f"    Top segments by edit_score:")
    for seg in segments[:5]:
        print(f"      [{seg['index']}] {seg['start']:.1f}-{seg['end']:.1f}s "
              f"score={seg['edit_score']:.3f} "
              f"motion={seg.get('motion_peak',0):.3f} "
              f"sem={seg.get('semantic_importance',5)} "
              f"type={seg.get('shotType','?')}")
```

---

## 9. scripts/monet_pipeline.py — generate_edl_from_dna() (full function)

```python
def generate_edl_from_dna(dna: dict, footage_path: str, music_path: Optional[str] = None) -> dict:
    """
    Generate MonetEDL by applying reference grammar to footage content.
    
    Algorithm:
    1. Calculate target clip count from reference's avgShotDuration
    2. Rank footage segments by motion + semantics + beat proximity
    3. Select top N segments matching reference's shotType distribution
    4. Order by narrative arc (establishing → building → climax → resolution)
    5. Snap cuts to music beats
    6. Apply reference effects, color grade, speed
    """
    footage_info = get_video_info(footage_path)
    footage_duration = footage_info["duration"]
    
    # Reference grammar rules
    ref_avg_dur = dna.get("avgShotDuration", 1.5)
    ref_shot_dist = dna.get("shotTypes", {}).get("distribution", {})
    ref_effects = dna.get("effects", {})
    ref_grade = dna.get("colorProfile", {}).get("grade", "normal")
    ref_speed = dna.get("speed", {}).get("avgSpeed", 1.0)
    ref_beats = dna.get("audioAnalysis", {}).get("beats", [])
    ref_rhythm = dna.get("rhythm", {})
    cuts_on_beat = ref_rhythm.get("cuts_on_beat", 0)
    
    # Target clip count based on reference pacing
    target_clips = max(4, int(footage_duration / ref_avg_dur)) if ref_avg_dur > 0 else 10
    print(f"  Target: {target_clips} clips @ {ref_avg_dur:.2f}s avg (footage: {footage_duration:.1f}s)")
    
    # Analyze FOOTAGE (not reference) — this is the content source
    footage_analysis = analyze_footage(footage_path, music_path)
    segments = footage_analysis["segments"]
    beats = footage_analysis["beats"]
    
    print(f"  Footage analysis: {len(segments)} segments, {len(beats)} beats, "
          f"{len(footage_analysis.get('motion_peaks', []))} motion peaks")
    
    if not segments:
        print("  Warning: No footage segments found, using whole clip")
        segments = [{"index": 0, "start": 0, "end": footage_duration, 
                      "duration": footage_duration, "shotType": "medium",
                      "motion_magnitude": 0, "edit_score": 5,
                      "semantic_importance": 5}]
    
    # Select top N segments ranked by edit_score (motion + semantics + beat proximity)
    selected = segments[:target_clips]
    print(f"  Selected {len(selected)} segments from footage (from {len(segments)} available)")
    
    # Re-sort by time for proper chronological ordering before arc reorder
    selected.sort(key=lambda s: s["start"])
    
    # Apply narrative arc ordering (establishing → building → climax → resolution)
    _apply_narrative_arc(selected, ref_shot_dist)
    
    # Log final clip order
    print(f"  Final clip order (narrative arc applied):")
    for i, seg in enumerate(selected):
        print(f"    Clip {i}: {seg['start']:.1f}-{seg['end']:.1f}s "
              f"({seg['duration']:.2f}s) type={seg.get('shotType','?')} "
              f"score={seg.get('edit_score',0):.3f}")
    
    # Snap to beats if reference is beat-driven
    if cuts_on_beat > 50 and beats:
        _snap_to_beats(selected, beats)
    
    # Build EDL clips
    clips = []
    
    # Calculate total effects to distribute across clips
    total_effects = ref_effects.get("totalEffects", 0)
    total_ref_shots = dna.get("totalShots", 1)
    effects_per_clip = total_effects / total_ref_shots if total_ref_shots > 0 else 0
    ref_visual_effects = ref_effects.get("visualEffects", {})
    weighted_effect_types = []
    for effect_name, count in ref_visual_effects.items():
        if effect_name == "none" or not count:
            continue
        weight = int(round(count))
        weighted_effect_types.extend([effect_name] * max(1, weight))
    
    import random
    random.seed(42)  # Deterministic effect distribution
    
    for i, seg in enumerate(selected):
        # Duration: use segment's natural duration, scaled by reference pacing
        duration = seg["duration"]
        # Cap at reference avg * 1.5 to avoid overly long clips
        duration = min(duration, ref_avg_dur * 1.5)
        # Ensure minimum duration
        duration = max(duration, 0.1)
        
        # Importance from footage semantic analysis
        importance = seg.get("semantic_importance", 5)
        
        # Build clip-level effects (blur EXCLUDED — blur is a transition, not a clip effect)
        effects = []
        non_blur_effects = [e for e in weighted_effect_types if e != "blur"]
        if non_blur_effects and effects_per_clip >= 0.3:
            apply_prob = min(0.35, effects_per_clip / 3)
            if random.random() < apply_prob:
                chosen_type = random.choice(non_blur_effects)
                effects.append({
                    "id": f"effect-{i}-{chosen_type}",
                    "type": chosen_type,
                    "start": 0,
                    "duration": duration,
                    "params": {},
                })
        
        # Transition: use reference's transition distribution
        clip_transition = None
        ref_transitions = dna.get("effects", {}).get("transitions", {})
        if ref_transitions:
            trans_types = list(ref_transitions.keys())
            trans_weights = list(ref_transitions.values())
            if trans_types and sum(trans_weights) > 0:
                chosen_trans = random.choices(trans_types, weights=trans_weights, k=1)[0]
                if chosen_trans != "cut":
                    clip_transition = {
                        "type": chosen_trans,
                        "duration": 0.15,
                    }
        
        # Blur as SHORT transition (not full-clip effect) — 15% of clips max
        blur_ratio = ref_visual_effects.get("blur", 0) / max(1, dna.get("totalShots", 1))
        if not clip_transition and random.random() < min(0.15, blur_ratio * 0.3):
            clip_transition = {
                "type": "blur",
                "duration": min(0.2, duration * 0.15),
            }
        
        # Speed: default to natural (1.0x), vary only for extreme importance
        if importance >= 9:
            speed = 0.5    # dramatic slow-mo
        elif importance >= 7:
            speed = 0.75   # subtle slow-mo
        elif importance >= 4:
            speed = 1.0    # NORMAL — most content stays here
        elif importance >= 2:
            speed = 1.5    # fast for filler
        else:
            speed = 2.0    # very fast for lowest-value clips
        
        # Only inflate speed if reference is genuinely fast-paced with ramps
        if ref_speed > 1.5 and dna.get("speed", {}).get("hasRamps", False):
            if importance < 4:
                speed = max(speed, min(ref_speed, 1.75))
        
        # Narrative role based on position
        position_ratio = i / max(1, len(selected) - 1)
        if position_ratio < 0.2:
            narrative_role = "establishing"
        elif position_ratio < 0.6:
            narrative_role = "building"
        elif position_ratio < 0.9:
            narrative_role = "climax"
        else:
            narrative_role = "resolution"
        
        clip = {
            "id": f"clip-{i:03d}",
            "mediaId": "footage-main",
            "startTime": seg["start"],
            "duration": duration,
            "inPoint": seg["start"],
            "outPoint": min(seg["start"] + duration, footage_duration),
            "speed": speed,
            "colorGrade": ref_grade,
            "transforms": {
                "position": [{"time": 0, "x": 0, "y": 0}],
                "scale": [{"time": 0, "value": 1}],
                "rotation": [{"time": 0, "value": 0}],
            },
            "audio": {"gain": 1},
            "effects": effects,
            "meta": {
                "shotType": seg.get("shotType", "medium"),
                "cameraMotion": "static",
                "subjectMotion": "running",
                "semanticEvent": {
                    "description": seg.get("semantic_description", ""),
                    "emotion": seg.get("semantic_emotion", "neutral"),
                    "event_type": seg.get("semantic_event_type", "action"),
                    "narrative_role": narrative_role,
                    "importance": importance,
                    "time": seg["start"],
                },
            },
        }
        
        if clip_transition:
            clip["transition"] = clip_transition
        
        clips.append(clip)
    
    # Calculate total duration
    total_duration = sum(c["duration"] for c in clips) if clips else 0
    
    # Build EDL
    edl = {
        "version": 1,
        "id": f"edl-{dna['name']}-{int(__import__('time').time())}",
        "meta": {
            "createdAt": int(__import__('time').time() * 1000),
            "updatedAt": int(__import__('time').time() * 1000),
            "aspectRatio": "1:1" if footage_info["width"] == footage_info["height"] else "9:16" if footage_info["height"] > footage_info["width"] else "16:9",
            "fps": footage_info["fps"],
            "sampleRate": 48000,
            "projectId": dna["name"],
            "renderMethod": "editly-full",
        },
        "assets": {
            "media": {
                "footage-main": {
                    "id": "footage-main",
                    "path": footage_path,
                    "duration": footage_duration,
                    "width": footage_info["width"],
                    "height": footage_info["height"],
                }
            },
            "audio": {},
            "overlays": {},
        },
        "timeline": {
            "duration": total_duration,
            "markers": [],
            "tracks": [
                {
                    "id": "video-main",
                    "type": "video",
                    "order": 0,
                    "locked": False,
                    "hidden": False,
                    "clips": clips,
                }
            ],
        },
        "music": {
            "sourceId": music_path,
            "volume": 0.8,
        } if music_path else None,
    }
    
    print(f"  Generated {len(clips)} clips, {total_duration:.1f}s total")
    return edl
```
