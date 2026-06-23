// apps/web/src/engine/depth/depth-types.ts

export interface DepthMapFrame {
  time: number;
  canvas: HTMLCanvasElement;
}

export interface DepthMapTrack {
  clipId: string;
  frames: DepthMapFrame[];
}
