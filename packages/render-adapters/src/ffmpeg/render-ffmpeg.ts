import { execa } from "execa";
import type { MonetEDL } from "@monet/edl/src/schemas";
import { compileEDLEffectsToFFmpeg } from "./filter-compiler";

export interface RenderFFmpegInput {
  edl: MonetEDL;
  inputPath: string;
  outputPath: string;
  mode: "preview" | "final";
}

export interface RenderFFmpegResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
  data?: {
    outputPath: string;
  };
}

function getFFmpegPath(): string {
  return process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim().length > 0
    ? process.env.FFMPEG_PATH
    : "ffmpeg";
}

export async function renderWithFFmpeg(
  input: RenderFFmpegInput
): Promise<RenderFFmpegResult> {
  try {
    if (!input.inputPath || input.inputPath.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT_PATH",
          message: "inputPath is required"
        }
      };
    }

    if (!input.outputPath || input.outputPath.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_OUTPUT_PATH",
          message: "outputPath is required"
        }
      };
    }

    const compiled = compileEDLEffectsToFFmpeg(input.edl);

    if (!compiled.success || !compiled.data) {
      return {
        success: false,
        error: compiled.error ?? {
          code: "FILTER_COMPILE_FAILED",
          message: "Could not compile FFmpeg filters"
        }
      };
    }

    const crf = input.mode === "preview" ? "28" : "18";
    const preset = input.mode === "preview" ? "veryfast" : "medium";

    const args = [
      "-y",
      "-i",
      input.inputPath,
      "-filter_complex",
      compiled.data.filterComplex,
      "-map",
      `[${compiled.data.videoOutputLabel}]`,
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      input.outputPath
    ];

    const result = await execa(getFFmpegPath(), args, {
      reject: false
    });

    if (result.exitCode !== 0) {
      console.error("[render-ffmpeg] ffmpeg failed", {
        stderr: result.stderr,
        stdout: result.stdout
      });

      return {
        success: false,
        error: {
          code: "FFMPEG_FAILED",
          message: "FFmpeg render failed"
        }
      };
    }

    return {
      success: true,
      data: {
        outputPath: input.outputPath
      }
    };
  } catch (error) {
    console.error("[render-ffmpeg] render failed", error);

    return {
      success: false,
      error: {
        code: "RENDER_FAILED",
        message: "Failed to render with FFmpeg"
      }
    };
  }
}