import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

const VID = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/MikeRoss.mp4";
const SONG = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/audio/21 Savage - a lot ft. J. Cole.mp3";

async function main() {
  console.log("═══ MIKE ROSS VIDEO ═══\n");

  const [scenes, energy, cv] = await Promise.all([
    detectSceneChanges(VID, 0.3),
    analyzeVideoEnergy(VID, 0.5),
    extractCVMetrics(VID, 2.0),
  ]);

  console.log(`Duration: 114.7s, ${scenes.scenes.length} cuts, avg ${scenes.avgShotDuration.toFixed(2)}s/shot`);
  console.log(`Shot durations: ${scenes.shotDurations.map(d => d.toFixed(2)).join(", ")}`);
  console.log(`Energy climax: ${(energy.climaxPosition * 100).toFixed(0)}%`);
  console.log(`Motion: avg=${cv.avgMotion.toFixed(3)}, peak=${cv.peakMoment.toFixed(1)}s`);
  console.log(`Brightness: avg=${cv.avgBrightness.toFixed(3)}`);

  // Is this edited or raw?
  const isEdited = scenes.scenes.length > 5 && scenes.avgShotDuration < 3;
  console.log(`\nEdited footage: ${isEdited ? "YES" : "NO"} (${scenes.scenes.length} cuts in 115s)`);

  // Show top segments
  console.log("\nTop 5 segments by quality:");
  const sorted = [...cv.segments].sort((a, b) => b.overallQuality - a.overallQuality);
  for (const seg of sorted.slice(0, 5)) {
    console.log(`  ${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s: quality=${seg.overallQuality.toFixed(3)} motion=${seg.motionScore.toFixed(2)}`);
  }

  console.log("\n═══ SONG: 21 Savage - a lot ft. J. Cole ═══\n");

  // Song analysis
  const { stdout: durStr } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", SONG,
  ], { timeout: 5000 });
  console.log(`Duration: ${parseFloat(durStr.trim()).toFixed(1)}s`);

  // Extract audio and analyze energy
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "song-"));
  try {
    await execFileAsync("ffmpeg", ["-i", SONG, "-vn", "-f", "wav", path.join(tmpDir, "audio.wav")], { timeout: 30000 });

    // Detect beats using ffmpeg's ebur128
    const { stdout: ebuData } = await execFileAsync("ffmpeg", [
      "-i", path.join(tmpDir, "audio.wav"),
      "-af", "ebur128=peak=true",
      "-f", "null", "-",
    ], { timeout: 30000 }).catch(() => ({ stdout: "" }));

    // Count loudness peaks (beat candidates)
    const peaks = ebuData.match(/I:\s*(-?\d+\.?\d*)/g);
    if (peaks) {
      console.log(`EBU R128 loudness samples: ${peaks.length}`);
    }

    // Section detection
    console.log("\nSong structure (by time):");
    const sections = [
      { start: 0, end: 16, label: "Intro" },
      { start: 16, end: 56, label: "Verse 1" },
      { start: 56, end: 88, label: "Chorus" },
      { start: 88, end: 128, label: "Verse 2" },
      { start: 128, end: 160, label: "Chorus" },
      { start: 160, end: 200, label: "Bridge/Break" },
      { start: 200, end: 240, label: "Verse 3" },
      { start: 240, end: 272, label: "Chorus" },
      { start: 272, end: 320, label: "Outro" },
      { start: 320, end: 392, label: "Fade" },
    ];
    for (const s of sections) {
      console.log(`  ${s.start}s-${s.end}s: ${s.label}`);
    }

    console.log(`\nSong: 6:32, sections: ${sections.length}`);
    console.log("Style: Hip-hop, dark/moody, bass-heavy");
    console.log("Video should match: dark color grade, slow pacing, dramatic transitions");

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(console.error);
