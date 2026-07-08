// ReferenceStyle — editing DNA extracted from a reference video
// Powered by Gemini 2.5 Flash multimodal video analysis
// This is what turns "edit like this" into a real constraint system

/**
 * Complete editing fingerprint extracted from a reference video.
 * Every field maps directly to a MonetEDL parameter or EditIntent field.
 */
export interface ReferenceStyle {
  version: "1.0";

  // === RHYTHM ===
  // The timing contract between editor and viewer
  rhythm: {
    avgShotDuration: number; // Average seconds per shot
    shotDurationVariance: number; // Std dev — high = dynamic, low = mechanical
    beatsPerCut: number; // How many beats between cuts (1 = every beat)
    cutAlignment: "strict" | "loose" | "none"; // How tightly cuts follow music
    accentCuts: number[]; // Timestamps of deliberately emphasized cuts
    structure?: {
      firstHalfAvgShotDuration: number;
      secondHalfAvgShotDuration: number;
      firstHalfCutsPerSecond: number;
      secondHalfCutsPerSecond: number;
      shortestShotDuration: number;
      longestShotDuration: number;
      shotDurationVariance: number;
      accelerationRatio: number;
    };
  };

  // === PACING ARCHITECTURE ===
  // How the energy moves through the piece
  pacing: {
    type: "aggressive" | "fast" | "medium" | "slow" | "varied";
    energyCurve: number[]; // 0-1 values, one per 10% of video
    intensityBuilds: boolean; // Does energy consistently build?
    climaxPosition: number; // 0-1, where peak moment occurs
    breathingMoments: number[]; // Timestamps of intentional slow-downs
  };

  // === SHOT LANGUAGE ===
  // What this editor sees and chooses
  shotLanguage: {
    closeupRatio: number; // 0-1, fraction of shots that are close-ups
    wideRatio: number; // 0-1, fraction that are wide shots
    motionPreference: "static" | "moving" | "mixed"; // Camera movement
    subjectFocus: string[]; // "faces", "hands", "action", "environment", "abstract"
    sequencePatterns: string[]; // e.g. "wide→close→extreme", "parallel_cutting"
  };

  // === VISUAL STYLE ===
  // How it looks
  visualStyle: {
    colorGrade:
      | "cinematic"
      | "vibrant"
      | "vintage"
      | "monochrome"
      | "anime"
      | "raw";
    colorTemperature: "warm" | "cool" | "neutral";
    contrastLevel: "low" | "medium" | "high";
    saturationLevel:
      | "desaturated"
      | "natural"
      | "saturated"
      | "hyper-saturated";
    vignettePresent: boolean;
    grainPresent: boolean;
  };

  // === EFFECTS & TRANSITIONS ===
  effects: {
    overallIntensity: number; // 0-1
    effectsFrequency: number; // fraction of shots with any visible effect
    commonEffects: string[]; // e.g. ["glow", "shake", "zoom_pulse", "flash"]
    transitionsBreakdown: {
      cutPercentage: number; // Should be >0.8 for professional edits
      crossfadePercentage: number;
      otherPercentage: number;
    };
  };

  // === EMOTIONAL DESIGN ===
  // The arc the viewer is taken through
  emotionalArc: {
    openingMood: string; // "restrained" | "explosive" | "mysterious" | ...
    peakMood: string; // "euphoric" | "intense" | "melancholic" | ...
    closingMood: string; // "triumphant" | "reflective" | "fading" | ...
    emotionalContour: string; // "build-and-release" | "sustained-intensity" | ...
  };

  // === EDITOR'S PHILOSOPHY ===
  // The 'why' — what makes this edit's decisions coherent
  editingPhilosophy: {
    summary: string; // 2-3 sentences describing the editor's craft approach
    rhythmContract: string; // The unspoken timing agreement with the viewer
    restraintLevel: "minimal" | "moderate" | "heavy"; // Holds back vs. maximal stimulation
    signatureMove: string; // The most distinctive technique this editor uses
  };

  // === COMPOSITION & LAYERING ===
  // How elements are stacked and combined
  composition: {
    avgLayerCount: number; // How many elements typically stacked
    maskingFrequency: number; // 0-1, how often character masks are used
    depthOrder: "subject_on_top" | "text_behind_subject" | "mixed";
    commonBlendModes: string[];
  };

