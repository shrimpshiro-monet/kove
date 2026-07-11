import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UparallaxU3dCapability: Capability = {
  id: "parallax-3d",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: parallax-3d",
  triggerPhrases: ["parallax-3d"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability parallax-3d is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UparallaxU3dCapability);
