import type { Env } from "../types/env";
import {
  FOOTAGE_ANALYSIS_JSON_SCHEMA,
  FootageAnalysisSchema,
  MUSIC_ANALYSIS_JSON_SCHEMA,
  MusicAnalysisSchema,
  type FootageAnalysis,
  type MusicAnalysis,
} from "../types/analysis";
import { loadPromptTemplate, type PromptName } from "../prompts";
import { getAIService, type AIService } from "./ai-service";
import { ok, err, type Result } from "../lib/result";
import { withRetry } from "../lib/retry";

type SupportedGeminiMimeType =
  | "video/mp4"
  | "video/webm"
  | "video/quicktime"
  | "video/mpeg"
  | "video/mpg"
  | "video/x-flv"
  | "video/3gpp"
  | "video/wmv"
  | "audio/aac"
  | "audio/flac"
  | "audio/mp3"
  | "audio/m4a"
  | "audio/mpeg"
  | "audio/mpga"
  | "audio/mp4"
  | "audio/opus"
  | "audio/pcm"
  | "audio/wav"
  | "audio/webm"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "application/pdf"
  | "text/plain";

const GEMINI_SUPPORTED_MIME_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/mpeg",
  "video/mpg",
  "video/x-flv",
  "video/3gpp",
  "video/wmv",
  "audio/aac",
  "audio/flac",
  "audio/mp3",
  "audio/m4a",
  "audio/mpeg",
  "audio/mpga",
  "audio/mp4",
  "audio/opus",
  "audio/pcm",
  "audio/wav",
  "audio/webm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function normalizeMimeType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().split(";")[0];
}

function extensionFromName(name: string): string {
  const clean = name.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function inferMimeTypeFromName(name: string): string {
  switch (extensionFromName(name)) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
    case "qt":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mpeg":
    case "mpg":
      return "video/mpeg";
    case "flv":
      return "video/x-flv";
    case "3gp":
    case "3gpp":
      return "video/3gpp";
    case "wmv":
      return "video/wmv";

    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "mp3":
      return "audio/mp3";
    case "m4a":
      return "audio/m4a";
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/opus";
    case "pcm":
      return "audio/pcm";
    case "oga":
    case "ogg":
      return "audio/opus";

    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";

    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";

    default:
      return "";
  }
}

function inferMimeTypeFromBytes(data: Uint8Array): string {
  if (data.length >= 12) {
    const boxType = String.fromCharCode(data[4], data[5], data[6], data[7]);
    const brand = String.fromCharCode(data[8], data[9], data[10], data[11]);

    if (boxType === "ftyp") {
      if (brand.startsWith("qt") || brand === "moov" || brand === "wide") {
        return "video/quicktime";
      }

      if (
        brand.startsWith("mp4") ||
        brand.startsWith("isom") ||
        brand.startsWith("iso") ||
        brand.startsWith("avc") ||
        brand.startsWith("m4v") ||
        brand.startsWith("MSNV")
      ) {
        return "video/mp4";
      }
    }
  }

  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  ) {
    return "video/webm";
  }

  if (data.length >= 3 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
    return "audio/mp3";
  }

  if (
    data.length >= 12 &&
    String.fromCharCode(data[0], data[1], data[2], data[3]) === "RIFF" &&
    String.fromCharCode(data[8], data[9], data[10], data[11]) === "WAVE"
  ) {
    return "audio/wav";
  }

  if (
    data.length >= 4 &&
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46
  ) {
    return "application/pdf";
  }

  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    data.length >= 12 &&
    String.fromCharCode(data[0], data[1], data[2], data[3]) === "RIFF" &&
    String.fromCharCode(data[8], data[9], data[10], data[11]) === "WEBP"
  ) {
    return "image/webp";
  }

  return "";
}

