import { execa } from "execa";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export interface FFmpegLicenseReport {
  ffmpegPath: string;
  versionOutput: string;
  hasEnableGpl: boolean;
  hasEnableNonfree: boolean;
  allowed: boolean;
}

function getFFmpegPath(): string {
  const value = process.env.FFMPEG_PATH;
  return value && value.trim().length > 0 ? value : "ffmpeg";
}

export async function assertLGPLCompatibleFFmpeg(): Promise<ActionResult<FFmpegLicenseReport>> {
  try {
    const ffmpegPath = getFFmpegPath();

    const result = await execa(ffmpegPath, ["-version"], {
      reject: false,
      all: true,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: {
          code: "FFMPEG_VERSION_FAILED",
          message: "Could not inspect FFmpeg version/configuration",
        },
      };
    }

    const output = result.all ?? "";
    const hasEnableGpl = output.includes("--enable-gpl");
    const hasEnableNonfree = output.includes("--enable-nonfree");
    const allowed = !hasEnableGpl && !hasEnableNonfree;

    if (!allowed) {
      return {
        success: false,
        error: {
          code: "FFMPEG_GPL_OR_NONFREE_BUILD",
          message:
            "This FFmpeg binary was built with --enable-gpl or --enable-nonfree. Monet requires an LGPL-compatible FFmpeg build.",
        },
        data: {
          ffmpegPath,
          versionOutput: output,
          hasEnableGpl,
          hasEnableNonfree,
          allowed,
        },
      };
    }

    return {
      success: true,
      data: {
        ffmpegPath,
        versionOutput: output,
        hasEnableGpl,
        hasEnableNonfree,
        allowed,
      },
    };
  } catch (error) {
    console.error("[license-guard] assertLGPLCompatibleFFmpeg failed", { error });

    return {
      success: false,
      error: {
        code: "FFMPEG_LICENSE_GUARD_FAILED",
        message: "Failed to verify FFmpeg license configuration",
      },
    };
  }
}
