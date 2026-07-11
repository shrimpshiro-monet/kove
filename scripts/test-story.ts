#!/usr/bin/env node
/**
 * Test the StoryGraph pipeline end-to-end against Azure OpenAI.
 *
 * Usage:
 *   AZURE_OPENAI_ENDPOINT=... \
 *   AZURE_OPENAI_API_KEY=... \
 *   pnpm tsx scripts/test-story.ts "make this feel like a comeback story"
 */
import { createAzureAIService } from "@monet/kove-ai";
import { directStoryOnly } from "@monet/kove-director";

const PROMPTS: Record<string, string> = {
  comeback:
    "Make this feel like a comeback story. The kid lost everything, trained alone for a year, then made the team.",
  tribute:
    "A tribute video for my grandfather. He passed last month. Show his life, his laugh, his garden.",
  celebration:
    "Hype edit of my friend's 21st birthday. Pure vibes. Make it FEEL like the night.",
  showcase:
    "Showcase my new ceramic mug collection. Clean, minimalist, soft jazz vibe.",
  discovery:
    "Found an abandoned arcade in the woods. Make it feel like uncovering a secret.",
  transformation:
    "Six months of weight training, before and after. Build the journey.",
  journey:
    "Road trip from LA to NYC, two friends, one car, 5 days.",
  confession:
    "I haven't told anyone this but I'm leaving my corporate job to be an artist.",
  tutorial:
    "How to make perfect espresso at home in 60 seconds.",
  manifesto:
    "Why social media is destroying attention spans. Make people angry.",
};

async function main() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!endpoint || !apiKey) {
    console.error("Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY");
    process.exit(1);
  }

  const promptArg = process.argv[2];
  const prompt =
    PROMPTS[promptArg] ?? promptArg ?? PROMPTS.comeback;

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

  const t0 = Date.now();
  const result = await directStoryOnly({
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
    maxCritiquePasses: 2,
  });
  const elapsed = Date.now() - t0;

  console.log("\n📋 CREATIVE BRIEF");
  console.log("  archetype:    ", result.brief.archetype,
              `(confidence ${(result.brief.archetypeConfidence * 100).toFixed(0)}%)`);
  console.log("  duration:     ", result.brief.duration + "s");
  console.log("  tone:         ", result.brief.tone.join(", "));
  console.log("  themes:       ", result.brief.themes.join(", "));
  console.log("  platform:     ", result.brief.platform);
  if (result.brief.protagonist) console.log("  protagonist:  ", result.brief.protagonist);

  console.log("\n🎬 STORY GRAPH");
  console.log("  beats:        ", result.story.beats.length);
  console.log("  promises:     ", result.story.promises.length);
  console.log("  critique passes:", result.critiquePasses);
  console.log("  warnings:     ", result.warnings.length);

  console.log("\n📖 BEAT-BY-BEAT");
  for (const beat of result.story.beats) {
    const intBar = "█".repeat(Math.round(beat.intensity * 10));
    console.log(
      `  ${String(beat.index).padStart(2)}. ${beat.type.toUpperCase().padEnd(11)} ` +
      `[${intBar.padEnd(10, "░")}] ${beat.emotion.padEnd(12)} ` +
      `${beat.duration.toFixed(1)}s — ${beat.purpose.slice(0, 60)}`
    );
    if (beat.effectFunction.length) {
      console.log(`      fns: ${beat.effectFunction.join(", ")}`);
    }
  }

  console.log("\n🪢 PROMISES");
  for (const p of result.story.promises) {
    console.log(`  ${p.setupBeatId} ──[${p.type}]──> ${p.payoffBeatId}`);
    console.log(`    "${p.description}"`);
  }

  if (result.warnings.length) {
    console.log("\n⚠️ WARNINGS");
    result.warnings.forEach((w) => console.log("  • " + w));
  }

  console.log(`\n✅ Completed in ${elapsed}ms (${result.durationMs}ms director time)`);

  if (process.env.DUMP_JSON) {
    console.log("\n━━━ FULL JSON ━━━");
    console.log(JSON.stringify(result.story, null, 2));
  }
}

main().catch((e) => {
  console.error("\n❌ FAILED:", e);
  process.exit(1);
});
