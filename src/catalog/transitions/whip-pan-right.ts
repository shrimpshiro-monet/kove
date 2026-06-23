import { TransitionItem } from "../types";

export const WhipPanRight: TransitionItem = {
  id: "whip-pan-right",
  type: "whip-pan",
  duration: 0.4,
  params: { direction: "right", motionBlur: 1.0 },
  aiRationale: "Fast directional movement to maintain momentum between high-action shots."
};
