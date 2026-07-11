import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability, CapabilityContext } from "../types";

const SplitClipParams = z.object({
  clipId: z.string().describe("ID of the clip to split"),
  splitTime: z.number().describe("Timeline position in seconds where the split occurs"),
});

type SplitClipParams = z.infer<typeof SplitClipParams>;

export const SplitClipCapability: Capability<SplitClipParams> = {
  id: "split-clip",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Split a clip into two separate clips at a specific time point.",
  triggerPhrases: [
    "split this clip",
    "cut here",
    "cut this clip in half",
    "divide this clip",
  ],
  params: SplitClipParams,
  compile: (input, context) => {
    const { clipId, splitTime } = input;
    const clip = context.currentClip;
    if (!clip) {
      throw new Error("split-clip requires context.currentClip");
    }
    if (splitTime <= 0 || splitTime >= clip.duration) {
      throw new Error(`splitTime ${splitTime} must be between 0 and clip duration ${clip.duration}`);
    }

    const trackId = context.trackId ?? "video-main";
    return [
      {
        type: "clip/add",
        id: `${clipId}-a-${Date.now()}`,
        timestamp: Date.now(),
        params: {
          clipId: `${clipId}-a`,
          mediaId: clip.mediaId,
          startTime: clip.startTime,
          duration: splitTime,
          inPoint: clip.inPoint,
          outPoint: clip.inPoint + splitTime,
          trackId,
        },
      },
      {
        type: "clip/add",
        id: `${clipId}-b-${Date.now()}`,
        timestamp: Date.now(),
        params: {
          clipId: `${clipId}-b`,
          mediaId: clip.mediaId,
          startTime: clip.startTime + splitTime,
          duration: clip.duration - splitTime,
          inPoint: clip.inPoint + splitTime,
          outPoint: clip.outPoint,
          trackId,
        },
      },
    ];
  },
  examples: [
    {
      input: { clipId: "clip-1", splitTime: 3 },
      output: [
        { type: "clip/add", id: "ex-1a", timestamp: 0, params: { clipId: "clip-1-a", mediaId: "footage-1", startTime: 0, duration: 3, inPoint: 0, outPoint: 3, trackId: "video-main" } },
        { type: "clip/add", id: "ex-1b", timestamp: 0, params: { clipId: "clip-1-b", mediaId: "footage-1", startTime: 3, duration: 7, inPoint: 3, outPoint: 10, trackId: "video-main" } },
      ],
    },
  ],
};

registerCapability(SplitClipCapability);
