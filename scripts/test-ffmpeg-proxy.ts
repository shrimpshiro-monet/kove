import { FFmpegProxyService } from "../src/server/services/ffmpeg-proxy-service";
import path from "node:path";
import fs from "node:fs/promises";

async function runTest() {
  console.log("=== FFmpeg LGPL Proxy Service Integration Test ===");
  const service = new FFmpegProxyService();

  const testVideoPath = path.join(process.cwd(), "steph curry.MP4");
  const outputDir = path.join(process.cwd(), "test-output-proxy");

  try {
    await fs.mkdir(outputDir, { recursive: true });

    // Step 1: Initialize service & run license gate checks
    console.log("\n[Step 1] Initializing service...");
    await service.initialize();
    console.log("Initialization successful.");

    // Step 2: Probe the input file
    console.log("\n[Step 2] Probing input file...");
    const probeResult = await service.probe(testVideoPath);
    console.log("Probe Result:", JSON.stringify(probeResult, null, 2));

    // Step 3: Generate preview proxy
    console.log("\n[Step 3] Generating preview proxy...");
    const proxyResult = await service.generatePreviewProxy(
      testVideoPath,
      outputDir,
      "test-project-123",
      "test-file-abc"
    );
    console.log("Proxy Result:", JSON.stringify(proxyResult, null, 2));

    // Step 4: Extract thumbnails
    console.log("\n[Step 4] Extracting thumbnails...");
    const thumbnails = await service.extractThumbnails(testVideoPath, outputDir, 1);
    console.log(`Extracted ${thumbnails.length} thumbnails.`);
    console.log("Sample thumbnails:", thumbnails.slice(0, 3));

    console.log("\n=== Test COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("\n!!! Test FAILED !!!", error);
    process.exit(1);
  } finally {
    // Clean up
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {}
  }
}

runTest();
