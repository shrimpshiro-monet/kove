import { describe, it, expect } from "vitest";
import { validateEditDNA } from "../index.js";
import type { EditDNA } from "../schema.js";

const validDNA: EditDNA = {
  version: "1.0",
  source: {
    type: "reference",
    duration_s: 13.87,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    aspect_ratio: "16:9",
  },
  shots: [
    {
      id: "shot-1",
      start_s: 0,
      end_s: 1.2,
      duration_s: 1.2,
      content: { description: "A cat sitting", subjects: ["cat"], action: "sitting", mood: "calm" },
      camera: { motion: "static", intensity: 0 },
      color: { dominant_hue: "brown", temperature: "warm", saturation: 0.6, brightness: 0.7 },
    },
  ],
  color: {
    contrast: 1.15,
    saturation: 0.9,
    temperature_shift: "cool",
    shadows_tint: "#1a1a2e",
    highlights_tint: "#f5e6cc",
  },
  audio: {
    bpm: 120,
    beat_grid_s: [0, 0.5, 1.0],
    downbeats_s: [0, 1.0],
    energy_curve: [{ time_s: 0, energy: 0.5 }],
    speech_segments: [],
    sync_points_s: [0, 0.5, 1.0],
  },
  text_events: [],
  pacing: {
    avg_shot_length_s: 1.2,
    variance: "medium",
    energy_curve: "steady",
  },
  metadata: {
    analyzed_at: "2026-07-21T00:00:00Z",
    frame_count: 42,
    analysis_fps: 3,
    confidence: 0.85,
    field_owners: { cuts: "cut-detector", motion: "motion-analyzer" },
  },
};

describe("EditDNA schema", () => {
  it("validates a correct EditDNA", () => {
    const result = validateEditDNA(validDNA);
    expect(result.ok).toBe(true);
  });

  it("rejects empty shots array", () => {
    const result = validateEditDNA({ ...validDNA, shots: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid camera motion", () => {
    const dna = {
      ...validDNA,
      shots: [{ ...validDNA.shots[0], camera: { ...validDNA.shots[0].camera, motion: "invalid" } }],
    };
    const result = validateEditDNA(dna);
    expect(result.ok).toBe(false);
  });

  it("rejects intensity out of range", () => {
    const dna = {
      ...validDNA,
      shots: [{ ...validDNA.shots[0], camera: { ...validDNA.shots[0].camera, intensity: 1.5 } }],
    };
    const result = validateEditDNA(dna);
    expect(result.ok).toBe(false);
  });

  it("rejects missing version", () => {
    const { version, ...rest } = validDNA;
    const result = validateEditDNA(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateEditDNA("not an object");
    expect(result.ok).toBe(false);
  });
});
