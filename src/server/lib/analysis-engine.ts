/**
 * Analysis Engine — orchestrates all analysis modules into Edit DNA.
 *
 * Order: extract frames → detect cuts → analyze motion → analyze color →
 *        caption shots (vision AI) → analyze audio → assemble Edit DNA
 */

import { z } from "zod";
import { validateEditDNA, type EditDNA, type Result } from "@monet/edit-dna";
import type { Env } from "../types/env";
import { captionShots, type ShotCaption } from "./vision-captioner.js";

const PYTHON_AI_URL_DEFAULT = "http://localhost:8102";
const PYTHON_AUDIO_URL_DEFAULT = "http://localhost:8101";

interface AnalysisOptions {
  filePath: string;
  fps?: number;
  type?: "reference" | "footage";
}

interface FrameInfo {
  path: string;
  timestamp_s: number;
  width: number;
  height: number;
}

interface ExtractionResult {
  frames: FrameInfo[];
  metadata: {
    total_frames: number;
    fps: number;
    duration_s: number;
    output_dir: string;
  };
}

interface CutResult {
  cuts: { frame_index: number; timestamp_s: number; confidence: number }[];
  shots: { start_s: number; end_s: number; frame_start: number; frame_end: number }[];
}

interface MotionResult {
  motions: { shot_index: number; motion: string; intensity: number; direction_degrees: number | null }[];
}

interface ColorResult {
  shots: { shot_index: number; dominant_hue: string; temperature: string; saturation: number; brightness: number }[];
  global: { contrast: number; saturation: number; temperature_shift: string; shadows_tint: string; highlights_tint: string };
}

interface AudioAnalysisResult {
  duration: number;
  sampleRate: number;
  tempo: number;
  beats: number[];
  transients: number[];
  energyCurve: { time: number; value: number }[];
  onsetCurve: { time: number; value: number }[];
  summary: { beatCount: number; transientCount: number; averageEnergy: number; maxEnergy: number };
}

const PythonWorkerResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
});

async function pythonPost<T>(url: string, body: unknown, dataSchema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Python worker ${url} returned ${res.status}`);
  }
  const raw = await res.json();
  const parsed = PythonWorkerResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Python worker at ${url} returned invalid envelope: ${JSON.stringify(raw)}`);
  }
  if (!parsed.data.success) throw new Error(`Python worker error at ${url}`);
  const dataResult = dataSchema.safeParse(parsed.data.data);
  if (!dataResult.success) {
    throw new Error(`Python worker at ${url} returned invalid data: ${dataResult.error.message}`);
  }
  return dataResult.data;
}

