import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { createEmptyShotEDL, createShot, registerAsset, renormalizeTimeline, toJSON } from "../packages/edl-v3/src/helpers";
import { validateShotEDL } from "../packages/edl-v3/src/validate";

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";

async function main() {
  console.log("=== STEP 1: Analyze raw footage ===\n");

  const [scenes, energy, cv] = await Promise.all([
    detectSceneChanges(RAW, 0.3),
    analyzeVideoEnergy(RAW, 0.5),
    extractCVMetrics(RAW, 2.0),
  ]);

  console.log(`Scenes: ${scenes.scenes.length} cuts, avg ${scenes.avgShotDuration.toFixed(2)}s`);
  console.log(`Energy: peak=${energy.peakMoment.toFixed(1)}s, climax=${energy.climaxPosition.toFixed(2)}`);
  console.log(`CV: ${cv.segments.length} segments`);

  console.log("\n=== STEP 2: Select best moments ===\n");

  // Sort CV segments by quality to find the best moments
  const ranked = [...cv.segments]
    .filter(s => !s.isBlackFrame && !s.isStaticFrame)
    .sort((a, b) => b.overallQuality - a.overallQuality);

  console.log("Top 10 segments by quality:");
  for (const seg of ranked.slice(0, 10)) {
    console.log(`  ${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s: quality=${seg.overallQuality.toFixed(3)} motion=${seg.motionScore.toFixed(2)} bright=${seg.brightnessScore.toFixed(2)}`);
  }

  // Find scene changes (good cut points)
  const sceneTimes = scenes.scenes.map(s => s.timestamp);
  console.log(`\nScene changes: ${sceneTimes.map(t => t.toFixed(1) + "s").join(", ")}`);

  console.log("\n=== STEP 3: Generate ShotEDL ===\n");

  // Build a 30-second highlight reel from the best moments
  const TARGET_DURATION = 30;
  const edl = createEmptyShotEDL({ aspectRatio: "9:16", prompt: "Steph Curry highlight reel" });

  // Register the source clip
  registerAsset(edl, {
    id: "steph-curry",
    path: RAW,
    duration: 72.83,
    width: 1280,
    height: 720,
  });

  // Select top moments (aim for ~30 seconds total)
  let currentTime = 0;
  const shotDuration = 2; // 2 seconds per shot

  // Use scene changes as cut points, pick the best segments between cuts
  const allSegments = [...scenes.scenes.map(s => s.timestamp), 72.83]; // add end
  const selectedShots = [];

  for (let i = 0; i < allSegments.length - 1 && currentTime < TARGET_DURATION; i++) {
    const segStart = allSegments[i];
    const segEnd = allSegments[i + 1];
    const segDuration = segEnd - segStart;

    if (segDuration < 0.5) continue; // skip very short segments

    // Pick the best 2-second window within this segment
    const pickStart = segStart;
    const pickEnd = Math.min(segStart + shotDuration, segEnd);

    // Find CV quality for this window
    const cvSeg = cv.segments.find(s =>
      s.startTime >= segStart - 0.1 && s.endTime <= segEnd + 0.1
    );
    const quality = cvSeg?.overallQuality ?? 0.5;

    selectedShots.push({
      clipId: "steph-curry",
      inPoint: pickStart,
      outPoint: pickEnd,
      quality,
      sceneIndex: i,
    });
  }

  // Sort by quality and take the best ones to fill 30s
  selectedShots.sort((a, b) => b.quality - a.quality);
  const finalShots = selectedShots.slice(0, Math.ceil(TARGET_DURATION / shotDuration));
  finalShots.sort((a, b) => a.inPoint - b.inPoint); // reorder by time

  // Build the EDL
  for (const shot of finalShots) {
    const duration = shot.outPoint - shot.inPoint;
    const s = createShot({
      clipId: shot.clipId,
      inPoint: shot.inPoint,
      outPoint: shot.outPoint,
      startTime: currentTime,
      effects: shot.quality > 0.6 ? [{
        id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "speed_ramp",
        intensity: 0.5,
      }] : [],
    });
    edl.shots.push(s);
    currentTime += duration;
  }

  edl.meta.duration = currentTime;
  edl.meta.generationMode = "montage";

  console.log(`Generated ${edl.shots.length} shots, total duration: ${edl.meta.duration.toFixed(1)}s`);
  console.log("\nShot list:");
  for (const shot of edl.shots) {
    console.log(`  ${shot.timing.startTime.toFixed(1)}-${(shot.timing.startTime + shot.timing.duration).toFixed(1)}s: ${shot.source.clipId} [${shot.source.inPoint.toFixed(1)}-${shot.source.outPoint.toFixed(1)}] effects=${shot.effects.length}`);
  }

  console.log("\n=== STEP 4: Validate ===\n");

  const validation = await validateShotEDL(edl);
  console.log("Valid:", validation.valid);
  if (validation.errors.length > 0) console.log("Errors:", validation.errors);
  if (validation.warnings.length > 0) console.log("Warnings:", validation.warnings);

  // Save EDL to file
  const edlJson = toJSON(edl);
  const fs = await import("node:fs/promises");
  await fs.writeFile("/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output-edl.json", edlJson);
  console.log("\nEDL saved to scripts/output-edl.json");
}

main().catch(console.error);
