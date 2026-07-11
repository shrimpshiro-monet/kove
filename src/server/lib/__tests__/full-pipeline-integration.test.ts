import { describe, it, expect } from "vitest";
import { fastPlanner } from "../fast-planner";
import { convertShotEDLToProjectEDL } from "../../../../apps/web/src/stores/shot-to-project-edl";

// Realistic analysis data mimicking what /api/analyze produces
const realisticFootageAnalysis = [
  {
    clipId: "799e90b0-678a-4200-9eeb-8033f54948cf",
    duration: 30,
    confidence: 0.8,
    analysisMode: "video" as const,
    segments: [
      {
        id: "seg_001",
        start: 0,
        end: 8,
        duration: 8,
        scores: { motion: 0.7, emotion: 0.5, visual: 0.8, overall: 0.6, interest: 0.9 },
        tags: ["action", "dynamic"],
        description: "High-energy basketball dribbling sequence",
        dominantColors: ["#8B4513", "#FFD700", "#1a1a1a"],
      },
      {
        id: "seg_002",
        start: 8,
        end: 18,
        duration: 10,
        scores: { motion: 0.4, emotion: 0.7, visual: 0.6, overall: 0.5, interest: 0.5 },
        tags: ["dialogue", "close-up"],
        description: "Player interview close-up",
        dominantColors: ["#2F4F4F", "#87CEEB"],
      },
      {
        id: "seg_003",
        start: 18,
        end: 30,
        duration: 12,
        scores: { motion: 0.9, emotion: 0.8, visual: 0.9, overall: 0.8, interest: 0.95 },
        tags: ["highlight", "slow-motion"],
        description: "Game-winning shot slow motion replay",
        dominantColors: ["#FF4500", "#FFD700"],
      },
    ],
    characteristics: {
      avgBrightness: 0.6,
      avgMotion: 0.6,
      dominantColors: ["#8B4513", "#FFD700"],
      visualStyle: "sports documentary",
      contentType: ["footage"],
    },
  },
  {
    clipId: "97c7a26f-ea99-473e-807f-a65993e75b60",
    duration: 25,
    confidence: 0.7,
    analysisMode: "video" as const,
    segments: [
      {
        id: "seg_004",
        start: 0,
        end: 12,
        duration: 12,
        scores: { motion: 0.3, emotion: 0.6, visual: 0.5, overall: 0.4, interest: 0.4 },
        tags: ["pre-game", "atmosphere"],
        description: "Arena atmosphere pre-game warmup",
        dominantColors: ["#191970", "#FFD700"],
      },
      {
        id: "seg_005",
        start: 12,
        end: 25,
        duration: 13,
        scores: { motion: 0.8, emotion: 0.9, visual: 0.85, overall: 0.7, interest: 0.8 },
        tags: ["crowd", "energy"],
        description: "Crowd reaction after dunk",
        dominantColors: ["#FF6347", "#FFD700"],
      },
    ],
    characteristics: {
      avgBrightness: 0.5,
      avgMotion: 0.5,
      dominantColors: ["#191970", "#FFD700"],
      visualStyle: "sports broadcast",
      contentType: ["footage"],
    },
  },
];

const realisticMusicAnalysis = {
  musicId: "bbf-mp3",
  duration: 30,
  bpm: 128,
  beatGrid: [0, 0.46875, 0.9375, 1.40625, 1.875, 2.34375, 2.8125, 3.28125, 3.75, 4.21875],
  confidence: 0.85,
  characteristics: {
    mood: ["energetic", "hype"],
    energy: 0.9,
    intensity: 0.8,
    genreHints: ["hip-hop", "trap"],
  },
};

