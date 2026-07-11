import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UcolorUlutCapability: Capability = {
  id: "color-lut",
  category: "effects",
  status: "planned",
  version: "0.0.0",
  description: "Planned: color-lut. Not yet implemented.",
  triggerPhrases: ["color-lut"],
  params: {},
  compile: () => {
    throw new Error("capability color-lut is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UcolorUlutCapability);
