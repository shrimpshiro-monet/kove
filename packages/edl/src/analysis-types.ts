export interface AudioAnalysisPoint {
  time: number;
  value: number;
}

export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  tempo: number;
  beats: number[];
  transients: number[];
  energyCurve: AudioAnalysisPoint[];
  onsetCurve: AudioAnalysisPoint[];
  spectralCentroidCurve: AudioAnalysisPoint[];
  summary: {
    beatCount: number;
    transientCount: number;
    averageEnergy: number;
    maxEnergy: number;
  };
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptAnalysis {
  language: string;
  languageProbability: number;
  duration: number;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  summary: {
    segmentCount: number;
    wordCount: number;
  };
}

export interface SubjectBBox {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface SubjectTrackFrame {
  time: number;
  frame: number;
  bbox: SubjectBBox;
  source: string;
  confidence: number;
}

export interface SubjectTrackAnalysis {
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  tracks: SubjectTrackFrame[];
  summary: {
    sampledFrames: number;
    trackedFrames: number;
    coverage: number;
  };
}

export interface SourceMediaInput {
  id: string;
  path: string;
  duration: number;
  width: number;
  height: number;
}

export type DirectorStyle =
  | "heavy-tiktok"
  | "cinematic"
  | "sports"
  | "anime"
  | "clean-captions"
  | "auto";

export interface ReferenceStyle {
  version: "1.0";
  rhythm: {
    avgShotDuration: number;
    shotDurationVariance: number;
    beatsPerCut: number;
    cutAlignment: "strict" | "loose" | "none";
    accentCuts: number[];
  };
  pacing: {
    type: "aggressive" | "fast" | "medium" | "slow" | "varied";
    energyCurve: number[];
    intensityBuilds: boolean;
    climaxPosition: number;
    breathingMoments: number[];
  };
  shotLanguage: {
    closeupRatio: number;
    wideRatio: number;
    motionPreference: "static" | "moving" | "mixed";
    subjectFocus: string[];
    sequencePatterns: string[];
  };
  visualStyle: {
    colorGrade: "cinematic" | "vibrant" | "vintage" | "monochrome" | "anime" | "raw";
    colorTemperature: "warm" | "cool" | "neutral";
    contrastLevel: "low" | "medium" | "high";
    saturationLevel: "desaturated" | "natural" | "saturated" | "hyper-saturated";
    vignettePresent: boolean;
    grainPresent: boolean;
  };
  effects: {
    overallIntensity: number;
    effectsFrequency: number;
    commonEffects: string[];
    transitionsBreakdown: {
      cutPercentage: number;
      crossfadePercentage: number;
      otherPercentage: number;
    };
  };
  emotionalArc: {
    openingMood: string;
    peakMood: string;
    closingMood: string;
    emotionalContour: string;
  };
  editingPhilosophy: {
    summary: string;
    rhythmContract: string;
    restraintLevel: "minimal" | "moderate" | "heavy";
    signatureMove: string;
  };
  composition: {
    avgLayerCount: number;
    maskingFrequency: number;
    depthOrder: "subject_on_top" | "text_behind_subject" | "mixed";
    commonBlendModes: string[];
  };
  pillarScores: {
    brutalistImpact: number;
    tensionPivot: number;
    vocalFlowSync: number;
    legacyMontage: number;
  };
  textStyle: {
    pacing: "snappy" | "lingering" | "none";
    positioning: "center" | "dynamic" | "lower_third";
    fontVibe: string;
    animationStyle: string;
  };
  effectTriggers: {
    type: string;
    triggerEvent: "cut" | "beat" | "action_start" | "random";
    intensity: number;
  }[];
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
    beatSyncStrength: number;
    colorTreatment: string;
    effectsIntensity: number;
    transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed";
    avgShotDuration: number;
    mood: string[];
    contentFocus: string[];
  };
}

export interface HeavyEditDirectorInput {
  projectId: string;
  media: SourceMediaInput[];
  audioAnalysis: AudioAnalysis;
  transcript?: TranscriptAnalysis;
  subjectTrack?: SubjectTrackAnalysis;
  style: DirectorStyle;
  aspectRatio: "16:9" | "9:16" | "1:1";
  targetDuration?: number;
  referenceStyle?: ReferenceStyle;
}
