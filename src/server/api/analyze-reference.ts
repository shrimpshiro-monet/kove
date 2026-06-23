// POST /api/analyze-reference
// Analyze a reference video to extract its complete editing DNA (ReferenceStyle).
//
// TWO input modes:
//   1. fileId  — file already in R2 (uploaded via /api/upload/direct)
//   2. youtubeUrl — public YouTube video; Gemini analyzes it directly by URL
//      (no download, no R2, no Files API — Gemini natively supports YouTube URLs)
//
// Flow for YouTube URL:
//   youtubeUrl → validate → Gemini.generateContentJSONWithFile(youtubeUrl) → ReferenceStyle
//
// Flow for fileId:
//   fileId → R2 fetch → Gemini Files API upload → Gemini analyze → ReferenceStyle

import type { Env } from "../types/env";
import { getAIService, type AIService } from "../services/ai-service";
import type { ReferenceStyle } from "../types/reference-style";
import {
  REFERENCE_STYLE_JSON_SCHEMA,
  normalizeReferenceStyle,
} from "../types/reference-style";
import { withRetry } from "../lib/retry";
import { loadPromptTemplate } from "../prompts";
import { jsonResponse, apiError, ApiErrorCode } from "../lib/api-response";

interface AnalyzeReferenceRequest {
  projectId: string;
  // Exactly one of fileId or youtubeUrl must be provided:
  fileId?: string; // R2 key from /api/upload/direct
  youtubeUrl?: string; // Public YouTube video URL
  mimeType?: string; // e.g. "video/mp4" — inferred if omitted
}

// In-memory cache: avoid re-analyzing the same reference file
const referenceCache = new Map<
  string,
  { style: ReferenceStyle; cachedAt: number }
>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type FileAnalysisCapableAI = AIService & {
  generateContentJSONWithFile: <T>(params: {
    fileUri: string;
    mimeType: string;
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    schema?: object;
  }) => Promise<T>;
};

function hasFileAnalysis(ai: AIService): ai is FileAnalysisCapableAI {
  return "generateContentJSONWithFile" in ai;
}

