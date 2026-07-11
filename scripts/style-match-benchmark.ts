import { scoreStyleMatch } from "../src/server/lib/style-match-scorer";
import { readFileSync } from "fs";

const reference = JSON.parse(readFileSync("benchmark-outputs/reference-style.json", "utf-8"));
const edl = JSON.parse(readFileSync("benchmark-outputs/generated-edl.json", "utf-8"));

const score = scoreStyleMatch(edl, reference);
console.log(`\n=== Style Match Score: ${score.total}/100 ===`);
console.log(`Shot Duration:    ${score.breakdown.shotDuration}/25`);
console.log(`Cut Frequency:    ${score.breakdown.cutFrequency}/25`);
console.log(`Effect Vocabulary: ${score.breakdown.effectVocabulary}/25`);
console.log(`Transition Style: ${score.breakdown.transitionStyle}/25`);
console.log(`\nDetails:`);
score.details.forEach(d => console.log(`  - ${d}`));
