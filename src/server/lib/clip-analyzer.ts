/**
 * Footage Analyzer — orchestrates all analysis modules for a single clip.
 *
 * Input: video file path
 * Output: complete analysis with transcription, semantic labels, cut points, CV metrics
 */
import type { Env } from "../types/env";
import { transcribe, extractSpeechSegments, detectSpeechPauses, type TranscriptionResult, type SpeechSegment, type SpeechPause } from "./transcription";
import { labelSegments, type SemanticAnalysisResult, type SemanticSegment } from "./semantic-labeler";
import { detectCutPoints, type CutPoint } from "./cut-point-detector";
import { extractCVMetrics, type SegmentQuality } from "./cv-metrics";
import { analyzeVideoEnergy, type EnergyAnalysisResult } from "./energy-analysis";
import { detectSceneChanges, type SceneDetectionResult } from "./scene-detection";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ClipAnalysis {
  clipId: string;
  duration: number;

  // Transcription
  transcription: TranscriptionResult;
  speechSegments: SpeechSegment[];
  speechPauses: SpeechPause[];
  hasSpeech: boolean;

  // Semantic labels
  semantic: SemanticAnalysisResult;

  // CV metrics
  cvMetrics: SegmentQuality[];

  // Energy
  energy: EnergyAnalysisResult;

  // Scene detection
  scenes: SceneDetectionResult;

  // Cut points (combined from all sources)
  cutPoints: CutPoint[];

  // Summary
  summary: {
    hasNarration: boolean;
    hasBroll: boolean;
    avgImportance: number;
    bestCutPointCount: number;
    speechRatio: number;
  };
}

// ── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Analyze a single video clip comprehensively.
 *
 * Runs all analysis modules and combines results into a single object.
 * This is what the pipeline calls for each uploaded clip.
 */
