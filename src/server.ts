import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import type { Env } from "./server/types/env";
import { handleUploadRequest, handleCompleteUpload, handleDirectUpload } from "./server/api/upload";
import { handleDecodeIntent, handleUpdateIntent } from "./server/api/decode-intent";
import { handleSyncFromAdvancedEditor } from "./server/api/sync-from-advanced-editor";
import { handleUploadAndDetect } from "./server/api/upload-and-detect";
import { handleAnalyze } from "./server/api/analyze";
import { handleGenerateEDL } from "./server/api/generate-edl";
import { handleRefineEDL } from "./server/api/refine-edl";
import { handleV3Analyze, handleV3Generate, handleV3Refine, handleV3Render } from "./server/api/v3-pipeline";
import { handleV3Tweak, handleV3Ask } from "./server/api/v3-tweak";
import { handleTranscribe } from "./server/api/transcribe";
import { handleAnalyzeReference } from "./server/api/analyze-reference";
import { handleDirectorFeedbackRequest } from "./server/api/director-feedback";
import { handleMedia } from "./server/api/media";
import { handleGenerateComposition } from "./server/api/generate-composition";
import { handleGetStudioProject, handlePersistStudioProject } from "./server/api/studio-project";
import { handleQueueExport, handleGetExportStatus } from "./server/api/export";
import { handleRenderPreview, handleRenderStatus } from "./server/api/render-preview";
import { handleAnalyzeDNA } from "./server/api/analyze-dna";
import { handleGeminiThinkEffects } from "./server/api/gemini-think-effects";
import { handleStyleCompile } from "./server/api/style-compile";
import { handleExportMP4 } from "./server/api/export-mp4";
import { handleDetectScenes } from "./server/api/detect-scenes";
import { handleDeepAnalysis } from "./server/api/deep-analysis";
import { handleSpecialistIsolate } from "./server/api/specialist-isolate";
import { handleSpecialistDepth } from "./server/api/specialist-depth";
import { handleSpecialistSlowmo } from "./server/api/specialist-slowmo";
import { handleReplicateStyle } from "./server/api/replicate-style";
import {
  handleCreateCheckout,
  handleCustomerPortal,
  handleBillingWebhook,
  handleGetUsage,
  handleIncrementUsage,
} from "./server/api/billing";
import {
  handleGetAffiliateProfile,
  handleGetAffiliateReferrals,
  handleGetAffiliateCommissions,
  handleClaimAffiliateCode,
  handleTrackReferral,
} from "./server/api/affiliate";
import { getDevEnv } from "./server/lib/dev-env";
import { runSandboxTestsJSON } from "./server/lib/test-engines-sandbox";
import { getAIService } from "./server/services/ai-service";
import { getEngineCapabilityContract } from "./server/lib/engine-capabilities";
import { putLocalMedia } from "./server/lib/local-media-cache";
import { runFreeCutPipeline } from "@monet/engine-freecut";
import { generateLUT, applyLUTToVideo } from "./server/lib/lut-generator";
import { generateASSFile, wordsToASS, generateWordHighlightASS } from "./server/lib/ass-text-generator";
import { generateSubjectMask, applyMaskedBlur } from "./server/lib/subject-mask";
import { clerkAuthMiddleware, createUnauthorizedResponse } from "./server/middleware/clerk-auth";
import { authGuard, createRedirectResponse } from "./server/middleware/auth-guard";
import { initSentry, trackException, trackRenderJob } from "./server/lib/sentry-init";
import { createJobStore, type JobStore } from "./server/lib/job-store";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";

// ------------------------------------------------------------------
// RESPONSE UTILS
// ------------------------------------------------------------------

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiError(code: string, message: string, status = 500): Response {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

// ------------------------------------------------------------------
// FFMPEG & BLENDER UTILS
// ------------------------------------------------------------------

function validateFFmpegCommand(command: string): boolean {
  const forbidden = [
    "&&", "$(", "`", "curl", "wget", "rm ", "sudo", "chmod", "mkfs", "dd ", "node ", "bash ", "sh "
  ];
  return !forbidden.some((token) => command.includes(token));
}

async function executeFFmpeg(args: string[], env: Env): Promise<string> {
  const apiBase = (env as any).MONET_API_URL || "http://localhost:3000";
  try {
    const resp = await fetch(`${apiBase}/api/execute/ffmpeg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args })
    });
    const data = await resp.json() as any;
    if (!resp.ok) throw new Error(data.error?.message || `FFmpeg execution failed via API (Status ${resp.status})`);
    return data.log;
  } catch (err: any) {
    console.error(`[executeFFmpeg] Fetch failed to ${apiBase}:`, err);
    throw new Error(`Rendering API connection failed at ${apiBase}. 
Check if the API server is running:
1. Run 'pnpm dev' in the root to start all services
2. Or run 'pnpm --filter @monet/api dev' in a separate terminal
3. Verify the API is listening on port 3000
Details: ${err.message}`);
  }
}

async function executeBlender(script: string, fileId: string, env: Env): Promise<string> {
  const apiBase = (env as any).MONET_API_URL || "http://localhost:3000";
  try {
    const resp = await fetch(`${apiBase}/api/execute/blender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, fileId })
    });
    const data = await resp.json() as any;
    if (!resp.ok) throw new Error(data.error?.message || `Blender execution failed via API (Status ${resp.status})`);
    return data.log;
  } catch (err: any) {
    console.error(`[executeBlender] Fetch failed to ${apiBase}:`, err);
    throw new Error(`Blender engine API connection failed at ${apiBase}. 
Check if the API server is running:
1. Run 'pnpm dev' in the root to start all services
2. Or run 'pnpm --filter @monet/api dev' in a separate terminal
3. Verify the API is listening on port 3000
Details: ${err.message}`);
  }
}

// ------------------------------------------------------------------
// INLINE HANDLERS
// ------------------------------------------------------------------