describe("Full pipeline: analysis → generation → conversion", () => {
  const mediaUrlMap = {
    "799e90b0-678a-4200-9eeb-8033f54948cf": "blob:http://localhost:8787/footage1",
    "97c7a26f-ea99-473e-807f-a65993e75b60": "blob:http://localhost:8787/footage2",
  };

  it("fast planner → conversion produces valid ProjectEDL with clips", () => {
    // Step 1: Generate EDL using fast planner (deterministic, no AI needed)
    const edl = fastPlanner.generate({
      intent: { style: "energetic", energy: "high" },
      footage: realisticFootageAnalysis as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype basketball edit",
    });

    // Step 2: Verify EDL has shots
    expect(edl.shots.length).toBeGreaterThan(0);

    // Step 3: Verify all shots have valid inPoint/outPoint (NOT null)
    for (const shot of edl.shots) {
      expect(shot.source.inPoint).not.toBeNull();
      expect(shot.source.outPoint).not.toBeNull();
      expect(Number.isFinite(shot.source.inPoint)).toBe(true);
      expect(Number.isFinite(shot.source.outPoint)).toBe(true);
      expect(shot.source.outPoint).toBeGreaterThan(shot.source.inPoint);
    }

    // Step 4: Convert to ProjectEDL
    const projectEdl = convertShotEDLToProjectEDL(edl, mediaUrlMap);

    // Step 5: Verify ProjectEDL structure
    expect(projectEdl.version).toBe(1);
    expect(projectEdl.timeline.duration).toBe(30);
    expect(projectEdl.timeline.tracks.length).toBe(1);
    expect(projectEdl.timeline.tracks[0].type).toBe("video");
    expect(projectEdl.timeline.tracks[0].clips.length).toBe(edl.shots.length);

    // Step 6: Verify assets have valid paths
    const assetKeys = Object.keys(projectEdl.assets.media);
    expect(assetKeys.length).toBeGreaterThan(0);
    for (const key of assetKeys) {
      expect(projectEdl.assets.media[key].path).toBeTruthy();
      expect(projectEdl.assets.media[key].path).toMatch(/^blob:/);
    }

    // Step 7: Verify clips have valid media references
    for (const clip of projectEdl.timeline.tracks[0].clips) {
      expect(projectEdl.assets.media[clip.mediaId]).toBeDefined();
      expect(projectEdl.assets.media[clip.mediaId].path).toBeTruthy();
    }
  });

  it("fast planner produces shots spread across full duration", () => {
    const edl = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: realisticFootageAnalysis as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype edit",
    });

    // Shots should cover the full 30s duration
    const firstStart = edl.shots[0].timing.startTime;
    const lastShot = edl.shots[edl.shots.length - 1];
    const lastEnd = lastShot.timing.startTime + lastShot.timing.duration;

    expect(firstStart).toBe(0);
    expect(lastEnd).toBeGreaterThanOrEqual(25); // Should cover most of 30s
    expect(lastEnd).toBeLessThanOrEqual(31); // Allow small rounding
  });

  it("fast planner cycles through available clips", () => {
    const edl = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: realisticFootageAnalysis as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype edit",
    });

    const clipIdsUsed = new Set(edl.shots.map((s) => s.source.clipId));
    const availableClipIds = new Set(realisticFootageAnalysis.map((f) => f.clipId));

    // Should use clips from the available footage
    for (const usedId of clipIdsUsed) {
      expect(availableClipIds.has(usedId)).toBe(true);
    }

    // Should use both clips (since there are enough shots)
    expect(clipIdsUsed.size).toBeGreaterThan(1);
  });

  it("fast planner assigns effects to every shot", () => {
    const edl = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: realisticFootageAnalysis as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype edit",
    });

    // Every shot should have at least one effect
    for (const shot of edl.shots) {
      expect(shot.effects.length).toBeGreaterThan(0);
    }
  });

  it("full pipeline produces player-ready data", () => {
    // Generate
    const edl = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: realisticFootageAnalysis as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype edit",
    });

    // Convert
    const projectEdl = convertShotEDLToProjectEDL(edl, mediaUrlMap);

    // Verify player-ready: every clip references a valid asset with a loadable path
    for (const clip of projectEdl.timeline.tracks[0].clips) {
      const asset = projectEdl.assets.media[clip.mediaId];
      expect(asset).toBeDefined();
      expect(asset.path).toBeTruthy();
      expect(asset.path.startsWith("blob:")).toBe(true);
      expect(clip.duration).toBeGreaterThan(0);
      expect(Number.isFinite(clip.startTime)).toBe(true);
      expect(Number.isFinite(clip.inPoint)).toBe(true);
      expect(Number.isFinite(clip.outPoint)).toBe(true);
    }
  });

  it("fast planner handles single-clip footage", () => {
    const singleClipFootage = [
      {
        clipId: "only-clip",
        duration: 30,
        segments: [
          {
            start: 0,
            end: 10,
            duration: 10,
            scores: { motion: 0.5, emotion: 0.5, visual: 0.5, overall: 0.5, interest: 0.5 },
            tags: ["general"],
            description: "General footage",
            dominantColors: ["#333"],
          },
          {
            start: 10,
            end: 20,
            duration: 10,
            scores: { motion: 0.7, emotion: 0.6, visual: 0.7, overall: 0.6, interest: 0.7 },
            tags: ["action"],
            description: "Action footage",
            dominantColors: ["#ff0000"],
          },
          {
            start: 20,
            end: 30,
            duration: 10,
            scores: { motion: 0.3, emotion: 0.8, visual: 0.4, overall: 0.5, interest: 0.4 },
            tags: ["emotional"],
            description: "Emotional footage",
            dominantColors: ["#0000ff"],
          },
        ],
      },
    ];

    const edl = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: singleClipFootage as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype edit",
    });

    // All shots should use the single clip
    for (const shot of edl.shots) {
      expect(shot.source.clipId).toBe("only-clip");
    }

    // Should still produce valid inPoint/outPoint
    for (const shot of edl.shots) {
      expect(Number.isFinite(shot.source.inPoint)).toBe(true);
      expect(Number.isFinite(shot.source.outPoint)).toBe(true);
    }
  });

  it("fast planner handles music without onsets (uses beatGrid)", () => {
    const musicNoOnsets = {
      musicId: "test-music",
      duration: 30,
      bpm: 120,
      beatGrid: [0, 0.5, 1, 1.5, 2, 2.5, 3],
      confidence: 0.7,
      characteristics: {
        mood: ["chill"],
        energy: 0.5,
        intensity: 0.4,
        genreHints: ["lo-fi"],
      },
    };

    const edl = fastPlanner.generate({
      intent: { style: "chill" },
      footage: realisticFootageAnalysis as any,
      music: musicNoOnsets as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a chill edit",
    });

    expect(edl.shots.length).toBeGreaterThan(0);
    for (const shot of edl.shots) {
      expect(Number.isFinite(shot.source.inPoint)).toBe(true);
    }
  });

  it("fast planner handles empty footage segments gracefully", () => {
    const emptySegmentsFootage = [
      {
        clipId: "empty-clip",
        duration: 30,
        segments: [],
      },
    ];

    // Should not crash — fast planner handles empty segments
    const edl = fastPlanner.generate({
      intent: { style: "energetic" },
      footage: emptySegmentsFootage as any,
      music: realisticMusicAnalysis as any,
      intentId: "test-intent",
      analysisId: "test-analysis",
      prompt: "make a hype edit",
    });

    // May produce 0 shots if no segments available
    expect(edl.shots).toBeDefined();
  });
});
