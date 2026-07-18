import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  preset: z.enum(["whip", "directional_blur", "flash_wipe"]).default("whip").describe("GL transition preset"),
  duration: z.number().min(0.1).max(3).default(0.5).describe("Transition duration in seconds"),
});

type P = z.infer<typeof Params>;

export const GlTransitionEffectCapability: Capability<P> = {
  id: "gl-transition-effect",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "GPU-accelerated GL transition effect applied as a clip effect. Uses WebGL shader-based transitions for smooth, high-quality visual transitions.",
  triggerPhrases: [
    "gl transition",
    "gpu transition",
    "shader transition",
    "webgl transition",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `glte-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "gl_transition",
        params: { preset: input.preset, duration: input.duration },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", preset: "whip", duration: 0.5 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "gl_transition", params: { preset: "whip", duration: 0.5 } },
        },
      ],
    },
  ],
};

registerCapability(GlTransitionEffectCapability);