async function handleGeminiDirectEngine(request: Request, env: Env) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { engineId, prompt } = body;
    if (!engineId || !prompt || typeof engineId !== "string" || typeof prompt !== "string") {
      return apiError("INVALID_REQUEST", "Missing or invalid engineId or prompt", 400);
    }

    const contract = getEngineCapabilityContract(engineId);
    const ai = getAIService(env);

    const systemInstruction = `
You are Monet, an AI Video Director. Your task is to output the exact, executable edits for the video editing engine: "${engineId}".
You must strictly follow this engine's Editing Capability Contract:
${contract}

Guidelines for your Output:
- Respond in a clear, professional, structured format.
- Based on the user's prompt, generate the exact editing steps, timeline modifications, or script parameters.
- Do not invent any capabilities outside of the contract.
- Keep your output concise and directly executable.
`;

    const fullPrompt = `User's Creative Directive/Prompt: "${prompt}"\n\nGenerate the complete, specific edits for "${engineId}" now.`;
    const result = await ai.generateContentJSON({
      prompt: fullPrompt,
      systemInstruction,
      temperature: 0.6,
    });

    return jsonResponse({ success: true, response: result });
  } catch (err: any) {
    console.error("[api/gemini-direct-engine] failed:", err);
    return apiError("ENGINE_ERROR", err.message || "Failed to direct engine", 500);
  }
}

