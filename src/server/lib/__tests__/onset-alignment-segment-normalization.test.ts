import { describe, it, expect } from "vitest";
import { alignToOnsets } from "../onset-alignment";

describe("alignToOnsets segment field normalization", () => {
  it("should produce shots with valid inPoint/outPoint from start/end segments", () => {
    const skeleton = {
      version: "1.0",
      emotionalArc: ["hook", "build", "peak"],
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", segmentIndex: 0 },
          intendedRole: "hook",
          emotionalBeat: "opening",
          effectIntents: [],
          aiRationale: "opening shot",
        },
        {
          id: "shot_002",
          source: { clipId: "clip-001", segmentIndex: 1 },
          intendedRole: "build",
          emotionalBeat: "rising",
          effectIntents: [],
          aiRationale: "building tension",
        },
      ],
    };

    const footage = [
      {
        clipId: "clip-001",
        duration: 30,
        segments: [
          {
            start: 0,
            end: 15,
            duration: 15,
            scores: { motion: 0.6, emotion: 0.5, visual: 0.7, overall: 0.6, interest: 0.8 },
            tags: ["action"],
            description: "Action segment",
            dominantColors: ["#ff0000"],
          },
          {
            start: 15,
            end: 30,
            duration: 15,
            scores: { motion: 0.4, emotion: 0.6, visual: 0.5, overall: 0.5, interest: 0.5 },
            tags: ["dialogue"],
            description: "Dialogue segment",
            dominantColors: ["#0000ff"],
          },
        ],
      },
    ];

    const music = {
      sourceId: "music-001",
      duration: 30,
      bpm: 120,
      onsets: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      beatGrid: [0, 0.5, 1, 1.5, 2],
      sections: [],
    };

    const result = alignToOnsets({
      skeleton: skeleton as any,
      footage: footage as any,
      music: music as any,
      intent: { prompt: "test", intentId: "test", analysisId: "test" },
    });

    expect(result.shots.length).toBe(2);

    for (const shot of result.shots) {
      expect(Number.isFinite(shot.source.inPoint)).toBe(true);
      expect(Number.isFinite(shot.source.outPoint)).toBe(true);
      expect(shot.source.outPoint).toBeGreaterThan(shot.source.inPoint);
      expect(shot.source.inPoint).toBeGreaterThanOrEqual(0);
    }
  });
});
