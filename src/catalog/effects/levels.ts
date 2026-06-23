import { EffectItem } from "../types";

export const Levels: EffectItem = {
  id: "levels",
  type: "levels",
  params: {
    gamma: 1.0,
    brightness: 0,
    contrast: 0,
    invert: false,
  },
  aiRationale: "Precise control over brightness and contrast, combining Color Balance, Gamma Correction, Brightness and Contrast, and Invert. Flexible for adjusting image tone and dynamic range without stacking multiple effects."
};
