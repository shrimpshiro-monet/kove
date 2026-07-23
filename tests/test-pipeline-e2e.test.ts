import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/server/types/env";
import type { EditDNA } from "@monet/edit-dna";

vi.mock("../src/server/lib/analysis-engine.js", () => ({
  analyzeVideo: vi.fn(),
}));

vi.mock("@monet/intent-compiler/compiler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@monet/intent-compiler/compiler")>();
  return {
    ...actual,
    compileIntent: vi.fn(),
  };
});

vi.mock("../src/server/services/ai-service", () => ({
  getAIService: vi.fn(),
}));

import { handlePipeline } from "../src/server/api/pipeline";
import { analyzeVideo } from "../src/server/lib/analysis-engine.js";
import { compileIntent } from "@monet/intent-compiler/compiler";
import { getAIService } from "../src/server/services/ai-service";

const mockAnalyzeVideo = vi.mocked(analyzeVideo);
const mockCompileIntent = vi.mocked(compileIntent);
const mockGetAIService = vi.mocked(getAIService);

const stubEnv = {
  PYTHON_AI_URL: "http://localhost:8102",
  PYTHON_AUDIO_URL: "http://localhost:8101",
} as unknown as Env;

const stubDNA: EditDNA = {
  version: "1.0",
  source: {
    type: "reference",
    duration_s: 30,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    aspect_ratio: "16:9",
  },
  shots: [
    {
      id: "shot-0",
      start_s: 0,
      end_s: 15,
      duration_s: 15,
      content: { description: "Wide establishing shot", subjects: ["landscape"], action: "panning", mood: "calm" },
      camera: { motion: "pan_right", intensity: 0.3, direction_degrees: 90 },
      color: { dominant_hue: "120", temperature: "warm", saturation: 0.7, brightness: 0.6 },
    },
    {
      id: "shot-1",
      start_s: 15,
      end_s: 30,
      duration_s: 15,
      content: { description: "Close-up of flowers", subjects: ["flowers"], action: "static", mood: "serene" },
      camera: { motion: "static", intensity: 0.0, direction_degrees: undefined },
      color: { dominant_hue: "300", temperature: "cool", saturation: 0.8, brightness: 0.5 },
    },
  ],
  color: {
    contrast: 1.1,
    saturation: 0.7,
    temperature_shift: "warm",
    shadows_tint: "blue",
    highlights_tint: "golden",
  },
  audio: {
    bpm: 120,
    beat_grid_s: [0, 0.5, 1.0],
    downbeats_s: [0, 1.0],
    energy_curve: [{ time_s: 0, energy: 0.3 }],
    speech_segments: [],
    sync_points_s: [],
  },
  text_events: [],
  pacing: {
    avg_shot_length_s: 15,
    variance: "low",
    energy_curve: "steady",
  },
  metadata: {
    analyzed_at: "2026-01-01T00:00:00Z",
    frame_count: 900,
    analysis_fps: 30,
    confidence: 0.85,
    field_owners: {
      cuts: "cut-detector",
      motion: "motion-analyzer",
      color: "color-analyzer",
      content: "vision-captioner",
      audio: "audio-worker",
    },
  },
};

const stubOperationPlan = {
  version: "1.0" as const,
  target_duration_s: 20,
  aspect_ratio: "16:9" as const,
  operations: [
    {
      type: "place_clip" as const,
      clip_id: "clip-0",
      track: 0,
      start_s: 0,
      duration_s: 10,
      in_point_s: 0,
      out_point_s: 10,
    },
    {
      type: "place_clip" as const,
      clip_id: "clip-1",
      track: 0,
      start_s: 10,
      duration_s: 10,
      in_point_s: 0,
      out_point_s: 10,
    },
  ],
  global_effects: [],
  text_overlays: [],
  audio_mix: { tracks: [] },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAIService.mockReturnValue({
    run: vi.fn().mockResolvedValue({ raw: JSON.stringify(stubOperationPlan) }),
  } as any);
});

