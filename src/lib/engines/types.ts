// src/lib/engines/types.ts

export type EngineId =
  | "openreel"        // baseline Canvas2D — always available, fastest
  | "webgl-grade"     // color, vignette, chromatic — GPU, near-free
  | "webgl-blur"      // gaussian/motion/radial blur — GPU
  | "sam-vfx"         // subject isolation, bg replace — Replicate API, slow + paid
  | "depth-vfx"       // depth-based parallax, fog, defocus — Replicate, slow
  | "rife-interp"     // optical-flow slow-mo, smooth ramps — Replicate or local
  | "ffmpeg-server"   // final HD render, AV1, true export — server GPU
  | "shader-fx"       // glitch, RGB shift, scan lines — custom WebGL
  | "particle-fx"     // sparks, light leaks, dust — Canvas2D + sprites
  | "text-engine"     // kinetic typography, captions — custom DOM/Canvas
  | "audio-engine"    // BGM mixing, ducking, fades — Web Audio API
  | "ai-specialist"   // Subject isolation, depth-aware compositing, face tracking
  | "specialist-ai"   // SAM2, Depth Anything, RIFE via Replicate
  | "opencv-browser"  // OpenCV.js browser CV: face detect, edges, optical flow
  | "canvas2d";       // Canvas2D fallback for unhandled effects

export interface EngineCapability {
  id: EngineId;
  displayName: string;
  description: string;
  supports: Set<string>;        // effect kinds it natively handles
  preferredFor: Set<string>;    // effects it handles BEST (vs just supports)
  cost: number;                  // 1 = free/fast, 10 = expensive/slow
  qualityBonus: number;          // 1 = baseline, 3 = dramatic upgrade
  tier: "free" | "creator" | "pro";
  maxShotsPerEdit?: number;     // throttle expensive engines
  serverSideOnly?: boolean;      // can't run in browser preview
  requiresFlag?: string;         // beta-gate certain engines
}

export interface RoutedShot {
  shotId: string;
  primaryEngine: EngineId;
  effectsByEngine: Partial<Record<EngineId, string[]>>;
}
