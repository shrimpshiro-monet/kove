import { EffectItem } from "../types";

export const GaussianBlur: EffectItem = {
  id: "gaussian-blur",
  type: "blur",
  intensity: 0.4,
  params: { blurriness: 20, dimensions: "horizontal and vertical" },
  aiRationale: "Blurs and softens the image and eliminates noise. Good for general smoothing or focusing attention elsewhere."
};