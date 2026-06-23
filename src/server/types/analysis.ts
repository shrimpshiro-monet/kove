import { z } from "zod";

const Score01Schema = z.number().min(0).max(1);

export const SegmentSchema = z
  .object({
    id: z.string().min(1).optional(),
    start: z.number().min(0),
    end: z.number().min(0),
    duration: z.number().positive(),
    scores: z.object({
      motion: Score01Schema,
      emotion: Score01Schema,
      visual: Score01Schema,
      overall: Score01Schema,
      interest: Score01Schema,
    }),
    tags: z.array(z.string()),
    description: z.string().min(1),
    aiRationale: z.string().optional(),
    faceDetected: z.boolean().optional(),
    dialogue: z.string().optional(),
    salientSubjects: z.array(z.string()).optional(),
    peaks: z
      .array(
        z.object({
          time: z.number(),
          type: z.enum(["audio", "emotional", "action"]),
          intensity: Score01Schema,
          description: z.string().optional(),
        })
      )
      .optional(),
  })
  .refine((segment) => segment.end > segment.start, {
    message: "Segment end must be greater than start",
    path: ["end"],
  })
  .refine(
    (segment) => Math.abs(segment.duration - (segment.end - segment.start)) <= 0.25,
    {
      message: "Segment duration must approximately match end - start",
      path: ["duration"],
    }
  );

export const FootageCharacteristicsSchema = z.object({
  avgBrightness: Score01Schema,
  avgMotion: Score01Schema,
  dominantColors: z.array(z.string()),
  visualStyle: z.string().min(1),
  contentType: z.array(z.string()),
  cameraMotion: z.enum(["static", "moving", "mixed"]).optional(),
  shotDensity: z.enum(["low", "medium", "high"]).optional(),
  quality: Score01Schema.optional(),
});

export const FootageAnalysisSchema = z.object({
  clipId: z.string().min(1),
  r2Key: z.string().min(1).optional(),
  duration: z.number().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  rotation: z.number().optional(),
  confidence: Score01Schema,
  analysisMode: z.enum(["video", "text_fallback", "metadata_fallback"]),
  segments: z.array(SegmentSchema).min(1),
  characteristics: FootageCharacteristicsSchema,
});

export type Segment = z.infer<typeof SegmentSchema>;
export type FootageCharacteristics = z.infer<typeof FootageCharacteristicsSchema>;
export type FootageAnalysis = z.infer<typeof FootageAnalysisSchema>;

export const BeatGridSchema = z.array(z.number().min(0));

export const MusicCharacteristicsSchema = z.object({
  mood: z.array(z.string()),
  energy: Score01Schema,
  intensity: Score01Schema,
  genreHints: z.array(z.string()),
  hasVocals: z.boolean().optional(),
});

export const MusicAnalysisSchema = z.object({
  musicId: z.string().min(1),
  r2Key: z.string().min(1).optional(),
  duration: z.number().positive(),
  bpm: z.number().positive(),
  beatGrid: BeatGridSchema,
  downbeats: z.array(z.number().min(0)).optional(),
  confidence: Score01Schema,
  characteristics: MusicCharacteristicsSchema,
});

export type MusicCharacteristics = z.infer<typeof MusicCharacteristicsSchema>;
export type MusicAnalysis = z.infer<typeof MusicAnalysisSchema>;

export const AnalysisResultSchema = z.object({
  version: z.string().min(1),
  projectId: z.string().min(1),
  timestamp: z.number(),
  footage: z.array(FootageAnalysisSchema),
  music: MusicAnalysisSchema.optional(),
  referenceId: z.string().min(1).optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const FOOTAGE_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    clipId: { type: "string" },
    r2Key: { type: "string" },
    duration: { type: "number" },
    confidence: { type: "number" },
    analysisMode: {
      type: "string",
      enum: ["video", "text_fallback", "metadata_fallback"],
    },
    segments: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          duration: { type: "number" },
          scores: {
            type: "object",
            properties: {
              motion: { type: "number" },
              emotion: { type: "number" },
              visual: { type: "number" },
              overall: { type: "number" },
              interest: { type: "number" },
            },
            required: ["motion", "emotion", "visual", "overall", "interest"],
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          description: { type: "string" },
          aiRationale: { type: "string" },
          dialogue: { type: "string" },
          salientSubjects: {
            type: "array",
            items: { type: "string" },
          },
          peaks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "number" },
                type: {
                  type: "string",
                  enum: ["audio", "emotional", "action"],
                },
                intensity: { type: "number" },
                description: { type: "string" },
              },
              required: ["time", "type", "intensity"],
            },
          },
        },
        required: [
          "start",
          "end",
          "duration",
          "scores",
          "tags",
          "description",
        ],
      },
    },
    characteristics: {
      type: "object",
      properties: {
        avgBrightness: { type: "number" },
        avgMotion: { type: "number" },
        dominantColors: {
          type: "array",
          items: { type: "string" },
        },
        visualStyle: { type: "string" },
        contentType: {
          type: "array",
          items: { type: "string" },
        },
        cameraMotion: {
          type: "string",
          enum: ["static", "moving", "mixed"],
        },
        shotDensity: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        quality: { type: "number" },
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
  required: [
    "clipId",
    "duration",
    "confidence",
    "analysisMode",
    "segments",
    "characteristics",
  ],
};

export const MUSIC_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    musicId: { type: "string" },
    r2Key: { type: "string" },
    duration: { type: "number" },
    bpm: { type: "number" },
    beatGrid: {
      type: "array",
      items: { type: "number" },
    },
    downbeats: {
      type: "array",
      items: { type: "number" },
    },
    confidence: { type: "number" },
    characteristics: {
      type: "object",
      properties: {
        mood: {
          type: "array",
          items: { type: "string" },
        },
        energy: { type: "number" },
        intensity: { type: "number" },
        genreHints: {
          type: "array",
          items: { type: "string" },
        },
        hasVocals: { type: "boolean" },
      },
      required: ["mood", "energy", "intensity", "genreHints"],
    },
  },
  required: [
    "musicId",
    "duration",
    "bpm",
    "beatGrid",
    "confidence",
    "characteristics",
  ],
};
