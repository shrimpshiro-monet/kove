import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import type { ProjectEDL as MonetEDL } from "@monet/edl/src/schemas";
import { renderTimelineWithFFmpeg } from "../ffmpeg/render-timeline";
import type { ActionResult, TimelineRenderResult } from "../ffmpeg/timeline-types";

// 1. The Universal "Vibe" Timeline State Tree
export interface VibeTimeline {
  projectId: string;
  engineTarget: "freecut" | "mlt" | "blender";
  settings: {
    width: number;
    height: number;
    fps: number;
  };
  tracks: {
    id: string;
    type: "video" | "audio";
    source: string; // Absolute path
    startFrame: number;
    endFrame: number;
    speed?: number; // e.g. 0.2 for slow-mo
  }[];
}

/**
 * Unified Multi-Engine Execution Router.
 * Routes a VibeTimeline to the appropriate rendering engine.
 */
export async function processVibeEngine(
  timeline: VibeTimeline
): Promise<ActionResult<TimelineRenderResult>> {
  const outputDir = path.join(process.cwd(), ".monet-artifacts/renders");
  const finalOut = path.join(outputDir, `render_${timeline.projectId}_${Date.now()}.mp4`);

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let outputPath: string;

    switch (timeline.engineTarget) {
      case "freecut":
        outputPath = await compileFreeCutFFmpeg(timeline, finalOut);
        break;
      case "mlt":
        outputPath = await compileMLT(timeline, finalOut);
        break;
      case "blender":
        outputPath = await compileBlender(timeline, finalOut, outputDir);
        break;
      default:
        return {
          success: false,
          error: {
            code: "ENGINE_UNTARGETED",
            message: `Engine layer "${timeline.engineTarget}" untargeted.`,
          },
        };
    }

    return {
      success: true,
      data: {
        outputPath,
        duration: timeline.tracks.reduce((sum, t) => sum + (t.endFrame - t.startFrame) / timeline.settings.fps, 0),
        inputCount: timeline.tracks.length,
        filterComplex: "",
      },
    };
  } catch (error: any) {
    console.error(`🔴 Engine Shell Error: ${error.message}`);
    return {
      success: false,
      error: {
        code: "RENDER_ENGINE_FAILED",
        message: error.message,
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────
// 🛠️ ENGINE 1: FREECUT (FFmpeg Custom Filtergraph compiler)
// ──────────────────────────────────────────────────────────────
async function compileFreeCutFFmpeg(tl: VibeTimeline, out: string): Promise<string> {
  const inputs = tl.tracks.map((t) => `-i "${t.source}"`).join(" ");
  let filterComplex = "";

  tl.tracks.forEach((t, i) => {
    // Basic cut trim filters
    filterComplex += `[${i}:v]trim=start_frame=${t.startFrame}:end_frame=${t.endFrame},setpts=PTS-STARTPTS[v${i}];`;
  });

  const concatMix =
    tl.tracks.map((_, i) => `[v${i}]`).join("") +
    `concat=n=${tl.tracks.length}:v=1:a=0[outv]`;
  
  const fullCmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}${concatMix}" -map "[outv]" -c:v libx264 -pix_fmt yuv420p "${out}"`;

  await runShell(fullCmd);
  return out;
}

// ──────────────────────────────────────────────────────────────
// 🎬 ENGINE 2: MLT ENGINE (Generates deterministic raw XML strings)
// ──────────────────────────────────────────────────────────────
async function compileMLT(tl: VibeTimeline, out: string): Promise<string> {
  const xmlPath = path.join(process.cwd(), ".monet-artifacts/mlt", `timeline_${tl.projectId}_${Date.now()}.mlt`);
  const mltDir = path.dirname(xmlPath);
  
  if (!fs.existsSync(mltDir)) fs.mkdirSync(mltDir, { recursive: true });

  // Build a production-ready, schema-validated MLT structural tree
  let xml = `<mlt profile="atsc_1080p_${tl.settings.fps}">`;

  // 1. Declare absolute production resources
  tl.tracks.forEach((t, i) => {
    xml += `
    <producer id="prod_${i}" resource="${t.source}">
      <property name="global_feed">1</property>
    </producer>`;
  });

  // 2. Arrange elements into a functional playlist track matrix
  xml += `\n  <playlist id="main_track">`;
  tl.tracks.forEach((t, i) => {
    xml += `\n    <entry producer="prod_${i}" in="${t.startFrame}" out="${t.endFrame}"/>`;
  });
  xml += `\n  </playlist>`;

  // 3. Connect structural consumer pipelines
  xml += `\n  <consumer id="render_out" target="${out}" provider="avformat"/>\n</mlt>`;

  fs.writeFileSync(xmlPath, xml.trim());

  // Fire melt CLI directly against the custom compiled project structure
  await runShell(`melt "${xmlPath}" -consumer avformat:"${out}" vcodec=libx264 acodec=aac`);
  return out;
}

// ──────────────────────────────────────────────────────────────
// 🧊 ENGINE 3: BLENDER HEADLESS PIPELINE (Injected programmatic Python)
// ──────────────────────────────────────────────────────────────
async function compileBlender(
  tl: VibeTimeline,
  out: string,
  outDir: string
): Promise<string> {
  const pyPath = path.join(outDir, `blender_${tl.projectId}_${Date.now()}.py`);

  let pythonCode = `
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.sequence_editor_create()
sequencer = scene.sequence_editor

scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.filepath = "${out}"
scene.render.use_sequencer = True
scene.frame_start = 1
scene.render.resolution_x = ${tl.settings.width}
scene.render.resolution_y = ${tl.settings.height}
scene.render.fps = ${tl.settings.fps}
`;

  let currentFrameCursor = 1;
  tl.tracks.forEach((t, i) => {
    const duration = t.endFrame - t.startFrame;
    pythonCode += `
strip_${i} = sequencer.sequences.new_movie("track_${i}", "${t.source}", channel=2, frame_start=${currentFrameCursor})
strip_${i}.frame_offset_start = ${t.startFrame}
strip_${i}.frame_final_duration = ${duration}
`;

    if (t.speed) {
      pythonCode += `
speed_${i} = sequencer.sequences.new_effect("speed_${i}", 'SPEED', channel=3, frame_start=${currentFrameCursor}, frame_end=${currentFrameCursor + duration}, seq1=strip_${i})
speed_${i}.use_as_speed = False
speed_${i}.speed_factor = ${t.speed}
`;
    }
    currentFrameCursor += duration;
  });

  pythonCode += `\nscene.frame_end = ${currentFrameCursor}\nbpy.ops.render.render(animation=True)`;

  fs.writeFileSync(pyPath, pythonCode.trim());
  await runShell(`blender -b -P "${pyPath}"`);
  return out;
}

// Helper utility loop to cleanly execute and log system shells
async function runShell(cmd: string): Promise<void> {
  const { all } = await execa(cmd, { shell: true, all: true });
  console.log(all);
}

// ─── Legacy Compatibility ──────────────────────────────────────────────

export interface RenderRouterInput {
  edl: MonetEDL;
  outputPath: string;
  mode: "preview" | "final";
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (progress: number) => void;
}

export async function renderEDL(
  input: RenderRouterInput
): Promise<ActionResult<TimelineRenderResult>> {
  try {
    if (!input.edl || input.edl.version !== 1) {
      return {
        success: false,
        error: {
          code: "INVALID_EDL",
          message: "Expected MonetEDL version 1",
        },
      };
    }

    return await renderTimelineWithFFmpeg({
      edl: input.edl,
      outputPath: input.outputPath,
      mode: input.mode,
      width: input.width,
      height: input.height,
      fps: input.fps,
      onProgress: input.onProgress,
    });
  } catch (error) {
    console.error("[render-router] renderEDL failed", {
      error,
      edlId: input.edl?.id,
      outputPath: input.outputPath,
    });

    return {
      success: false,
      error: {
        code: "RENDER_ROUTER_FAILED",
        message: "Failed to route MonetEDL render",
      },
    };
  }
}