async function handleEnginesEdit(request: Request, env: Env) {
  console.log("[api/engines-edit] >>> NEW REQUEST RECEIVED");
  try {
    const EngineEditSchema = z.object({
      engineId: z.string(),
      fileId: z.string(),
      prompt: z.string(),
    });

    // Clone the request stream first so we never hit a "Body already consumed" crash
    console.log("[api/engines-edit] Cloning request...");
    const clonedRequest = request.clone();
    let bodyJson;
    try {
      bodyJson = await clonedRequest.json();
      console.log("[api/engines-edit] Request body parsed:", JSON.stringify(bodyJson, null, 2));
    } catch (jsonErr) {
      console.error("[api/engines-edit] JSON Parse Error:", jsonErr);
      return apiError("BAD_JSON", "Failed to parse incoming request JSON body", 400);
    }

    const parsed = EngineEditSchema.safeParse(bodyJson);
    if (!parsed.success) {
      console.error("[api/engines-edit] Validation Error:", parsed.error.format());
      return apiError("INVALID_REQUEST", "Missing required parameters: engineId, fileId, prompt", 400);
    }

    const { engineId, fileId, prompt } = parsed.data;
    console.log(`[api/engines-edit] Validated params: engine=${engineId}, fileId=${fileId}, prompt="${prompt}"`);

    const localDir = path.join(os.tmpdir(), "monet-media-dev");
    console.log(`[api/engines-edit] Target directory: ${localDir}`);
    await fs.mkdir(localDir, { recursive: true });
    
    const outputId = `edited_${fileId}.mp4`;
    const outputPath = path.join(localDir, outputId);
    console.log(`[api/engines-edit] Expected output path: ${outputPath}`);

    // Fallback lookup to check for file extensions if the raw fileId fails
    let inputPath = path.join(localDir, fileId);
    console.log(`[api/engines-edit] Checking input path: ${inputPath}`);
    let fileExists = await fs.stat(inputPath).then(() => true).catch(() => false);

    if (!fileExists) {
      console.log("[api/engines-edit] Raw fileId not found, trying with .mp4 extension...");
      inputPath = path.join(localDir, `${fileId}.mp4`);
      console.log(`[api/engines-edit] Checking fallback input path: ${inputPath}`);
      fileExists = await fs.stat(inputPath).then(() => true).catch(() => false);
    }

    if (!fileExists) {
      console.error(`[api/engines-edit] FILE NOT FOUND: ${inputPath}`);
      return apiError("NOT_FOUND", `Source video file not found in cache path: ${inputPath}`, 404);
    }
    console.log("[api/engines-edit] Input file verified.");

    console.log("[api/engines-edit] Initializing AI service...");
    const ai = getAIService(env);

    if (engineId === "freecut") {
      console.log("[api/engines-edit] Running FreeCut pipeline...");
      const result = await runFreeCutPipeline({
        userPrompt: prompt,
        rawFootagePath: inputPath,
        outputPath: outputPath,
        callGemini: async (promptText) => {
          return await ai.generateContentJSON({
            prompt: promptText,
            temperature: 0.1,
          });
        },
      });

      console.log("[api/engines-edit] FreeCut pipeline SUCCESS. Output:", result.outputPath);
      return jsonResponse({
        success: true,
        editedFileId: outputId,
        message: `Engine freecut processed real Gemini-directed edits successfully!`,
        log: `Render command executed:\n${result.command}\n\nCoverage Report:\n${JSON.stringify(result.coverage, null, 2)}`
      });
    }

    const isBlender = engineId === "blender";
    
    let systemInstruction = "";
    let aiPrompt = "";
    
    if (isBlender) {
      console.log("[api/engines-edit] Building Blender system instructions...");
      const contract = getEngineCapabilityContract("blender");
      systemInstruction = `
You are Monet, an AI Video Director and Blender Python Expert.
Your task is to generate a valid, headless Blender Python script to process a video file based on a creative prompt.

CRITICAL: You MUST use exactly "INPUT_PATH" for the source video file and "OUTPUT_PATH" for the render output file. 
These are placeholders that WILL be replaced by the backend. Do NOT invent your own paths like "/tmp/output.mp4".

Follow the Blender Contract:
${contract}

Guidelines:
- Output ONLY the Python script. No markdown formatting like \`\`\`python.
- Always start with:
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    scene.render.engine = 'BLENDER_EEVEE'
scene.render.use_sequencer = True
scene.use_nodes = False # Default to Sequencer unless complex nodes requested

- Set output:
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.filepath = "OUTPUT_PATH"

- Load video:
strip = scene.sequence_editor_create().sequences.new_movie("input_strip", "INPUT_PATH", channel=1, frame_start=1)
scene.frame_start = 1
scene.frame_end = strip.frame_duration
# Set scene fps safely (must be an integer! e.g. round(strip.fps) or 30):
scene.render.fps = int(round(strip.fps)) if hasattr(strip, "fps") else 30

- BLENDER COMPOSITOR NODES RULE: When creating compositor nodes, use correct input names and modern Blender 4.x node types (they are case-sensitive):
  1. 'CompositorNodeScale' inputs are: 'Image', 'X', 'Y'. Do NOT use 'Scale' or 'Factor'. To animate or set scale, use inputs['X'] and inputs['Y'].
  2. 'CompositorNodeTranslate' inputs are: 'Image', 'X', 'Y'. Do NOT use 'Shift'. To animate or set shift, use inputs['X'] and inputs['Y'].
  3. To separate/combine color channels, use 'CompositorNodeSeparateColor' and 'CompositorNodeCombineColor' with mode = 'RGB'. NEVER use 'CompositorNodeSeparateRGBA' or 'CompositorNodeCombineRGBA' as they are undefined in modern Blender 4.x.

- IMPORTANT: You MUST include 'bpy.ops.render.render(animation=True)' at the very end to actually execute the render.
`;
      aiPrompt = `Input: INPUT_PATH\nOutput: OUTPUT_PATH\nCreative Directive: "${prompt}"\n\nGenerate the Blender Python script now using the exact placeholders INPUT_PATH and OUTPUT_PATH.`;
    } else {
      console.log("[api/engines-edit] Building FFmpeg system instructions...");
      systemInstruction = `
You are Monet, an AI Video Director and FFmpeg Expert.
Your task is to generate a single, valid, high-performance set of FFmpeg arguments to process a video file based on a creative prompt.
IGNORE the fact that the prompt is intended for the engine "${engineId}". You must ONLY generate FFmpeg arguments, not the engine's native format.

The input file path is provided as INPUT_PATH.
The output file path is provided as OUTPUT_PATH.

Guidelines:
- Output ONLY a valid JSON array of strings representing the exact arguments for ffmpeg.
- Do NOT output JSON objects or the engine's native format. ONLY an array of strings.
- Do NOT include the 'ffmpeg' command itself.
- Example: ["-y", "-i", "INPUT_PATH", "-vf", "scale=1280:-2", "-c:v", "libx264", "-c:a", "copy", "OUTPUT_PATH"]
- IMPORTANT: Use '-y' to overwrite. Use '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest' for compatibility.
- COMPAND RULE: In 'compand' filter, use 'x/y' for points and '|' to separate point pairs (e.g., '-90/-90|-15/-15'). NEVER use ':' inside an argument that itself contains multiple values.
- NO CONCATENATION: Return strict JSON. Do NOT use string concatenation ('+') inside the JSON array. Make long strings a single continuous string.
- KEEP IT SIMPLE: Avoid overly complex, experimental filter chains. Rely on basic, well-supported filters.
- ZOOMPAN RULE: The 'zoompan' filter does NOT support the 'eval' option. NEVER use ':eval=frame' with zoompan. For the 's' parameter, you MUST use explicit WxH like 's=1920x1080' instead of 'iw:ih'. Do not use single quotes around 'z', 'x', or 'y' expressions.
- EVAL RULE: ONLY use ':eval=frame' for 'scale', 'crop', or 'rotate'. Do NOT use it for 'zoompan' or 'colorchannelmixer' or 'eq'. Do not use dynamic expressions in colorchannelmixer.
- NO DRAWTEXT RULE: The local FFmpeg installation does NOT support the 'drawtext' filter (libfreetype is disabled). NEVER use the 'drawtext' filter in your output arguments! If the prompt asks for text, subtitles, overlays, or captions, you must completely ignore the text/caption request and do NOT generate any 'drawtext' filters.
- Ensure all inputs [0:v][0:a] are correctly mapped to outputs [v_out][a_out] if using filter_complex.
`;
      aiPrompt = `Input: INPUT_PATH\nOutput: OUTPUT_PATH\nCreative Directive: "${prompt}"\n\nGenerate the FFmpeg arguments array now.`;
    }

    console.log("[api/engines-edit] Requesting content generation from Gemini...");
    const aiResponse = await ai.generateContentJSON<string>({
      prompt: aiPrompt,
      systemInstruction,
      temperature: 0.2,
    });
    console.log("[api/engines-edit] AI Response received (first 100 chars):", aiResponse.slice(0, 100));

    let logMessage = "";

    if (isBlender) {
      console.log("[api/engines-edit] Processing Blender script...");
      let script = aiResponse;
      
      // 1. Unconditionally strip out markdown code-block wraps if hallucinated
      script = script.replace(/```python/gi, "").replace(/```/gi, "").trim();
      
      // 2. Comprehensive placeholder cleansing (handles quotes dynamically)
      console.log("[api/engines-edit] Sanitizing script and injecting paths...");
      
      // Greedy replacement for any path-like string that looks like it's trying to be an input or output
      let sanitizedScript = script
        .replace(/["']\/path\/to\/[^"']+["']/g, (match: any) => {
           if (match.toLowerCase().includes("output")) return `"${outputPath}"`;
           return `"${inputPath}"`;
        })
        .replace(/["']\/tmp\/[^"']+["']/g, (match: any) => {
           if (match.toLowerCase().includes("output")) return `"${outputPath}"`;
           return `"${inputPath}"`;
        })
        .replace(/INPUT_PATH/g, inputPath)
        .replace(/OUTPUT_PATH/g, outputPath);

      // Force scene.render.filepath override if Gemini set it manually to something else
      if (!sanitizedScript.includes(`filepath = "${outputPath}"`)) {
          sanitizedScript = sanitizedScript.replace(/scene\.render\.filepath\s*=\s*["'][^"']+["']/g, `scene.render.filepath = "${outputPath}"`);
          sanitizedScript = sanitizedScript.replace(/scene\.render\.ffmpeg\.filepath\s*=\s*["'][^"']+["']/g, `scene.render.filepath = "${outputPath}"`);
      }

      // 3. Force rendering pipeline execution block
      if (sanitizedScript.includes("# bpy.ops.render.render(animation=True)")) {
        console.log("[api/engines-edit] Activation: Found commented render call, uncommenting...");
        sanitizedScript = sanitizedScript.replace("# bpy.ops.render.render(animation=True)", "bpy.ops.render.render(animation=True)");
      } else if (!sanitizedScript.includes("bpy.ops.render.render(")) {
        console.log("[api/engines-edit] Activation: Render call missing, appending to script end...");
        sanitizedScript += "\n\nbpy.ops.render.render(animation=True)\n";
      }

      console.log(`[api/engines-edit] Delegating BLENDER execution to API for file: ${fileId}`);
      try {
        logMessage = await executeBlender(sanitizedScript, fileId, env);
        console.log("[api/engines-edit] Blender delegation SUCCESS");
        
        // Final sanity check: does the file actually exist where we told Blender to put it?
        const outputExists = await fs.stat(outputPath).then(() => true).catch(() => false);
        if (!outputExists) {
            console.error(`[api/engines-edit] Blender claim SUCCESS but OUTPUT MISSING at ${outputPath}`);
            throw new Error(`Blender failed to produce output at ${outputPath}. Check if internal script path was overridden.`);
        }
      } catch (execErr: any) {
        console.error("[api/engines-edit] Blender execution delegation FAILED:", execErr);
        throw new Error(`Blender failed: ${execErr.message}`);
      }
      logMessage = `Gemini generated and executed this real Blender script via API:\n${sanitizedScript}\n\nExecution Log:\n${logMessage}`;
    } else {
      console.log("[api/engines-edit] Processing FFmpeg arguments...");
      let args: string[];
      try {
        let cleanedResponse = aiResponse;
        const match = cleanedResponse.match(/\[\s*[\s\S]*\s*\]/);
        if (match) {
          cleanedResponse = match[0];
        }
        args = JSON.parse(cleanedResponse);
        if (!Array.isArray(args) || !args.every(a => typeof a === 'string')) {
           throw new Error("Not an array of strings");
        }
      } catch (e) {
        console.error("[api/engines-edit] AI FFmpeg JSON Parse Error:", e);
        console.error("[api/engines-edit] Raw Response:", aiResponse);
        throw new Error("AI did not return a valid JSON array of arguments. Response was: " + aiResponse);
      }

      console.log("[api/engines-edit] Injecting paths into FFmpeg args...");
      args = args.map((arg: string) => arg.replace(/INPUT_PATH/g, inputPath).replace(/OUTPUT_PATH/g, outputPath));

      const commandStr = args.join(" ");
      console.log("[api/engines-edit] Validating FFmpeg command...");
      if (!validateFFmpegCommand(commandStr)) {
        console.error("[api/engines-edit] UNSAFE COMMAND DETECTED:", commandStr);
        return apiError("UNSAFE_COMMAND", "Generated FFmpeg arguments contain unsafe tokens.", 403);
      }

      console.log(`[api/engines-edit] Delegating FFMPEG execution to API...`);
      console.log(`[api/engines-edit] Args:`, JSON.stringify(args));
      
      try {
        logMessage = await executeFFmpeg(args, env);
        console.log("[api/engines-edit] FFmpeg delegation SUCCESS");
      } catch (execErr: any) {
        console.error("[api/engines-edit] FFmpeg execution delegation FAILED:", execErr);
        // Surface the underlying error more clearly
        throw new Error(`FFmpeg execution failed: ${execErr.message}. Command attempted: ffmpeg ${args.join(" ")}`);
      }
      logMessage = `Gemini generated and executed this real render sequence via API:\nffmpeg ${args.join(" ")}\n\nExecution Log:\n${logMessage}`;
    }

    console.log("[api/engines-edit] <<< REQUEST COMPLETED SUCCESSFULLY");
    return jsonResponse({
      success: true,
      editedFileId: outputId,
      message: `Engine ${engineId} processed real Gemini-directed edits successfully!`,
      log: logMessage
    });
  } catch (err: any) {
    console.error("[api/engines-edit] !!! FATAL EXCEPTION:", err);
    // Ensure the 500 error includes the specific message from the exception
    return apiError("PROCESS_FAILED", `Editing failed: ${err.message || "Unknown error"}`, 500);
  }
}

