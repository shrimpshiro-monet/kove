// Prompt registry for Monet AI Director
// Aligned with GEMINI.md mandates: no filesystem access in Workers.

// Vite handles ?raw to bundle these text files at build time.
import analyzeFootagePrompt from "./analyze-footage.txt?raw";
import analyzeMusicPrompt from "./analyze-music.txt?raw";
import analyzeReferencePrompt from "./analyze-reference.txt?raw";
import decodeIntentPrompt from "./decode-intent.txt?raw";
import generateCompositionPrompt from "./generate-composition.txt?raw";
import generateEdlPromptV3 from "./generate-edl-v3.txt?raw";
import refineEdlPrompt from "./refine-edl.txt?raw";
import generatePatchPrompt from "./generate-patch.txt?raw";
import styleVocabularyPrompt from "./style-vocabulary.txt?raw";
import critiqueEdlPrompt from "./critique-edl.txt?raw";
import compileStylePrompt from "./compile-style.txt?raw";

const PROMPTS = {
  "analyze-footage.txt": analyzeFootagePrompt,
  "analyze-music.txt": analyzeMusicPrompt,
  "analyze-reference.txt": analyzeReferencePrompt,
  "decode-intent.txt": decodeIntentPrompt,
  "generate-composition.txt": generateCompositionPrompt,
  "generate-edl-v3.txt": generateEdlPromptV3,
  "refine-edl.txt": refineEdlPrompt,
  "generate-patch.txt": generatePatchPrompt,
  "style-vocabulary.txt": styleVocabularyPrompt,
  "critique-edl.txt": critiqueEdlPrompt,
  "compile-style.txt": compileStylePrompt,
} as const;

export type PromptName = keyof typeof PROMPTS;

/**
 * Load a prompt template from the bundled registry.
 * No filesystem access, Worker-compliant.
 */
export function loadPromptTemplate(filename: PromptName): string {
  return PROMPTS[filename];
}