function resolveGeminiMimeType(params: {
  declaredMimeType?: unknown;
  fileName?: string;
  r2Key?: string;
  clipId?: string;
  data: Uint8Array;
}): SupportedGeminiMimeType {
  const declared = normalizeMimeType(params.declaredMimeType);

  if (declared && declared !== "application/octet-stream") {
    if (GEMINI_SUPPORTED_MIME_TYPES.has(declared)) {
      return declared as SupportedGeminiMimeType;
    }

    throw new Error(
      `Unsupported Gemini MIME type "${declared}" for clip "${
        params.clipId ?? params.r2Key ?? "unknown"
      }".`
    );
  }

  const candidates = [params.fileName, params.r2Key, params.clipId].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );

  for (const candidate of candidates) {
    const inferred = inferMimeTypeFromName(candidate);
    if (inferred && GEMINI_SUPPORTED_MIME_TYPES.has(inferred)) {
      return inferred as SupportedGeminiMimeType;
    }
  }

  const sniffed = inferMimeTypeFromBytes(params.data);
  if (sniffed && GEMINI_SUPPORTED_MIME_TYPES.has(sniffed)) {
    return sniffed as SupportedGeminiMimeType;
  }

  throw new Error(
    `Could not determine a Gemini-supported MIME type for clip "${
      params.clipId ?? params.r2Key ?? "unknown"
    }". ` + `Declared MIME was "${declared || "missing"}". Do not send application/octet-stream to Vertex Gemini.`
  );
}

const MAX_WORKER_GEMINI_UPLOAD_BYTES = 100 * 1024 * 1024;

export type AnalysisServiceErrorCode =
  | "MEDIA_NOT_FOUND"
  | "STORAGE_UNAVAILABLE"
  | "FILE_TOO_LARGE"
  | "GEMINI_UPLOAD_UNAVAILABLE"
  | "GEMINI_ANALYSIS_FAILED"
  | "INVALID_ANALYSIS_RESPONSE";

export interface AnalysisServiceError {
  code: AnalysisServiceErrorCode;
  message: string;
  details?: unknown;
}

interface UploadFileParams {
  data: Uint8Array;
  mimeType: string;
  displayName: string;
}

interface UploadedFile {
  uri: string;
  expiresAt?: string;
}

type FileUploadCapableAI = AIService & {
  uploadFile: (params: UploadFileParams) => Promise<UploadedFile>;
};

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

interface MediaLookup {
  id: string;
  r2Key: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  rotation?: number;
}

interface AnalyzeClipParams {
  clipId: string;
  env: Env;
  ai?: AIService;
}

interface AnalyzeMusicParams {
  musicId: string;
  env: Env;
  ai?: AIService;
}

export async function analyzeClip(
  params: AnalyzeClipParams
): Promise<Result<FootageAnalysis, AnalysisServiceError>> {
  if (!params.env) {
    return err({
      code: "STORAGE_UNAVAILABLE",
      message: "Env not provided to analyzeClip",
    });
  }
  const ai = params.ai ?? getAIService(params.env);

  const lookupResult = await resolveMediaLookup(params.clipId, params.env);
  if (!lookupResult.ok) {
    return err(lookupResult.error);
  }

  const media = lookupResult.value;
  const prompt = loadPromptTemplate("analyze-footage.txt" as PromptName);

  const isMockId = media.id.startsWith("clip-") || media.id.startsWith("music-") || !media.r2Key.includes("/");

  if (
    params.env.MONET_MEDIA &&
    isFileUploadCapableAI(ai) &&
    isFileAnalysisCapableAI(ai) &&
    !isMockId
  ) {
    return analyzeClipFromR2(media, params.env, ai, prompt);
  }

  return analyzeClipFromTextContext(media, ai, prompt);
}

export async function analyzeMusic(
  params: AnalyzeMusicParams
): Promise<Result<MusicAnalysis, AnalysisServiceError>> {
  const ai = params.ai ?? getAIService(params.env);

  const lookupResult = await resolveMediaLookup(params.musicId, params.env);
  if (!lookupResult.ok) {
    return err(lookupResult.error);
  }

  const media = lookupResult.value;
  const prompt = loadPromptTemplate("analyze-music.txt" as PromptName);

  const isMockId = media.id.startsWith("clip-") || media.id.startsWith("music-") || !media.r2Key.includes("/");

  if (
    params.env.MONET_MEDIA &&
    isFileUploadCapableAI(ai) &&
    isFileAnalysisCapableAI(ai) &&
    !isMockId
  ) {
    return analyzeMusicFromR2(media, params.env, ai, prompt);
  }

  return analyzeMusicFromTextContext(media, ai, prompt);
}