import { parseAIJson } from "./lib/parse-ai-json";

// ------------------------------------------------------------------
// VIBE REFINE (inline — background job + polling)
// ------------------------------------------------------------------

import crypto from "node:crypto";

interface RefineJob {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "complete" | "failed";
  progress: number;
  message: string;
  startTime: number;
  result?: { edl: unknown };
  error?: string;
}

async function handleVibeRefine(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { currentEdl, prompt, scopeClipIds } = body as {
      currentEdl?: Record<string, any>;
      prompt?: string;
      scopeClipIds?: string[];
    };

    if (!currentEdl || !prompt) {
      return apiError("INVALID_REQUEST", "currentEdl and prompt are required", 400);
    }

    const jobId = crypto.randomUUID();
    const jobStore = createJobStore(env);
    const job: RefineJob = {
      jobId,
      status: "queued",
      progress: 0,
      message: "Queued",
      startTime: Date.now(),
    };
    await jobStore.set(jobId, job);

    // Run refinement inline (no Python dependency — use AI service directly)
    // Use env from the request (Cloudflare Workers provide it per-request)
    const refineEnv = env;
    (async () => {
      try {
        job.status = "analyzing";
        job.progress = 10;
        job.message = "Analyzing current edit...";
        await jobStore.set(jobId, job);

        const ai = getAIService(refineEnv);

        job.progress = 30;
        job.message = "Generating refined EDL...";
        await jobStore.set(jobId, job);

        const refinementPrompt = `You are a video editing AI. Refine this EDL based on the user's feedback.

Current EDL:
${JSON.stringify(currentEdl, null, 2)}

User feedback: "${prompt}"

${scopeClipIds?.length ? `Scope: only modify clips ${scopeClipIds.join(", ")}` : "Scope: entire timeline"}

CRITICAL RULES — VIOLATION = INVALID OUTPUT:
1. You MUST preserve ALL "clipId" values in shots[].source.clipId exactly as they appear above. NEVER invent new IDs.
2. You MUST preserve ALL keys in assets.media exactly as they appear above. NEVER create new asset entries.
3. You MUST preserve ALL clip "id" values exactly as they appear above.
4. You MAY modify: timing (startTime, duration, speed), effects, transitions, globalEffects, meta.
5. You MUST NOT modify: clipIds, asset keys, asset paths, clip.mediaId.
6. If unsure whether an ID should change, DO NOT change it.

Return ONLY valid JSON. No markdown fences. No commentary. No text outside the JSON object.`;

        const result = await ai.generateContentJSON({
          prompt: refinementPrompt,
          temperature: 0.3,
        });

        // Parse and validate the refined EDL
        const refined = parseAIJson<Record<string, any>>(result);
        if (!refined) {
          throw new Error("AI returned invalid JSON for refined EDL");
        }

        // Post-validation: ensure original clip IDs are preserved
        const originalClipIds = new Set(
          (currentEdl.shots ?? []).map((s: any) => s.source?.clipId).filter(Boolean)
        );
        const refinedClipIds = new Set(
          (refined.shots ?? []).map((s: any) => s.source?.clipId).filter(Boolean)
        );
        const originalAssetKeys = new Set(Object.keys(currentEdl.assets?.media ?? {}));
        const refinedAssetKeys = new Set(Object.keys(refined.assets?.media ?? {}));

        // Check for hallucinated clip IDs
        for (const id of refinedClipIds) {
          if (!originalClipIds.has(id)) {
            console.warn(`[vibe-refine] AI hallucinated clipId "${id}" — remapping to first original clipId`);
            const firstOriginal = [...originalClipIds][0];
            if (firstOriginal) {
              for (const shot of refined.shots ?? []) {
                if (shot.source?.clipId === id) shot.source.clipId = firstOriginal;
              }
            }
          }
        }

        // Check for hallucinated asset keys
        for (const key of refinedAssetKeys) {
          if (!originalAssetKeys.has(key)) {
            console.warn(`[vibe-refine] AI hallucinated asset key "${key}" — removing`);
            delete refined.assets.media[key];
          }
        }

        // Restore missing asset keys from original
        for (const key of originalAssetKeys) {
          if (!refinedAssetKeys.has(key)) {
            refined.assets.media[key] = currentEdl.assets.media[key];
          }
        }

        job.status = "complete";
        job.progress = 100;
        job.message = "Refinement complete";
        job.result = { edl: refined };
        await jobStore.set(jobId, job);
      } catch (err: any) {
        job.status = "failed";
        job.message = err.message || "Refinement failed";
        job.error = err.message;
        await jobStore.set(jobId, job);
      }
    })();

    return jsonResponse({ jobId, status: "queued" });
  } catch (err: any) {
    return apiError("REFINE_ERROR", err.message || "Failed to start refinement", 500);
  }
}

