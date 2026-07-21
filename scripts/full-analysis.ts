import { analyzeClip } from "../src/server/lib/clip-analyzer";

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";

async function main() {
  console.log("Analyzing Steph Curry clip...");

  const env = { PYTHON_AI_URL: "http://localhost:8102" } as any;

  const analysis = await analyzeClip({
    env,
    clipId: "steph-curry",
    filePath: RAW,
    duration: 72.83,
  });

  console.log("\n=== ANALYSIS RESULT ===");
  console.log("Duration:", analysis.duration.toFixed(1) + "s");
  console.log("Has speech:", analysis.hasSpeech);
  console.log("Semantic segments:", analysis.semantic.segments.length);
  console.log("Speech segments:", analysis.speechSegments.length);
  console.log("Cut points:", analysis.cutPoints.length);
  console.log("CV segments:", analysis.cvMetrics.length);

  console.log("\nSemantic breakdown:");
  const labels: Record<string, number> = {};
  for (const seg of analysis.semantic.segments) {
    labels[seg.label] = (labels[seg.label] || 0) + 1;
  }
  console.log(labels);

  console.log("\nTop 5 cut points:");
  const best = analysis.cutPoints.sort((a, b) => b.score - a.score).slice(0, 5);
  for (const cp of best) {
    console.log(`  ${cp.time.toFixed(1)}s: score=${cp.score.toFixed(2)} (${cp.reason})`);
  }

  console.log("\nSummary:", JSON.stringify(analysis.summary, null, 2));
}

main().catch(console.error);
