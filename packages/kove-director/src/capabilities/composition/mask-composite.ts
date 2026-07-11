import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UmaskUcompositeCapability: Capability = {
  id: "mask-composite",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: mask-composite. Not yet implemented.",
  triggerPhrases: ["mask-composite"],
  params: {},
  compile: () => {
    throw new Error("capability mask-composite is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UmaskUcompositeCapability);
