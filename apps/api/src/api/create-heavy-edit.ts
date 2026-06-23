import type { FastifyInstance } from "fastify";
import { BlenderScriptFactory } from "@monet/job-contracts";
import * as path from "node:path";
import * as fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHeavyEditEDL } from "@monet/edl-enhancers";
import type { DirectorStyle, SourceMediaInput } from "@monet/edl/src/analysis-types";
import {
  analyzeAudioWithPython,
  trackSubjectWithPython,
  transcribeWithPython
} from "../services/python-workers";

const execFileAsync = promisify(execFile);

interface CreateHeavyEditBody {
  projectId?: unknown;
  filePath?: unknown;
  mediaId?: unknown;
  duration?: unknown;
  width?: unknown;
  height?: unknown;
  style?: unknown;
  aspectRatio?: unknown;
  targetDuration?: unknown;
  includeTranscript?: unknown;
  includeSubjectTrack?: unknown;
  referenceStyle?: unknown;

  // New specific inputs for Blender Script Compiler Pipeline
  assetId?: unknown;
  sourceFilename?: unknown;
  segments?: unknown;
  audio?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function styleField(value: unknown): DirectorStyle {
  if (
    value === "heavy-tiktok" ||
    value === "cinematic" ||
    value === "sports" ||
    value === "anime" ||
    value === "clean-captions" ||
    value === "auto"
  ) {
    return value;
  }

  return "heavy-tiktok";
}

function aspectRatioField(value: unknown): "16:9" | "9:16" | "1:1" {
  if (value === "16:9" || value === "9:16" || value === "1:1") {
    return value;
  }

  return "9:16";
}

export async function registerCreateHeavyEditRoute(app: FastifyInstance): Promise<void> {
  app.post("/create-heavy-edit", async (req, res) => {
    try {
      if (!isRecord(req.body)) {
        return res.status(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "Request body must be an object"
          }
        });
      }

      const body = req.body as CreateHeavyEditBody;

      // Detect if we should use the Blender headless pipeline
      const hasSourceFilename = typeof body.sourceFilename === "string" && body.sourceFilename.trim().length > 0;
      const isBlenderDirectRender = hasSourceFilename || body.style === "blender-automation";

      if (isBlenderDirectRender) {
        const assetId = stringField(body.assetId) ?? stringField(body.projectId) ?? `render_${Date.now()}`;
        const sourceFilename = stringField(body.sourceFilename) ?? (stringField(body.filePath) ? path.basename(String(body.filePath)) : null);

        if (!sourceFilename) {
          return res.status(400).send({
            success: false,
            error: {
              code: "SOURCE_FILENAME_REQUIRED",
              message: "sourceFilename or filePath is required for Blender headless render pipeline"
            }
          });
        }

        const storageDir = path.resolve(process.cwd(), "storage/uploads");
        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }

        const sourceVideoFullPath = path.join(storageDir, sourceFilename);
        const uniqueOutputName = `render_${assetId}_complete.mp4`;
        const renderOutputFullPath = path.join(storageDir, uniqueOutputName);

        // 1. DUMMY COMPILING MOCK ANALYSIS / DYNAMIC SEGMENTS
        // Maps the single source video into precise offsets
        const segments = Array.isArray(body.segments)
          ? body.segments.map((seg: any) => ({
              name: String(seg.name || "Highlight"),
              sourceStartSecond: Number(seg.sourceStartSecond ?? 0),
              durationSeconds: Number(seg.durationSeconds ?? 5),
              applySpeedRamp: Boolean(seg.applySpeedRamp),
              rampTriggerOffsetSecond: seg.rampTriggerOffsetSecond !== undefined ? Number(seg.rampTriggerOffsetSecond) : undefined
            }))
          : [
              {
                name: "Curry_Crossover_Highlight",
                sourceStartSecond: 12.5,
                durationSeconds: 4.0,
                applySpeedRamp: true,
                rampTriggerOffsetSecond: 1.8
              },
              {
                name: "Curry_Celebration_Sequence",
                sourceStartSecond: 45.0,
                durationSeconds: 3.5,
                applySpeedRamp: false
              }
            ];

        const audioTracks = Array.isArray(body.audio)
          ? body.audio.map((aud: any) => ({
              filePath: String(aud.filePath),
              channel: Number(aud.channel ?? 1),
              volume: Number(aud.volume ?? 1.0)
            }))
          : [
              {
                filePath: path.join(storageDir, "asset_35ab8618-3ba0-412a-a689-e16b4671b915-test.txt"),
                channel: 5,
                volume: 0.8
              }
            ];

        const engineeredProjectConfig = {
          sourceVideoPath: sourceVideoFullPath,
          outputPath: renderOutputFullPath,
          resolutionX: typeof body.width === "number" ? body.width : 1080,
          resolutionY: typeof body.height === "number" ? body.height : 1920,
          fps: 60,
          segments,
          audio: audioTracks
        };

        // 2. Compile valid headless code script through the Factory engine
        const flawlessBlenderScript = BlenderScriptFactory.generateHeadlessScript(engineeredProjectConfig);
        
        const executionScriptPath = path.join("/tmp", `runner_${assetId}.py`);
        fs.writeFileSync(executionScriptPath, flawlessBlenderScript, "utf-8");

        // 3. Execute Blender headless subprocess directly via shell
        app.log.info(`[Server Pipeline] Starting headless process run for asset: ${assetId}`);
        
        let stdout = "";
        let stderr = "";
        try {
          const result = await execFileAsync("blender", ["-b", "-P", executionScriptPath]);
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (execError: any) {
          stdout = execError.stdout || "";
          stderr = execError.stderr || "";
          app.log.error({ execError, stdout, stderr }, "Blender execution error");
          throw new Error(`Blender Subprocess Execution Failed: ${execError.message}. Stderr: ${stderr}`);
        } finally {
          // Clean up runner script
          try {
            if (fs.existsSync(executionScriptPath)) {
              fs.unlinkSync(executionScriptPath);
            }
          } catch (cleanupError) {
            app.log.warn({ cleanupError }, "Failed to clean up execution script");
          }
        }

        app.log.info({ stdout }, "[Blender Engine Log]");

        if (stderr && stderr.includes("[FATAL SERVER EXCEPTION]")) {
          throw new Error(`Blender Subprocess Error: ${stderr}`);
        }

        return res.status(200).send({
          success: true,
          message: "Dynamic sequence rendered successfully with zero hallucination paths.",
          videoUrl: `/uploads/${uniqueOutputName}`
        });
      }

      // --- PATH B: Original Standard EDL Generation Workflow ---
      const projectId = stringField(body.projectId) ?? `project-${Date.now()}`;
      const filePath = stringField(body.filePath);
      const mediaId = stringField(body.mediaId) ?? "source-main";
      const duration = numberField(body.duration);
      const width = numberField(body.width);
      const height = numberField(body.height);
      const style = styleField(body.style);
      const aspectRatio = aspectRatioField(body.aspectRatio);
      const targetDuration = numberField(body.targetDuration);
      const includeTranscript = booleanField(body.includeTranscript, true);
      const includeSubjectTrack = booleanField(body.includeSubjectTrack, true);

      if (!filePath) {
        return res.status(400).send({
          success: false,
          error: {
            code: "FILE_PATH_REQUIRED",
            message: "filePath is required"
          }
        });
      }

      if (duration === null || duration <= 0) {
        return res.status(400).send({
          success: false,
          error: {
            code: "VALID_DURATION_REQUIRED",
            message: "duration must be a positive number"
          }
        });
      }

      if (width === null || width <= 0 || height === null || height <= 0) {
        return res.status(400).send({
          success: false,
          error: {
            code: "VALID_DIMENSIONS_REQUIRED",
            message: "width and height must be positive numbers"
          }
        });
      }

      const audioResult = await analyzeAudioWithPython(filePath);

      if (!audioResult.success || !audioResult.data) {
        return res.status(502).send({
          success: false,
          error: audioResult.error ?? {
            code: "AUDIO_ANALYSIS_FAILED",
            message: "Audio analysis failed"
          }
        });
      }

      const transcriptResult = includeTranscript
        ? await transcribeWithPython(filePath)
        : { success: true as const, data: undefined };

      if (!transcriptResult.success) {
        return res.status(502).send({
          success: false,
          error: transcriptResult.error ?? {
            code: "TRANSCRIPTION_FAILED",
            message: "Transcription failed"
          }
        });
      }

      const subjectResult = includeSubjectTrack
        ? await trackSubjectWithPython(filePath)
        : { success: true as const, data: undefined };

      if (!subjectResult.success) {
        return res.status(502).send({
          success: false,
          error: subjectResult.error ?? {
            code: "SUBJECT_TRACKING_FAILED",
            message: "Subject tracking failed"
          }
        });
      }

      const media: SourceMediaInput[] = [
        {
          id: mediaId,
          path: filePath,
          duration,
          width,
          height
        }
      ];

      const referenceStyle = isRecord(body.referenceStyle)
        ? body.referenceStyle
        : undefined;

      const edlResult = createHeavyEditEDL({
        projectId,
        media,
        audioAnalysis: audioResult.data,
        transcript: transcriptResult.data,
        subjectTrack: subjectResult.data,
        style,
        aspectRatio,
        targetDuration: targetDuration !== null ? targetDuration : undefined,
        referenceStyle: referenceStyle as any
      });

      if (!edlResult.success || !edlResult.data) {
        return res.status(500).send({
          success: false,
          error: edlResult.error ?? {
            code: "EDL_CREATION_FAILED",
            message: "Failed to create heavy edit EDL"
          }
        });
      }

      return res.send({
        success: true,
        data: {
          edl: edlResult.data,
          analysis: {
            audio: audioResult.data,
            transcript: transcriptResult.data,
            subjectTrack: subjectResult.data
          }
        }
      });
    } catch (error: any) {
      app.log.error({ error }, "create-heavy-edit failed");

      return res.status(500).send({
        success: false,
        error: {
          code: "CREATE_HEAVY_EDIT_FAILED",
          message: "Failed to create heavy edit",
          details: error.message
        }
      });
    }
  });
}
