import type { ActionError, ActionResult } from "./health-check.js";

export interface SpatialFrameRef {
  time: number;
  frame: number;
  path: string;
  width: number;
  height: number;
}

export interface SubjectMaskManifest {
  id: string;
  clipId: string;
  mediaId: string;
  sourceVideoPath: string;
  maskType: "subject" | "foreground" | "person" | "object";
  frames: SpatialFrameRef[];
  fps: number;
  width: number;
  height: number;
  generatedAt: number;
  engine: "sam2";
}

export interface DepthManifest {
  id: string;
  clipId: string;
  mediaId: string;
  sourceVideoPath: string;
  frames: SpatialFrameRef[];
  fps: number;
  width: number;
  height: number;
  generatedAt: number;
  engine: "depth-anything-v2";
  minDepth: number;
  maxDepth: number;
}

export interface PointTrackSample {
  time: number;
  frame: number;
  x: number;
  y: number;
  visible: boolean;
  confidence: number;
}

export interface PointTrack {
  id: string;
  queryFrame: number;
  queryX: number;
  queryY: number;
  samples: PointTrackSample[];
}

export interface PointTrackManifest {
  id: string;
  clipId: string;
  mediaId: string;
  sourceVideoPath: string;
  tracks: PointTrack[];
  fps: number;
  width: number;
  height: number;
  generatedAt: number;
  engine: "cotracker";
  licenseMode: "research-only" | "commercial-verified";
}
