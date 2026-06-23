import { EffectItem } from "../types";

export const DirectionalBlur: EffectItem = {
  id: "directional-blur",
  type: "blur",
  intensity: 0.6,
  params: { direction: 90, blurLength: 15 },
  aiRationale: "Gives a clip the illusion of motion. Applied equally on either side of a pixel's center."
};