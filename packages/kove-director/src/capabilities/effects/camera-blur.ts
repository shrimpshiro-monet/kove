import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UcameraUblurCapability: Capability = {
  id: "camera-blur",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: camera-blur",
  triggerPhrases: ["camera-blur"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability camera-blur is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UcameraUblurCapability);
