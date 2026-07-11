#!/usr/bin/env node
/**
 * Test the VibeDNA pipeline end-to-end against Azure OpenAI.
 *
 * Usage:
 *   AZURE_OPENAI_ENDPOINT=... \
 *   AZURE_OPENAI_API_KEY=... \
 *   pnpm tsx scripts/test-vibe.ts comeback
 */
import { createAzureAIService } from "../packages/kove-ai/src/index";
import { directVibePipeline } from "../packages/kove-director/src/index";
import { VibeRegistry } from "../packages/kove-vibes/src/index";

const PROMPTS: Record<string, string> = {
  "pure-vibe-anime": "anime AMV",
  "pure-vibe-neon": "4am Tokyo neon edit",
  "pure-vibe-noir": "film noir aesthetic",
  "narrative-only": "comeback story about a kid who lost everything",
  "hybrid": "comeback story with anime AMV vibe",
  "creative-heavy": "fast paced noir, make steph curry an existential villain",
  "reference": "make it feel like Wong Kar-wai's Chungking Express but with my skate footage",
  "celebration": "Hype edit of my friend's 21st birthday. Pure vibes.",
  "tribute": "A tribute video for my grandfather. Show his life, his laugh, his garden.",
  "tutorial": "How to make perfect espresso at home in 60 seconds.",
};

async function main() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!endpoint || !apiKey) {
    console.error("Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY");
    process.exit(1);
  }

  const promptArg = process.argv[2];
  const prompt = PROMPTS[promptArg] ?? promptArg ?? PROMPTS["pure-vibe-anime"];

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PROMPT:");
  console.log("  " + prompt);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const ai = createAzureAIService({
    endpoint,
    apiKey,
    fastDeployment: process.env.AZURE_FAST ?? "gpt-4o-mini",
    smartDeployment: process.env.AZURE_SMART ?? "gpt-4o-mini",
  });

  const registry = new VibeRegistry();

  const t0 = Date.now();
  const result = await directVibePipeline({
    prompt,
    context: {
      hasFootage: true,
      hasMusic: true,
      footageSummary:
        "Mock footage: 12 clips totaling ~120s. Tags: training, gym, alone, sunrise, " +
        "rain, faces, hands, running, falling, crowd, trophy, smile. Avg shot 3s.",
      musicSummary:
        "Mock music: 60s instrumental, BPM 95→128 build, dramatic strings + drum drop @ 38s.",
    },
    ai,
    registry,
    maxCritiquePasses: 2,
  });
  const elapsed = Date.now() - t0;

  console.log("\n🎨 VIBE BRIEF");
  console.log(`  vibe:         ${result.brief.vibe.archetype} (confidence ${(result.brief.vibe.confidence * 100).toFixed(0)}%)`);
  console.log(`  energy:       ${result.brief.vibe.energyProfile}`);
  console.log(`  color:        ${result.brief.vibe.colorTemperature}`);
  console.log(`  motion:       ${result.brief.vibe.motionSignature}`);
  console.log(`  music:        ${result.brief.vibe.musicRelationship}`);
  if (result.brief.vibe.blend?.length) {
    console.log(`  blend:        ${result.brief.vibe.blend.map(b => `${b.archetype}@${(b.weight*100).toFixed(0)}%`).join(", ")}`);
  }
  if (result.brief.vibe.customDescriptors?.length) {
    console.log(`  descriptors:  ${result.brief.vibe.customDescriptors.join(", ")}`);
  }

  console.log("\n📖 NARRATIVE");
  console.log(`  archetype:    ${result.brief.narrative.archetype}`);
  if (result.brief.narrative.archetype !== "none") {
    console.log(`  confidence:   ${(result.brief.narrative.confidence * 100).toFixed(0)}%`);
    console.log(`  arcShape:     ${result.brief.narrative.arcShape ?? "default"}`);
    if (result.brief.narrative.protagonist) console.log(`  protagonist:  ${result.brief.narrative.protagonist}`);
  }

  if (result.brief.overlay) {
    console.log("\n✨ OVERLAY");
    if (result.brief.overlay.subjects?.length) {
      for (const s of result.brief.overlay.subjects) {
        console.log(`  subject:      "${s.name}" as "${s.treatment}"`);
        if (s.visualMarkers?.length) console.log(`  markers:      ${s.visualMarkers.join(", ")}`);
      }
    }
    if (result.brief.overlay.tonalModifiers?.length) console.log(`  tonal:        ${result.brief.overlay.tonalModifiers.join(", ")}`);
    if (result.brief.overlay.concepts?.length) console.log(`  concepts:     ${result.brief.overlay.concepts.join(", ")}`);
    if (result.brief.overlay.literalDirection) console.log(`  literal:      "${result.brief.overlay.literalDirection}"`);
  }

  console.log("\n🎬 VIBE MAP");
  console.log(`  phases:       ${result.map.phases.length}`);
  console.log(`  promises:     ${result.map.promises.length}`);
  console.log(`  critique:     ${result.critiquePasses} passes`);
  console.log(`  warnings:     ${result.warnings.length}`);

  console.log("\n📊 PHASE-BY-PHASE");
  for (const phase of result.map.phases) {
    const vibBar = "█".repeat(Math.round(phase.vibeIntensity * 10));
    const narStr = phase.narrativeRole ? ` [${phase.narrativeRole}]` : "";
    console.log(
      `  ${String(phase.index).padStart(2)}. ${phase.vibeMode.toUpperCase().padEnd(10)} ` +
      `[${vibBar.padEnd(10, "░")}] ${phase.emotion.padEnd(12)} ` +
      `${phase.duration.toFixed(1)}s${narStr}`
    );
    if (phase.vibeFunction.length) console.log(`      vibeFns: ${phase.vibeFunction.join(", ")}`);
    if (phase.narrativeFunction?.length) console.log(`      narFns:  ${phase.narrativeFunction.join(", ")}`);
    if (phase.overlayDirectives?.subjectFocus) console.log(`      overlay: ${phase.overlayDirectives.subjectFocus}`);
  }

  if (result.map.promises.length) {
    console.log("\n🪢 PROMISES");
    for (const p of result.map.promises) {
      console.log(`  ${p.setupBeatId} ──[${p.type}]──> ${p.payoffBeatId}`);
      console.log(`    "${p.description}"`);
    }
  }

  if (result.warnings.length) {
    console.log("\n⚠️ WARNINGS");
    result.warnings.forEach((w) => console.log("  • " + w));
  }

  console.log(`\n✅ Completed in ${elapsed}ms (${result.durationMs}ms director time)`);

  if (process.env.DUMP_JSON) {
    console.log("\n━━━ FULL JSON ━━━");
    console.log(JSON.stringify(result.map, null, 2));
  }
}

main().catch((e) => {
  console.error("\n❌ FAILED:", e);
  process.exit(1);
});
