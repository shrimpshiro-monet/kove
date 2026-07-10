// Prompt registry for Monet AI Director
// Aligned with GEMINI.md mandates: no filesystem access in Workers.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROMPT_DIR = path.dirname(__filename);

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