async function analyzeClipFromR2(
  media: MediaLookup,
  env: Env,
  ai: FileUploadCapableAI & FileAnalysisCapableAI,
  prompt: string
): Promise<Result<FootageAnalysis, AnalysisServiceError>> {
  try {
    const object = await env.MONET_MEDIA.get(media.r2Key);
    if (!object) {
      console.warn(`[analysis/clip] R2 media object not found for clip "${media.id}" at key "${media.r2Key}". Falling back to text context analysis.`);
      return analyzeClipFromTextContext(media, ai, prompt);
    }

    if (object.size > MAX_WORKER_GEMINI_UPLOAD_BYTES) {
      return err({
        code: "FILE_TOO_LARGE",
        message:
          "Clip is too large for Worker-based Gemini upload path. Use a queued/server analysis path for this asset.",
        details: {
          clipId: media.id,
          r2Key: media.r2Key,
          size: object.size,
          maxBytes: MAX_WORKER_GEMINI_UPLOAD_BYTES,
        },
      });
    }

    const arrayBuffer = await object.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const declaredMimeType =
      object.httpMetadata?.contentType ||
      (object as any).customMetadata?.mimeType ||
      (object as any).customMetadata?.contentType ||
      "application/octet-stream";

    const mimeType = resolveGeminiMimeType({
      declaredMimeType,
      fileName:
        (object as any).customMetadata?.fileName ||
        (object as any).customMetadata?.name ||
        (object as any).customMetadata?.originalName,
      r2Key: media.r2Key,
      clipId: media.id,
      data: bytes,
    });

    console.log("[analysis/clip] Resolved Gemini MIME type", {
      operation: "analyzeClipFromR2",
      clipId: media.id,
      r2Key: media.r2Key,
      declaredMimeType,
      mimeType,
      bytes: bytes.byteLength,
    });

    const displayName = `${media.id}.${
      extensionFromName((object as any).customMetadata?.fileName || media.r2Key) || "mp4"
    }`;

    const uploaded = await withRetry(
      () =>
        ai.uploadFile({
          data: bytes,
          mimeType,
          displayName,
        }) as Promise<{ uri: string; name: string; }>,
      { retries: 2, baseDelay: 1000 }
    );

    const raw = await withRetry(
      () =>
        ai.generateContentJSONWithFile<unknown>({
          fileUri: uploaded.uri,
          mimeType,
          prompt: buildFootagePrompt(prompt, media),
          systemInstruction:
            "You are Monet's footage analyst. Watch the video carefully and return only valid structured JSON matching the provided schema.",
          temperature: 0.25,
          schema: FOOTAGE_ANALYSIS_JSON_SCHEMA,
        }),
      { retries: 2, baseDelay: 1000 }
    );

    console.log("=== MONET LIVE BLUEPRINT DEBUT ===");
    console.log(JSON.stringify(raw, null, 2));
    console.log("==================================");

    return validateFootageAnalysis(raw, media, "video");
  } catch (error) {
    console.error("[analysis/clip] Gemini video analysis failed", {
      operation: "analyzeClipFromR2",
      clipId: media.id,
      r2Key: media.r2Key,
      error,
    });

    return err({
      code: "GEMINI_ANALYSIS_FAILED",
      message: "Failed to analyze clip with Gemini",
      details: error,
    });
  }
}

