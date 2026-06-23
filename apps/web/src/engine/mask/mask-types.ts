// apps/web/src/engine/mask/mask-types.ts

export interface SubjectMaskFrame {
  time: number;
  canvas: HTMLCanvasElement;
}

export interface SubjectMaskTrack {
  clipId: string;
  frames: SubjectMaskFrame[];
}
