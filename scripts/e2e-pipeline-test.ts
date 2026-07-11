// End-to-end pipeline test with real test files
// Usage: npx tsx scripts/e2e-pipeline-test.ts

const API = "http://localhost:8787";
const PROJECT_ID = `e2e-test-${Date.now()}`;

const FOOTAGE_FILES = [
  { path: "testfiles/MikeRoss.mp4", type: "footage" },
  { path: "testfiles/StephCurry.mp4", type: "footage" },
];
const MUSIC_FILE = { path: "testfiles/bbf.mp3", type: "music" };
const REFERENCE_FILE = { path: "reference-edits-2/steph curry.MP4", type: "reference" };

async function uploadFile(filePath: string, type: string): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp4": "video/mp4", ".MP4": "video/mp4", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  };
  const mimeType = mimeMap[ext] || "video/mp4";
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", blob, fileName);
  formData.append("projectId", PROJECT_ID);
  formData.append("type", type);

  console.log(`  Uploading ${fileName} (${type})...`);
  const res = await fetch(`${API}/api/upload/direct`, { method: "POST", body: formData });
  const json = await res.json() as any;
  if (!json.success) throw new Error(`Upload failed: ${JSON.stringify(json.error)}`);
  console.log(`  ✓ Uploaded → fileId: ${json.fileId}`);
  return json.fileId;
}

async function analyzeMedia(footageIds: string[], musicId?: string): Promise<any> {
  console.log("\n[2/5] Analyzing media...");
  const res = await fetch(`${API}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID, footageIds, musicId }),
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(`Analysis failed: ${JSON.stringify(json.error)}`);
  console.log(`  ✓ Analysis complete. analysisId: ${json.analysisId}`);
  console.log(`  Footage clips: ${json.result?.footage?.length ?? 0}`);
  for (const f of json.result?.footage ?? []) {
    console.log(`    - ${f.clipId}: ${f.segments?.length ?? 0} segments, duration=${f.duration}s, mode=${f.analysisMode}`);
    for (const seg of f.segments ?? []) {
      console.log(`      seg ${seg.id}: ${seg.start}s-${seg.end}s, motion=${seg.scores?.motion}, interest=${seg.scores?.interest}, tags=[${seg.tags?.join(",")}]`);
    }
  }
  if (json.result?.music) {
    const m = json.result.music;
    console.log(`  Music: bpm=${m.bpm}, duration=${m.duration}s, beats=${m.beatGrid?.length ?? 0}`);
  }
  return json;
}

async function decodeIntent(prompt: string): Promise<any> {
  console.log("\n[3/5] Decoding intent...");
  const res = await fetch(`${API}/api/decode-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID, prompt }),
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(`Intent decode failed: ${JSON.stringify(json.error)}`);
  console.log(`  ✓ Intent decoded. intentId: ${json.intentId}`);
  console.log(`  Intent:`, JSON.stringify(json.result?.intent ?? json.intent, null, 2).slice(0, 500));
  return json;
}