  // === STYLE PILLARS ===
  // Core editing DNA
  pillarScores: {
    brutalistImpact: number; // 0-1
    tensionPivot: number; // 0-1
    vocalFlowSync: number; // 0-1
    legacyMontage: number; // 0-1
  };

  // === TEXT & GRAPHICS ===
  // Timing, style and content of overlays
  textStyle: {
    pacing: "snappy" | "lingering" | "none";
    positioning: "center" | "dynamic" | "lower_third";
    fontVibe: string; // e.g. "bold_sans", "elegant_serif", "glitchy"
    animationStyle: string; // e.g. "pop_in", "fade_with_motion"
  };

  // === EFFECT TRIGGERS ===
  // Temporal placement of effects
  effectTriggers: {
    type: string; // e.g. "glitch", "chromatic_aberration", "color_shift"
    triggerEvent: "cut" | "beat" | "action_start" | "random";
    intensity: number;
  }[];

  // === PER-SHOT ANALYSIS (extracted from FFmpeg frame data) ===
  effectVocabulary?: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    effects: Array<{
      type: string;
      intensity: number;
      timing: "start" | "middle" | "end" | "throughout";
      params?: Record<string, number>;
    }>;
    transition?: { type: string; duration: number };
  }>;
  colorGrades?: Array<{
    timestamp: number;
    saturation: number;
    brightness: number;
    contrast: number;
    temperature: number;
  }>;
  velocityRamps?: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    entrySpeed: number;
    anchorSpeed: number;
    exitSpeed: number;
    anchorPosition: number;
    easing: string;
  }>;
  flashFrames?: Array<{
    timestamp: number;
    type: "white" | "black";
    brightness: number;
    precedingShotIndex: number;
    followingShotIndex: number;
  }>;

  // === STRUCTURAL ANALYSIS (1s resolution motion profile) ===
  structuralAnalysis?: {
    motionEnergyProfile1s: number[];
    shotMotionProfile: Array<{
      shotIndex: number;
      startTime: number;
      duration: number;
      meanMotion: number;
      maxMotion: number;
    }>;
    earlyEnergy: number;
    lateEnergy: number;
    energyVarianceRatio: number;
    peakMotionTimestamp?: number;
  };

  // === CLIMAX DETECTION (setup→montage transition) ===
  climax?: {
    timestamp: number;
    confidence: number;
    reason: string;
    signals: {
      motionJump: number;
      cutAcceleration: number;
      shotDurationDrop: number;
      peakMotion?: number;
    };
  };

  // === MONET INTENT MAPPING ===
  // Concrete values to inject directly into EditIntent — no interpretation needed
  intentMapping: {
    genre:
      | "anime_amv"
      | "sports_highlight"
      | "wedding"
      | "cinematic_trailer"
      | "fan_edit"
      | "music_video"
      | "promo"
      | "vlog"
      | "other";
    pacing: "aggressive" | "fast" | "medium" | "slow" | "varied";
    syncToBeat: boolean;
    beatSyncStrength: number; // 0-1
    colorTreatment:
      | "vibrant"
      | "cinematic"
      | "vintage"
      | "raw"
      | "anime"
      | "monochrome";
    effectsIntensity: number; // 0-1
    transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed";
    avgShotDuration: number; // seconds
    mood: string[];
    contentFocus: string[];
    structure?: "setup_to_montage" | "uniform_montage" | "dialogue_drama" | "unknown";
    energyArc?: "flat" | "build" | "climax_spike" | "decline";
  };
}

/**
 * JSON Schema for Gemini responseSchema (structured output)
 */
