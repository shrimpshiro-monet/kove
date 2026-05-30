// Renderer Types
// Lightweight types for the canvas renderer (subset of MonetEDL)

export interface MediaAsset {
  id: string;
  type: "video" | "audio" | "image";
  url: string;
  duration: number;
  element?: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  loaded: boolean;
}

export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  fps: number;
}

export interface EffectParams {
  type: string;
  intensity: number;
  startTime?: number;
  duration?: number;
  params?: Record<string, number>;
}

export interface RenderFrame {
  time: number;
  shotIndex: number;
  sourceTime: number; // Time into source clip (accounting for speed)
  effects: EffectParams[];
  transform: {
    scale: number;
    rotation: number;
    position: { x: number; y: number };
  };
  transition?: {
    type: string;
    progress: number; // 0-1
    prevShotIndex?: number;
  };
}