export async function analyzeClip(params: {
  env: Env;
  clipId: string;
  filePath: string;
  duration?: number;
}): Promise<ClipAnalysis> {
  const { env, clipId, filePath, duration: providedDuration } = params;

  console.log(`[analyze-clip] Starting analysis for ${clipId}`);

  // Run all analyses in parallel where possible
  const [transcription, cvMetrics, energy, scenes] = await Promise.all([
    transcribe(env, filePath).catch((e) => {
      console.warn(`[analyze-clip] Transcription failed: ${(e as Error).message}`);
      return null;
    }),
    extractCVMetrics(filePath, 2.0).catch((e) => {
      console.warn(`[analyze-clip] CV metrics failed: ${(e as Error).message}`);
      return null;
    }),
    analyzeVideoEnergy(filePath, 0.5).catch((e) => {
      console.warn(`[analyze-clip] Energy analysis failed: ${(e as Error).message}`);
      return null;
    }),
    detectSceneChanges(filePath, 0.3).catch((e) => {
      console.warn(`[analyze-clip] Scene detection failed: ${(e as Error).message}`);
      return null;
    }),
  ]);

  const duration = providedDuration
    ?? transcription?.duration
    ?? energy?.totalDuration
    ?? scenes?.totalDuration
    ?? 0;

  // Process transcription
  const speechSegments = transcription
    ? extractSpeechSegments(transcription.words, 0.5)
    : [];
  const speechPauses = transcription
    ? detectSpeechPauses(speechSegments, transcription.words, 0.3)
    : [];
  const hasSpeech = speechSegments.length > 0 && speechSegments.reduce((sum, s) => sum + (s.end - s.start), 0) > 1;

  // Semantic labeling
  const segments = cvMetrics?.segments ?? [];
  let semantic: SemanticAnalysisResult;
  try {
    // Extract a few frames for Gemini if we have the file
    const frames = await extractFrames(filePath, 8).catch(() => []);
    semantic = await labelSegments({
      env,
      segments,
      speechSegments,
      frames,
      duration,
    });
  } catch (e) {
    console.warn(`[analyze-clip] Semantic labeling failed: ${(e as Error).message}`);
    // Fallback: basic labeling from CV metrics only
    semantic = {
      segments: segments.map((s) => ({
        start: s.startTime,
        end: s.endTime,
        label: s.motionScore > 0.5 ? "action" : "b-roll",
        importance: s.overallQuality,
        confidence: 0.5,
        description: `CV-only label (motion=${(s.motionScore * 100).toFixed(0)}%)`,
        faceVisible: false,
        speechCoverage: 0,
      })),
      summary: {
        speechRatio: 0,
        actionRatio: segments.filter((s) => s.motionScore > 0.5).length / Math.max(1, segments.length),
        brollRatio: segments.filter((s) => s.motionScore <= 0.5).length / Math.max(1, segments.length),
        beautyRatio: 0,
        avgImportance: segments.reduce((sum, s) => sum + s.overallQuality, 0) / Math.max(1, segments.length),
        hasNarration: false,
        hasBroll: true,
      },
    };
  }

  // Cut point detection
  const cutPoints = detectCutPoints({
    speechPauses,
    beatGrid: [], // no music for raw footage analysis
    sceneChanges: scenes?.scenes ?? [],
    segments: semantic.segments,
    energyCurve: energy?.energyCurve ?? [],
    duration,
  });

  console.log(`[analyze-clip] Done: ${clipId} — ${speechSegments.length} speech segments, ${cutPoints.length} cut points`);

  return {
    clipId,
    duration,
    transcription: transcription ?? {
      language: "unknown",
      languageProbability: 0,
      duration,
      segments: [],
      words: [],
      summary: { segmentCount: 0, wordCount: 0 },
    },
    speechSegments,
    speechPauses,
    hasSpeech,
    semantic,
    cvMetrics: segments,
    energy: energy ?? {
      frames: [],
      energyCurve: [],
      avgBrightness: 0.5,
      avgMotion: 0.5,
      peakMoment: 0,
      peakIntensity: 0,
      climaxPosition: 0.5,
      breathingMoments: [],
      totalDuration: duration,
    },
    scenes: scenes ?? {
      scenes: [],
      shotCount: 0,
      avgShotDuration: 0,
      shotDurations: [],
      totalDuration: duration,
      cutFrequency: 0,
    },
    cutPoints,
    summary: {
      hasNarration: semantic.summary.hasNarration,
      hasBroll: semantic.summary.hasBroll,
      avgImportance: semantic.summary.avgImportance,
      bestCutPointCount: cutPoints.filter((cp) => cp.score >= 0.6).length,
      speechRatio: semantic.summary.speechRatio,
    },
  };
}

/**
 * Analyze multiple clips in parallel.
 */
export async function analyzeMultipleClips(params: {
  env: Env;
  clips: Array<{ clipId: string; filePath: string; duration?: number }>;
}): Promise<ClipAnalysis[]> {
  return Promise.all(
    params.clips.map((clip) =>
      analyzeClip({ env, ...clip }),
    ),
  );
}

// ── Frame Extraction ────────────────────────────────────────────────────────

async function extractFrames(filePath: string, count: number): Promise<Uint8Array[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");

  const execFileAsync = promisify(execFile);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "frames-"));
  const framesDir = path.join(tmpDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  try {
    // Get duration
    const { stdout: durStr } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { timeout: 10_000 });
    const duration = parseFloat(durStr.trim());
    if (isNaN(duration) || duration <= 0) return [];

    // Extract frames at regular intervals
    const frames: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * duration;
      const framePath = path.join(framesDir, `frame_${i}.jpg`);
      try {
        await execFileAsync("ffmpeg", [
          "-ss", String(t),
          "-i", filePath,
          "-frames:v", "1",
          "-q:v", "2",
          framePath,
        ], { timeout: 10_000 });
        const data = await fs.readFile(framePath);
        frames.push(new Uint8Array(data));
      } catch {
        // Skip failed frames
      }
    }

    return frames;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