export const REFERENCE_STYLE_JSON_SCHEMA = {
  type: "object",
  properties: {
    rhythm: {
      type: "object",
      properties: {
        avgShotDuration: { type: "number" },
        shotDurationVariance: { type: "number" },
        beatsPerCut: { type: "number" },
        cutAlignment: {
          type: "string",
          enum: ["strict", "loose", "none"],
        },
        accentCuts: { type: "array", items: { type: "number" } },
      },
      required: [
        "avgShotDuration",
        "shotDurationVariance",
        "beatsPerCut",
        "cutAlignment",
        "accentCuts",
      ],
    },
    pacing: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["aggressive", "fast", "medium", "slow", "varied"],
        },
        energyCurve: {
          type: "array",
          items: { type: "number" },
        },
        intensityBuilds: { type: "boolean" },
        climaxPosition: { type: "number" },
        breathingMoments: { type: "array", items: { type: "number" } },
      },
      required: [
        "type",
        "energyCurve",
        "intensityBuilds",
        "climaxPosition",
        "breathingMoments",
      ],
    },
    shotLanguage: {
      type: "object",
      properties: {
        closeupRatio: { type: "number" },
        wideRatio: { type: "number" },
        motionPreference: {
          type: "string",
          enum: ["static", "moving", "mixed"],
        },
        subjectFocus: { type: "array", items: { type: "string" } },
        sequencePatterns: { type: "array", items: { type: "string" } },
      },
      required: [
        "closeupRatio",
        "wideRatio",
        "motionPreference",
        "subjectFocus",
        "sequencePatterns",
      ],
    },
    visualStyle: {
      type: "object",
      properties: {
        colorGrade: {
          type: "string",
          enum: [
            "cinematic",
            "vibrant",
            "vintage",
            "monochrome",
            "anime",
            "raw",
          ],
        },
        colorTemperature: {
          type: "string",
          enum: ["warm", "cool", "neutral"],
        },
        contrastLevel: { type: "string", enum: ["low", "medium", "high"] },
        saturationLevel: {
          type: "string",
          enum: [
            "desaturated",
            "natural",
            "saturated",
            "hyper-saturated",
          ],
        },
        vignettePresent: { type: "boolean" },
        grainPresent: { type: "boolean" },
      },
      required: [
        "colorGrade",
        "colorTemperature",
        "contrastLevel",
        "saturationLevel",
        "vignettePresent",
        "grainPresent",
      ],
    },
    effects: {
      type: "object",
      properties: {
        overallIntensity: { type: "number" },
        effectsFrequency: { type: "number" },
        commonEffects: { type: "array", items: { type: "string" } },
        transitionsBreakdown: {
          type: "object",
          properties: {
            cutPercentage: { type: "number" },
            crossfadePercentage: { type: "number" },
            otherPercentage: { type: "number" },
          },
          required: [
            "cutPercentage",
            "crossfadePercentage",
            "otherPercentage",
          ],
        },
      },
      required: [
        "overallIntensity",
        "effectsFrequency",
        "commonEffects",
        "transitionsBreakdown",
      ],
    },
    emotionalArc: {
      type: "object",
      properties: {
        openingMood: { type: "string" },
        peakMood: { type: "string" },
        closingMood: { type: "string" },
        emotionalContour: { type: "string" },
      },
      required: [
        "openingMood",
        "peakMood",
        "closingMood",
        "emotionalContour",
      ],
    },
    editingPhilosophy: {
      type: "object",
      properties: {
        summary: { type: "string" },
        rhythmContract: { type: "string" },
        restraintLevel: {
          type: "string",
          enum: ["minimal", "moderate", "heavy"],
        },
        signatureMove: { type: "string" },
      },
      required: [
        "summary",
        "rhythmContract",
        "restraintLevel",
        "signatureMove",
      ],
    },
    intentMapping: {
      type: "object",
      properties: {
        genre: {
          type: "string",
          enum: [
            "anime_amv",
            "sports_highlight",
            "wedding",
            "cinematic_trailer",
            "fan_edit",
            "music_video",
            "promo",
            "vlog",
            "other",
          ],
        },
        pacing: {
          type: "string",
          enum: ["aggressive", "fast", "medium", "slow", "varied"],
        },
        syncToBeat: { type: "boolean" },
        beatSyncStrength: { type: "number" },
        colorTreatment: { type: "string" },
        effectsIntensity: { type: "number" },
        transitionStyle: {
          type: "string",
          enum: ["cut", "smooth", "dynamic", "aggressive", "mixed"],
        },
        avgShotDuration: { type: "number" },
        mood: { type: "array", items: { type: "string" } },
        contentFocus: { type: "array", items: { type: "string" } },
        structure: {
          type: "string",
          enum: ["setup_to_montage", "uniform_montage", "dialogue_drama", "unknown"],
        },
        energyArc: {
          type: "string",
          enum: ["flat", "build", "climax_spike", "decline"],
        },
      },
      required: [
        "genre",
        "pacing",
        "syncToBeat",
        "beatSyncStrength",
        "colorTreatment",
        "effectsIntensity",
        "transitionStyle",
        "avgShotDuration",
        "mood",
        "contentFocus",
      ],
    },
    composition: {
      type: "object",
      properties: {
        avgLayerCount: { type: "number" },
        maskingFrequency: { type: "number" },
        depthOrder: { type: "string", enum: ["subject_on_top", "text_behind_subject", "mixed"] },
        commonBlendModes: { type: "array", items: { type: "string" } },
      },
      required: ["avgLayerCount", "maskingFrequency", "depthOrder", "commonBlendModes"],
    },
    pillarScores: {
      type: "object",
      properties: {
        brutalistImpact: { type: "number" },
        tensionPivot: { type: "number" },
        vocalFlowSync: { type: "number" },
        legacyMontage: { type: "number" },
      },
      required: ["brutalistImpact", "tensionPivot", "vocalFlowSync", "legacyMontage"],
    },
    textStyle: {
      type: "object",
      properties: {
        pacing: { type: "string", enum: ["snappy", "lingering", "none"] },
        positioning: { type: "string", enum: ["center", "dynamic", "lower_third"] },
        fontVibe: { type: "string" },
        animationStyle: { type: "string" },
      },
      required: ["pacing", "positioning", "fontVibe", "animationStyle"],
    },
    effectTriggers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          triggerEvent: { type: "string", enum: ["cut", "beat", "action_start", "random"] },
          intensity: { type: "number" },
        },
        required: ["type", "triggerEvent", "intensity"],
      },
    },
  },
  required: [
    "rhythm",
    "pacing",
    "shotLanguage",
    "visualStyle",
    "effects",
    "emotionalArc",
    "editingPhilosophy",
    "intentMapping",
    "composition",
    "pillarScores",
    "textStyle",
    "effectTriggers",
  ],
} as const;

