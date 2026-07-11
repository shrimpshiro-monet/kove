import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UdepthUparallaxCapability: Capability = {
  id: "depth-parallax",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: depth-parallax. Not yet implemented.",
  triggerPhrases: ["depth-parallax"],
  params: {},
  compile: () => {
    throw new Error("capability depth-parallax is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UdepthUparallaxCapability);