async function handleVibeRefineStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const jobId = url.pathname.split("/api/vibe-refine/status/")[1];
  if (!jobId) return apiError("MISSING_JOB_ID", "Missing jobId", 400);

  const jobStore = createJobStore(env);
  const job = await jobStore.get(jobId);
  if (!job) return apiError("NOT_FOUND", "Job not found", 404);

  return jsonResponse({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
}

// ------------------------------------------------------------------
// FRAME-LEVEL PRECISION HANDLERS
// ------------------------------------------------------------------

const LUTGenerateSchema = z.object({
  sourceVideoUrl: z.string().url(),
  referenceFrameUrl: z.string().url(),
  size: z.number().int().min(2).max(64).optional(),
});

async function handleGenerateLUT(request: Request, env: Env) {
  try {
    const parsed = LUTGenerateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_REQUEST", `Invalid request: ${parsed.error.issues.map(i => i.message).join(", ")}`, 400);
    }
    const { sourceVideoUrl, referenceFrameUrl, size } = parsed.data;

    // Download source video and reference frame to temp
    const tempDir = path.join(os.tmpdir(), `lut-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const sourcePath = path.join(tempDir, "source.mp4");
    const refPath = path.join(tempDir, "reference.jpg");
    const outputPath = path.join(tempDir, "grade.cube");

    // Fetch files
    const [sourceResp, refResp] = await Promise.all([
      fetch(sourceVideoUrl),
      fetch(referenceFrameUrl),
    ]);

    if (!sourceResp.ok || !refResp.ok) {
      return apiError("FETCH_FAILED", "Failed to download source files", 502);
    }

    await Promise.all([
      fs.writeFile(sourcePath, Buffer.from(await sourceResp.arrayBuffer())),
      fs.writeFile(refPath, Buffer.from(await refResp.arrayBuffer())),
    ]);

    const result = await generateLUT(sourcePath, refPath, outputPath, { size });

    // Upload .cube file to R2
    const cubeContent = await fs.readFile(outputPath);
    const r2Key = `luts/${Date.now()}.cube`;
    await env.MONET_RENDERS.put(r2Key, cubeContent, {
      httpMetadata: { contentType: "application/octet-stream" },
    });

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return jsonResponse({
      success: true,
      lutKey: r2Key,
      size: result.size,
      gridPoints: result.gridPoints,
      durationMs: result.durationMs,
    });
  } catch (err: any) {
    trackException(err, { tags: { handler: "handleGenerateLUT" } });
    return apiError("LUT_ERROR", err.message || "Failed to generate LUT", 500);
  }
}

const LUTApplySchema = z.object({
  videoUrl: z.string().url(),
  lutUrl: z.string().url(),
});

async function handleApplyLUT(request: Request, env: Env) {
  try {
    const parsed = LUTApplySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_REQUEST", `Invalid request: ${parsed.error.issues.map(i => i.message).join(", ")}`, 400);
    }
    const { videoUrl, lutUrl } = parsed.data;

    const tempDir = path.join(os.tmpdir(), `lut-apply-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const videoPath = path.join(tempDir, "input.mp4");
    const lutPath = path.join(tempDir, "grade.cube");
    const outputPath = path.join(tempDir, "output.mp4");

    const [videoResp, lutResp] = await Promise.all([
      fetch(videoUrl),
      fetch(lutUrl),
    ]);

    await Promise.all([
      fs.writeFile(videoPath, Buffer.from(await videoResp.arrayBuffer())),
      fs.writeFile(lutPath, Buffer.from(await lutResp.arrayBuffer())),
    ]);

    await applyLUTToVideo(videoPath, lutPath, outputPath);

    const outputBuffer = await fs.readFile(outputPath);
    const r2Key = `renders/lut-${Date.now()}.mp4`;
    await env.MONET_RENDERS.put(r2Key, outputBuffer, {
      httpMetadata: { contentType: "video/mp4" },
    });

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return jsonResponse({ success: true, outputKey: r2Key });
  } catch (err: any) {
    trackException(err, { tags: { handler: "handleApplyLUT" } });
    return apiError("LUT_APPLY_ERROR", err.message || "Failed to apply LUT", 500);
  }
}

const SubjectMaskSchema = z.object({
  videoUrl: z.string().url(),
  smoothness: z.number().min(0).max(1).optional(),
  invert: z.boolean().optional(),
});

async function handleSubjectMask(request: Request, env: Env) {
  try {
    const parsed = SubjectMaskSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_REQUEST", `Invalid request: ${parsed.error.issues.map(i => i.message).join(", ")}`, 400);
    }
    const { videoUrl, smoothness, invert } = parsed.data;

    const tempDir = path.join(os.tmpdir(), `mask-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, "input.mp4");
    const maskPath = path.join(tempDir, "mask.mp4");

    const videoResp = await fetch(videoUrl);
    await fs.writeFile(inputPath, Buffer.from(await videoResp.arrayBuffer()));

    const result = await generateSubjectMask(inputPath, maskPath, {
      smoothness,
      invert,
      tempDir: path.join(tempDir, "frames"),
    });

    const maskBuffer = await fs.readFile(maskPath);
    const r2Key = `masks/${Date.now()}.mp4`;
    await env.MONET_RENDERS.put(r2Key, maskBuffer, {
      httpMetadata: { contentType: "video/mp4" },
    });

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return jsonResponse({
      success: true,
      maskKey: r2Key,
      frameCount: result.frameCount,
      format: result.format,
      durationMs: result.durationMs,
    });
  } catch (err: any) {
    trackException(err, { tags: { handler: "handleSubjectMask" } });
    return apiError("MASK_ERROR", err.message || "Failed to generate mask", 500);
  }
}

const SubjectBlurSchema = z.object({
  videoUrl: z.string().url(),
  maskUrl: z.string().url(),
  blurStrength: z.number().min(1).max(50).optional(),
});

async function handleSubjectBlur(request: Request, env: Env) {
  try {
    const parsed = SubjectBlurSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_REQUEST", `Invalid request: ${parsed.error.issues.map(i => i.message).join(", ")}`, 400);
    }
    const { videoUrl, maskUrl, blurStrength } = parsed.data;

    const tempDir = path.join(os.tmpdir(), `blur-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, "input.mp4");
    const maskPath = path.join(tempDir, "mask.mp4");
    const outputPath = path.join(tempDir, "output.mp4");

    const [videoResp, maskResp] = await Promise.all([
      fetch(videoUrl),
      fetch(maskUrl),
    ]);

    await Promise.all([
      fs.writeFile(inputPath, Buffer.from(await videoResp.arrayBuffer())),
      fs.writeFile(maskPath, Buffer.from(await maskResp.arrayBuffer())),
    ]);

    await applyMaskedBlur(inputPath, maskPath, outputPath, blurStrength ?? 15);

    const outputBuffer = await fs.readFile(outputPath);
    const r2Key = `renders/blur-${Date.now()}.mp4`;
    await env.MONET_RENDERS.put(r2Key, outputBuffer, {
      httpMetadata: { contentType: "video/mp4" },
    });

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return jsonResponse({ success: true, outputKey: r2Key });
  } catch (err: any) {
    trackException(err, { tags: { handler: "handleSubjectBlur" } });
    return apiError("BLUR_ERROR", err.message || "Failed to apply masked blur", 500);
  }
}

