// packages/job-contracts/src/queues.ts

export type QueueName =
  | "analyze.audio"
  | "analyze.transcript"
  | "analyze.video"
  | "spatial.track_subject"
  | "spatial.generate_mask"
  | "spatial.estimate_depth"
  | "spatial.planar_track"
  | "generate.edl"
  | "enhance.recipe"
  | "render.preview"
  | "render.final"
  | "export.delivery";

export interface JobPayloadMap {
  "generate.edl": {
    projectId: string;
    mediaIds: string[];
    prompt?: string;
  };

  "enhance.recipe": {
    edl: unknown;
    features: string[];
  };

  "render.preview": {
    edl: unknown;
    outputPath: string;
    width?: number;
    height?: number;
    fps?: number;
  };

  "render.final": {
    edl: unknown;
    outputPath: string;
    width?: number;
    height?: number;
    fps?: number;
  };

  "analyze.audio": {
    mediaId: string;
    filePath: string;
  };

  "analyze.transcript": {
    mediaId: string;
    filePath: string;
  };
}

export type JobPayload<T extends QueueName> =
  T extends keyof JobPayloadMap ? JobPayloadMap[T] : Record<string, unknown>;