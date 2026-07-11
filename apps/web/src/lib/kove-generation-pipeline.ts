// Shared generation orchestrator for Kove frontend.
// Both Simple Editor and Chat Thread call this module.
// It owns upload, analysis, intent, style, generation, refinement, and export.

import {
  uploadFileDirect,
  decodeIntent,
  analyzeMedia,
  analyzeReferenceStyle,
  generateEDL as apiGenerateEDL,
  compileStyle,
  submitDirectorFeedback,
  type UploadResult,
} from "@/lib/api-client";
import {
  useProjectStore,
  type AssetKind,
  type FootageAsset,
  type MusicAsset,
  type ReferenceAsset,
  type ProjectAssets,
  type DirectorMessage,
} from "../stores/project-store";
import { probeVideoClientSide } from "@/lib/client-probe";

// --- Types ---

export type PipelineStage = "idle" | "uploading" | "analyzing" | "generating" | "ready" | "error";

export type UploadAssetInput = {
  file?: File;
  url?: string;
  type?: AssetKind;
  source?: "simple" | "chat" | "studio";
};

export type UploadedProjectAsset = {
  id: string;
  fileName: string;
  type: AssetKind;
  mediaUrl: string;
  size?: number;
  r2FileId?: string;
  uploadStatus: "uploaded" | "failed";
  error?: string;
};

export type UploadAssetsResult = {
  projectId: string;
  assets: UploadedProjectAsset[];
  footageIds: string[];
  musicId?: string;
  referenceIds: string[];
  mediaUrlMap: Record<string, string>;
  errors: Array<{ fileName?: string; error: string }>;
};

export type AnalysisResult = {
  analysisId?: string;
  footage?: unknown[];
  music?: unknown;
};

export type ReferenceResult = {
  referenceStyleId?: string;
  style: unknown;
};

export type IntentResult = {
  intentId?: string;
  intent?: unknown;
  confidence?: number;
};

export type StyleResult = {
  style: unknown;
  source?: string;
  cached?: boolean;
};

export type EDLResult = {
  edlId?: string;
  edl: unknown;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  usedFallback?: boolean;
  mode?: string;
};

export type PipelineResult = {
  success: boolean;
  edl?: unknown;
  edlId?: string;
  analysisId?: string;
  intentId?: string;
  referenceStyleId?: string;
  mediaUrlMap: Record<string, string>;
  scores?: EDLResult["scores"];
  mode?: string;
  fallbackUsed?: boolean;
  error?: string;
};

export type RefineResult = {
  success: boolean;
  edl?: unknown;
  patchSummary?: string;
  error?: string;
};

// --- Upload ---

export async function uploadAssets(input: {
  projectId: string;
  files: UploadAssetInput[];
  signal?: AbortSignal;
  onProgress?: (assetIdOrTempId: string, progress: number) => void;
}): Promise<UploadAssetsResult> {
  const { projectId, files, signal } = input;
  const assets: UploadedProjectAsset[] = [];
  const errors: Array<{ fileName?: string; error: string }> = [];
  const mediaUrlMap: Record<string, string> = {};

  for (const fileInput of files) {
    if (!fileInput.file) continue;

    const assetType: AssetKind = fileInput.type ?? classifyFileType(fileInput.file);
    const tempId = crypto.randomUUID().slice(0, 8);

    try {
      // Probe video metadata if applicable
      let metadata: { duration: number; width: number; height: number; fps?: number } | undefined;
      if (assetType === "footage" && fileInput.file.type.startsWith("video/")) {
        try {
          metadata = await probeVideoClientSide(fileInput.file);
        } catch {
          // metadata stays undefined — upload will still work
        }
      }

      const result: UploadResult = await uploadFileDirect(
        fileInput.file, projectId, assetType, metadata, signal
      );

      if (result.success && result.fileId) {
        const asset: UploadedProjectAsset = {
          id: result.fileId,
          fileName: fileInput.file.name,
          type: assetType,
          mediaUrl: result.fileId, // Will be resolved to actual URL later
          size: result.size,
          r2FileId: result.fileId,
          uploadStatus: "uploaded",
        };
        assets.push(asset);
        mediaUrlMap[result.fileId] = `/api/media/${result.fileId}`;
      } else {
        errors.push({ fileName: fileInput.file.name, error: result.error || "Upload failed" });
        assets.push({
          id: tempId,
          fileName: fileInput.file.name,
          type: assetType,
          mediaUrl: "",
          uploadStatus: "failed",
          error: result.error,
        });
      }
    } catch (err: any) {
      errors.push({ fileName: fileInput.file.name, error: err.message || "Upload failed" });
      assets.push({
        id: tempId,
        fileName: fileInput.file.name,
        type: assetType,
        mediaUrl: "",
        uploadStatus: "failed",
        error: err.message,
      });
    }
  }

  // Categorize assets
  const footageIds = assets.filter((a) => a.type === "footage" && a.uploadStatus === "uploaded").map((a) => a.id);
  const musicId = assets.find((a) => a.type === "music" && a.uploadStatus === "uploaded")?.id;
  const referenceIds = assets.filter((a) => a.type === "reference" && a.uploadStatus === "uploaded").map((a) => a.id);

  return { projectId, assets, footageIds, musicId, referenceIds, mediaUrlMap, errors };
}

