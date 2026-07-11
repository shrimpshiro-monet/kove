#!/usr/bin/env node
// scripts/quality-test.mjs
// Runs the full pipeline on MikeRoss + Outfit, diffs against a hand-edited reference.
// Outputs ONE quality number you stare at while iterating.

import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.MONET_API ?? "http://127.0.0.1:8787";
const REFERENCE_EDL_PATH = "./test/reference-edl.json";

const log = (...a) => console.log("[quality]", ...a);

async function post(url, body) {
  const r = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function uploadFile(localPath, type) {
  const buf = await fs.readFile(localPath);
  const fd = new FormData();
  fd.set(
    "file",
    new Blob([buf], { type: type === "footage" ? "video/mp4" : "audio/mpeg" }),
    path.basename(localPath)
  );
  fd.set("type", type);
  fd.set("projectId", "quality-test");
  const r = await fetch(`${BASE}/api/upload/direct`, { method: "POST", body: fd });
  return (await r.json()).fileId;
}

async function run() {
  log("Uploading test assets...");
  const footageId = await uploadFile("test/MikeRoss.mp4", "footage");
  const musicId = await uploadFile(
    "test/Outfit (with 21 Savage).mp3",
    "music"
  );

  log("Analyzing...");
  const analysis = await post("/api/analyze", {
    projectId: "quality-test",
    footageIds: [footageId],
    musicId,
  });

  log("Decoding intent...");
  const intent = await post("/api/decode-intent", {
    projectId: "quality-test",
    prompt:
      "Hype sports-style edit. Fast cuts, beat-synced, cinematic grade. TikTok highlight reel.",
  });

  log("Generating EDL...");
  const gen = await post("/api/generate-edl", {
    projectId: "quality-test",
    intentId: intent.intentId,
    analysisId: analysis.analysisId,
    prompt: "Hype sports-style edit.",
  });

  log(`Generation mode: ${gen.generationMode}, provider: ${gen.provider}, model: ${gen.model}`);
  log(
    `Scores: beatSync=${gen.scores.beatSyncScore}, pacingVar=${gen.scores.pacingVariance}, effectDensity=${gen.scores.effectDensity}, overall=${gen.scores.overallConfidence}`
  );

  // Diff against hand-edited reference
  let referenceDiff = null;
  try {
    const reference = JSON.parse(
      await fs.readFile(REFERENCE_EDL_PATH, "utf8")
    );
    referenceDiff = diffEDL(gen.edl, reference);
    log(
      `vs reference: cutTimingMAE=${referenceDiff.cutTimingMAE.toFixed(3)}s, shotCountDelta=${referenceDiff.shotCountDelta}`
    );
  } catch {
    log("No reference EDL found at", REFERENCE_EDL_PATH, "— skipping reference diff");
  }

  // Single quality number — weighted composite
  const Q =
    gen.scores.beatSyncScore * 0.4 +
    (1 - Math.min(1, gen.scores.pacingVariance * 0.5)) * 0.15 +
    gen.scores.effectDensity * 0.1 +
    (referenceDiff
      ? Math.max(0, 1 - referenceDiff.cutTimingMAE / 2) * 0.35
      : 0.35 * gen.scores.overallConfidence);

  log(`\nQUALITY SCORE: ${(Q * 100).toFixed(1)} / 100`);
  log(`generation_mode=${gen.generationMode}`);

  // Append to history
  const history = JSON.parse(
    await fs
      .readFile("./test/quality-history.json", "utf8")
      .catch(() => "[]")
  );
  history.push({
    ts: Date.now(),
    Q,
    scores: gen.scores,
    mode: gen.generationMode,
    model: gen.model,
  });
  await fs.writeFile(
    "./test/quality-history.json",
    JSON.stringify(history, null, 2)
  );

  // Exit non-zero if Q drops below threshold
  const THRESHOLD = 0.55;
  if (Q < THRESHOLD) {
    console.error(`\n❌ Q=${Q.toFixed(3)} < threshold ${THRESHOLD}`);
    process.exit(1);
  }
}

function diffEDL(edl, reference) {
  const cutsA = edl.shots.map((s) => s.timing.startTime);
  const cutsB = reference.shots.map((s) => s.timing.startTime);
  const len = Math.min(cutsA.length, cutsB.length);
  let err = 0;
  for (let i = 0; i < len; i++) err += Math.abs(cutsA[i] - cutsB[i]);
  return {
    cutTimingMAE: len > 0 ? err / len : Infinity,
    shotCountDelta: edl.shots.length - reference.shots.length,
  };
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
