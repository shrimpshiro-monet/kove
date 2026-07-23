export interface EditDNA {
  version: "1.0";
  source: {
    type: "reference" | "footage";
    duration_s: number;
    fps: number;
    resolution: { width: number; height: number };
    aspect_ratio: string;
  };
  shots: Shot[];
  color: ColorProfile;
  audio: AudioProfile;
  text_events: TextEvent[];
  pacing: PacingProfile;
  metadata: {
    analyzed_at: string;
    frame_count: number;
    analysis_fps: number;
    confidence: number;
    field_owners: Record<string, string>;
  };
}

export interface Shot {
  id: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  content: {
    description: string;
    subjects: string[];
    action: string;
    mood: string;
  };
  camera: {
    motion: "static" | "pan_left" | "pan_right" | "zoom_in" | "zoom_out" | "shake" | "tracking" | "handheld";
    intensity: number;
    direction_degrees?: number;
  };
  color: {
    dominant_hue: string;
    temperature: "warm" | "cool" | "neutral";
    saturation: number;
    brightness: number;
  };
  crop?: "tight" | "medium" | "wide" | "ultra-wide";
  cut_in_type?: "hard" | "dissolve" | "fade_from_black";
  cut_out_type?: "hard" | "dissolve" | "fade_to_black";
}

export interface ColorProfile {
  contrast: number;
  saturation: number;
  temperature_shift: "warm" | "cool" | "neutral";
  shadows_tint: string;
  highlights_tint: string;
  lut_approximation?: {
    shadows: [number, number, number];
    mids: [number, number, number];
    highlights: [number, number, number];
  };
}

export interface AudioProfile {
  bpm: number;
  beat_grid_s: number[];
  downbeats_s: number[];
  energy_curve: { time_s: number; energy: number }[];
  speech_segments: { start_s: number; end_s: number }[];
  sync_points_s: number[];
}

export interface TextEvent {
  start_s: number;
  end_s: number;
  content: string;
  position: "center" | "top" | "bottom" | "lower-third";
  style: "bold" | "italic" | "outline" | "shadow" | "glow";
  animation: "pop" | "fade" | "slide" | "typewriter" | "none";
}

export interface PacingProfile {
  avg_shot_length_s: number;
  variance: "low" | "medium" | "high";
  energy_curve: "rising" | "falling" | "peak" | "valley" | "steady";
  climax_position_s?: number;
}
