import { describe, it, expect } from "vitest";
import {
  executePlan,
  type HeadlessMediaInput,
} from "../apps/kove-advanced/packages/core/src/headless/operation-executor.js";
import type { OperationPlan } from "../packages/intent-compiler/src/types.js";

function createTestMedia(
  id: string,
  overrides?: Partial<HeadlessMediaInput["metadata"]>,
): HeadlessMediaInput {
  return {
    id,
    name: `${id}.mp4`,
    type: "video",
    blob: new Blob(),
    metadata: {
      duration: 5,
      width: 1920,
      height: 1080,
      frameRate: 30,
      codec: "h264",
      sampleRate: 44100,
      channels: 2,
      fileSize: 1024000,
      ...overrides,
    },
  };
}

describe("Headless Execution", () => {
  it("converts an OperationPlan into a HeadlessProject", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 5.0,
      aspect_ratio: "16:9",
      operations: [
        {
          type: "place_clip",
          clip_id: "clip-1",
          track: 0,
          start_s: 0,
          duration_s: 2.5,
          in_point_s: 0,
          out_point_s: 2.5,
        },
        {
          type: "place_clip",
          clip_id: "clip-2",
          track: 0,
          start_s: 2.5,
          duration_s: 2.5,
          in_point_s: 0,
          out_point_s: 2.5,
        },
      ],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const media = [
      createTestMedia("clip-1"),
      createTestMedia("clip-2"),
    ];

    const project = executePlan(plan, media);

    expect(project.id).toBeTruthy();
    expect(project.name).toBe("Headless Export");
    expect(project.timeline.tracks.length).toBeGreaterThan(0);

    const videoTrack = project.timeline.tracks[0];
    expect(videoTrack.type).toBe("video");
    expect(videoTrack.clips.length).toBe(2);
    expect(videoTrack.clips[0].mediaId).toBe("clip-1");
    expect(videoTrack.clips[0].startTime).toBe(0);
    expect(videoTrack.clips[0].duration).toBe(2.5);
    expect(videoTrack.clips[1].mediaId).toBe("clip-2");
    expect(videoTrack.clips[1].startTime).toBe(2.5);
  });

  it("resolves 16:9 aspect ratio to correct dimensions", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 1.0,
      aspect_ratio: "16:9",
      operations: [],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, []);

    expect(project.settings.width).toBe(1920);
    expect(project.settings.height).toBe(1080);
  });

  it("resolves 9:16 aspect ratio to correct dimensions", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 1.0,
      aspect_ratio: "9:16",
      operations: [],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, []);

    expect(project.settings.width).toBe(608);
    expect(project.settings.height).toBe(1080);
  });

  it("applies speed operations to clips", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 5.0,
      aspect_ratio: "16:9",
      operations: [
        {
          type: "place_clip",
          clip_id: "clip-1",
          track: 0,
          start_s: 0,
          duration_s: 5.0,
          in_point_s: 0,
          out_point_s: 5.0,
        },
        {
          type: "apply_speed",
          target: "clip",
          clip_id: "clip-1",
          curve: {
            keyframes: [
              { time_s: 0, speed: 2.0 },
              { time_s: 2.5, speed: 0.5 },
            ],
            easing: "linear",
          },
        },
      ],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, [createTestMedia("clip-1")]);
    const clip = project.timeline.tracks[0].clips[0];

    expect(clip.speed).toBe(1.25);
  });

  it("populates mediaLibrary with provided media items", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 1.0,
      aspect_ratio: "16:9",
      operations: [],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const media = [
      createTestMedia("vid-1", { duration: 10, width: 3840, height: 2160 }),
      createTestMedia("vid-2", { duration: 3, width: 1280, height: 720 }),
    ];

    const project = executePlan(plan, media);

    expect(project.mediaLibrary.items.length).toBe(2);
    expect(project.mediaLibrary.items[0].id).toBe("vid-1");
    expect(project.mediaLibrary.items[0].metadata.width).toBe(3840);
    expect(project.mediaLibrary.items[1].id).toBe("vid-2");
    expect(project.mediaLibrary.items[1].metadata.height).toBe(720);
  });

  it("creates separate tracks for different track indices", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 5.0,
      aspect_ratio: "16:9",
      operations: [
        {
          type: "place_clip",
          clip_id: "clip-1",
          track: 0,
          start_s: 0,
          duration_s: 5.0,
          in_point_s: 0,
          out_point_s: 5.0,
        },
        {
          type: "place_clip",
          clip_id: "clip-2",
          track: 1,
          start_s: 0,
          duration_s: 3.0,
          in_point_s: 0,
          out_point_s: 3.0,
        },
      ],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, [
      createTestMedia("clip-1"),
      createTestMedia("clip-2"),
    ]);

    expect(project.timeline.tracks.length).toBe(2);
    expect(project.timeline.tracks[0].clips[0].mediaId).toBe("clip-1");
    expect(project.timeline.tracks[1].clips[0].mediaId).toBe("clip-2");
  });

  it("sets timeline duration from target_duration_s", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 30.0,
      aspect_ratio: "16:9",
      operations: [],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, []);

    expect(project.timeline.duration).toBe(30.0);
  });

  it("handles empty operations gracefully", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 0,
      aspect_ratio: "16:9",
      operations: [],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, []);

    expect(project.id).toBeTruthy();
    expect(project.timeline.tracks.length).toBe(0);
    expect(project.mediaLibrary.items.length).toBe(0);
  });

  it("assigns unique IDs to clips and tracks", () => {
    const plan: OperationPlan = {
      version: "1.0",
      target_duration_s: 5.0,
      aspect_ratio: "16:9",
      operations: [
        {
          type: "place_clip",
          clip_id: "clip-1",
          track: 0,
          start_s: 0,
          duration_s: 2.5,
          in_point_s: 0,
          out_point_s: 2.5,
        },
        {
          type: "place_clip",
          clip_id: "clip-2",
          track: 0,
          start_s: 2.5,
          duration_s: 2.5,
          in_point_s: 0,
          out_point_s: 2.5,
        },
      ],
      global_effects: [],
      text_overlays: [],
      audio_mix: { tracks: [] },
    };

    const project = executePlan(plan, [
      createTestMedia("clip-1"),
      createTestMedia("clip-2"),
    ]);

    const clipIds = project.timeline.tracks[0].clips.map((c) => c.id);
    expect(new Set(clipIds).size).toBe(2);
  });
});
