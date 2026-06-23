// apps/web/src/lib/project-store-types.ts

export interface Keyframe {
  property: string;
  time: number;
  value: any;
  easing?: string;
}

export interface Effect {
  kind: string;
  params?: Record<string, any>;
}

export interface Overlay {
  id: string;
  kind: "flash" | string;
  timelineStart: number;
  duration: number;
  sourceIn?: number;
  sourceOut?: number;
  params?: Record<string, any>;
}

export interface Clip {
  id: string;
  sourceId?: string;
  mediaId?: string;
  sourceIn?: number;
  sourceOut?: number;
  timelineStart: number;
  startTime?: number;
  duration: number;
  kind?: "video" | "audio" | "text" | "overlay";
  effects?: Effect[];
  keyframes?: Keyframe[];
  transform?: {
    scale: number;
    x: number;
    y: number;
    rotation: number;
  };
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  audioFlags?: {
    duckUnderVO?: boolean;
  };
  text?: string;
  style?: Record<string, any>;
}

export interface Track {
  id: string;
  kind: string;
  type?: string;
  name?: string;
  clips: any[]; // Supports both Clip and Overlay
  effects?: Effect[];
  managed_by?: string;
}

export interface ProjectState {
  id?: string;
  name?: string;
  tracks: Track[];
  timeline?: {
    tracks: Track[];
    duration: number;
  };
  duration?: number;
  lastEditor?: string;
  modifiedAt?: number;
}
