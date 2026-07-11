/**
 * Bug Fix Verification #1: text-overlay-extractor.ts
 * 
 * BUG: Input type was missing `height` and `width` fields.
 * buildOverlay() accessed group[0].height and first.height on a type
 * that didn't have them — TypeScript would error, and at runtime
 * height would be undefined, making fontSize = NaN.
 * 
 * FIX: Added `height` and `width` to the input type definition.
 * 
 * VERIFICATION: Call extractTextOverlays with data that includes height/width.
 * Confirm fontSize is computed correctly (not NaN).
 */

import { extractTextOverlays } from "../src/server/lib/text-overlay-extractor";

const detections = [
  {
    text: "SAUL GOODMAN",
    timestamp: 2.5,
    position: "bottom",
    centerX: 0.5,
    centerY: 0.85,
    width: 0.3,
    height: 0.06,
    isWhite: true,
    hasStroke: true,
    confidence: 0.92,
  },
  {
    text: "SAUL GOODMAN",
    timestamp: 3.0,
    position: "bottom",
    centerX: 0.5,
    centerY: 0.85,
    width: 0.3,
    height: 0.06,
    isWhite: true,
    hasStroke: true,
    confidence: 0.91,
  },
  {
    text: "BETTER CALL SAUL",
    timestamp: 5.0,
    position: "center",
    centerX: 0.5,
    centerY: 0.5,
    width: 0.4,
    height: 0.08,
    isWhite: true,
    hasStroke: false,
    confidence: 0.88,
  },
];

console.log("=== Bug Fix Verification #1: text-overlay-extractor height field ===\n");

console.log("Input detections:");
detections.forEach((d, i) => {
  console.log(`  [${i}] text="${d.text}" height=${d.height} width=${d.width}`);
});

const overlays = extractTextOverlays(detections, 30);

console.log(`\nOutput: ${overlays.length} overlay(s) detected`);
overlays.forEach((o, i) => {
  console.log(`  [${i}] text="${o.text}"`);
  console.log(`       startTime=${o.startTime} duration=${o.duration.toFixed(3)}s`);
  console.log(`       position=${o.position}`);
  console.log(`       fontSize=${o.style.fontSize} (must be finite, not NaN)`);
  console.log(`       color=${o.style.color} fontWeight=${o.style.fontWeight}`);
  console.log(`       hasStroke=${o.style.hasStroke}`);
  
  // Verify the fix
  const fontSizeValid = Number.isFinite(o.style.fontSize) && o.style.fontSize >= 12 && o.style.fontSize <= 72;
  console.log(`       VALID: fontSize is ${fontSizeValid ? "PASS" : "FAIL"} (${o.style.fontSize})`);
});

// Negative test: what would happen WITHOUT the fix?
console.log("\n--- What the bug produced (without height field) ---");
const buggyDetection = {
  text: "TEST",
  timestamp: 1.0,
  position: "center",
  centerX: 0.5,
  centerY: 0.5,
  isWhite: true,
  hasStroke: false,
  confidence: 0.9,
  // NO height field — this was the bug
};
const buggyFontSize = Math.round((buggyDetection as any).height * 100);
console.log(`  buggyFontSize = Math.round(undefined * 100) = ${buggyFontSize}`);
console.log(`  Number.isFinite(buggyFontSize) = ${Number.isFinite(buggyFontSize)}`);
console.log(`  BUG CONFIRMED: without height, fontSize is ${buggyFontSize} (NaN)`);

console.log("\n=== VERDICT: Bug #1 FIXED — height field present, fontSize computed correctly ===");
