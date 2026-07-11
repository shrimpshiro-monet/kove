import { describe, it, expect } from "vitest";
import { convertShotEDLToProjectEDL } from "../../../../apps/web/src/stores/shot-to-project-edl";

describe("convertShotEDLToProjectEDL — full pipeline conversion", () => {
  const mediaUrlMap = {
    "clip-001": "blob:http://localhost:8787/abc123",
    "clip-002": "blob:http://localhost:8787/def456",
    "clip-003": "blob:http://localhost:8787/ghi789",
  };

  it("should convert shot-based EDL to ProjectEDL with correct clip count", () => {
    const shotEdl = {
      version: "1.0.0",
      metadata: { projectId: "test-project", createdAt: Date.now() },
      timeline: { resolution: { width: 1920, height: 1080 }, fps: 30, duration: 30 },
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", inPoint: 0, outPoint: 3 },
          timing: { startTime: 0, duration: 3, speed: 1 },
          effects: [{ id: "fx_1", type: "color_grade", startTime: 0, duration: 3, params: {} }],
          aiRationale: "opening shot",
        },
        {
          id: "shot_002",
          source: { clipId: "clip-002", inPoint: 5, outPoint: 8 },
          timing: { startTime: 3, duration: 3, speed: 1 },
          effects: [],
          aiRationale: "build tension",
        },
        {
          id: "shot_003",
          source: { clipId: "clip-001", inPoint: 10, outPoint: 15 },
          timing: { startTime: 6, duration: 5, speed: 0.5 },
          effects: [{ id: "fx_2", type: "speed_ramp", startTime: 6, duration: 5, params: { speed: 0.5 } }],
          aiRationale: "slow motion climax",
        },
      ],
      music: { sourceId: "music-001", bpm: 120, beatGrid: [0, 0.5, 1, 1.5, 2] },
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);

    // Should have 3 clips (one per shot)
    expect(result.timeline.tracks[0].clips.length).toBe(3);

    // Should have 3 assets (clip-001, clip-002, clip-003 — conversion adds ALL mediaUrlMap entries)
    expect(Object.keys(result.assets.media).length).toBe(3);

    // Duration should match
    expect(result.timeline.duration).toBe(30);
  });

  it("should map mediaUrlMap to asset paths", () => {
    const shotEdl = {
      timeline: { duration: 10 },
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", inPoint: 0, outPoint: 5 },
          timing: { startTime: 0, duration: 5, speed: 1 },
          effects: [],
        },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);

    expect(result.assets.media["clip-001"].path).toBe("blob:http://localhost:8787/abc123");
  });

  it("should preserve inPoint and outPoint from shots", () => {
    const shotEdl = {
      timeline: { duration: 10 },
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", inPoint: 2.5, outPoint: 7.5 },
          timing: { startTime: 0, duration: 5, speed: 1 },
          effects: [],
        },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);
    const clip = result.timeline.tracks[0].clips[0];

    expect(clip.inPoint).toBe(2.5);
    expect(clip.outPoint).toBe(7.5);
  });

  it("should handle shots with null inPoint/outPoint (fallback to 0/duration)", () => {
    const shotEdl = {
      timeline: { duration: 10 },
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", inPoint: null, outPoint: null },
          timing: { startTime: 0, duration: 5, speed: 1 },
          effects: [],
        },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);
    const clip = result.timeline.tracks[0].clips[0];

    expect(clip.inPoint).toBe(0);
    expect(clip.outPoint).toBe(5);
  });

  it("should map effects from shots to clips", () => {
    const shotEdl = {
      timeline: { duration: 10 },
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", inPoint: 0, outPoint: 5 },
          timing: { startTime: 0, duration: 5, speed: 1 },
          effects: [
            { id: "fx_1", type: "color_grade", startTime: 0, duration: 5, params: { brightness: 1.2 } },
            { id: "fx_2", type: "blur", startTime: 0, duration: 5, params: { radius: 5 } },
          ],
        },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);
    const clip = result.timeline.tracks[0].clips[0];

    expect(clip.effects.length).toBe(2);
    expect(clip.effects[0].type).toBe("color_grade");
    expect(clip.effects[1].type).toBe("blur");
  });

  it("should add extra mediaUrlMap entries as assets", () => {
    const shotEdl = {
      timeline: { duration: 10 },
      shots: [
        {
          id: "shot_001",
          source: { clipId: "clip-001", inPoint: 0, outPoint: 5 },
          timing: { startTime: 0, duration: 5, speed: 1 },
          effects: [],
        },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);

    // clip-002 and clip-003 are in mediaUrlMap but not used in shots
    expect(result.assets.media["clip-002"]).toBeDefined();
    expect(result.assets.media["clip-003"]).toBeDefined();
    expect(result.assets.media["clip-002"].path).toBe("blob:http://localhost:8787/def456");
  });

  it("should handle empty shots array", () => {
    const shotEdl = {
      timeline: { duration: 30 },
      shots: [],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);

    expect(result.timeline.tracks[0].clips.length).toBe(0);
    expect(result.timeline.duration).toBe(30);
  });

  it("should compute correct clip startTime for sequential shots", () => {
    const shotEdl = {
      timeline: { duration: 20 },
      shots: [
        { id: "s1", source: { clipId: "clip-001", inPoint: 0, outPoint: 5 }, timing: { startTime: 0, duration: 5 }, effects: [] },
        { id: "s2", source: { clipId: "clip-002", inPoint: 0, outPoint: 5 }, timing: { startTime: 5, duration: 5 }, effects: [] },
        { id: "s3", source: { clipId: "clip-003", inPoint: 0, outPoint: 5 }, timing: { startTime: 10, duration: 5 }, effects: [] },
        { id: "s4", source: { clipId: "clip-001", inPoint: 5, outPoint: 10 }, timing: { startTime: 15, duration: 5 }, effects: [] },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);
    const clips = result.timeline.tracks[0].clips;

    expect(clips[0].startTime).toBe(0);
    expect(clips[1].startTime).toBe(5);
    expect(clips[2].startTime).toBe(10);
    expect(clips[3].startTime).toBe(15);
  });

  it("should handle speed variations", () => {
    const shotEdl = {
      timeline: { duration: 20 },
      shots: [
        { id: "s1", source: { clipId: "clip-001", inPoint: 0, outPoint: 5 }, timing: { startTime: 0, duration: 5, speed: 1 }, effects: [] },
        { id: "s2", source: { clipId: "clip-001", inPoint: 5, outPoint: 10 }, timing: { startTime: 5, duration: 10, speed: 0.5 }, effects: [] },
        { id: "s3", source: { clipId: "clip-001", inPoint: 10, outPoint: 15 }, timing: { startTime: 15, duration: 2.5, speed: 2 }, effects: [] },
      ],
    };

    const result = convertShotEDLToProjectEDL(shotEdl, mediaUrlMap);
    const clips = result.timeline.tracks[0].clips;

    expect(clips[0].speed).toBe(1);
    expect(clips[1].speed).toBe(0.5);
    expect(clips[2].speed).toBe(2);
  });
});