export async function analyzeVideo(
  env: Env,
  options: AnalysisOptions,
): Promise<Result<EditDNA, string>> {
  const { filePath, fps = 3, type = "reference" } = options;
  const aiUrl = env.PYTHON_AI_URL || PYTHON_AI_URL_DEFAULT;
  const audioUrl = env.PYTHON_AUDIO_URL || PYTHON_AUDIO_URL_DEFAULT;

  try {
    // Step 1: Extract frames
    const extraction = await pythonPost<ExtractionResult>(`${aiUrl}/extract-frames`, {
      filePath,
      fps,
    });

    const { frames, metadata } = extraction;
    if (frames.length === 0) {
      return { ok: false, error: "No frames extracted from video" };
    }

    // Step 2: Detect cuts
    const cutResult = await pythonPost<CutResult>(`${aiUrl}/detect-cuts`, {
      frameDir: metadata.output_dir,
      fps,
      threshold: 0.3,
    });

    if (cutResult.shots.length === 0) {
      return { ok: false, error: "No shots detected in video" };
    }

    // Step 3: Analyze motion
    const motionResult = await pythonPost<MotionResult>(`${aiUrl}/analyze-motion`, {
      frameDir: metadata.output_dir,
      shots: cutResult.shots,
    });

    // Step 4: Analyze color
    const colorResult = await pythonPost<ColorResult>(`${aiUrl}/analyze-color`, {
      frameDir: metadata.output_dir,
      shots: cutResult.shots,
    });

    // Step 5: Vision captioning
    const captions = await captionShots(env, metadata.output_dir, cutResult.shots, fps);

    // Step 6: Audio analysis (optional — proceed without it on failure)
    let audioProfile = buildEmptyAudioProfile();
    try {
      const audioResult = await pythonPost<AudioAnalysisResult>(`${audioUrl}/analyze-audio`, {
        filePath,
      });
      audioProfile = mapAudioProfile(audioResult);
    } catch {
      // Audio analysis is optional
    }

    // Step 7: Assemble Edit DNA
    const shots = cutResult.shots.map((shot, i) => ({
      id: `shot-${i}`,
      start_s: shot.start_s,
      end_s: shot.end_s,
      duration_s: shot.end_s - shot.start_s,
      content: {
        description: captions[i]?.description || "Unknown",
        subjects: captions[i]?.subjects || [],
        action: captions[i]?.action || "unknown",
        mood: captions[i]?.mood || "neutral",
      },
      camera: {
        motion: mapMotionType(motionResult.motions[i]?.motion || "static"),
        intensity: clamp01(motionResult.motions[i]?.intensity || 0),
        direction_degrees: motionResult.motions[i]?.direction_degrees ?? undefined,
      },
      color: {
        dominant_hue: colorResult.shots[i]?.dominant_hue || "90",
        temperature: mapTemperature(colorResult.shots[i]?.temperature),
        saturation: clamp01(colorResult.shots[i]?.saturation ?? 0.5),
        brightness: clamp01(colorResult.shots[i]?.brightness ?? 0.5),
      },
    }));

    const dna: EditDNA = {
      version: "1.0",
      source: {
        type,
        duration_s: metadata.duration_s,
        fps: metadata.fps,
        resolution: { width: frames[0]?.width || 1920, height: frames[0]?.height || 1080 },
        aspect_ratio: "16:9",
      },
      shots,
      color: {
        contrast: colorResult.global.contrast,
        saturation: colorResult.global.saturation,
        temperature_shift: mapTemperature(colorResult.global.temperature_shift),
        shadows_tint: colorResult.global.shadows_tint,
        highlights_tint: colorResult.global.highlights_tint,
      },
      audio: audioProfile,
      text_events: [],
      pacing: {
        avg_shot_length_s: shots.reduce((sum, s) => sum + s.duration_s, 0) / shots.length,
        variance: shots.length > 5 ? "high" : shots.length > 2 ? "medium" : "low",
        energy_curve: "steady",
      },
      metadata: {
        analyzed_at: new Date().toISOString(),
        frame_count: frames.length,
        analysis_fps: fps,
        confidence: 0.8,
        field_owners: {
          cuts: "cut-detector",
          motion: "motion-analyzer",
          color: "color-analyzer",
          content: "vision-captioner",
          audio: "audio-worker",
        },
      },
    };

    // Validate
    const validation = validateEditDNA(dna);
    if (!validation.ok) {
      return { ok: false, error: `Edit DNA validation failed: ${validation.error.message}` };
    }

    return { ok: true, value: validation.value };
  } catch (err) {
    return { ok: false, error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const VALID_MOTION_TYPES = new Set([
  "static", "pan_left", "pan_right", "zoom_in", "zoom_out", "shake", "tracking", "handheld",
]);

function mapMotionType(raw: string): EditDNA["shots"][0]["camera"]["motion"] {
  if (VALID_MOTION_TYPES.has(raw)) {
    return raw as EditDNA["shots"][0]["camera"]["motion"];
  }
  // Python worker may return "tilt_up"/"tilt_down" — map to nearest valid type
  if (raw === "tilt_up" || raw === "tilt_down") return "tracking";
  return "static";
}

function mapTemperature(raw: string): "warm" | "cool" | "neutral" {
  if (raw === "warm" || raw === "cool") return raw;
  return "neutral";
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mapAudioProfile(result: AudioAnalysisResult): EditDNA["audio"] {
  return {
    bpm: result.tempo || 0,
    beat_grid_s: result.beats || [],
    downbeats_s: result.transients || [],
    energy_curve: (result.energyCurve || []).map((p) => ({ time_s: p.time, energy: p.value })),
    speech_segments: [],
    sync_points_s: [],
  };
}

function buildEmptyAudioProfile(): EditDNA["audio"] {
  return {
    bpm: 0,
    beat_grid_s: [],
    downbeats_s: [],
    energy_curve: [],
    speech_segments: [],
    sync_points_s: [],
  };
}
