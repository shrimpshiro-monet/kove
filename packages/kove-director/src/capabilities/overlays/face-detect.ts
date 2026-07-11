import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UfaceUdetectCapability: Capability = {
  id: "face-detect",
  category: "overlays",
  status: "planned",
  version: "0.0.0",
  description: "Planned: face-detect. Not yet implemented.",
  triggerPhrases: ["face-detect"],
  params: {},
  compile: () => {
    throw new Error("capability face-detect is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UfaceUdetectCapability);
