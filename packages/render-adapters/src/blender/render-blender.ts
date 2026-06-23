import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

export interface BlenderRenderPayload {
  assetId: string;
  sourceVideoPath: string;
  startFrame: number;
  endFrame: number;
  width?: number;
  height?: number;
  fps?: number;
}

export interface BlenderRenderResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  stdout?: string;
}

/**
 * Executes a native Blender render using the headless binary.
 * This follows the deterministic rendering pipeline blueprint.
 */
export async function executeNativeBlenderRender(
  payload: BlenderRenderPayload
): Promise<BlenderRenderResult> {
  const assetId = payload.assetId || nanoid();
  const outputDirectory = path.join(process.cwd(), ".monet-artifacts/blender");
  const uniqueOutputFilePath = path.join(
    outputDirectory,
    `render_${assetId}_${Date.now()}.mp4`
  );
  const pythonScriptPath = path.join(
    outputDirectory,
    `runner_${assetId}_${Date.now()}.py`
  );

  try {
    // 1. Establish Asset Pre-Flight Routing
    if (!fs.existsSync(payload.sourceVideoPath)) {
      return {
        success: false,
        error: `Source video not found: ${payload.sourceVideoPath}`,
      };
    }

    // Ensure the target temporary system directories exist
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    const width = payload.width || 1280;
    const height = payload.height || 720;
    const fps = payload.fps || 30;

    // 2. Perform Dynamic Template Injection
    // Pure, absolute Python template code - no mock wrappers allowed
    const scriptContent = `
import bpy
import os

# Clear existing data
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Set render engine and output settings
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = ${width}
scene.render.resolution_y = ${height}
scene.render.resolution_percentage = 100
scene.render.fps = ${fps}

scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
scene.render.filepath = "${uniqueOutputFilePath}"

# Initialize Sequencer
scene.sequence_editor_create()
scene.render.use_sequencer = True
sequencer = scene.sequence_editor

# Add video strip
video_strip = sequencer.sequences.new_movie(
    name="Active_Track",
    filepath="${payload.sourceVideoPath}",
    channel=2,
    frame_start=${payload.startFrame}
)

# Set timeline boundaries
scene.frame_start = ${payload.startFrame}
scene.frame_end = ${payload.endFrame}

# Execute render
print("STARTING_NATIVE_RENDER")
bpy.ops.render.render(animation=True, write_still=True)
print("NATIVE_RENDER_COMPLETE")
`;

    // Write out the concrete python script file to storage
    fs.writeFileSync(pythonScriptPath, scriptContent.trim());

    // 3. Spawn the Native Child Process & 4. Monitor Streams
    const { stdout, stderr, exitCode } = await execa(
      "blender",
      ["-b", "-P", pythonScriptPath],
      {
        reject: false,
        all: true,
      }
    );

    if (exitCode !== 0) {
      console.error(`❌ Native Engine Failure Log: ${stderr || stdout}`);
      return {
        success: false,
        error: `Blender process failed with exit code ${exitCode}`,
        stdout: stdout,
      };
    }

    if (stdout.includes("NATIVE_RENDER_COMPLETE")) {
      console.log(`🎉 Rendering complete. Asset written to: ${uniqueOutputFilePath}`);
      return {
        success: true,
        outputPath: uniqueOutputFilePath,
        stdout: stdout,
      };
    } else {
      return {
        success: false,
        error: "Render cycle completed but failed internal execution validation loops.",
        stdout: stdout,
      };
    }
  } catch (error: any) {
    console.error(`❌ Fatal Render Error: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Optional: Clean up the python script
    try {
      if (fs.existsSync(pythonScriptPath)) {
        fs.unlinkSync(pythonScriptPath);
      }
    } catch (e) {
      console.warn("Failed to clean up Blender python script", e);
    }
  }
}
