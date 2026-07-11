import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UlogoUwatermarkCapability: Capability = {
  id: "logo-watermark",
  category: "overlays",
  status: "planned",
  version: "0.0.0",
  description: "Planned: logo-watermark. Not yet implemented.",
  triggerPhrases: ["logo-watermark"],
  params: {},
  compile: () => {
    throw new Error("capability logo-watermark is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UlogoUwatermarkCapability);
