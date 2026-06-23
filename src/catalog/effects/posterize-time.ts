import { EffectItem } from "../types";

export const PosterizeTime: EffectItem = {
  id: "posterize-time",
  type: "time",
  intensity: 0.4,
  params: { frameRate: 24 },
  aiRationale: "Locks a clip to a specific frame rate (e.g. 24, 12, or 8 fps) to give a filmic look, or strobe-like motion designs."
};