// apps/web/src/engine/keyframes/keyframe-types.ts

export interface Keyframe {
  time: number;           // local clip time
  value: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface AnimatedParam {
  base: number;
  keyframes?: Keyframe[];
}
