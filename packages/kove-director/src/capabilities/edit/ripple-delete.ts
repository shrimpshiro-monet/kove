import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to remove"),
});

type P = z.infer<typeof Params>;

export const RippleDeleteCapability: Capability<P> = {
  id: "ripple-delete",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Remove a clip and close the gap by shifting all subsequent clips earlier. Preserves timeline continuity without dead space.",
  triggerPhrases: [
    "ripple delete",
    "delete and close gap",
    "remove clip and shift",
    "delete filling gap",
    "cut and close",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "clip/remove",
      id: `rd-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        ripple: true,
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-2" },
      output: [
        {
          type: "clip/remove",
          id: "ex-1",
          timestamp: 0,
          params: { clipId: "clip-2", ripple: true },
        },
      ],
    },
  ],
};

registerCapability(RippleDeleteCapability);