export async function handleAnalyzeReference(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  let body: AnalyzeReferenceRequest;
  try {
    body = (await request.json()) as AnalyzeReferenceRequest;
  } catch {
    return apiError(ApiErrorCode.InvalidRequest, "Invalid JSON body", 400);
  }

  if (!body.projectId || (!body.fileId && !body.youtubeUrl)) {
    return apiError(
      ApiErrorCode.InvalidRequest,
      "Missing required fields: projectId and one of (fileId, youtubeUrl)",
      400
    );
  }

  // Validate YouTube URL if provided
  if (body.youtubeUrl && !isValidYouTubeUrl(body.youtubeUrl)) {
    return apiError(
      ApiErrorCode.InvalidRequest,
      "Invalid YouTube URL. Must be a youtube.com or youtu.be video URL.",
      400
    );
  }

  // Cache key: prefer YouTube URL (stable), fall back to fileId
  const cacheKey = body.youtubeUrl
    ? `yt:${extractYouTubeVideoId(body.youtubeUrl)}`
    : `r2:${body.fileId}`;

  // Cache hit
  const cached = referenceCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.info(`Reference analysis cache hit for: ${cacheKey}`);
    return jsonResponse({
      success: true,
      referenceStyleId: `cached-${cacheKey}`,
      style: cached.style,
      cached: true,
    });
  }

  try {
    const ai = getAIService(env);

    // Load the analysis prompt (bundled)
    const analysisPrompt = loadPromptTemplate("analyze-reference.txt");

    let style: ReferenceStyle;

    if (body.youtubeUrl) {
      // Fast path: Gemini analyzes the YouTube video directly by URL.
      const canonicalUrl = canonicalizeYouTubeUrl(body.youtubeUrl);
      console.info(`Analyzing YouTube reference directly: ${canonicalUrl}`);
      try {
        style = await analyzeFromYouTubeUrl(canonicalUrl, analysisPrompt, ai);
      } catch (ytError) {
        console.warn(
          `[analyze-reference] analyzeFromYouTubeUrl failed, falling back to text-context analysis:`,
          ytError
        );
        style = await analyzeFromTextContext(
          body.youtubeUrl,
          analysisPrompt,
          ai
        );
      }
    } else if (env && "MONET_MEDIA" in env && env.MONET_MEDIA && body.fileId) {
      // Production path: fetch from R2, upload to Gemini Files API, analyze
      let r2Key = body.fileId;
      if (env.DB) {
        try {
          const mediaItem = await env.DB.prepare(
            `SELECT r2_key FROM media_items WHERE id = ?`
          )
            .bind(body.fileId)
            .first<{ r2_key: string }>();
          if (mediaItem?.r2_key) {
            r2Key = mediaItem.r2_key;
            console.info(`[analyze-reference] Resolved fileId ${body.fileId} to R2 key: ${r2Key}`);
          } else {
            console.warn(`[analyze-reference] No media_item found in DB for fileId: ${body.fileId}`);
          }
        } catch (dbError) {
          console.error(`[analyze-reference] DB error resolving fileId ${body.fileId}:`, dbError);
        }
      }

      const mimeType = body.mimeType ?? inferMimeType(r2Key);
      try {
        style = await analyzeFromR2(
          r2Key,
          mimeType,
          analysisPrompt,
          ai,
          env
        );
      } catch (r2Error) {
        console.warn(
          `[analyze-reference] analyzeFromR2 failed, falling back to text-context analysis:`,
          r2Error
        );
        style = await analyzeFromTextContext(
          body.fileId,
          analysisPrompt,
          ai
        );
      }
    } else {
      // Dev/no-R2 path: text-only analysis using fileId as context hint
      style = await analyzeFromTextContext(
        body.fileId ?? "",
        analysisPrompt,
        ai
      );
    }

    // Validate and normalize output
    const normalized = normalizeReferenceStyle(style);
    if (!normalized) {
      return apiError(
        ApiErrorCode.AnalysisFailed,
        "Gemini returned an invalid ReferenceStyle structure",
        500
      );
    }
    style = normalized;

    // --- V0 APPROXIMATION: Build a reference trace from style ---
    const trace = generateMockTrace(style, cacheKey);

    // Cache the result
    referenceCache.set(cacheKey, { style, cachedAt: Date.now() });

    // Store in D1 if available
    const referenceStyleId = env?.DB
      ? await storeReferenceStyle(env.DB, body.projectId, cacheKey, style)
      : `ref-${Date.now()}`;

    return jsonResponse({
      success: true,
      referenceStyleId,
      style,
      trace,
    });
  } catch (error) {
    console.error("analyze-reference error:", {
      ref: body.youtubeUrl ?? body.fileId,
      projectId: body.projectId,
      error: error instanceof Error ? error.message : error,
    });

    return apiError(
      ApiErrorCode.AnalysisFailed,
      error instanceof Error ? error.message : "Reference analysis failed",
      500
    );
  }
}

/**
 * YouTube URL path: Gemini analyzes the video directly from YouTube.
 */
async function analyzeFromYouTubeUrl(
  youtubeUrl: string,
  analysisPrompt: string,
  ai: AIService
): Promise<ReferenceStyle> {
  if (!hasFileAnalysis(ai)) {
    return analyzeFromTextContext(youtubeUrl, analysisPrompt, ai);
  }

  return ai.generateContentJSONWithFile<ReferenceStyle>({
    fileUri: youtubeUrl,
    mimeType: "video/mp4",
    prompt: analysisPrompt,
    systemInstruction:
      "You are a master film editor and cinematographer. Watch this entire YouTube video carefully. Analyze its editing DNA with precision — rhythm, pacing, shot language, visual style, effects, emotional arc, and the editor's philosophy. Every number you return will be used directly to drive a real AI video editor that must replicate this style.",
    temperature: 0.35,
    schema: REFERENCE_STYLE_JSON_SCHEMA,
  });
}

/**
 * Full production path: R2 → Gemini Files API → analysis
 */
