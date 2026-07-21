import { describe, it, expect } from "vitest";

const API_URL = "http://localhost:8102";

const TEST_VIDEO =
  "/Users/hamza/Desktop/reserves/monet-ai-story/tests/fixtures/youtube_talking_head/footage.mp4";

describe("Frame Extraction", () => {
  it("extracts frames from a video file", async () => {
    const res = await fetch(`${API_URL}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: TEST_VIDEO,
        fps: 1,
        maxFrames: 3,
      }),
    });

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.frames.length).toBe(3);
    expect(data.data.metadata.fps).toBe(1);
    expect(data.data.frames[0]).toHaveProperty("path");
    expect(data.data.frames[0]).toHaveProperty("timestamp_s");
    expect(data.data.frames[0]).toHaveProperty("width");
    expect(data.data.frames[0]).toHaveProperty("height");
  });

  it("respects maxFrames limit", async () => {
    const res = await fetch(`${API_URL}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: TEST_VIDEO,
        fps: 5,
        maxFrames: 2,
      }),
    });

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.frames.length).toBe(2);
  });

  it("returns correct metadata", async () => {
    const res = await fetch(`${API_URL}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: TEST_VIDEO,
        fps: 1,
        maxFrames: 1,
      }),
    });

    const data = await res.json();
    expect(data.data.metadata).toHaveProperty("total_frames");
    expect(data.data.metadata).toHaveProperty("fps");
    expect(data.data.metadata).toHaveProperty("duration_s");
    expect(data.data.metadata).toHaveProperty("output_dir");
    expect(data.data.metadata.duration_s).toBeGreaterThan(0);
  });
});
