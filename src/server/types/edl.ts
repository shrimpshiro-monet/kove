// MonetEDL - Edit Decision List Schema
// The AI-generated edit plan that becomes a video

/**
 * Edit DNA - Quantified Style Signature
 */
export interface EditDNA {
  cutDensity: number; // 0-1, how frequently cuts happen
  motionAggression: number; // 0-1, camera motion intensity
  transitionRhythm: "mechanical" | "syncopated" | "organic" | "chaotic";
  emotionalCadence: "rising" | "falling" | "wave" | "plateau";
  visualChaos: number; // 0-1, compositional variety
  colorTemperature: "cool" | "warm" | "mixed";
  effectIntensity: number; // 0-1, how heavy effects are
  beatAlignmentStrictness: number; // 0-1, how tightly synced to music
}

export interface Act {
  name: string;
  startTime: number;
  duration: number;
  energy: number;
  mood: string;
}

export interface CharacterFocus {
  name: string;
  prominence: number;
  emotionalArc?: string;
}

export interface SegmentRef {
  clipId: string;
  inPoint: number;
  outPoint: number;
  reason?: string;
}

/**
 * Edit Intent Layer
 */
export interface EditIntent {
  version: string;
  goal: { primary: string; secondary?: string[] };
  targetAudience: { platform: "tiktok" | "youtube" | "instagram" | "twitter" | "general"; demographics?: string };
  style: { genre: string; pacing: "slow" | "medium" | "fast" | "aggressive" | "varied"; mood: string[]; referenceStyle?: string };
  structure: { duration: number; acts?: Act[]; energyCurve: number[]; climaxPoint?: number };
  technical: { syncToBeat: boolean; beatSyncStrength?: number; avgShotDuration?: number; transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed"; colorTreatment: "vibrant" | "cinematic" | "vintage" | "raw" | "anime" | "monochrome"; effectsIntensity: number };
  contentPreferences: { focusOn?: string[]; avoid?: string[]; characters?: CharacterFocus[] };
  constraints?: { mustInclude?: SegmentRef[]; mustAvoid?: string[]; maxComplexity?: "simple" | "medium" | "complex" };
}

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

  motionTracks?: MotionTrack[];
  planarTracks?: PlanarTrack[];
  textOverlays?: TextOverlay[];

  globalEffects?: {
    colorGrade?: ColorGradePreset;
    vignette?: number; // 0-1
    grain?: number; // 0-1
  };
}

export interface MotionTrackKeyframe {
  time: number; // Seconds in source clip time
  x: number; // -1..1 normalized
  y: number; // -1..1 normalized
  scale?: number;
  rotation?: number;
  confidence?: number; // 0..1
}

export interface MotionTrack {
  id: string;
  clipId: string;
  method: "feature" | "face" | "object";
  keyframes: MotionTrackKeyframe[];
}

export interface PlanarCorner {
  x: number; // -1..1 normalized
  y: number; // -1..1 normalized
}

export interface PlanarTrackKeyframe {
  time: number; // Seconds in source clip time
  corners: [PlanarCorner, PlanarCorner, PlanarCorner, PlanarCorner]; // TL, TR, BR, BL
  confidence?: number;
}

export interface PlanarTrack {
  id: string;
  clipId: string;
  keyframes: PlanarTrackKeyframe[];
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number; // Main timeline seconds
  endTime: number; // Main timeline seconds
  offset?: { x: number; y: number }; // -1..1 normalized offset
  style?: {
    fontSize?: number;
    color?: string;
    weight?: string;
    shadow?: boolean;
  };
  tracking?: {
    trackId: string;
    mode: "follow" | "behind_subject" | "planar";
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
    speedRamp?: {
      startSpeed: number;
      endSpeed: number;
      easing: EasingType;
    };
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
  | "zoom_pulse"
  | "directional_blur"
  | "rgb_split"
  | "radial_zoom_blur";

// Transition types (MVP subset)
export type TransitionType = "cut" | "crossfade" | "whip-pan" | "zoom-blur" | "glitch";

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
                  enum: ["blur", "brightness", "contrast", "saturation", "glow", "shake", "zoom_pulse", "directional_blur", "rgb_split", "radial_zoom_blur"],
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
              type: { type: "string", enum: ["cut", "crossfade", "whip-pan", "zoom-blur", "glitch"] },
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
    motionTracks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          clipId: { type: "string" },
          method: { type: "string", enum: ["feature", "face", "object"] },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "number" },
                x: { type: "number" },
                y: { type: "number" },
                scale: { type: "number" },
                rotation: { type: "number" },
                confidence: { type: "number" },
              },
              required: ["time", "x", "y"],
            },
          },
        },
        required: ["id", "clipId", "method", "keyframes"],
      },
    },
    planarTracks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          clipId: { type: "string" },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "number" },
                corners: {
                  type: "array",
                  minItems: 4,
                  maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                  },
                },
                confidence: { type: "number" },
              },
              required: ["time", "corners"],
            },
          },
        },
        required: ["id", "clipId", "keyframes"],
      },
    },
    textOverlays: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          startTime: { type: "number" },
          endTime: { type: "number" },
          offset: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
          style: {
            type: "object",
            properties: {
              fontSize: { type: "number" },
              color: { type: "string" },
              weight: { type: "string" },
            },
          },
          tracking: {
            type: "object",
            properties: {
              trackId: { type: "string" },
              mode: { type: "string", enum: ["follow", "behind_subject", "planar"] },
            },
            required: ["trackId", "mode"],
          },
        },
        required: ["id", "text", "startTime", "endTime"],
      },
    },
  },
  required: ["timeline", "shots"],
};
