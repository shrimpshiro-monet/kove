import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UdirectionalUblurCapability: Capability = {
  id: "directional-blur",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: directional-blur",
  triggerPhrases: ["directional-blur"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability directional-blur is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UdirectionalUblurCapability);
