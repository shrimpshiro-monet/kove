import { execa } from "execa";
import { compileTimelineToFFmpegGraph } from "./timeline-filter-compiler";
import { getFFmpegPath } from "./ffmpeg-utils";
import { assertLGPLCompatibleFFmpeg } from "./license-guard";
import type {
  ActionResult,
  TimelineRenderInput,
  TimelineRenderResult
} from "./timeline-types";

export async function renderTimelineWithFFmpeg(
  input: TimelineRenderInput
): Promise<ActionResult<TimelineRenderResult>> {
  try {
    const licenseCheck = await assertLGPLCompatibleFFmpeg();

    if (!licenseCheck.success) {
      return {
        success: false,
        error: licenseCheck.error ?? {
          code: "FFMPEG_LICENSE_CHECK_FAILED",
          message: "FFmpeg license check failed"
        }
      };
    }

    if (!input.outputPath || input.outputPath.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "OUTPUT_PATH_REQUIRED",
          message: "outputPath is required"
        }
      };
    }

    const compiled = compileTimelineToFFmpegGraph({
      edl: input.edl,
      width: input.width,
      height: input.height,
      fps: input.fps
    });

    if (!compiled.success || !compiled.data) {
      return {
        success: false,
        error: compiled.error ?? {
          code: "COMPILE_FAILED",
          message: "Failed to compile FFmpeg timeline graph"
        }
      };
    }

    const args: string[] = ["-y"];

    for (const ffmpegInput of compiled.data.inputs) {
      args.push("-i", ffmpegInput.path);
    }

    args.push("-filter_complex", compiled.data.filterComplex);
    args.push("-map", `[${compiled.data.videoOutputLabel}]`);

    if (compiled.data.audioOutputLabel) {
      args.push("-map", `[${compiled.data.audioOutputLabel}]`);
    }

    const crf = input.mode === "preview" ? "28" : "18";
    const preset = input.mode === "preview" ? "veryfast" : "medium";
    const audioBitrate = input.mode === "preview" ? "128k" : "192k";

    args.push(
      "-t",
      compiled.data.duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p"
    );

    if (compiled.data.audioOutputLabel) {
      args.push("-c:a", "aac", "-b:a", audioBitrate);
    } else {
      args.push("-an");
    }

    args.push("-movflags", "+faststart");
    args.push(input.outputPath);

    const child = execa(getFFmpegPath(), args, {
      reject: false,
      all: true
    });

    let lastProgress = 0;

    if (input.mode === "preview" || input.mode === "final") {
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();

        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);

        if (match && compiled.data) {
          const [, h, m, s] = match;

          const seconds =
            Number(h) * 3600 +
            Number(m) * 60 +
            Number(s);

          const progress = Math.min(
            100,
            (seconds / compiled.data.duration) * 100
          );

          if (progress - lastProgress >= 1) {
            lastProgress = progress;
            const inputAny = input as any;
            if (inputAny.onProgress) {
              inputAny.onProgress(progress);
            }
          }
        }
      });
    }

    const result = await child;

    if (result.exitCode !== 0) {
      console.error("[render-timeline] ffmpeg failed", {
        exitCode: result.exitCode,
        outputPath: input.outputPath,
        all: result.all,
        args
      });

      return {
        success: false,
        error: {
          code: "FFMPEG_TIMELINE_RENDER_FAILED",
          message: "FFmpeg failed while rendering Monet timeline"
        }
      };
    }

    return {
      success: true,
      data: {
        outputPath: input.outputPath,
        filterComplex: compiled.data.filterComplex,
        inputCount: compiled.data.inputs.length,
        duration: compiled.data.duration
      }
    };
  } catch (error) {
    console.error("[render-timeline] render failed", {
      error,
      outputPath: input.outputPath
    });

    return {
      success: false,
      error: {
        code: "TIMELINE_RENDER_FAILED",
        message: "Failed to render Monet timeline"
      }
    };
  }
}