function classifyFileType(file: File): AssetKind {
  if (file.type.startsWith("video/")) return "footage";
  if (file.type.startsWith("audio/")) return "music";
  return "reference";
}

// --- Analysis ---

export async function analyzeProject(input: {
  projectId: string;
  footageIds: string[];
  musicId?: string;
  signal?: AbortSignal;
}): Promise<AnalysisResult> {
  const result = await analyzeMedia(input.projectId, input.footageIds, input.musicId, input.signal);
  return {
    analysisId: result.analysisId,
    footage: result.result?.footage,
    music: result.result?.music,
  };
}

// --- Reference ---

export async function analyzeReference(input: {
  projectId: string;
  fileId: string;
  signal?: AbortSignal;
}): Promise<ReferenceResult> {
  const result = await analyzeReferenceStyle(input.projectId, input.fileId, input.signal);
  return {
    referenceStyleId: result.referenceStyleId,
    style: result.style,
  };
}

// --- Intent ---

export async function decodePromptIntent(input: {
  prompt: string;
  projectId: string;
  referenceStyle?: unknown;
  signal?: AbortSignal;
}): Promise<IntentResult> {
  const result = await decodeIntent(input.prompt, input.projectId, input.referenceStyle as any, input.signal);
  return {
    intentId: result.intentId,
    intent: result.result?.intent,
    confidence: result.result?.confidence,
  };
}

// --- Style ---

export async function compileStyleDNA(input: {
  prompt: string;
  signal?: AbortSignal;
}): Promise<StyleResult> {
  const result = await compileStyle(input.prompt, input.signal);
  return {
    style: result.style,
    source: result.source,
    cached: result.cached,
  };
}

// --- Generate ---

export async function generateProjectEDL(input: {
  projectId: string;
  intentId: string;
  analysisId: string;
  prompt: string;
  referenceStyle?: unknown;
  referenceTrace?: unknown;
  referenceMode?: "strict_replication" | "inspired";
  styleDNA?: unknown;
  intensity?: number;
  tempoMode?: string;
  analysisData?: unknown;
  signal?: AbortSignal;
}): Promise<EDLResult> {
  const result = await apiGenerateEDL(
    input.projectId,
    input.intentId,
    input.analysisId ?? "",
    input.referenceStyle as any,
    input.referenceTrace,
    input.referenceMode ?? "inspired",
    input.prompt,
    undefined, // style
    undefined, // durationSeconds
    input.styleDNA as any,
    input.intensity,
    input.tempoMode as any,
    input.analysisData,
  );

  return {
    edlId: result.edlId,
    edl: result.edl,
    scores: result.scores,
    usedFallback: result.usedFallback,
    mode: (result as any).generationMode,
  };
}

// --- Full Pipeline ---

