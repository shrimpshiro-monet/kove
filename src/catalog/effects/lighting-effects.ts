import { EffectItem } from "../types";

export const LightingEffects: EffectItem = {
  id: "lighting-effects",
  type: "lighting-effects",
  params: {
    lightType: "spotlight",
    direction: 45,
    intensity: 0.8,
    color: "#FFFFFF",
    spread: 0.5,
  },
  aiRationale: "Adds creative lighting using adjustable lights. Modifies light type, direction, intensity, color, lighting center, spread, and can simulate texture. Perfect for giving footage depth or a dramatic, stylized 3D-like surface effect."
};
