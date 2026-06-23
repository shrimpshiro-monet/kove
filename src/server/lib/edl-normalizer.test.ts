import { describe, expect, test } from "bun:test";
import { normalizeCreativeEDL } from "./edl-normalizer";
import { CANVAS_PREVIEW_CAPABILITIES } from "../types/edl-capabilities";
import type { MonetEDL } from "../types/edl";

describe("CreativeEDL Normalizer Suite", () => {
  const dummyEDL: MonetEDL = {
    version: "1.0.0",
    metadata: {
      title: "Test Edit",
      createdAt: Date.now(),
      aiModel: "gemini-2.5-flash",
      prompt: "test",
      intentId: "intent-123",
      analysisId: "analysis-123",
    },
    timeline: {
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      duration: 10,
    },
    shots: [
      {
        id: "shot-1",
        source: { clipId: "clip-1", inPoint: 0, outPoint: 5 },
        timing: { startTime: 0, duration: 5, speedRamp: { startSpeed: -1, endSpeed: 2, easing: "linear" } },
        transition: { type: "glitch", duration: 0.5 },
        effects: [
          { id: "fx-1", type: "facialBlur" as any, intensity: 0.8 },
          { id: "fx-2", type: "unsupported_vfx_type" as any, intensity: 0.5 },
        ],
      },
    ],
    textOverlays: [
      {
        id: "text-1",
        text: "Premium Title",
        startTime: 1,
        endTime: 4,
        style: { fontFamily: "Futura-Bold" },
      },
    ],
  };

  test("should downgrade unsupported transitions to crossfade under Canvas preview", () => {
    const result = normalizeCreativeEDL(dummyEDL, CANVAS_PREVIEW_CAPABILITIES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const normalized = result.value.edl;
      expect(normalized.shots[0].transition?.type).toBe("crossfade");
      expect(result.value.warnings.some((w) => w.code === "UNSUPPORTED_TRANSITION")).toBe(true);
    }
  });

  test("should downgrade facialBlur to standard blur if no face track exists", () => {
    const result = normalizeCreativeEDL(dummyEDL, CANVAS_PREVIEW_CAPABILITIES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const normalized = result.value.edl;
      const effects = normalized.shots[0].effects;
      expect(effects?.some((e) => e.type === "blur")).toBe(true);
      expect(effects?.some((e: any) => e.type === "facialBlur")).toBe(false);
    }
  });

  test("should drop entirely unsupported effects from the track", () => {
    const result = normalizeCreativeEDL(dummyEDL, CANVAS_PREVIEW_CAPABILITIES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const normalized = result.value.edl;
      const effects = normalized.shots[0].effects;
      expect(effects?.some((e: any) => e.type === "unsupported_vfx_type")).toBe(false);
    }
  });

  test("should clamp illegal speed ramps to safe boundaries", () => {
    const result = normalizeCreativeEDL(dummyEDL, CANVAS_PREVIEW_CAPABILITIES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const normalized = result.value.edl;
      expect(normalized.shots[0].timing.speedRamp?.startSpeed).toBe(0.1);
    }
  });

  test("should substitute custom font-family with safe fallback", () => {
    const result = normalizeCreativeEDL(dummyEDL, CANVAS_PREVIEW_CAPABILITIES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const normalized = result.value.edl;
      expect(normalized.textOverlays?.[0].style?.fontFamily).toBe("system-ui, sans-serif");
    }
  });
});
