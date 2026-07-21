import { describe, it, expect } from "vitest";
import { validateOperationPlan } from "../index.js";
import type { OperationPlan } from "../types.js";

const validPlan: OperationPlan = {
  version: "1.0",
  target_duration_s: 30,
  aspect_ratio: "16:9",
  operations: [
    {
      type: "place_clip",
      clip_id: "clip-1",
      track: 0,
      start_s: 0,
      duration_s: 5,
      in_point_s: 0,
      out_point_s: 5,
    },
  ],
  global_effects: [],
  text_overlays: [],
  audio_mix: { tracks: [] },
};

describe("OperationPlan schema", () => {
  it("validates a correct OperationPlan", () => {
    const result = validateOperationPlan(validPlan);
    expect(result.ok).toBe(true);
  });

  it("validates plan with all operation types", () => {
    const plan: OperationPlan = {
      ...validPlan,
      operations: [
        validPlan.operations[0],
        {
          type: "apply_speed",
          target: "clip",
          clip_id: "clip-1",
          curve: { keyframes: [{ time_s: 0, speed: 1 }], easing: "linear" },
        },
        {
          type: "apply_transition",
          between: [0, 1],
          transition_type: "crossfade",
          duration_s: 0.5,
        },
        {
          type: "apply_effect",
          target: "clip",
          effect: { type: "blur", intensity: 0.5 },
        },
        {
          type: "apply_color",
          target: "global",
          params: { contrast: 1.2, saturation: 0.8 },
        },
      ],
    };
    const result = validateOperationPlan(plan);
    expect(result.ok).toBe(true);
  });

  it("rejects empty operations array", () => {
    const result = validateOperationPlan({ ...validPlan, operations: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid operation type", () => {
    const plan = {
      ...validPlan,
      operations: [{ type: "unknown_op" }],
    };
    const result = validateOperationPlan(plan);
    expect(result.ok).toBe(false);
  });

  it("rejects missing required fields in place_clip", () => {
    const plan = {
      ...validPlan,
      operations: [{ type: "place_clip", clip_id: "clip-1" }],
    };
    const result = validateOperationPlan(plan);
    expect(result.ok).toBe(false);
  });

  it("rejects missing version", () => {
    const { version: _, ...rest } = validPlan;
    const result = validateOperationPlan(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateOperationPlan("not an object");
    expect(result.ok).toBe(false);
  });

  it("validates apply_speed with segment target", () => {
    const plan = {
      ...validPlan,
      operations: [
        {
          type: "apply_speed",
          target: "segment",
          segment_index: 0,
          curve: { keyframes: [{ time_s: 0, speed: 2 }], easing: "ease-in-out" },
        },
      ],
    };
    const result = validateOperationPlan(plan);
    expect(result.ok).toBe(true);
  });

  it("validates apply_color on clip", () => {
    const plan = {
      ...validPlan,
      operations: [
        {
          type: "apply_color",
          target: "clip",
          clip_id: "clip-1",
          params: { temperature: 6500 },
        },
      ],
    };
    const result = validateOperationPlan(plan);
    expect(result.ok).toBe(true);
  });

  it("validates plan with global effects, text overlays, and audio mix", () => {
    const plan: OperationPlan = {
      ...validPlan,
      global_effects: [{ type: "vignette", params: { intensity: 0.3 } }],
      text_overlays: [{
        text: "Hello",
        start_s: 0,
        end_s: 3,
        position: { x: 0.5, y: 0.5 },
        style: { fontSize: 24 },
        animation: "fade",
      }],
      audio_mix: {
        tracks: [{ clip_id: "clip-1", volume: 0.8, fade_in_s: 0.5, fade_out_s: 1.0 }],
        ducking: { enabled: true, threshold: -20 },
      },
    };
    const result = validateOperationPlan(plan);
    expect(result.ok).toBe(true);
  });
});