export async function runGenerationPipeline(input: {
  projectId: string;
  files: UploadAssetInput[];
  prompt: string;
  intensity?: number;
  tempoMode?: string;
  referenceMode?: "strict_replication" | "inspired";
  signal?: AbortSignal;
  onStageChange?: (stage: PipelineStage) => void;
}): Promise<PipelineResult> {
  const store = useProjectStore.getState();
  const { setAssets, setPrompt, setAnalysis, setGeneration, setTruth } = store;
  const mediaUrlMap: Record<string, string> = {};

  try {
    // Stage 1: Upload
    input.onStageChange?.("uploading");
    setGeneration({ status: "generating" });

    const uploadResult = await uploadAssets({
      projectId: input.projectId,
      files: input.files,
      signal: input.signal,
    });

    if (uploadResult.errors.length > 0 && uploadResult.footageIds.length === 0) {
      throw new Error(`Upload failed: ${uploadResult.errors.map((e) => e.error).join(", ")}`);
    }

    // Build asset state
    const footageAssets: FootageAsset[] = uploadResult.assets
      .filter((a) => a.type === "footage")
      .map((a) => ({
        id: a.id, fileName: a.fileName, mediaUrl: a.mediaUrl,
        r2FileId: a.r2FileId, uploadStatus: a.uploadStatus as any,
        error: a.error, type: "footage" as const,
      }));

    const musicAsset: MusicAsset | undefined = uploadResult.assets
      .filter((a) => a.type === "music")
      .map((a) => ({
        id: a.id, fileName: a.fileName, mediaUrl: a.mediaUrl,
        r2FileId: a.r2FileId, uploadStatus: a.uploadStatus as any,
        error: a.error, type: "music" as const,
        beatFallback: false, analysisStatus: "idle" as const,
      }))[0];

    const refAsset: ReferenceAsset | undefined = uploadResult.assets
      .filter((a) => a.type === "reference")
      .map((a) => ({
        id: a.id, fileName: a.fileName, mediaUrl: a.mediaUrl,
        r2FileId: a.r2FileId, uploadStatus: a.uploadStatus as any,
        error: a.error, type: "reference" as const,
        analysisStatus: "idle" as const,
      }))[0];

    setAssets({ footage: footageAssets, music: musicAsset, reference: refAsset });
    setPrompt({ text: input.prompt, intensity: input.intensity, tempoMode: input.tempoMode });
    Object.assign(mediaUrlMap, uploadResult.mediaUrlMap);

    // Stage 2: Analysis
    input.onStageChange?.("analyzing");
    setAnalysis({ status: "analyzing" });

    let analysisResult: AnalysisResult | null = null;
    if (uploadResult.footageIds.length > 0) {
      analysisResult = await analyzeProject({
        projectId: input.projectId,
        footageIds: uploadResult.footageIds,
        musicId: uploadResult.musicId,
        signal: input.signal,
      });
      setAnalysis({
        analysisId: analysisResult.analysisId,
        footage: analysisResult.footage,
        music: analysisResult.music,
        status: "ready",
      });
    }

    // Stage 2b: Reference analysis (if reference provided)
    let referenceStyleId: string | undefined;
    let referenceStyle: unknown;
    if (refAsset?.r2FileId) {
      try {
        const refResult = await analyzeReference({
          projectId: input.projectId,
          fileId: refAsset.r2FileId,
          signal: input.signal,
        });
        referenceStyleId = refResult.referenceStyleId;
        referenceStyle = refResult.style;
        setAnalysis({ referenceStyleId });
        setTruth({ referenceProvided: true, referenceAnalyzed: true });
      } catch (err: any) {
        console.warn("Reference analysis failed:", err.message);
        setTruth({ referenceProvided: true, referenceAnalyzed: false });
      }
    }

    // Stage 2c: Intent decode
    const intentResult = await decodePromptIntent({
      prompt: input.prompt,
      projectId: input.projectId,
      referenceStyle,
      signal: input.signal,
    });
    setPrompt({ intentId: intentResult.intentId, intent: intentResult.intent });

    // Stage 2d: Style compilation (parallel, non-blocking)
    let styleDNA: unknown;
    try {
      const styleResult = await compileStyleDNA({
        prompt: input.prompt,
        signal: input.signal,
      });
      styleDNA = styleResult.style;
      setPrompt({ styleDNA });
    } catch {
      // Style compilation is optional — don't fail pipeline
    }

    // Stage 3: Generate EDL
    input.onStageChange?.("generating");

    const edlResult = await generateProjectEDL({
      projectId: input.projectId,
      intentId: intentResult.intentId ?? "",
      analysisId: analysisResult?.analysisId ?? "",
      prompt: input.prompt,
      referenceStyle,
      referenceMode: input.referenceMode ?? (referenceStyle ? "inspired" : undefined),
      styleDNA,
      intensity: input.intensity,
      tempoMode: input.tempoMode,
      analysisData: analysisResult,
      signal: input.signal,
    });

    setGeneration({
      edl: edlResult.edl as any,
      edlId: edlResult.edlId,
      mode: edlResult.mode as any,
      fallbackUsed: edlResult.usedFallback,
      scores: edlResult.scores,
      status: "ready",
    });

    setTruth({
      referenceUsedInGeneration: !!referenceStyle,
      musicProvided: !!uploadResult.musicId,
      bpm: (analysisResult?.music as any)?.bpm,
      beatFallback: (analysisResult?.music as any)?.beatFallback ?? false,
      generationMode: edlResult.mode as any,
      fallbackUsed: edlResult.usedFallback ?? false,
    });

    input.onStageChange?.("ready");

    return {
      success: true,
      edl: edlResult.edl,
      edlId: edlResult.edlId,
      analysisId: analysisResult?.analysisId,
      intentId: intentResult.intentId,
      referenceStyleId,
      mediaUrlMap,
      scores: edlResult.scores,
      mode: edlResult.mode,
      fallbackUsed: edlResult.usedFallback,
    };
  } catch (err: any) {
    input.onStageChange?.("error");
    setGeneration({ status: "failed" });
    return {
      success: false,
      mediaUrlMap,
      error: err.message || "Pipeline failed",
    };
  }
}

