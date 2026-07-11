/**
 * Perception Plugins Client
 *
 * TypeScript interfaces and subprocess callers for perception upgrades:
 * - PaddleOCR text overlay detection
 * - YOLO + ByteTrack subject tracking
 * - PySceneDetect scene boundary validation
 * - librosa audio-visual sync analysis
 * - FFmpeg signalstats color/flash detection
 * - Silence detection (from auto-editor algorithms)
 * - Motion scoring (from auto-editor algorithms)
 * - Audio normalization (from auto-editor algorithms)
 *
 * All Python scripts are called via execFileAsync (subprocess), not HTTP.
 * Follows the existing pattern from reference-analysis-service.ts.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const PYTHON_WORKERS_DIR = path.resolve(process.cwd(), "workers/python-ai/workers");
const VENV_PYTHON = path.resolve(process.cwd(), "workers/python-ai/.venv/bin/python3");

async function runPythonScript(scriptName: string, functionName: string, videoPath: string, timeout = 120_000): Promise<any> {
  try {
    const { stdout } = await execFileAsync(
      VENV_PYTHON,
      [
        "-c",
        `import json,sys;sys.path.insert(0,'${PYTHON_WORKERS_DIR}');from ${scriptName} import ${functionName};print(json.dumps(${functionName}(sys.argv[1])))`,
        videoPath,
      ],
      { timeout, maxBuffer: 50 * 1024 * 1024 },
    );
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error(`[perception] ${scriptName}.${functionName} failed: ${(err as Error).message}`);
    return null;
  }
}

// ─── Text Overlay Detection (PaddleOCR) ──────────────────────────

export interface TextOverlayTrace {
  startTime: number;
  endTime: number;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  position: "center" | "lower_third" | "upper_third" | "dynamic";
  animation: "pop_scale" | "fade_in" | "slide_up" | "typewriter" | "static_caption" | "unknown";
  motion: {
    dx: number;
    dy: number;
    scaleStart: number;
    scaleEnd: number;
    opacityCurve: "fast_in" | "linear" | "slow_in" | "unknown";
  };
  fontVibe: "bold_sans" | "condensed_sans" | "serif" | "monospace" | "handwritten" | "outline" | "italic" | "unknown";
  confidence: number;
}

export async function detectTextOverlays(videoPath: string): Promise<TextOverlayTrace[]> {
  const result = await runPythonScript("text_overlay_analyzer", "analyze_text_overlays", videoPath, 180_000);
  return result?.overlays ?? [];
}

// ─── Subject Tracking (YOLO + ByteTrack) ─────────────────────────

export interface SubjectTrack {
  trackId: string;
  className: string;
  startTime: number;
  endTime: number;
  avgCenter: { x: number; y: number };
  motionPath: "left_to_right" | "right_to_left" | "static" | "circular" | "diagonal" | "unknown";
  velocityPeaks: number[];
  occlusionEvents: Array<{ startTime: number; endTime: number }>;
  faceLikelyVisible: boolean;
  confidence: number;
}

export async function trackSubjects(videoPath: string): Promise<SubjectTrack[]> {
  const result = await runPythonScript("subject_tracker", "track_subjects", videoPath, 180_000);
  return result?.tracks ?? [];
}

// ─── Scene Boundary Validation (PySceneDetect) ───────────────────

export interface SceneBoundaryTrace {
  timestamp: number;
  type: "hard_cut" | "fade_in" | "fade_out" | "dissolve" | "crossfade" | "jump_cut";
  confidence: number;
  contentScore: number;
  durationBefore: number;
  durationAfter: number;
}

export async function detectSceneBoundaries(videoPath: string): Promise<SceneBoundaryTrace[]> {
  const result = await runPythonScript("scene_boundary_analyzer", "detect_boundaries", videoPath, 120_000);
  return result?.boundaries ?? [];
}

// ─── Audio-Visual Sync (librosa) ─────────────────────────────────

export interface AudioVisualSync {
  beatToCutAlignmentMs: number;
  cutOnBeatRatio: number;
  accentCutRatio: number;
  dropCutTimes: number[];
  offBeatSyncopationRatio: number;
  avgBeatIntervalMs: number;
  syncConfidence: number;
}

export async function analyzeAudioVisualSync(videoPath: string): Promise<AudioVisualSync | null> {
  return await runPythonScript("audio_sync_analyzer", "analyze_sync", videoPath, 120_000);
}

// ─── Color/Effect Signal Stats (FFmpeg signalstats) ──────────────

export interface SignalStatsTrace {
  timestamp: number;
  lumaAvg: number;
  lumaMin: number;
  lumaMax: number;
  saturationAvg: number;
  hueAvg: number;
  hueMedian: number;
  flashDetected: boolean;
  exposurePulse: boolean;
}

export interface ColorSignalStats {
  avgSaturation: number;
  avgHue: number;
  avgLuma: number;
  saturationVariance: number;
  flashCount: number;
  flashTimestamps: number[];
  exposurePulseCount: number;
  saturationCurve: number[];
  lumaCurve: number[];
  hueCurve: number[];
}

export async function analyzeSignalStats(videoPath: string): Promise<ColorSignalStats | null> {
  return await runPythonScript("signal_stats_analyzer", "analyze_signal_stats", videoPath, 60_000);
}

// ─── Silence Detection (from auto-editor) ────────────────────────

export interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceAnalysis {
  silenceSegments: SilenceSegment[];
  speechSegments: SilenceSegment[];
  silenceRatio: number;
  totalSilenceDuration: number;
  totalDuration: number;
  silenceCount: number;
  speechCount: number;
}

export async function detectSilence(videoPath: string): Promise<SilenceAnalysis | null> {
  return await runPythonScript("silence_detector", "detect_silence", videoPath, 120_000);
}

// ─── Motion Scoring (from auto-editor) ───────────────────────────

export interface MotionSegment {
  start: number;
  end: number;
  duration: number;
  avgMotion: number;
  maxMotion: number;
  motionLevel: "motionless" | "low" | "medium" | "high";
  isMotionless: boolean;
}

export interface MotionAnalysis {
  segments: MotionSegment[];
  totalDuration: number;
  avgMotion: number;
  motionlessRatio: number;
  motionlessCount: number;
}

export async function scoreMotion(videoPath: string): Promise<MotionAnalysis | null> {
  return await runPythonScript("motion_scorer", "score_motion", videoPath, 120_000);
}

// ─── Audio Normalization (from auto-editor) ──────────────────────

export interface NormalizationAnalysis {
  inputLoudness: number;
  inputTruePeak: number;
  inputLRA: number;
  targetLoudness: number;
  gainDb: number;
  gainLinear: number;
  needsNormalization: boolean;
  totalDuration: number;
  normalizationType: string;
}

export async function normalizeAudio(videoPath: string): Promise<NormalizationAnalysis | null> {
  return await runPythonScript("audio_normalizer", "normalize_audio", videoPath, 60_000);
}

// ─── Batch Perception Analysis ────────────────────────────────────

export interface PerceptionResult {
  textOverlays: TextOverlayTrace[];
  subjectTracks: SubjectTrack[];
  sceneBoundaries: SceneBoundaryTrace[];
  audioVisualSync: AudioVisualSync | null;
  colorSignalStats: ColorSignalStats | null;
  silenceAnalysis: SilenceAnalysis | null;
  motionAnalysis: MotionAnalysis | null;
  normalization: NormalizationAnalysis | null;
}

export async function runPerceptionPlugins(videoPath: string): Promise<PerceptionResult> {
  console.log("[perception] Running perception plugins...");

  const [textOverlays, subjectTracks, sceneBoundaries, audioVisualSync, colorSignalStats, silenceAnalysis, motionAnalysis, normalization] = await Promise.all([
    detectTextOverlays(videoPath).catch(() => []),
    trackSubjects(videoPath).catch(() => []),
    detectSceneBoundaries(videoPath).catch(() => []),
    analyzeAudioVisualSync(videoPath).catch(() => null),
    analyzeSignalStats(videoPath).catch(() => null),
    detectSilence(videoPath).catch(() => null),
    scoreMotion(videoPath).catch(() => null),
    normalizeAudio(videoPath).catch(() => null),
  ]);

  console.log(`[perception] Results: ${textOverlays.length} text, ${subjectTracks.length} subjects, ${sceneBoundaries.length} scenes, silence=${silenceAnalysis?.silenceRatio?.toFixed(2) ?? "N/A"}, motion=${motionAnalysis?.avgMotion?.toFixed(3) ?? "N/A"}`);

  return { textOverlays, subjectTracks, sceneBoundaries, audioVisualSync, colorSignalStats, silenceAnalysis, motionAnalysis, normalization };
}
