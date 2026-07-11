import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UlyricUtextCapability: Capability = {
  id: "lyric-text",
  category: "overlays",
  status: "planned",
  version: "0.0.0",
  description: "Planned: lyric-text. Not yet implemented.",
  triggerPhrases: ["lyric-text"],
  params: {},
  compile: () => {
    throw new Error("capability lyric-text is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UlyricUtextCapability);
