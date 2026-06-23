import { EffectItem } from "../types";

export const Invert: EffectItem = {
  id: "invert",
  type: "color",
  intensity: 1.0,
  params: { blend: 0, channel: "RGB" },
  aiRationale: "Reverses color channels for creative, stylized looks. You can choose to invert RGB, Red, Green, Blue, Alpha, or HLS channels."
};