async function analyzeMusicFromR2(
  media: MediaLookup,
  env: Env,
  ai: FileUploadCapableAI & FileAnalysisCapableAI,
  prompt: string
): Promise<Result<MusicAnalysis, AnalysisServiceError>> {
  try {
    const object = await env.MONET_MEDIA.get(media.r2Key);
    if (!object) {
      console.warn(`[analysis/music] R2 media object not found for music "${media.id}" at key "${media.r2Key}". Falling back to text context analysis.`);
      return analyzeMusicFromTextContext(media, ai, prompt);
    }

    if (object.size > MAX_WORKER_GEMINI_UPLOAD_BYTES) {
      return err({
        code: "FILE_TOO_LARGE",
        message:
          "Music file is too large for Worker-based Gemini upload path. Use a queued/server analysis path for this asset.",
        details: {
          musicId: media.id,
          r2Key: media.r2Key,
          size: object.size,
          maxBytes: MAX_WORKER_GEMINI_UPLOAD_BYTES,
        },
      });
    }

    const arrayBuffer = await object.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const declaredMimeType =
      object.httpMetadata?.contentType ||
      (object as any).customMetadata?.mimeType ||
      (object as any).customMetadata?.contentType ||
      "application/octet-stream";

    const mimeType = resolveGeminiMimeType({
      declaredMimeType,
      fileName:
        (object as any).customMetadata?.fileName ||
        (object as any).customMetadata?.name ||
        (object as any).customMetadata?.originalName,
      r2Key: media.r2Key,
      clipId: media.id,
      data: bytes,
    });

    console.log("[analysis/music] Resolved Gemini MIME type", {
      operation: "analyzeMusicFromR2",
      musicId: media.id,
      r2Key: media.r2Key,
      declaredMimeType,
      mimeType,
      bytes: bytes.byteLength,
    });

    const displayName = `${media.id}.${
      extensionFromName((object as any).customMetadata?.fileName || media.r2Key) || "mp3"
    }`;

    const uploaded = await withRetry(
      () =>
        ai.uploadFile({
          data: bytes,
          mimeType,
          displayName,
        }) as Promise<{ uri: string; name: string; }>,
      { retries: 2, baseDelay: 1000 }
    );

    const raw = await withRetry(
      () =>
        ai.generateContentJSONWithFile<unknown>({
          fileUri: uploaded.uri,
          mimeType,
          prompt: buildMusicPrompt(prompt, media),
          systemInstruction:
            "You are Monet's music analyst. Analyze rhythm, BPM, beat grid, energy, and mood. Return only valid structured JSON matching the provided schema.",
          temperature: 0.2,
          schema: MUSIC_ANALYSIS_JSON_SCHEMA,
        }),
      { retries: 2, baseDelay: 1000 }
    );

    return validateMusicAnalysis(raw, media);
  } catch (error) {
    console.error("[analysis/music] Gemini music analysis failed", {
      operation: "analyzeMusicFromR2",
      musicId: media.id,
      r2Key: media.r2Key,
      error,
    });

    return err({
      code: "GEMINI_ANALYSIS_FAILED",
      message: "Failed to analyze music with Gemini",
      details: error,
    });
  }
}

async function analyzeClipFromTextContext(
  media: MediaLookup,
  ai: AIService,
  prompt: string
): Promise<Result<FootageAnalysis, AnalysisServiceError>> {
  try {
    const raw = await ai.generateContentJSON<unknown>({
      prompt: `${buildFootagePrompt(prompt, media)}

NOTE: Video bytes are not available in this environment. Produce a conservative metadata_fallback analysis from the clip ID, filename, and media type only. Confidence must be low.
You MUST produce at least 1 segment of duration between 3s and 10s. Do not return an empty segment array.`,
      systemInstruction:
        "You are Monet's fallback footage analyst. Return conservative structured JSON only.",
      temperature: 0.2,
      schema: FOOTAGE_ANALYSIS_JSON_SCHEMA,
    });

    return validateFootageAnalysis(raw, media, "metadata_fallback");
  } catch (error) {
    console.error("[analysis/clip] Text fallback analysis failed", {
      operation: "analyzeClipFromTextContext",
      clipId: media.id,
      r2Key: media.r2Key,
      error,
    });

    return err({
      code: "GEMINI_ANALYSIS_FAILED",
      message: "Failed to analyze clip from metadata context",
      details: error,
    });
  }
}

async function analyzeMusicFromTextContext(
  media: MediaLookup,
  ai: AIService,
  prompt: string
): Promise<Result<MusicAnalysis, AnalysisServiceError>> {
  try {
    const raw = await ai.generateContentJSON<unknown>({
      prompt: `${buildMusicPrompt(prompt, media)}

NOTE: Audio bytes are not available in this environment. Produce a conservative metadata_fallback music analysis from the music ID, filename, and media type only. Confidence must be low.`,
      systemInstruction:
        "You are Monet's fallback music analyst. Return conservative structured JSON only.",
      temperature: 0.2,
      schema: MUSIC_ANALYSIS_JSON_SCHEMA,
    });

    return validateMusicAnalysis(raw, media);
  } catch (error) {
    console.error("[analysis/music] Text fallback analysis failed", {
      operation: "analyzeMusicFromTextContext",
      musicId: media.id,
      r2Key: media.r2Key,
      error,
    });

    return err({
      code: "GEMINI_ANALYSIS_FAILED",
      message: "Failed to analyze music from metadata context",
      details: error,
    });
  }
}

