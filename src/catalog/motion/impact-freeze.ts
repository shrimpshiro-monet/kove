import { MotionItem } from "../types";

export const ImpactFreeze: MotionItem = {
  id: "impact-freeze",
  speedRamp: { startSpeed: 4.0, endSpeed: 0.1, easing: "ease-out" },
  aiRationale: "Creates a 'matrix-style' slowdown on the moment of impact."
};
