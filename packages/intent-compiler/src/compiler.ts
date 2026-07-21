import { validateOperationPlan, type OperationPlan, type Result } from "./index.js";
import type { EditDNA } from "@monet/edit-dna";

export interface ClipManifest {
  clips: {
    id: string;
    filePath: string;
    duration_s: number;
    resolution: { width: number; height: number };
    content_tags?: string[];
  }[];
}

export type CallLLM = (systemPrompt: string, userMessage: string) => Promise<string>;

const MAX_RETRIES = 2;

function buildUserMessage(dna: EditDNA, manifest: ClipManifest, userPrompt: string): string {
  return (
    `Edit DNA:\n${JSON.stringify(dna, null, 2)}\n\n` +
    `Available clips:\n${JSON.stringify(manifest, null, 2)}\n\n` +
    `User request: ${userPrompt}`
  );
}

export async function compileIntent(
  dna: EditDNA,
  manifest: ClipManifest,
  userPrompt: string,
  callLLM: CallLLM,
  systemPrompt: string,
): Promise<Result<OperationPlan, string>> {
  const userMessage = buildUserMessage(dna, manifest, userPrompt);
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt =
        attempt === 0
          ? systemPrompt
          : `${systemPrompt}\n\nYour previous output failed validation: ${lastError}\nFix the error and return the corrected OperationPlan.`;

      const response = await callLLM(prompt, userMessage);

      let parsed: unknown;
      try {
        parsed = JSON.parse(response);
      } catch {
        lastError = "Invalid JSON in LLM response";
        continue;
      }

      const validation = validateOperationPlan(parsed);
      if (validation.ok) {
        return { ok: true, value: validation.value };
      }

      lastError = validation.error.message;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    error: `Intent compilation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
  };
}
