export interface OperationPlan {
  version: "1.0";
  target_duration_s: number;
  aspect_ratio: string;
  operations: Operation[];
  global_effects: GlobalEffect[];
  text_overlays: TextOverlay[];
  audio_mix: AudioMix;
}

export type Operation =
  | { type: "place_clip"; clip_id: string; track: number; start_s: number; duration_s: number; in_point_s: number; out_point_s: number }
  | { type: "apply_speed"; target: "clip" | "segment"; clip_id?: string; segment_index?: number; curve: SpeedCurve }
  | { type: "apply_transition"; between: [number, number]; transition_type: "crossfade" | "wipe" | "dissolve" | "hard"; duration_s: number }
  | { type: "apply_effect"; target: "clip" | "segment"; effect: EffectParams }
  | { type: "apply_color"; target: "global" | "clip"; clip_id?: string; params: ColorParams };

export interface SpeedCurve {
  keyframes: { time_s: number; speed: number }[];
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface GlobalEffect {
  type: "color_grade" | "vignette" | "grain" | "glow";
  params: Record<string, number>;
}

export interface TextOverlay {
  text: string;
  start_s: number;
  end_s: number;
  position: { x: number; y: number };
  style: Record<string, unknown>;
  animation: string;
}

export interface AudioMix {
  tracks: { clip_id: string; volume: number; fade_in_s: number; fade_out_s: number }[];
  ducking?: { enabled: boolean; threshold: number };
}

export interface EffectParams {
  type: string;
  intensity: number;
  [key: string]: unknown;
}

export interface ColorParams {
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: string;
  lut?: string;
}
