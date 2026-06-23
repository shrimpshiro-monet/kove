import { EffectItem } from "../types";

export const UnsharpMask: EffectItem = {
  id: "unsharp-mask",
  type: "sharpen",
  intensity: 0.6,
  params: { radius: 2.0, threshold: 0.5, amount: 50 },
  aiRationale: "Increases contrast between colors that define an edge. Use to refine edge details and enhance focus on subjects."
};