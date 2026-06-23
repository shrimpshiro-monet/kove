import { EffectItem } from "../types";

export const Echo: EffectItem = {
  id: "echo",
  type: "time",
  intensity: 0.5,
  params: { delay: -0.033, count: 3, decay: 0.5 },
  aiRationale: "Combines frames from different times in a clip. Creates visual echo, streaking, and smearing effects. Requires motion in the clip."
};