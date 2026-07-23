/**
 * Generate reference analysis as HTML visualization.
 * (FFmpeg drawtext not available in this build)
 *
 * Creates an HTML page with:
 * - Video player
 * - Cut markers on timeline
 * - Energy curve
 * - Analysis labels
 */
import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const REF = "/Users/hamza/Desktop/reserves/monet-ai-story/reference-edits-2/new-reference.MOV";
const OUTPUT = "/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output";

async function main() {
  console.log("Generating reference analysis HTML...\n");

  const [scenes, energy] = await Promise.all([
    detectSceneChanges(REF, 0.3),
    analyzeVideoEnergy(REF, 0.5),
  ]);

  const duration = 13.87;

  // Build HTML
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Reference Analysis — Jalebi</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui; background: #0a0a0a; color: #fff; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 20px; }
    .container { max-width: 500px; margin: 0 auto; }
    video { width: 100%; border-radius: 12px; }
    .timeline { position: relative; height: 60px; margin: 20px 0; background: #1a1a1a; border-radius: 8px; overflow: hidden; }
    .cut-marker { position: absolute; top: 0; width: 3px; height: 100%; background: #ff4444; z-index: 2; }
    .cut-label { position: absolute; top: -20px; font-size: 11px; color: #ff4444; white-space: nowrap; }
    .energy-bar { position: absolute; bottom: 0; background: linear-gradient(to top, #22c55e, #eab308, #ef4444); border-radius: 2px 2px 0 0; }
    .climax-line { position: absolute; top: 0; width: 2px; height: 100%; background: #f97316; z-index: 3; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; }
    .stat { background: #1a1a1a; padding: 12px; border-radius: 8px; }
    .stat-label { font-size: 12px; color: #888; }
    .stat-value { font-size: 20px; font-weight: bold; }
    .shot-list { margin: 20px 0; }
    .shot { display: flex; align-items: center; gap: 10px; padding: 8px; background: #1a1a1a; border-radius: 6px; margin: 4px 0; font-size: 13px; }
    .shot-time { color: #888; min-width: 60px; }
    .shot-dur { color: #22c55e; }
    .shot-type { color: #f97316; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 Reference Analysis</h1>
    <video controls src="file://${REF}"></video>

    <div class="info">
      <div class="stat">
        <div class="stat-label">Cuts</div>
        <div class="stat-value">${scenes.scenes.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Avg Shot Duration</div>
        <div class="stat-value">${scenes.avgShotDuration.toFixed(2)}s</div>
      </div>
      <div class="stat">
        <div class="stat-label">Fast Cuts (&lt;1s)</div>
        <div class="stat-value">${scenes.shotDurations.filter(d => d < 1).length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Climax Position</div>
        <div class="stat-value">${(energy.climaxPosition * 100).toFixed(0)}%</div>
      </div>
    </div>

    <h3>Timeline</h3>
    <div class="timeline">
      ${scenes.scenes.map(s => `
        <div class="cut-marker" style="left: ${(s.timestamp / duration * 100).toFixed(1)}%">
          <div class="cut-label">${s.timestamp.toFixed(1)}s</div>
        </div>
      `).join("\n")}
      <div class="climax-line" style="left: ${(energy.climaxPosition * 100).toFixed(1)}%"></div>
      ${energy.energyCurve.map((val, i) => `
        <div class="energy-bar" style="left: ${(i / energy.energyCurve.length * 100).toFixed(1)}%; width: ${(1 / energy.energyCurve.length * 100).toFixed(1)}%; height: ${(val * 100).toFixed(0)}%"></div>
      `).join("\n")}
    </div>

    <h3>Shot Breakdown</h3>
    <div class="shot-list">
      ${scenes.shotDurations.map((dur, i) => {
        const start = i === 0 ? 0 : scenes.shotDurations.slice(0, i).reduce((s, d) => s + d, 0);
        const type = dur < 0.5 ? "⚡ flash" : dur < 1 ? "🔴 quick" : dur > 2 ? "🔵 hold" : "🟢 standard";
        return `<div class="shot"><span class="shot-time">${start.toFixed(1)}s</span><span class="shot-dur">${dur.toFixed(2)}s</span><span class="shot-type">${type}</span></div>`;
      }).join("\n")}
    </div>

    <h3>Energy Curve</h3>
    <div style="display:flex;align-items:end;gap:2px;height:100px;">
      ${energy.energyCurve.map((val, i) => `
        <div style="flex:1;background:${val > 0.7 ? '#ef4444' : val > 0.4 ? '#eab308' : '#22c55e'};height:${(val * 100).toFixed(0)}%;border-radius:2px 2px 0 0" title="${(i * 100 / energy.energyCurve.length).toFixed(0)}%: ${(val * 100).toFixed(0)}%"></div>
      `).join("\n")}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-top:4px">
      <span>0%</span><span>50%</span><span>100%</span>
    </div>
  </div>
</body>
</html>`;

  const outputPath = path.join(OUTPUT, "reference-analysis.html");
  await fs.writeFile(outputPath, html);
  console.log(`✓ Reference analysis saved: ${outputPath}`);

  // Also print summary
  console.log(`\nReference: ${duration.toFixed(1)}s, ${scenes.scenes.length} cuts`);
  console.log(`Shot durations: ${scenes.shotDurations.map(d => d.toFixed(2)).join(", ")}`);
  console.log(`Energy climax: ${(energy.climaxPosition * 100).toFixed(0)}%`);
}

main().catch(console.error);
