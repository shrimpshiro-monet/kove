import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UcustomUtransitionCapability: Capability = {
  id: "custom-transition",
  category: "transitions",
  status: "planned",
  version: "0.0.0",
  description: "Planned: custom-transition. Not yet implemented.",
  triggerPhrases: ["custom-transition"],
  params: {},
  compile: () => {
    throw new Error("capability custom-transition is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UcustomUtransitionCapability);
