/// <reference types="node" />
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function testFFmpeg() {
  const localDir = path.join(os.tmpdir(), "monet-media-dev");
  console.log("LocalDir:", localDir);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  // Create a dummy video file
  const testInput = path.join(localDir, "test_input.mp4");
  const testOutput = path.join(localDir, "edited_test_input.mp4");
  
  // Use a real video file from the repo if exists, or generate one
  const sourceVideo = path.resolve("steph curry.MP4");
  if (fs.existsSync(sourceVideo)) {
    fs.copyFileSync(sourceVideo, testInput);
  } else {
    console.log("steph curry.MP4 not found. Please provide a valid file.");
    return;
  }

  // simulate fetch to local server
  const resp = await fetch("http://localhost:8787/api/engines-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      engineId: "blender",
      fileId: "test_input.mp4",
      prompt: "Direct Blender server-side rendering to add high-energy zoom-pulses and dynamic chromatic aberration."
    })
  });

  const data = await resp.json();
  console.log("Status:", resp.status);
  console.log("Response:", data);
}

testFFmpeg().catch(console.error);
