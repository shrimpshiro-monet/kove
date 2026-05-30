// Edit Intent Schema - THE MOAT
// This is what makes Monet a creative intelligence system, not just a video editor

/**
 * EditIntent - Creative reasoning layer between user prompt and EDL
 *
 * This abstraction enables:
 * - Multi-variant EDL generation from same intent
 * - Cheap refinements (tweak intent, not re-analyze)
 * - Explainability (user sees WHY AI made decisions)
 * - Cross-genre learning
 * - Intent caching (60% cost reduction)
 */
export interface EditIntent {
  version: string; // "1.0.0"

  // What does the user want to achieve?
  goal: {
    primary: string; // "build tension before chorus drop"
    secondary?: string[]; // ["showcase character emotions", "fast pacing"]
  };

  // Who is this for?
  targetAudience: {
    platform: "tiktok" | "youtube" | "instagram" | "twitter" | "general";
    demographics?: string; // "anime fans 16-24"
  };

  // What style/genre?
  style: {
    genre:
      | "anime_amv"
      | "sports_highlight"
      | "wedding"
      | "cinematic_trailer"
      | "fan_edit"
      | "music_video"
      | "promo"
      | "vlog"
      | "tutorial"
      | "other";
    pacing: "slow" | "medium" | "fast" | "aggressive" | "varied";
    mood: string[]; // ["energetic", "emotional", "dark", "triumphant"]
    referenceStyle?: string; // Extracted from reference video if provided
  };

  // How should it be structured?
  structure: {
    duration: number; // Target seconds
    acts?: Act[]; // Optional story beats
    energyCurve: number[]; // 0-1 values, one per second or beat
    climaxPoint?: number; // Timestamp of peak moment
  };

  // Technical requirements
  technical: {
    syncToBeat: boolean; // Hard sync to music beats
    beatSyncStrength?: number; // 0-1, how strict (default: 0.8)
    avgShotDuration?: number; // Seconds, null = AI decides
    transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed";
    colorTreatment:
      | "vibrant"
      | "cinematic"
      | "vintage"
      | "raw"
      | "anime"
      | "monochrome";
    effectsIntensity: number; // 0-1
  };

  // What to focus on?
  contentPreferences: {
    focusOn?: string[]; // ["face_closeups", "action_scenes", "landscape_shots"]
    avoid?: string[]; // ["shaky_footage", "dark_scenes"]
    characters?: CharacterFocus[]; // For story-driven edits
  };

  // User constraints
  constraints?: {
    mustInclude?: SegmentRef[]; // User-selected clips that must appear
    mustAvoid?: string[]; // "no slow-mo", "no text overlays"
    maxComplexity?: "simple" | "medium" | "complex";
  };
}

export interface Act {
  name: string; // "Intro", "Build-up", "Drop", "Outro"
  startTime: number; // Seconds into final edit
  duration: number;
  energy: number; // 0-1
  mood: string;
}

export interface CharacterFocus {
  name: string; // "Naruto", "Sasuke"
  prominence: number; // 0-1, how much screen time
  emotionalArc?: string; // "determined → victorious"
}

export interface SegmentRef {
  clipId: string;
  inPoint: number;
  outPoint: number;
  reason?: string; // Why user wants this included
}

/**
 * Intent Extraction Response - What Gemini returns
 */
export interface IntentExtractionResult {
  intent: EditIntent;
  confidence: number; // 0-1
  clarifyingQuestions?: ClarifyingQuestion[];
  reasoning: string; // Why AI interpreted the prompt this way
}

export interface ClarifyingQuestion {
  question: string;
  options: string[];
  affectsField: string; // JSONPath to intent field this impacts
  importance: "critical" | "high" | "medium" | "low";
}

/**
 * MVP Simplified Intent - Start with this
 * Full schema is expansion system
 */
export interface SimplifiedIntent {
  version: string;

  goal: {
    primary: string;
  };

  style: {
    genre: string;
    pacing: "slow" | "medium" | "fast" | "aggressive";
    mood: string[];
  };

  structure: {
    duration: number;
    energyCurve: number[]; // Just 5-10 values for MVP
  };

  technical: {
    syncToBeat: boolean;
    beatSyncStrength: number;
    transitionStyle: "cut" | "smooth" | "dynamic";
    colorTreatment: string;
    effectsIntensity: number;
  };

  contentPreferences: {
    focusOn: string[];
  };
}

/**
 * JSON Schema for Gemini structured output
 * This ensures Gemini returns valid intent JSON
 */
export const INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "object",
      properties: {
        version: { type: "string" },
        goal: {
          type: "object",
          properties: {
            primary: { type: "string" },
          },
          required: ["primary"],
        },
        style: {
          type: "object",
          properties: {
            genre: { type: "string" },
            pacing: {
              type: "string",
              enum: ["slow", "medium", "fast", "aggressive"],
            },
            mood: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["genre", "pacing", "mood"],
        },
        structure: {
          type: "object",
          properties: {
            duration: { type: "number" },
            energyCurve: {
              type: "array",
              items: { type: "number", minimum: 0, maximum: 1 },
            },
          },
          required: ["duration", "energyCurve"],
        },
        technical: {
          type: "object",
          properties: {
            syncToBeat: { type: "boolean" },
            beatSyncStrength: { type: "number", minimum: 0, maximum: 1 },
            transitionStyle: {
              type: "string",
              enum: ["cut", "smooth", "dynamic"],
            },
            colorTreatment: { type: "string" },
            effectsIntensity: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "syncToBeat",
            "beatSyncStrength",
            "transitionStyle",
            "colorTreatment",
            "effectsIntensity",
          ],
        },
        contentPreferences: {
          type: "object",
          properties: {
            focusOn: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["focusOn"],
        },
      },
      required: ["version", "goal", "style", "structure", "technical", "contentPreferences"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    clarifyingQuestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          affectsField: { type: "string" },
          importance: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
        },
        required: ["question", "options", "affectsField", "importance"],
      },
    },
    reasoning: { type: "string" },
  },
  required: ["intent", "confidence", "reasoning"],
};