function validateFootageAnalysis(
  raw: unknown,
  media: MediaLookup,
  analysisMode: FootageAnalysis["analysisMode"]
): Result<FootageAnalysis, AnalysisServiceError> {
  // Pre-process to fix common AI hallucinations and fill missing fields
  let normalized = raw;
  if (raw && typeof raw === "object") {
    const obj = { ...(raw as any) };
    // Fill required fields from media metadata if AI didn't provide them
    if (!obj.clipId) obj.clipId = media.id;
    if (!obj.duration) obj.duration = media.duration ?? 10;
    if (obj.confidence === undefined || obj.confidence === null) obj.confidence = 0.5;
    if (!obj.analysisMode) obj.analysisMode = analysisMode;
    if (!obj.characteristics) obj.characteristics = { mood: ["neutral"], energy: 0.5, visualComplexity: 0.5 };
    if (!Array.isArray(obj.segments) || obj.segments.length === 0) {
      obj.segments = [{
        id: "seg_001",
        start: 0,
        end: obj.duration,
        duration: obj.duration,
        scores: { overall: 0.5, motion: 0.5, emotion: 0.5, visual: 0.5, interest: 0.5 },
        description: "AI-generated segment from metadata analysis",
        tags: ["ai_generated"],
      }];
    }
    if (Array.isArray(obj.segments)) {
      obj.segments = obj.segments.map((seg: any, idx: number) => {
        if (seg && typeof seg === "object") {
          const s = { ...seg };
          if (typeof s.start === "number" && typeof s.end === "number") {
            s.duration = Number((s.end - s.start).toFixed(3));
          }
          if (!s.id) s.id = `seg_${String(idx + 1).padStart(3, "0")}`;
          if (!s.scores) s.scores = { overall: 0.5, motion: 0.5, emotion: 0.5, visual: 0.5, interest: 0.5 };
          if (!s.tags) s.tags = ["ai_generated"];
          return s;
        }
        return seg;
      });
    }
    normalized = obj;
  }

  const validation = FootageAnalysisSchema.safeParse(normalized);

  if (!validation.success) {
    console.error("[analysis/clip] Invalid Gemini footage analysis response", {
      operation: "validateFootageAnalysis",
      clipId: media.id,
      error: validation.error,
      raw: JSON.stringify(normalized).slice(0, 1000),
    });

    return err({
      code: "INVALID_ANALYSIS_RESPONSE",
      message: "Gemini returned invalid footage analysis",
      details: validation.error,
    });
  }

  const value: FootageAnalysis = {
    ...validation.data,
    clipId: media.id,
    r2Key: media.r2Key,
    analysisMode,
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
    ...(media.fps ? { fps: media.fps } : {}),
    ...(media.rotation ? { rotation: media.rotation } : {}),
  };

  const finalValidation = FootageAnalysisSchema.safeParse(value);
  if (!finalValidation.success) {
    return err({
      code: "INVALID_ANALYSIS_RESPONSE",
      message: "Normalized footage analysis failed validation",
      details: finalValidation.error,
    });
  }

  return ok(finalValidation.data);
}

