import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const MoveClipParams = z.object({
  clipId: z.string().describe("ID of the clip to move"),
  newStartTime: z.number().describe("New start position in seconds"),
});

type MoveClipParams = z.infer<typeof MoveClipParams>;

export const MoveClipCapability: Capability<MoveClipParams> = {
  id: "move-clip",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Move a clip to a different position on the timeline.",
  triggerPhrases: ["move this clip", "reorder this clip", "put this clip earlier"],
  params: MoveClipParams,
  compile: (input) => [
    {
      type: "clip/add",
      id: `move-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        mediaId: "from-clip",
        startTime: input.newStartTime,
        duration: 0,
        inPoint: 0,
        outPoint: 0,
        trackId: "video-main",
      },
    },
  ],
  examples: [
    { input: { clipId: "clip-3", newStartTime: 0 }, output: [{ type: "clip/add", id: "ex-1", timestamp: 0, params: { clipId: "clip-3", mediaId: "from-clip", startTime: 0, duration: 0, inPoint: 0, outPoint: 0, trackId: "video-main" } }] },
  ],
};

registerCapability(MoveClipCapability);
