/**
 * BeatSync Analysis Client
 *
 * Calls the Python BeatSync analysis service for enhanced music/video analysis.
 * Falls back gracefully if the service is unavailable.
 */

const BEATSYNC_URL = process.env.BEATSYNC_URL || "http://localhost:8103";

export interface AudioFeatures {
  duration: number;
  bpm: number;
  beat_grid: number[];
  beat_count: number;
  features: {
    kick: number[];
    bass: number[];
    clap: number[];
    hihat: number[];
    rms: number[];
    centroid: number[];
    flux: number[];
    novelty: number[];
    energy: number[];
    impact_score: number[];
    arc: number[];
    energy_levels: string[];
  };
  sections: Array<{
    index: number;
    start: number;
    end: number;
    duration: number;
    type: string;
    avg_energy: number;
  }>;
  tempo_classification: string;
}

export interface VideoAnalysis {
  duration: number;
  fps: number;
  total_frames: number;
  candidates: Array<{
    time: number;
    frame_idx: number;
    motion: number;
    quality: number;
    brightness: number;
    saturation: number;
    has_face: boolean;
  }>;
  candidate_count: number;
  scene_changes: number[];
  avg_motion: number;
  avg_quality: number;
}

export interface CutPlan {
  cut_count: number;
  cut_times: number[];
  cut_info: Array<{
    time: number;
    section: string;
    energy: number;
    impact: number;
  }>;
  planned_clips: Array<{
    cut_time: number;
    source_time: number;
    source_video: string;
    match_score: number;
  }>;
  avg_cut_interval: number;
}

async function fetchJSON<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BEATSYNC_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn(`[beatsync-client] ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[beatsync-client] ${path} failed:`, (err as Error).message);
    return null;
  }
}

export async function analyzeAudio(audioPath: string): Promise<AudioFeatures | null> {
  return fetchJSON<AudioFeatures>("/analyze-audio", { audio_path: audioPath });
}

export async function analyzeVideo(videoPath: string, maxFrames = 64): Promise<VideoAnalysis | null> {
  return fetchJSON<VideoAnalysis>("/analyze-video", {
    video_path: videoPath,
    max_frames: maxFrames,
  });
}

export async function planCuts(
  audioFeatures: AudioFeatures["features"] & { beat_grid: number[] },
  sections: AudioFeatures["sections"],
  videoCandidates?: VideoAnalysis["candidates"],
): Promise<CutPlan | null> {
  return fetchJSON<CutPlan>("/plan-cuts", {
    audio_features: audioFeatures,
    sections,
    video_candidates: videoCandidates,
  });
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BEATSYNC_URL}/docs`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}