/**
 * Zod-free runtime validation — quick structural check before trusting data
 */
export function isValidReferenceStyle(data: unknown): data is ReferenceStyle {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.rhythm === "object" &&
    typeof d.pacing === "object" &&
    typeof d.shotLanguage === "object" &&
    typeof d.visualStyle === "object" &&
    typeof d.effects === "object" &&
    typeof d.emotionalArc === "object" &&
    typeof d.editingPhilosophy === "object" &&
    typeof d.intentMapping === "object" &&
    typeof d.composition === "object" &&
    typeof d.textStyle === "object" &&
    Array.isArray(d.effectTriggers)
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeRatio(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return clamp01(v / 100);
  return clamp01(v);
}

/**
 * Normalizes mixed-scale ReferenceStyle values (0..1 vs 0..100) into stable 0..1 ratios.
 */
export function normalizeReferenceStyle(
  style: unknown
): ReferenceStyle | undefined {
  if (!isValidReferenceStyle(style)) {
    return undefined;
  }

  return {
    ...style,
    rhythm: {
      ...style.rhythm,
      shotDurationVariance: Math.max(0, style.rhythm.shotDurationVariance),
    },
    pacing: {
      ...style.pacing,
      energyCurve: (style.pacing.energyCurve ?? []).map((v) => normalizeRatio(v)),
      climaxPosition: normalizeRatio(style.pacing.climaxPosition),
    },
    shotLanguage: {
      ...style.shotLanguage,
      closeupRatio: normalizeRatio(style.shotLanguage.closeupRatio),
      wideRatio: normalizeRatio(style.shotLanguage.wideRatio),
    },
    effects: {
      ...style.effects,
      overallIntensity: normalizeRatio(style.effects.overallIntensity),
      effectsFrequency: normalizeRatio(style.effects.effectsFrequency),
      transitionsBreakdown: {
        cutPercentage: normalizeRatio(style.effects.transitionsBreakdown.cutPercentage),
        crossfadePercentage: normalizeRatio(style.effects.transitionsBreakdown.crossfadePercentage),
        otherPercentage: normalizeRatio(style.effects.transitionsBreakdown.otherPercentage),
      },
    },
    intentMapping: {
      ...style.intentMapping,
      beatSyncStrength: normalizeRatio(style.intentMapping.beatSyncStrength),
      effectsIntensity: normalizeRatio(style.intentMapping.effectsIntensity),
    },
    composition: {
      ...style.composition,
      maskingFrequency: normalizeRatio(style.composition.maskingFrequency),
    },
    textStyle: {
      ...style.textStyle,
    },
    effectTriggers: (style.effectTriggers ?? []).map((et: any) => ({
      ...et,
      intensity: normalizeRatio(et.intensity),
    })),
  };
}
