// packages/engine-freecut/src/executor/types.ts

export type Action =
  | AddMediaAction
  | SplitAction
  | UpdateClipAction
  | AddCaptionAction
  | RemoveClipAction;

export interface AddMediaAction {
  type: "addMedia";
  trackId: string;            // "video_1" | "audio_1" | etc
  mediaId: string;            // RESOLVED asset id (NOT a hallucinated filename)
  clipId: string;             // unique id on the timeline
  startTime: number;          // timeline seconds
  sourceIn?: number;          // optional: trim from source start
  sourceOut?: number;         // optional: trim to source end
}

export interface SplitAction {
  type: "split";
  trackId: string;
  clipId: string;             // clip to split
  time: number;               // SOURCE-relative time within the original clip
                              // (post-split, segment_2 keeps original clipId + "_segment_2")
}

export interface UpdateClipAction {
  type: "updateClip";
  trackId: string;
  clipId: string;
  properties: {
    playbackSpeed?: number;   // 0.1 .. 4.0
    volume?: number;          // 0.0 .. 2.0
    mute?: boolean;
  };
}

export interface AddCaptionAction {
  type: "addCaption";
  trackId: string;            // "text_1"
  startTime: number;          // timeline seconds
  duration: number;
  text: string;
  style?: CaptionStyle;
}

export interface RemoveClipAction {
  type: "removeClip";
  trackId: string;
  clipId: string;
}

export interface CaptionStyle {
  color?: string;             // "yellow" | "#ffcc00"
  fontSize?: string | number; // "8vw" | 96
  fontFamily?: string;        // "Impact"
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  backgroundColor?: string;   // "rgba(0,0,0,0.3)"
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ProjectSettings {
  width: number;              // 1080
  height: number;             // 1920
  fps: number;                // 30
  audioSampleRate: number;    // 44100
  audioChannels: number;      // 2
}

// ---- Resolved timeline (post-build, pre-compile) ----

export interface Timeline {
  settings: ProjectSettings;
  duration: number;
  videoSegments: VideoSegment[];
  bgmTracks: AudioSegment[];      // music / external audio
  captions: CaptionSegment[];
}

export interface VideoSegment {
  inputIndex: number;             // FFmpeg -i index
  inputPath: string;
  sourceIn: number;               // seconds into source
  sourceOut: number;
  timelineStart: number;
  playbackSpeed: number;          // 1.0 = normal
  volume: number;                 // 0.0 = muted
  mute: boolean;
}

export interface AudioSegment {
  inputIndex: number;
  inputPath: string;
  sourceIn: number;
  sourceOut: number;
  timelineStart: number;
  volume: number;
}

export interface CaptionSegment {
  startTime: number;
  duration: number;
  text: string;
  style: Required<Omit<CaptionStyle, "backgroundColor" | "strokeColor">> & {
    backgroundColor?: string;
    strokeColor?: string;
  };
}

export interface RenderResult {
  outputPath: string;
  command: string;
  filterGraph: string;
  durationSec: number;
  coverage: {
    actionsReceived: number;
    actionsApplied: number;
    unsupportedActions: string[];
    resolvedMedia: Record<string, string>;
    unresolvedMedia: string[];
  };
}
