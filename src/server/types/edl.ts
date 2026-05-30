// MonetEDL - Edit Decision List Schema
// The AI-generated edit plan that becomes a video

/**
 * Complete edit timeline
 * This is what Gemini generates after analyzing footage + music
 */
export interface MonetEDL {
  version: string; // "1.0.0"

  metadata: {
    title: string;
    createdAt: number;
    aiModel: string; // "gemini-2.5-flash"
    prompt: string; // User's original request
    intentId: string; // Reference to EditIntent
    analysisId: string; // Reference to AnalysisResult
  };

  timeline: {
    resolution: { width: number; height: number }; // 1920x1080
    fps: number; // 30, 60
    duration: number; // Total seconds
  };

  music?: {
    sourceId: string; // Media item ID
    bpm: number;
    beatGrid: number[]; // Timestamps of beats
    volume: number; // 0-1
    fadeIn?: number; // Seconds
    fadeOut?: number; // Seconds
  };

  shots: Shot[]; // Ordered list of shots

  globalEffects?: {
    colorGrade?: ColorGradePreset;
    vignette?: number; // 0-1
    grain?: number; // 0-1
  };
}

/**
 * A single shot in the timeline
 */
export interface Shot {
  id: string;

  source: {
    clipId: string; // Media item ID
    inPoint: number; // Trim start (seconds into source)
    outPoint: number; // Trim end
  };

  timing: {
    startTime: number; // Position on main timeline
    duration: number; // Duration on timeline
    speed?: number; // 1.0 = normal, 0.5 = slow-mo, 2.0 = fast
  };

  transform?: {
    position?: { x: number; y: number }; // -1 to 1 (normalized)
    scale?: number; // 1.0 = 100%
    rotation?: number; // Degrees
    crop?: { top: number; bottom: number; left: number; right: number }; // 0-1
  };

  effects?: Effect[];

  transition?: {
    type: TransitionType;
    duration: number; // Seconds
    easing?: EasingType;
  };

  beatLock?: {
    beatIndex: number; // Which beat to align to
    lockMode: "start" | "end" | "center"; // Where to align
  };

  aiRationale?: string; // Why AI chose this shot (transparency)
}

/**
 * Visual effect applied to a shot
 */
export interface Effect {
  type: EffectType;
  intensity: number; // 0-1
  startTime?: number; // Effect start within shot (seconds)
  duration?: number; // Effect duration (if not full shot)
  params?: Record<string, number>; // Effect-specific params
}

// Effect types (MVP subset)
export type EffectType =
  | "blur"
  | "brightness"
  | "contrast"
  | "saturation"
  | "glow"
  | "shake"
  | "zoom_pulse";

// Transition types (MVP subset)
export type TransitionType = "cut" | "crossfade";

// Easing curves
export type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";

// Color grading presets
export type ColorGradePreset =
  | "cinematic" // Teal & orange, low saturation
  | "vibrant" // High saturation, punchy
  | "vintage" // Faded, warm tones
  | "monochrome" // Black & white
  | "anime" // High contrast, saturated primaries
  | "raw"; // No grading

/**
 * JSON schema for Gemini structured output (EDL generation)
 */
export const EDL_JSON_SCHEMA = {
  type: "object",
  properties: {
    timeline: {
      type: "object",
      properties: {
        duration: { type: "number" },
      },
      required: ["duration"],
    },
    music: {
      type: "object",
      properties: {
        sourceId: { type: "string" },
        volume: { type: "number" },
        fadeIn: { type: "number" },
        fadeOut: { type: "number" },
      },
    },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: {
            type: "object",
            properties: {
              clipId: { type: "string" },
              inPoint: { type: "number" },
              outPoint: { type: "number" },
            },
            required: ["clipId", "inPoint", "outPoint"],
          },
          timing: {
            type: "object",
            properties: {
              startTime: { type: "number" },
              duration: { type: "number" },
              speed: { type: "number" },
            },
            required: ["startTime", "duration"],
          },
          transform: {
            type: "object",
            properties: {
              position: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                },
              },
              scale: { type: "number" },
              rotation: { type: "number" },
            },
          },
          effects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["blur", "brightness", "contrast", "saturation", "glow", "shake", "zoom_pulse"],
                },
                intensity: { type: "number" },
                startTime: { type: "number" },
                duration: { type: "number" },
              },
              required: ["type", "intensity"],
            },
          },
          transition: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["cut", "crossfade"] },
              duration: { type: "number" },
              easing: { type: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] },
            },
            required: ["type", "duration"],
          },
          beatLock: {
            type: "object",
            properties: {
              beatIndex: { type: "number" },
              lockMode: { type: "string", enum: ["start", "end", "center"] },
            },
            required: ["beatIndex", "lockMode"],
          },
          aiRationale: { type: "string" },
        },
        required: ["source", "timing"],
      },
    },
    globalEffects: {
      type: "object",
      properties: {
        colorGrade: {
          type: "string",
          enum: ["cinematic", "vibrant", "vintage", "monochrome", "anime", "raw"],
        },
        vignette: { type: "number" },
        grain: { type: "number" },
      },
    },
  },
  required: ["timeline", "shots"],
};