const ASSGenerateSchema = z.object({
  entries: z.array(z.object({
    text: z.string(),
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    fontSize: z.number().int().min(8).max(200).optional(),
    color: z.string().optional(),
    bold: z.boolean().optional(),
    fadeIn: z.number().min(0).optional(),
    fadeOut: z.number().min(0).optional(),
  })).min(1),
  width: z.number().int().min(1).max(7680).optional(),
  height: z.number().int().min(1).max(4320).optional(),
  fontName: z.string().optional(),
  fontSize: z.number().int().min(8).max(200).optional(),
  fontColor: z.string().optional(),
  outlineColor: z.string().optional(),
  outlineWidth: z.number().min(0).max(10).optional(),
});

async function handleGenerateASS(request: Request, env: Env) {
  try {
    const parsed = ASSGenerateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_REQUEST", `Invalid request: ${parsed.error.issues.map(i => i.message).join(", ")}`, 400);
    }
    const { entries, width, height, fontName, fontSize, fontColor, outlineColor, outlineWidth } = parsed.data;

    const assContent = generateASSFile(entries, {
      width,
      height,
      fontName,
      fontSize,
      fontColor,
      outlineColor,
      outlineWidth,
    });

    return jsonResponse({
      success: true,
      ass: assContent,
      entryCount: entries.length,
    });
  } catch (err: any) {
    trackException(err, { tags: { handler: "handleGenerateASS" } });
    return apiError("ASS_ERROR", err.message || "Failed to generate ASS file", 500);
  }
}

