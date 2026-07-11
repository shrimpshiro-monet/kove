import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UsplitUscreenCapability: Capability = {
  id: "split-screen",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: split-screen. Not yet implemented.",
  triggerPhrases: ["split-screen"],
  params: {},
  compile: () => {
    throw new Error("capability split-screen is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UsplitUscreenCapability);