async function analyzeFromR2(
  fileId: string,
  mimeType: string,
  analysisPrompt: string,
  ai: AIService,
  env: Env
): Promise<ReferenceStyle> {
  if (!("uploadFile" in ai) || !hasFileAnalysis(ai)) {
    return analyzeFromTextContext(fileId, analysisPrompt, ai);
  }

  // Resolve real R2 key from media_items DB if possible
  let r2Key = fileId;
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT r2_key FROM media_items WHERE id = ?"
      )
        .bind(fileId)
        .first<{ r2_key: string }>();
      if (row?.r2_key) {
        r2Key = row.r2_key;
        console.info(`[analyze-reference] Resolved fileId ${fileId} to R2 key: ${r2Key}`);
      } else {
        console.warn(
          `[analyze-reference] No DB row in media_items for fileId: ${fileId}. Will try fileId as key directly.`
        );
      }
    } catch (err) {
      console.warn(
        `[analyze-reference] Failed to look up r2_key in DB for fileId: ${fileId}`,
        err
      );
    }
  }

  // Fetch bytes from R2
  const r2Object = await env.MONET_MEDIA!.get(r2Key);
  if (!r2Object) {
    throw new Error(
      `Reference file not found in R2: ${r2Key}. Was it uploaded successfully?`
    );
  }

  const bytes = new Uint8Array(await r2Object.arrayBuffer());
  console.info(
    `Fetched ${(bytes.length / 1024 / 1024).toFixed(1)}MB from R2 for ${r2Key}`
  );

  // Upload to Gemini Files API
  const displayName = fileId.split("/").pop() ?? fileId;
  const uploaded = await withRetry(
    () =>
      ai.uploadFile({
        data: bytes,
        mimeType,
        displayName,
      }),
    { retries: 2, baseDelay: 1000 }
  );

  const expiresAt = "expiresAt" in uploaded ? uploaded.expiresAt : undefined;
  console.info(
    `Uploaded to Gemini Files API: ${uploaded.uri}${
      expiresAt ? ` (expires ${expiresAt})` : ""
    }`
  );

  // Analyze the video
  return ai.generateContentJSONWithFile<ReferenceStyle>({
    fileUri: uploaded.uri,
    mimeType,
    prompt: analysisPrompt,
    systemInstruction:
      "You are a master film editor and cinematographer. Analyze this reference video with precision. Every number you return will be used directly to drive a real AI video editor.",
    temperature: 0.35,
    schema: REFERENCE_STYLE_JSON_SCHEMA,
  });
}

/**
 * Dev/fallback path: analyze by file name + metadata only.
 */
async function analyzeFromTextContext(
  fileId: string,
  analysisPrompt: string,
  ai: AIService
): Promise<ReferenceStyle> {
  console.warn(
    `R2 not available — running text-context reference analysis for ${fileId}`
  );

  // Infer clues from filename
  const filename = fileId.toLowerCase();
  const hints: string[] = [];
  if (filename.includes("amv") || filename.includes("anime"))
    hints.push("This appears to be an anime AMV (fan edit with fast cuts).");
  if (filename.includes("cinematic"))
    hints.push("This appears to be a cinematic edit.");
  if (filename.includes("sports") || filename.includes("hype"))
    hints.push("This appears to be a sports highlight.");
  if (filename.includes("wedding"))
    hints.push("This appears to be a wedding video.");

  const contextHint =
    hints.length > 0
      ? hints.join(" ")
      : "This is a reference video for style analysis.";

  const textPrompt = `${analysisPrompt}

NOTE: No video file is available in this analysis — reason through the style based on context.
File reference: ${fileId}
Context hints: ${contextHint}

Generate plausible default values for a high-quality edit of the detected genre.
Be internally consistent across all fields.`;

  return ai.generateContentJSON<ReferenceStyle>({
    prompt: textPrompt,
    systemInstruction:
      "You are a master film editor. Provide a complete, internally-consistent style analysis.",
    temperature: 0.5,
    schema: REFERENCE_STYLE_JSON_SCHEMA,
  });
}

/**
 * Store ReferenceStyle in D1 for project association
 */