async function generateEDL(intentId: string, analysisId: string, analysisData: any, prompt: string, referenceStyleId?: string): Promise<any> {
  console.log("\n[4/5] Generating EDL...");
  const body: any = {
    projectId: PROJECT_ID,
    intentId,
    analysisId,
    analysisData,
    prompt,
    targetDuration: 30,
  };
  if (referenceStyleId) {
    body.referenceStyleId = referenceStyleId;
    body.referenceMode = "strict_replication";
  }
  const res = await fetch(`${API}/api/generate-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(`EDL generation failed: ${JSON.stringify(json.error)}`);
  console.log(`  ✓ EDL generated. edlId: ${json.edlId}`);
  console.log(`  Generation mode: ${json.generationMode}`);
  console.log(`  Scores:`, json.scores);
  return json;
}

function printEDL(edl: any) {
  console.log("\n[5/5] EDL Output:");
  console.log("═".repeat(80));
  console.log(`Version: ${edl.version}`);
  console.log(`Duration: ${edl.timeline?.duration}s`);
  console.log(`FPS: ${edl.timeline?.fps}`);
  console.log(`Resolution: ${edl.timeline?.resolution?.width}x${edl.timeline?.resolution?.height}`);
  console.log(`Shots: ${edl.shots?.length ?? 0}`);
  console.log("─".repeat(80));

  for (const shot of edl.shots ?? []) {
    const start = shot.timing?.startTime?.toFixed(2) ?? "?";
    const dur = shot.timing?.duration?.toFixed(2) ?? "?";
    const end = (shot.timing?.startTime + shot.timing?.duration)?.toFixed(2) ?? "?";
    const clipId = shot.source?.clipId?.slice(0, 8) ?? "?";
    const inPt = shot.source?.inPoint?.toFixed(2) ?? "null";
    const outPt = shot.source?.outPoint?.toFixed(2) ?? "null";
    const effects = shot.effects?.map((e: any) => e.type).join(",") || "none";
    const speed = shot.timing?.speed ?? 1;
    const speedStr = speed !== 1 ? ` [${speed}x]` : "";
    const transition = shot.transition?.type ?? "cut";

    console.log(
      `  ${shot.id} │ ${start}s → ${end}s (${dur}s) │ clip:${clipId} │ in:${inPt} out:${outPt}${speedStr} │ fx: ${effects} │ ${transition}`
    );
  }

  console.log("─".repeat(80));
  console.log(`Music: bpm=${edl.music?.bpm}, beats=${edl.music?.beatGrid?.length ?? 0}`);
  console.log("═".repeat(80));
}

function printConversion(projectEdl: any) {
  console.log("\nConverted ProjectEDL:");
  console.log("═".repeat(80));
  console.log(`Tracks: ${projectEdl.timeline?.tracks?.length ?? 0}`);
  console.log(`Clips: ${projectEdl.timeline?.tracks?.[0]?.clips?.length ?? 0}`);
  console.log(`Assets: ${Object.keys(projectEdl.assets?.media ?? {}).length}`);
  console.log(`Duration: ${projectEdl.timeline?.duration}s`);
  console.log("─".repeat(80));

  for (const clip of projectEdl.timeline?.tracks?.[0]?.clips ?? []) {
    const asset = projectEdl.assets?.media?.[clip.mediaId];
    const path = asset?.path?.slice(0, 50) ?? "NO PATH";
    console.log(
      `  ${clip.id} │ t=${clip.startTime?.toFixed(2)}s dur=${clip.duration?.toFixed(2)}s │ in=${clip.inPoint?.toFixed(2)} out=${clip.outPoint?.toFixed(2)} │ speed=${clip.speed} │ fx=${clip.effects?.length ?? 0} │ asset: ${path}`
    );
  }
  console.log("═".repeat(80));
}

async function main() {
  console.log("KOVE E2E PIPELINE TEST");
  console.log("═".repeat(80));
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Server: ${API}`);
  console.log(`Footage: ${FOOTAGE_FILES.map((f) => f.path).join(", ")}`);
  console.log(`Music: ${MUSIC_FILE.path}`);
  console.log(`Reference: ${REFERENCE_FILE.path}`);
  console.log("═".repeat(80));

  // Step 1: Upload
  console.log("\n[1/5] Uploading files...");
  const footageIds: string[] = [];
  for (const f of FOOTAGE_FILES) {
    const id = await uploadFile(f.path, f.type);
    footageIds.push(id);
  }
  const musicId = await uploadFile(MUSIC_FILE.path, MUSIC_FILE.type);
  const referenceId = await uploadFile(REFERENCE_FILE.path, "reference");

  // Step 2: Analyze
  const analysisRes = await analyzeMedia(footageIds, musicId);

  // Step 2b: Analyze reference
  let referenceStyleId: string | undefined;
  if (referenceId) {
    console.log("\n[2b] Analyzing reference...");
    const refRes = await fetch(`${API}/api/analyze-reference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: PROJECT_ID, referenceFileId: referenceId }),
    });
    const refJson = await refRes.json() as any;
    if (refJson.success) {
      referenceStyleId = refJson.referenceStyleId;
      console.log(`  ✓ Reference analyzed. styleId: ${referenceStyleId}`);
      console.log(`  Style keys: ${Object.keys(refJson.style ?? {})}`);
      console.log(`  Rhythm:`, refJson.style?.rhythm);
      console.log(`  IntentMapping:`, refJson.style?.intentMapping);
      console.log(`  Pacing:`, refJson.style?.pacing);
    } else {
      console.warn(`  ✗ Reference analysis failed:`, refJson.error);
    }
  }

  // Step 3: Decode intent
  const prompt = "Make a hype basketball edit with fast cuts on beat drops, slow motion for highlights, and energy-boosting effects. Match the vibe of Steph Curry highlights.";
  const intentRes = await decodeIntent(prompt);

  // Step 4: Generate EDL
  const edlRes = await generateEDL(
    intentRes.intentId,
    analysisRes.analysisId,
    analysisRes.result,
    prompt,
    referenceStyleId
  );

  // Step 5: Print results
  printEDL(edlRes.edl);

  // Step 6: Convert and print
  const { convertShotEDLToProjectEDL } = await import("../apps/web/src/stores/shot-to-project-edl");
  const mediaUrlMap: Record<string, string> = {};
  for (const id of footageIds) {
    mediaUrlMap[id] = `blob:test/${id}`;
  }
  mediaUrlMap[musicId] = `blob:test/${musicId}`;

  const projectEdl = convertShotEDLToProjectEDL(edlRes.edl, mediaUrlMap);
  printConversion(projectEdl);

  // Step 7: Verify integrity
  console.log("\nINTEGRITY CHECK:");
  const clipCount = edlRes.edl?.shots?.length ?? 0;
  const storeClips = projectEdl.timeline?.tracks?.[0]?.clips?.length ?? 0;
  const assetCount = Object.keys(projectEdl.assets?.media ?? {}).length;
  const allPathsValid = Object.values(projectEdl.assets?.media ?? {}).every((a: any) => a.path && a.path.length > 0);
  const allInPointsValid = projectEdl.timeline?.tracks?.[0]?.clips?.every((c: any) => Number.isFinite(c.inPoint) && Number.isFinite(c.outPoint)) ?? false;

  console.log(`  Server shots: ${clipCount}`);
  console.log(`  Converted clips: ${storeClips}`);
  console.log(`  Assets: ${assetCount}`);
  console.log(`  All asset paths valid: ${allPathsValid}`);
  console.log(`  All inPoint/outPoint valid: ${allInPointsValid}`);
  console.log(`  PASS: ${clipCount > 0 && storeClips > 0 && assetCount > 0 && allPathsValid && allInPointsValid ? "✓ YES" : "✗ NO"}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
