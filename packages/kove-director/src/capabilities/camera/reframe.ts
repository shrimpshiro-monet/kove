import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UreframeCapability: Capability = {
  id: "reframe",
  category: "camera",
  status: "planned",
  version: "0.0.0",
  description: "Planned: reframe. Not yet implemented.",
  triggerPhrases: ["reframe"],
  params: {},
  compile: () => {
    throw new Error("capability reframe is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UreframeCapability);
