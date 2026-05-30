// Analysis Result Types
// What Gemini returns after analyzing footage + music

export interface AnalysisResult {
  version: string; // "1.0.0"
  projectId: string;
  timestamp: number;

  footage: FootageAnalysis[];
  music?: MusicAnalysis;
  reference?: ReferenceAnalysis;
}

/**
 * Analysis of a single video clip
 * Gemini scores segments for motion, emotion, visual quality
 */
export interface FootageAnalysis {
  clipId: string;
  duration: number;
  resolution: { width: number; height: number };
  fps: number;

  // Scored segments (high-quality moments)
  segments: ScoredSegment[];

  // Overall clip characteristics
  characteristics: {
    avgBrightness: number; // 0-1
    avgMotion: number; // 0-1
    dominantColors: string[]; // ["#FF5733", "#33FF57"]
    visualStyle: string; // "cinematic", "handheld", "static", etc.
    contentType: string[]; // ["action", "dialogue", "landscape"]
  };
}

/**
 * A scored segment within a clip
 * AI identifies the best moments to use
 */
export interface ScoredSegment {
  start: number; // Seconds into clip
  end: number;
  duration: number;

  // Scoring metrics (0-1)
  scores: {
    overall: number; // Combined score
    motion: number; // Camera/subject movement
    emotion: number; // Emotional intensity
    visual: number; // Composition, lighting quality
    interest: number; // How engaging/unique
  };

  // What makes this segment good
  description: string; // "intense close-up with high emotion"
  tags: string[]; // ["closeup", "action", "emotional"]

  // Technical details
  avgBrightness: number;
  dominantColor: string;
  faceDetected: boolean;
}

/**
 * Music analysis - beats, structure, energy
 */
export interface MusicAnalysis {
  musicId: string;
  duration: number;

  // Beat detection
  bpm: number; // Beats per minute
  beatGrid: number[]; // Timestamps of beats [0.5, 0.93, 1.36, ...]
  beatConfidence: number; // 0-1, how confident we are in beat detection

  // Song structure
  structure?: {
    intro?: [number, number]; // [start, end] in seconds
    verse?: [number, number][];
    chorus?: [number, number][];
    bridge?: [number, number];
    outro?: [number, number];
    drop?: number[]; // Timestamps of drops/climaxes
  };

  // Energy curve (0-1 per second)
  energyCurve: number[]; // [0.3, 0.4, 0.5, 0.7, 0.9, ...]

  // Musical characteristics
  characteristics: {
    genre: string; // "electronic", "rock", "orchestral"
    mood: string[]; // ["energetic", "dark", "triumphant"]
    tempo: "slow" | "medium" | "fast" | "variable";
    intensity: number; // 0-1
  };
}

/**
 * Reference video analysis (optional)
 * Extracts style/pacing to match
 */
export interface ReferenceAnalysis {
  referenceId: string;
  duration: number;

  // Pacing analysis
  pacing: {
    avgShotDuration: number; // Seconds
    shotDurations: number[]; // All shot lengths
    pacingVariance: number; // 0-1, how varied the pacing is
    cutsPerMinute: number;
  };

  // Transition analysis
  transitions: {
    mostCommon: string; // "cut", "crossfade", "whip_pan"
    transitionTypes: Record<string, number>; // { "cut": 45, "crossfade": 5 }
    avgTransitionDuration: number;
  };

  // Visual style
  visualStyle: {
    colorGrading: string; // "vibrant", "cinematic", "desaturated"
    dominantColors: string[];
    avgBrightness: number;
    contrastLevel: number; // 0-1
    motionLevel: number; // 0-1, how much camera movement
  };

  // Effects detected
  effects: string[]; // ["glow", "shake", "speed_ramp"]

  // Overall style summary
  styleSummary: string; // "TikTok-style fast cuts with vibrant colors and whip pan transitions"
}

/**
 * JSON schema for Gemini structured output (footage analysis)
 */
export const FOOTAGE_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          duration: { type: "number" },
          scores: {
            type: "object",
            properties: {
              overall: { type: "number" },
              motion: { type: "number" },
              emotion: { type: "number" },
              visual: { type: "number" },
              interest: { type: "number" },
            },
            required: ["overall", "motion", "emotion", "visual", "interest"],
          },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          avgBrightness: { type: "number" },
          dominantColor: { type: "string" },
          faceDetected: { type: "boolean" },
        },
        required: [
          "start",
          "end",
          "duration",
          "scores",
          "description",
          "tags",
          "avgBrightness",
          "dominantColor",
          "faceDetected",
        ],
      },
    },
    characteristics: {
      type: "object",
      properties: {
        avgBrightness: { type: "number" },
        avgMotion: { type: "number" },
        dominantColors: { type: "array", items: { type: "string" } },
        visualStyle: { type: "string" },
        contentType: { type: "array", items: { type: "string" } },
      },
      required: [
        "avgBrightness",
        "avgMotion",
        "dominantColors",
        "visualStyle",
        "contentType",
      ],
    },
  },
  required: ["segments", "characteristics"],
};

/**
 * JSON schema for music analysis
 */
export const MUSIC_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    bpm: { type: "number" },
    beatGrid: { type: "array", items: { type: "number" } },
    beatConfidence: { type: "number" },
    structure: {
      type: "object",
      properties: {
        intro: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        verse: { type: "array", items: { type: "array", items: { type: "number" } } },
        chorus: { type: "array", items: { type: "array", items: { type: "number" } } },
        bridge: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        outro: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        drop: { type: "array", items: { type: "number" } },
      },
    },
    energyCurve: { type: "array", items: { type: "number" } },
    characteristics: {
      type: "object",
      properties: {
        genre: { type: "string" },
        mood: { type: "array", items: { type: "string" } },
        tempo: { type: "string", enum: ["slow", "medium", "fast", "variable"] },
        intensity: { type: "number" },
      },
      required: ["genre", "mood", "tempo", "intensity"],
    },
  },
  required: ["bpm", "beatGrid", "beatConfidence", "energyCurve", "characteristics"],
};