describe("POST /api/pipeline", () => {
  it("returns 400 for missing required fields", async () => {
    const res = await handlePipeline(makeRequest({}), stubEnv);
    const json = await res.json() as any;

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 for empty clipPaths", async () => {
    const res = await handlePipeline(
      makeRequest({ filePath: "/tmp/ref.mp4", clipPaths: [], prompt: "Edit like this" }),
      stubEnv,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 for empty prompt", async () => {
    const res = await handlePipeline(
      makeRequest({ filePath: "/tmp/ref.mp4", clipPaths: ["/tmp/a.mp4"], prompt: "" }),
      stubEnv,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 500 when analysis fails", async () => {
    mockAnalyzeVideo.mockResolvedValue({ ok: false, error: "No frames extracted" });

    const res = await handlePipeline(
      makeRequest({
        filePath: "/tmp/ref.mp4",
        clipPaths: ["/tmp/a.mp4", "/tmp/b.mp4"],
        prompt: "Match this style",
      }),
      stubEnv,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(500);
    expect(json.error.message).toContain("Analysis failed");
  });

  it("returns 500 when compilation fails", async () => {
    mockAnalyzeVideo.mockResolvedValue({ ok: true, value: stubDNA });
    mockCompileIntent.mockResolvedValue({ ok: false, error: "LLM returned invalid JSON" });

    const res = await handlePipeline(
      makeRequest({
        filePath: "/tmp/ref.mp4",
        clipPaths: ["/tmp/a.mp4", "/tmp/b.mp4"],
        prompt: "Match this style",
      }),
      stubEnv,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(500);
    expect(json.error.message).toContain("Compilation failed");
  });

  it("returns editDNA and operationPlan on success", async () => {
    mockAnalyzeVideo.mockResolvedValue({ ok: true, value: stubDNA });
    mockCompileIntent.mockResolvedValue({ ok: true, value: stubOperationPlan });

    const res = await handlePipeline(
      makeRequest({
        filePath: "/tmp/ref.mp4",
        clipPaths: ["/tmp/a.mp4", "/tmp/b.mp4"],
        prompt: "Match this style",
      }),
      stubEnv,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.editDNA).toEqual(stubDNA);
    expect(json.data.operationPlan).toEqual(stubOperationPlan);
  });

  it("uses default fps and type when omitted", async () => {
    mockAnalyzeVideo.mockResolvedValue({ ok: true, value: stubDNA });
    mockCompileIntent.mockResolvedValue({ ok: true, value: stubOperationPlan });

    const res = await handlePipeline(
      makeRequest({
        filePath: "/tmp/ref.mp4",
        clipPaths: ["/tmp/a.mp4"],
        prompt: "Make it cinematic",
      }),
      stubEnv,
    );

    expect(res.status).toBe(200);
    expect(mockAnalyzeVideo).toHaveBeenCalledWith(stubEnv, {
      filePath: "/tmp/ref.mp4",
      fps: 3,
      type: "reference",
    });
  });

  it("passes custom fps and type to analysis", async () => {
    mockAnalyzeVideo.mockResolvedValue({ ok: true, value: stubDNA });
    mockCompileIntent.mockResolvedValue({ ok: true, value: stubOperationPlan });

    const res = await handlePipeline(
      makeRequest({
        filePath: "/tmp/ref.mp4",
        clipPaths: ["/tmp/a.mp4"],
        prompt: "Make it cinematic",
        fps: 5,
        type: "footage",
      }),
      stubEnv,
    );

    expect(res.status).toBe(200);
    expect(mockAnalyzeVideo).toHaveBeenCalledWith(stubEnv, {
      filePath: "/tmp/ref.mp4",
      fps: 5,
      type: "footage",
    });
  });

  it("builds a clip manifest with correct clip IDs from clipPaths", async () => {
    mockAnalyzeVideo.mockResolvedValue({ ok: true, value: stubDNA });
    mockCompileIntent.mockResolvedValue({ ok: true, value: stubOperationPlan });

    await handlePipeline(
      makeRequest({
        filePath: "/tmp/ref.mp4",
        clipPaths: ["/tmp/a.mp4", "/tmp/b.mp4", "/tmp/c.mp4"],
        prompt: "Edit",
      }),
      stubEnv,
    );

    expect(mockCompileIntent).toHaveBeenCalledTimes(1);
    const [dnaArg, manifestArg, promptArg] = mockCompileIntent.mock.calls[0];
    expect(dnaArg).toEqual(stubDNA);
    expect(promptArg).toBe("Edit");
    expect(manifestArg.clips).toHaveLength(3);
    expect(manifestArg.clips[0].id).toBe("clip-0");
    expect(manifestArg.clips[1].id).toBe("clip-1");
    expect(manifestArg.clips[2].id).toBe("clip-2");
    expect(manifestArg.clips[0].filePath).toBe("/tmp/a.mp4");
  });

  it("rejects fps outside 0.5-30 range", async () => {
    const res = await handlePipeline(
      makeRequest({ filePath: "/tmp/ref.mp4", clipPaths: ["/tmp/a.mp4"], prompt: "Edit", fps: 50 }),
      stubEnv,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });
});
