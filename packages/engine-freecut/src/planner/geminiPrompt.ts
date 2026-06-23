// packages/engine-freecut/src/planner/geminiPrompt.ts
import { AssetResolver } from "../executor/assetResolver";

export function buildPlannerPrompt(args: {
  userPrompt: string;
  referenceAnalysis?: string;
  rawFootageAnalysis?: string;
  resolver: AssetResolver;
  projectSettings: { width: number; height: number; fps: number };
}): string {
  const { userPrompt, referenceAnalysis, rawFootageAnalysis, resolver, projectSettings } = args;

  return `You are the FreeCut Director. Output ONLY a JSON array of actions — no prose, no comments, no markdown fences.

PROJECT SETTINGS
- Resolution: ${projectSettings.width}x${projectSettings.height} (9:16 vertical)
- FPS: ${projectSettings.fps}

${resolver.toPromptContext()}

ACTION SCHEMA (strict — invalid actions are rejected):
- {"type":"addMedia","trackId":"video_1|audio_1","mediaId":"<EXACT id from list above>","clipId":"<unique>","startTime":<sec>}
- {"type":"split","trackId":"video_1","clipId":"<existing clipId>","time":<sec into source>}
   ↳ produces "<clipId>_segment_1" and "<clipId>_segment_2"
- {"type":"updateClip","trackId":"...","clipId":"...","properties":{"playbackSpeed":0.3,"volume":1.0,"mute":false}}
- {"type":"addCaption","trackId":"text_1","startTime":<sec>,"duration":<sec>,"text":"...","style":{...}}
- {"type":"removeClip","trackId":"...","clipId":"..."}

HARD RULES
1. mediaId MUST be one of the AVAILABLE ASSETS. Never invent filenames.
2. clipIds must be unique. Reference split outputs as "<original>_segment_2".
3. Captions overlay on track "text_1" — do NOT addMedia for captions.
4. Music goes on track "audio_1". Source video audio stays on its video clip.
5. Times are in SECONDS as numbers (3.5 not "3.5s").
6. Output the JSON array ONLY. No \`\`\`json fences.

REFERENCE VIDEO ANALYSIS:
${referenceAnalysis ?? "(none provided)"}

RAW FOOTAGE ANALYSIS:
${rawFootageAnalysis ?? "(none provided)"}

USER PROMPT:
${userPrompt}
`;
}
