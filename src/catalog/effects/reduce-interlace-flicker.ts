import { EffectItem } from "../types";

export const ReduceInterlaceFlicker: EffectItem = {
  id: "reduce-interlace-flicker",
  type: "blur", // often categorized under blur/soften
  intensity: 0.3,
  params: { softness: 0.5 },
  aiRationale: "Reduces high vertical frequencies to make images more suitable for use in an interlaced medium, or to remove subtle horizontal flickers."
};