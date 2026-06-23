import axios from "axios";
import path from "node:path";

async function testBlenderRender() {
  const baseUrl = "http://localhost:3000"; // Assuming the API is running
  
  // Need a real video file to test.
  // I'll look for one in the project.
  const sourceVideoPath = path.resolve(process.cwd(), "steph curry.MP4");

  try {
    console.log("🚀 Triggering Blender render...");
    const response = await axios.post(`${baseUrl}/api/render/blender`, {
      sourceVideoPath,
      startFrame: 1,
      endFrame: 60,
      width: 640,
      height: 360,
      fps: 30
    });

    console.log("✅ Render Success:", response.data);
  } catch (error: any) {
    console.error("❌ Render Failed:", error.response?.data || error.message);
  }
}

// testBlenderRender();
console.log("Test script ready. Run with 'tsx test-blender.ts' if the API is up.");
