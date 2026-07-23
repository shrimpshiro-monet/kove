import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { detectSpeech } from "../src/server/lib/speech-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import { extractCVMetrics } from "../src/server/lib/cv-metrics";

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";
const REF = "/Users/hamza/Desktop/reserves/monet-ai-story/reference-edits-2/new-reference.MOV";

async function main() {
  console.log("=== RAW VIDEO (Steph Curry, 72s) ===");
  const [rawScenes, rawSpeech, rawEnergy, rawCV] = await Promise.all([
    detectSceneChanges(RAW, 0.3).catch((e) => { console.warn("scenes err:", e.message); return null; }),
    detectSpeech(RAW).catch((e) => { console.warn("speech err:", e.message); return null; }),
    analyzeVideoEnergy(RAW, 0.5).catch((e) => { console.warn("energy err:", e.message); return null; }),
    extractCVMetrics(RAW, 2.0).catch((e) => { console.warn("cv err:", e.message); return null; }),
  ]);

  console.log("Scenes:", rawScenes ? `${rawScenes.scenes.length} cuts, avg ${rawScenes.avgShotDuration.toFixed(2)}s` : "failed");
  console.log("Speech:", rawSpeech ? `${rawSpeech.segments.length} segments, ratio=${rawSpeech.speechRatio.toFixed(2)}` : "failed");
  console.log("Energy:", rawEnergy ? `peak=${rawEnergy.peakMoment.toFixed(1)}s, climax=${rawEnergy.climaxPosition.toFixed(2)}` : "failed");
  console.log("CV:", rawCV ? `${rawCV.segments.length} segments, peak=${rawCV.peakMoment.toFixed(1)}s` : "failed");

  if (rawCV) {
    console.log("\nTop CV segments:");
    const sorted = [...rawCV.segments].sort((a, b) => b.overallQuality - a.overallQuality);
    for (const seg of sorted.slice(0, 5)) {
      console.log(`  ${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s: quality=${seg.overallQuality.toFixed(2)} motion=${seg.motionScore.toFixed(2)} bright=${seg.brightnessScore.toFixed(2)}`);
    }
  }

  console.log("\n=== REFERENCE VIDEO (14s) ===");
  const [refScenes, refSpeech, refEnergy, refCV] = await Promise.all([
    detectSceneChanges(REF, 0.3).catch((e) => { console.warn("scenes err:", e.message); return null; }),
    detectSpeech(REF).catch((e) => { console.warn("speech err:", e.message); return null; }),
    analyzeVideoEnergy(REF, 0.5).catch((e) => { console.warn("energy err:", e.message); return null; }),
    extractCVMetrics(REF, 2.0).catch((e) => { console.warn("cv err:", e.message); return null; }),
  ]);

  console.log("Scenes:", refScenes ? `${refScenes.scenes.length} cuts, avg ${refScenes.avgShotDuration.toFixed(2)}s` : "failed");
  console.log("Speech:", refSpeech ? `${refSpeech.segments.length} segments, ratio=${refSpeech.speechRatio.toFixed(2)}` : "failed");
  console.log("Energy:", refEnergy ? `peak=${refEnergy.peakMoment.toFixed(1)}s, climax=${refEnergy.climaxPosition.toFixed(2)}` : "failed");
  console.log("CV:", refCV ? `${refCV.segments.length} segments, peak=${refCV.peakMoment.toFixed(1)}s` : "failed");

  if (refScenes) {
    console.log("\nScene timestamps:");
    for (const scene of refScenes.scenes) {
      console.log(`  ${scene.timestamp.toFixed(2)}s (score=${scene.score.toFixed(3)})`);
    }
  }
}

main().catch(console.error);
