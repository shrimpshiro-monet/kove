import { describe, it, expect } from "vitest";
import { fastPlanner } from "../fast-planner";

describe("fastPlanner segment field normalization", () => {
  const baseFootage = [
    {
      clipId: "clip-001",
      duration: 30,
      segments: [
        {
          start: 0,
          end: 10,
          duration: 10,
          scores: { motion: 0.8, emotion: 0.5, visual: 0.7, overall: 0.6, interest: 0.9 },
          tags: ["action"],
          description: "Action segment",
          dominantColors: ["#ff0000", "#00ff00"],
        },
        {
          start: 10,
          end: 20,
          duration: 10,
          scores: { motion: 0.3, emotion: 0.7, visual: 0.5, overall: 0.5, interest: 0.4 },
          tags: ["dialogue"],
          description: "Dialogue segment",
          dominantColors: ["#0000ff"],
        },
      ],
    },
  ];

  const baseMusic = {
    sourceId: "music-001",
    duration: 30,
    bpm: 120,
    onsets: [0, 0.5, 1, 1.5, 2, 2.5, 3],
    beatGrid: [0, 0.5, 1, 1.5, 2, 2.5, 3],
  };

  it("should produce shots with valid inPoint and outPoint (not null/NaN)", () => {
    const result = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: baseFootage as any,
      music: baseMusic as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make it energetic",
    });

    expect(result.shots.length).toBeGreaterThan(0);

    for (const shot of result.shots) {
      expect(shot.source.inPoint).not.toBeNull();
      expect(shot.source.outPoint).not.toBeNull();
      expect(Number.isFinite(shot.source.inPoint)).toBe(true);
      expect(Number.isFinite(shot.source.outPoint)).toBe(true);
      expect(shot.source.outPoint).toBeGreaterThan(shot.source.inPoint);
    }
  });

  it("should produce shots with valid clipId from available footage", () => {
    const result = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: baseFootage as any,
      music: baseMusic as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make it energetic",
    });

    const validClipIds = new Set(baseFootage.map((f) => f.clipId));
    for (const shot of result.shots) {
      expect(validClipIds.has(shot.source.clipId)).toBe(true);
    }
  });

  it("should produce shots with effects (not empty array)", () => {
    const result = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: baseFootage as any,
      music: baseMusic as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make it energetic",
    });

    const shotsWithEffects = result.shots.filter((s) => s.effects.length > 0);
    expect(shotsWithEffects.length).toBeGreaterThan(0);
  });

  it("should handle segments with startTime/endTime fields (alternative format)", () => {
    const footageWithAltFields = [
      {
        clipId: "clip-002",
        duration: 30,
        segments: [
          {
            startTime: 0,
            endTime: 10,
            motionLevel: "high" as const,
            dominantColors: ["#ff0000"],
            energyScore: 0.8,
            visualInterestScore: 0.9,
            description: "High energy segment",
          },
        ],
      },
    ];

    const result = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: footageWithAltFields as any,
      music: baseMusic as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make it energetic",
    });

    expect(result.shots.length).toBeGreaterThan(0);
    for (const shot of result.shots) {
      expect(Number.isFinite(shot.source.inPoint)).toBe(true);
      expect(Number.isFinite(shot.source.outPoint)).toBe(true);
    }
  });

  it("should produce total duration matching target", () => {
    const result = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: baseFootage as any,
      music: baseMusic as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make it energetic",
    });

    expect(result.timeline.duration).toBe(30);
  });
});