function validateMusicAnalysis(
  raw: unknown,
  media: MediaLookup
): Result<MusicAnalysis, AnalysisServiceError> {
  let normalized = raw;
  if (raw && typeof raw === "object") {
    const obj = { ...(raw as any) };
    if (!obj.musicId) obj.musicId = media.id;
    if (!obj.duration || typeof obj.duration !== "number") obj.duration = media.duration ?? 180;
    if (typeof obj.bpm !== "number" || obj.bpm <= 0) obj.bpm = 120;
    if (!Array.isArray(obj.beatGrid) || obj.beatGrid.length === 0) {
      // Generate a basic beat grid from BPM
      const beatInterval = 60 / obj.bpm;
      const beats = [];
      for (let t = 0; t < obj.duration; t += beatInterval) {
        beats.push(Number(t.toFixed(3)));
      }
      obj.beatGrid = beats;
    }
    if (obj.confidence === undefined || obj.confidence === null) obj.confidence = 0.5;
    if (!obj.characteristics) {
      obj.characteristics = { mood: ["neutral"], energy: 0.5, intensity: 0.5, genreHints: ["unknown"] };
    }
    // Ensure all required characteristics fields exist
    if (!obj.characteristics.mood) obj.characteristics.mood = ["neutral"];
    if (obj.characteristics.energy === undefined) obj.characteristics.energy = 0.5;
    if (obj.characteristics.intensity === undefined) obj.characteristics.intensity = 0.5;
    if (!obj.characteristics.genreHints) obj.characteristics.genreHints = ["unknown"];
    normalized = obj;
  }

  const validation = MusicAnalysisSchema.safeParse(normalized);

  if (!validation.success) {
    console.error("[analysis/music] Invalid Gemini music analysis response", {
      operation: "validateMusicAnalysis",
      musicId: media.id,
      error: validation.error,
      raw: JSON.stringify(normalized).slice(0, 1000),
    });

    return err({
      code: "INVALID_ANALYSIS_RESPONSE",
      message: "Gemini returned invalid music analysis",
      details: validation.error,
    });
  }

  const value: MusicAnalysis = {
    ...validation.data,
    musicId: media.id,
    r2Key: media.r2Key,
  };

  const finalValidation = MusicAnalysisSchema.safeParse(value);
  if (!finalValidation.success) {
    return err({
      code: "INVALID_ANALYSIS_RESPONSE",
      message: "Normalized music analysis failed validation",
      details: finalValidation.error,
    });
  }

  return ok(finalValidation.data);
}

async function resolveMediaLookup(
  mediaId: string,
  env: Env
): Promise<Result<MediaLookup, AnalysisServiceError>> {
  if (env?.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT r2_key, mime_type, file_size, width, height, fps, rotation FROM media_items WHERE id = ?"
      )
        .bind(mediaId)
        .first<{
          r2_key: string;
          mime_type: string | null;
          file_size: number | null;
          width: number | null;
          height: number | null;
          fps: number | null;
          rotation: number | null;
        }>();

      if (row) {
        return ok({
          id: mediaId,
          r2Key: row.r2_key,
          mimeType: row.mime_type ?? inferMimeType(row.r2_key),
          size: row.file_size ?? undefined,
          width: row.width ?? undefined,
          height: row.height ?? undefined,
          fps: row.fps ?? undefined,
          rotation: row.rotation ?? undefined,
        });
      }
    } catch (error) {
      console.error("[analysis/media] Failed to resolve media metadata", {
        operation: "resolveMediaLookup",
        mediaId,
        error,
      });

      return err({
        code: "STORAGE_UNAVAILABLE",
        message: "Failed to resolve media metadata",
        details: error,
      });
    }
  }

  return ok({
    id: mediaId,
    r2Key: mediaId,
    mimeType: inferMimeType(mediaId),
  });
}

function buildFootagePrompt(prompt: string, media: MediaLookup): string {
  return `${prompt}

Clip metadata:
- clipId: ${media.id}
- r2Key: ${media.r2Key}
- mimeType: ${media.mimeType}
${media.size !== undefined ? `- sizeBytes: ${media.size}` : ""}

Return a valid FootageAnalysis JSON object. Segment start/end times must be in seconds. Scores must be between 0 and 1.`;
}

function buildMusicPrompt(prompt: string, media: MediaLookup): string {
  return `${prompt}

Music metadata:
- musicId: ${media.id}
- r2Key: ${media.r2Key}
- mimeType: ${media.mimeType}
${media.size !== undefined ? `- sizeBytes: ${media.size}` : ""}

Return a valid MusicAnalysis JSON object. beatGrid must be an array of beat timestamps in seconds.`;
}

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

  return mimeMap[ext] ?? "application/octet-stream";
}

function isFileUploadCapableAI(ai: AIService): ai is FileUploadCapableAI {
  return "uploadFile" in ai && typeof ai.uploadFile === "function";
}

function isFileAnalysisCapableAI(ai: AIService): ai is FileAnalysisCapableAI {
  return (
    "generateContentJSONWithFile" in ai &&
    typeof ai.generateContentJSONWithFile === "function"
  );
}
