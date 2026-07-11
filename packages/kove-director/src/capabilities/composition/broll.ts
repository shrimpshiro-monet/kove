import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UbrollCapability: Capability = {
  id: "broll",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: broll. Not yet implemented.",
  triggerPhrases: ["broll"],
  params: {},
  compile: () => {
    throw new Error("capability broll is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UbrollCapability);
