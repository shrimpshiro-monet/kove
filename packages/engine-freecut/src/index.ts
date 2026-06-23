// packages/engine-freecut/src/index.ts
import { AssetResolver } from "./executor/assetResolver";
import { render } from "./executor/render";
import { parsePlan } from "./planner/parsePlan";
import { buildPlannerPrompt } from "./planner/geminiPrompt";

export async function runFreeCutPipeline(input: {
  userPrompt: string;
  referenceVideoPath?: string;
  rawFootagePath: string;
  musicPath?: string;
  outputPath?: string;
  callGemini: (prompt: string) => Promise<string>;
}) {
  // 1. Register the REAL files Gemini is allowed to reference
  const resolver = new AssetResolver();
  resolver.register({
    mediaId: "raw_footage_main",
    semanticName: "User's raw footage to be edited",
    filePath: input.rawFootagePath,
    kind: "video",
  });
  if (input.musicPath) {
    resolver.register({
      mediaId: "bgm_main",
      semanticName: "User-provided background music",
      filePath: input.musicPath,
      kind: "audio",
    });
  }

  const settings = {
    width: 1080,
    height: 1920,
    fps: 30,
    audioSampleRate: 44100,
    audioChannels: 2,
  };

  // 2. Ask Gemini for actions
  const prompt = buildPlannerPrompt({
    userPrompt: input.userPrompt,
    resolver,
    projectSettings: settings,
  });
  const rawPlan = await input.callGemini(prompt);
  const actions = parsePlan(rawPlan);

  // 3. Render — strict mode so failures are LOUD
  return render({
    actions,
    resolver,
    settings,
    outputPath: input.outputPath,
    strict: true,
  });
}

export * from "./executor";
