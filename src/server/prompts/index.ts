// Prompt registry for Monet AI Director
// Aligned with GEMINI.md mandates: no filesystem access in Workers.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function resolvePromptDirectory(): string {
  const candidates: string[] = [];

  if (typeof import.meta !== "undefined" && typeof import.meta.url === "string") {
    try {
      candidates.push(path.dirname(fileURLToPath(import.meta.url)));
    } catch {
      // Fall back to cwd-based resolution below.
    }
  }

  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    candidates.push(path.resolve(process.cwd(), "src/server/prompts"));
  }

  candidates.push(path.resolve("src/server/prompts"));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve("src/server/prompts");
}

const PROMPT_DIR = resolvePromptDirectory();

const PROMPT_FILES = [
  "analyze-footage.txt",
  "analyze-music.txt",
  "analyze-reference.txt",
  "decode-intent.txt",
  "generate-composition.txt",
  "generate-edl-v3.txt",
  "refine-edl.txt",
  "generate-patch.txt",
  "style-vocabulary.txt",
  "critique-edl.txt",
  "compile-style.txt",
  "humanize-skeleton.txt",
] as const;

export type PromptName = (typeof PROMPT_FILES)[number];

const cache: Record<string, string> = {};

/**
 * Load a prompt template from disk.
 * Caches after first read for performance.
 */
export function loadPromptTemplate(filename: PromptName): string {
  if (cache[filename]) return cache[filename];
  const filePath = path.join(PROMPT_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  cache[filename] = content;
  return content;
}