async function storeReferenceStyle(
  db: D1Database,
  projectId: string,
  fileId: string,
  style: ReferenceStyle
): Promise<string> {
  const id = crypto.randomUUID();

  try {
    // Ensure the project exists in the projects table first
    await db
      .prepare(
        `INSERT INTO projects (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(projectId, "Untitled Project", Date.now(), Date.now())
      .run();

    // Check if a reference style already exists for this project
    const existing = await db
      .prepare("SELECT id FROM reference_styles WHERE project_id = ?")
      .bind(projectId)
      .first<{ id: string }>();

    if (existing) {
      await db
        .prepare(
          `UPDATE reference_styles
           SET file_id = ?, style_data = ?, created_at = ?
           WHERE id = ?`
        )
        .bind(fileId, JSON.stringify(style), Date.now(), existing.id)
        .run();
      console.info(`[analyze-reference] Updated reference style for project: ${projectId}`);
    } else {
      await db
        .prepare(
          `INSERT INTO reference_styles (id, project_id, file_id, style_data, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(id, projectId, fileId, JSON.stringify(style), Date.now())
        .run();
      console.info(`[analyze-reference] Inserted new reference style for project: ${projectId}`);
    }
  } catch (dbError) {
    // D1 table may not exist yet — non-fatal, we still return the style
    console.warn(
      "Could not store reference style in D1 (table may not exist yet):",
      dbError
    );
  }

  return id;
}

/**
 * Infer MIME type from R2 key / filename extension
 */
function inferMimeType(fileId: string): string {
  const ext = fileId.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    webm: "video/webm",
    mkv: "video/x-matroska",
    m4v: "video/x-m4v",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  return mimeMap[ext] ?? "video/mp4";
}

/**
 * Validate that a URL is a public YouTube video URL.
 */
function isValidYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.length > 1;
    if (host === "youtube.com") {
      return (
        (u.pathname === "/watch" && !!u.searchParams.get("v")) ||
        u.pathname.startsWith("/shorts/") ||
        u.pathname.startsWith("/embed/")
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract the video ID from any valid YouTube URL format.
 */
function extractYouTubeVideoId(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (host === "youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v") ?? url;
      const m = u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/);
      return m?.[1] ?? url;
    }
  } catch {
    // fall through
  }
  return url;
}

/**
 * Return the canonical watch URL for a YouTube video.
 */
function canonicalizeYouTubeUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  // If extraction didn't reduce to a short ID, just return the original
  if (id.startsWith("http")) return url;
  return `https://www.youtube.com/watch?v=${id}`;
}

import type { ReferenceEditTrace, ReferenceEditEvent, ReferenceEditEventType } from "../director/reference-edit-trace";

function generateMockTrace(style: ReferenceStyle, sourceId: string): ReferenceEditTrace {
  const durationSec = 15; // V0 hardcoded or derived
  const avgShotDuration = style.rhythm.avgShotDuration || 1.0;
  const numShots = Math.max(1, Math.floor(durationSec / avgShotDuration));
  const shotDurations = Array.from({ length: numShots }, () => avgShotDuration);
  const effectDensityPer10Sec = style.effects.effectsFrequency * 10;
  const motionDensityPer10Sec = effectDensityPer10Sec * 0.8;
  const events: ReferenceEditEvent[] = [];

  for (let i = 0; i < numShots; i++) {
    const timeSec = i * avgShotDuration;
    events.push({
      timeSec,
      normalizedTime: timeSec / durationSec,
      type: "cut",
      intensity: 0.5,
      beatAligned: style.rhythm.cutAlignment !== "loose",
      visualRole: i === 0 ? "establishing" : i === numShots - 1 ? "reaction" : "action"
    });

    if (Math.random() < style.effects.effectsFrequency) {
      const isFast = style.intentMapping.pacing.includes("fast");
      const types: ReferenceEditEventType[] = isFast 
        ? ["flash", "push_in", "speed_ramp", "shake", "color_pulse", "whip"]
        : ["push_in", "hold"];
      const type = types[Math.floor(Math.random() * types.length)];
      
      events.push({
        timeSec: timeSec + 0.1,
        normalizedTime: (timeSec + 0.1) / durationSec,
        type,
        intensity: 0.7,
      });
    }
  }

  return {
    sourceId,
    durationSec,
    avgShotDurationSec: avgShotDuration,
    events,
    shotDurations,
    energyCurve: style.pacing.energyCurve || [0.5, 0.8, 1.0, 0.6],
    effectDensityPer10Sec,
    motionDensityPer10Sec
  };
}
