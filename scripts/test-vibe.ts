import axios from "axios";
import path from "node:path";
import fs from "node:fs";

async function testVibeRouter() {
  const baseUrl = "http://localhost:3000";
  const UPLOAD_DIR = path.resolve(process.cwd(), "storage/uploads");

  // We need a real file in storage/uploads to test
  const files = fs.readdirSync(UPLOAD_DIR);
  const firstVideo = files.find(f => f.endsWith(".mp4") || f.endsWith(".MP4"));

  if (!firstVideo) {
    console.error("❌ No videos found in storage/uploads. Upload one first.");
    return;
  }

  const assetId = firstVideo.split("-")[0];

  const payload = {
    projectId: "test_vibe",
    engineTarget: "freecut", // Test with ffmpeg first
    settings: { width: 1280, height: 720, fps: 30 },
    tracks: [
      {
        id: "track_1",
        type: "video",
        assetId: assetId,
        startFrame: 0,
        endFrame: 60
      },
      {
        id: "track_2",
        type: "video",
        assetId: assetId,
        startFrame: 120,
        endFrame: 180
      }
    ]
  };

  try {
    console.log(`🚀 Triggering Vibe Multi-Engine Render (${payload.engineTarget})...`);
    const response = await axios.post(`${baseUrl}/api/render/vibe`, payload);
    console.log("✅ Vibe Render Success:", response.data);
  } catch (error: any) {
    console.error("❌ Vibe Render Failed:", error.response?.data || error.message);
  }
}

// testVibeRouter();
console.log("Vibe test script ready.");
