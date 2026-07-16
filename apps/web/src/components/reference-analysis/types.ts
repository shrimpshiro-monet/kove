export interface ColorSignature {
  brightness: number
  contrast: number
  saturation: number
  style: string
}

export interface SegmentStyle {
  start: number
  end: number
  duration: number
  brightness: number
  contrast: number
  saturation: number
  blur: number
  vignette: number
  grain: number
  glow: number
  shake: number
  rgb_split: number
  camera_motion: "static" | "pan" | "zoom" | "handheld" | "orbit"
  transition_type: "cut" | "crossfade" | "flash" | "wipe"
  transition_duration: number
  speed: number
  has_text: boolean
  text_confidence: number
}

export interface ReferenceStyleProfile {
  source_path: string
  duration: number
  fps: number
  resolution: [number, number]
  total_cuts: number
  avg_shot_duration: number
  shot_duration_variance: number
  bpm: number
  beats: number[]
  cut_alignment: "strict" | "loose" | "none"
  segments: SegmentStyle[]
  color_signature: ColorSignature
  energy_curve: number[]
  climax_position: number
  pacing_type: "aggressive" | "fast" | "medium" | "slow"
  effect_vocabulary: string[]
  transition_vocabulary: string[]
  avg_transition_duration: number
  camera_motion_distribution: Record<string, number>
  avg_speed: number
  speed_variance: number
}

export interface AnalyzeReferenceResult {
  overlayVideoUrl: string | null
  report: ReferenceStyleProfile
}

export interface AnalyzeReferenceStatus {
  jobId: string
  status: "queued" | "analyzing" | "generating_overlay" | "complete" | "failed"
  progress: number
  message: string
  result?: AnalyzeReferenceResult
  error?: string
}
