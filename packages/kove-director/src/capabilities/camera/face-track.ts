import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UfaceUtrackCapability: Capability = {
  id: "face-track",
  category: "camera",
  status: "planned",
  version: "0.0.0",
  description: "Planned: face-track. Not yet implemented.",
  triggerPhrases: ["face-track"],
  params: {},
  compile: () => {
    throw new Error("capability face-track is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UfaceUtrackCapability);