const WordHighlightSchema = z.object({
  words: z.array(z.object({
    word: z.string(),
    start: z.number().min(0),
    end: z.number().min(0),
  })).min(1),
  width: z.number().int().min(1).max(7680).optional(),
  height: z.number().int().min(1).max(4320).optional(),
  fontName: z.string().optional(),
  fontSize: z.number().int().min(8).max(200).optional(),
});

async function handleWordHighlightASS(request: Request, env: Env) {
  try {
    const parsed = WordHighlightSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("INVALID_REQUEST", `Invalid request: ${parsed.error.issues.map(i => i.message).join(", ")}`, 400);
    }
    const { words, width, height, fontName, fontSize } = parsed.data;

    const assContent = generateWordHighlightASS(words, {
      width,
      height,
      fontName,
      fontSize,
    });

    return jsonResponse({
      success: true,
      ass: assContent,
      wordCount: words.length,
    });
  } catch (err: any) {
    trackException(err, { tags: { handler: "handleWordHighlightASS" } });
    return apiError("ASS_ERROR", err.message || "Failed to generate word highlight ASS", 500);
  }
}

// ------------------------------------------------------------------
// ROUTE REGISTRY
// ------------------------------------------------------------------

interface ApiRoute {
  method: string;
  path: RegExp | string;
  handler: (request: Request, env: Env, ctx?: unknown) => Promise<Response> | Response;
}

const apiRoutes: ApiRoute[] = [
  // Upload endpoints
  { method: "POST", path: "/api/upload", handler: handleUploadRequest },
  { method: "POST", path: "/api/upload/complete", handler: handleCompleteUpload },
  { method: "POST", path: "/api/upload/direct", handler: handleDirectUpload },
  { method: "GET", path: /^\/api\/media\//, handler: handleMedia },
  
  // Intent extraction endpoints
  { method: "POST", path: "/api/decode-intent", handler: handleDecodeIntent },
  { method: "POST", path: "/api/intent/update", handler: handleUpdateIntent },
  { method: "POST", path: "/api/upload-and-detect", handler: handleUploadAndDetect },
  { method: "POST", path: "/api/sync-from-advanced-editor", handler: handleSyncFromAdvancedEditor },
  
  // Analysis & EDL endpoints
  { method: "POST", path: "/api/analyze", handler: handleAnalyze },
  { method: "POST", path: "/api/generate-edl", handler: handleGenerateEDL },
  { method: "POST", path: "/api/refine-edl", handler: handleRefineEDL },
  
  // Transcription & Reference Style
  { method: "POST", path: "/api/transcribe", handler: handleTranscribe },
  { method: "POST", path: "/api/analyze-reference", handler: handleAnalyzeReference },
  
  // Director Loop
  { method: "POST", path: "/api/director/feedback", handler: async (req, env) => {
    if (!env) return apiError("MISSING_ENV", "Missing environment", 500);
    return await handleDirectorFeedbackRequest(req, env);
  }},
  { method: "GET", path: /^\/api\/director\/render\//, handler: async (req, env) => {
    if (!env) return apiError("MISSING_ENV", "Missing environment", 500);
    const url = new URL(req.url);
    const jobId = url.pathname.split("/").pop();
    if (!jobId) return apiError("MISSING_JOB_ID", "Missing jobId", 400);
    const newUrl = new URL(req.url);
    newUrl.pathname = "/api/export";
    newUrl.searchParams.set("jobId", jobId);
    return await handleGetExportStatus(new Request(newUrl.toString(), req), env);
  }},
  
  // Composition Overlay
  { method: "POST", path: "/api/generate-composition", handler: handleGenerateComposition },
  
  // Edit DNA Analysis Engine
  { method: "POST", path: "/api/analyze-dna", handler: handleAnalyzeDNA },

  // Gemini Think Effects
  { method: "POST", path: "/api/gemini-think-effects", handler: handleGeminiThinkEffects },
  
  // Server-side FFmpeg export
  { method: "POST", path: "/api/export-mp4", handler: handleExportMP4 },

  { method: "POST", path: "/api/detect-scenes", handler: handleDetectScenes },

  { method: "POST", path: "/api/deep-analysis", handler: handleDeepAnalysis },

  // Specialist AI engines
  { method: "POST", path: "/api/specialist/isolate", handler: handleSpecialistIsolate },
  { method: "POST", path: "/api/specialist/depth", handler: handleSpecialistDepth },
  { method: "POST", path: "/api/specialist/slowmo", handler: handleSpecialistSlowmo },
  
  // Live Gemini Directing Playground
  { method: "POST", path: "/api/gemini-direct-engine", handler: handleGeminiDirectEngine },
  
  // Live Real Video Editing
  { method: "POST", path: "/api/engines-edit", handler: handleEnginesEdit },
  
  // Sandbox test
  { method: "GET", path: "/api/engines-test", handler: async () => jsonResponse(runSandboxTestsJSON()) },
  
  // Studio project
  { method: "GET", path: "/api/studio-project", handler: handleGetStudioProject },
  { method: "POST", path: "/api/studio-project", handler: handlePersistStudioProject },
  
  // Render preview
  { method: "POST", path: "/api/render-preview", handler: handleRenderPreview },
  { method: "GET", path: /^\/api\/render-status\//, handler: async (req, env) => {
      const url = new URL(req.url);
      const jobId = url.pathname.split("/api/render-status/")[1];
      if (!jobId) return apiError("MISSING_JOB_ID", "Missing jobId", 400);
      return await handleRenderStatus(jobId, env);
  }},
  
  // Output renders
  { method: "GET", path: /^\/api\/renders\//, handler: async (req, env) => {
      const url = new URL(req.url);
      const r2Key = decodeURIComponent(url.pathname.replace("/api/renders/", ""));
      const object = await env.MONET_RENDERS.get(r2Key);
      if (!object) return apiError("NOT_FOUND", "Render not found", 404);
      return new Response(await object.arrayBuffer(), {
        headers: { "Content-Type": "video/mp4", "Cache-Control": "public, max-age=3600" },
      });
  }},
  
  // Style Compiler
  { method: "POST", path: "/api/style/compile", handler: handleStyleCompile },
  
  // Export queue
  { method: "POST", path: "/api/export", handler: handleQueueExport },
  { method: "GET", path: "/api/export", handler: handleGetExportStatus },

  // Vibe Refine
  { method: "POST", path: "/api/vibe-refine", handler: (req, env) => handleVibeRefine(req, env) },
  { method: "GET", path: /^\/api\/vibe-refine\/status\//, handler: (req, env) => handleVibeRefineStatus(req, env) },

  // Style Replication
  { method: "POST", path: "/api/replicate-style", handler: handleReplicateStyle },

  // V3 Pipeline (new)
  { method: "POST", path: "/api/v3/analyze", handler: handleV3Analyze },
  { method: "POST", path: "/api/v3/generate", handler: handleV3Generate },
  { method: "POST", path: "/api/v3/refine", handler: handleV3Refine },
  { method: "POST", path: "/api/v3/render", handler: handleV3Render },
  { method: "POST", path: "/api/v3/tweak", handler: handleV3Tweak },
  { method: "POST", path: "/api/v3/ask", handler: handleV3Ask },

  // Frame-Level Precision Tools
  { method: "POST", path: "/api/lut/generate", handler: handleGenerateLUT },
  { method: "POST", path: "/api/lut/apply", handler: handleApplyLUT },
  { method: "POST", path: "/api/subject/mask", handler: handleSubjectMask },
  { method: "POST", path: "/api/subject/blur", handler: handleSubjectBlur },
  { method: "POST", path: "/api/text/ass", handler: handleGenerateASS },
  { method: "POST", path: "/api/text/word-ass", handler: handleWordHighlightASS },

  // Billing (Paddle)
  { method: "POST", path: "/api/billing/checkout", handler: handleCreateCheckout },
  { method: "POST", path: "/api/billing/checkout/customer-portal", handler: handleCustomerPortal },
  { method: "POST", path: "/api/billing/webhook", handler: handleBillingWebhook },
  { method: "GET", path: "/api/billing/usage", handler: handleGetUsage },
  { method: "POST", path: "/api/billing/usage/increment", handler: handleIncrementUsage },

  // Affiliate
  { method: "GET", path: "/api/affiliate/profile", handler: handleGetAffiliateProfile },
  { method: "GET", path: "/api/affiliate/referrals", handler: handleGetAffiliateReferrals },
  { method: "GET", path: "/api/affiliate/commissions", handler: handleGetAffiliateCommissions },
  { method: "POST", path: "/api/affiliate/claim-code", handler: handleClaimAffiliateCode },
  { method: "POST", path: "/api/affiliate/track-referral", handler: handleTrackReferral },
];