// --- Refinement ---

export async function refineProject(input: {
  projectId: string;
  prompt: string;
  mode?: "auto" | "full-edl" | "patch";
  selection?: { shotId?: string; range?: { start: number; end: number } };
  signal?: AbortSignal;
}): Promise<RefineResult> {
  const store = useProjectStore.getState();
  const currentEdl = store.generation.edl;
  if (!currentEdl) {
    return { success: false, error: "No EDL to refine. Generate first." };
  }

  try {
    const result = await submitDirectorFeedback(
      input.projectId,
      input.prompt,
      currentEdl as any,
      [], // keyframes
      store.prompt.intentId as string | undefined,
      store.analysis.analysisId,
    );

    if (result.newEDL) {
      // Save previous EDL to director messages
      store.addDirectorMessage({
        id: crypto.randomUUID(),
        role: "kove",
        text: result.patchSummary || "Refined edit",
        timestamp: Date.now(),
        metadata: { previousEdl: currentEdl },
      });

      store.setGeneration({ edl: result.newEDL as any, status: "ready" });
    }

    return {
      success: true,
      edl: result.newEDL,
      patchSummary: result.patchSummary,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Refinement failed",
    };
  }
}

// --- Export ---

export async function exportProject(input: {
  projectId: string;
  preferServer?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: { percent: number; stage: string }) => void;
}): Promise<{ success: boolean; blob?: Blob; error?: string }> {
  const store = useProjectStore.getState();
  const edl = store.generation.edl;
  if (!edl) {
    return { success: false, error: "No EDL to export. Generate first." };
  }

  // Dynamic import to avoid bundling export engine when not needed
  const { exportEDLToMP4ViaServer } = await import("@/lib/export-engine");

  try {
    const mediaUrlMap = buildMediaUrlMapFromAssets(store.assets);
    const blob = await exportEDLToMP4ViaServer(
      edl as any,
      new Map(Object.entries(mediaUrlMap)),
      input.onProgress,
    );
    return { success: true, blob };
  } catch (err: any) {
    return { success: false, error: err.message || "Export failed" };
  }
}

// --- Helpers ---

function buildMediaUrlMapFromAssets(assets: ProjectAssets): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of assets.footage) {
    if (f.r2FileId) map[f.r2FileId] = `/api/media/${f.r2FileId}`;
  }
  if (assets.music?.r2FileId) {
    map[assets.music.r2FileId] = `/api/media/${assets.music.r2FileId}`;
  }
  if (assets.reference?.r2FileId) {
    map[assets.reference.r2FileId] = `/api/media/${assets.reference.r2FileId}`;
  }
  return map;
}
