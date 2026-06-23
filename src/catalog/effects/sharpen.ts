import { EffectItem } from "../types";

export const Sharpen: EffectItem = {
  id: "sharpen",
  type: "sharpen",
  intensity: 0.5,
  params: { amount: 50 },
  aiRationale: "Improves the contrast where color change occurs and between nearby pixels to make edges and details more straightforward, reducing soft looks."
};