// ------------------------------------------------------------------
// SERVER ENTRY
// ------------------------------------------------------------------

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const cloned = response.clone();
  const reader = cloned.body?.getReader();
  if (!reader) return response;
  
  let body = "";
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      body += new TextDecoder().decode(value);
      bytesRead += value.length;
    }
    if (done || bytesRead > 4096) break;
  }
  
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// ------------------------------------------------------------------
// SENTRY INITIALIZATION (runs once)
// ------------------------------------------------------------------

let sentryBootstrapped = false;

function bootstrapSentry(env: Env) {
  if (sentryBootstrapped) return;
  if ((env as any).SENTRY_DSN) {
    initSentry({
      dsn: (env as any).SENTRY_DSN,
      environment: (env as any).SENTRY_ENVIRONMENT || (env as any).ENVIRONMENT || "development",
      release: (env as any).SENTRY_RELEASE || "monet@0.1.0",
      tracesSampleRate: 0.1,
    });
    sentryBootstrapped = true;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const typedEnv = getDevEnv(
      (env as any)?.env || 
      (env as any)?.cloudflare?.env || 
      (ctx as any)?.env || 
      env
    ) as Env;

    // Bootstrap Sentry on first request
    bootstrapSentry(typedEnv);

    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    // Fast-path for API aliases
    if (request.method === "POST" && (pathname === "/analyze" || pathname === "/generate-edl")) {
       return Response.redirect(new URL("/api" + pathname, request.url).toString(), 307);
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        if (request.method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
              "Access-Control-Max-Age": "86400",
            },
          });
        }

        // Clerk auth middleware — check protected routes
        const clerkKey = (typedEnv as any).CLERK_PUBLISHABLE_KEY;
        const clerkSecret = (typedEnv as any).CLERK_SECRET_KEY;
        if (clerkKey && clerkSecret) {
          const authResult = await clerkAuthMiddleware(request, {
            publishableKey: clerkKey,
            secretKey: clerkSecret,
            jwtKey: (typedEnv as any).CLERK_JWT_KEY,
          });

          if (!authResult.success && authResult.error) {
            return createUnauthorizedResponse(authResult.error);
          }
        }

        // Registry Route Matching
        for (const route of apiRoutes) {
          const methodMatch = route.method === request.method;
          const pathMatch = typeof route.path === "string"
            ? route.path === pathname // Uses the sanitized trailing-slash variable
            : route.path.test(pathname);

          if (methodMatch && pathMatch) {
            return await route.handler(request, typedEnv, ctx);
          }
        }

        return apiError("NOT_FOUND", "Not found", 404);
      } catch (error) {
        console.error("API error:", error);
        trackException(error, { tags: { path: pathname, method: request.method } });
        return apiError("INTERNAL_ERROR", "An internal error occurred. Please try again.", 500);
      }
    }

    // SSR routes — check auth guard for protected pages
    try {
      const clerkKey = (typedEnv as any).CLERK_PUBLISHABLE_KEY;
      const clerkSecret = (typedEnv as any).CLERK_SECRET_KEY;
      if (clerkKey && clerkSecret) {
        const guardResult = await authGuard(request, {
          publishableKey: clerkKey,
          secretKey: clerkSecret,
          jwtKey: (typedEnv as any).CLERK_JWT_KEY,
        });

        if (!guardResult.allowed && guardResult.redirectTo) {
          return createRedirectResponse(guardResult.redirectTo);
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
