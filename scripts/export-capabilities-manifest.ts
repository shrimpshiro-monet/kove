/**
 * export-capabilities-manifest.ts
 *
 * Exports the capability registry to JSON and Markdown for Nemotron injection.
 * Run: npx tsx scripts/export-capabilities-manifest.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { buildJsonManifest, buildManifest, getStats } from "../packages/kove-director/src/capabilities/registry";

// Import all capabilities (side-effect imports register them)
import "../packages/kove-director/src/capabilities/index";

const outputDir = join(import.meta.dirname ?? process.cwd(), ".");

console.log("Exporting capabilities manifest...");

const stats = getStats();
console.log(`Registry: ${stats.total} total, ${stats.alpha} alpha, ${stats.beta} beta, ${stats.planned} planned`);

// Export JSON (alpha + beta for Nemotron)
const jsonManifest = buildJsonManifest({ minStatus: "beta" });
const jsonPath = join(outputDir, "capabilities.json");
writeFileSync(jsonPath, JSON.stringify(jsonManifest, null, 2));
console.log(`Written: ${jsonPath} (${jsonManifest.capabilities.length} capabilities)`);

// Export Markdown (alpha + beta for Nemotron system prompt)
const mdManifest = buildManifest({ minStatus: "beta" });
const mdPath = join(outputDir, "capabilities.md");
writeFileSync(mdPath, mdManifest);
console.log(`Written: ${mdPath} (${mdManifest.split("\n").length} lines)`);

console.log("\nDone. Run this script before building to keep manifests current.");
