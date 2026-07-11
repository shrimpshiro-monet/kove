import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UmultiUcamCapability: Capability = {
  id: "multi-cam",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: multi-cam. Not yet implemented.",
  triggerPhrases: ["multi-cam"],
  params: {},
  compile: () => {
    throw new Error("capability multi-cam is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UmultiUcamCapability);
