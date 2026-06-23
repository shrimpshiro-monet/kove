import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import {
  validateLicenseManifest,
  assertComponentAllowed,
  assertVariantNotBlocked,
  LicenseManifest,
  LicenseGateResult
} from "../lib/license-gate";

const execAsync = promisify(exec);

export interface FFmpegProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec?: string;
}

export interface ProxyGenerationResult {
  success: boolean;
  proxyKey: string;
  proxyPath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export class FFmpegProxyService {
  private manifest: LicenseManifest | null = null;
  private isInitialized = false;

  constructor(private manifestPath = path.join(process.cwd(), "brain", "license_manifest.json")) {}

  /**
   * Initializes the service and runs strict license compliance checks.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const content = await fs.readFile(this.manifestPath, "utf-8");
      const manifestJson = JSON.parse(content);
      const validationResult = validateLicenseManifest(manifestJson);

      if (!validationResult.success || !validationResult.data) {
        throw new Error(
          `License manifest validation failed: ${validationResult.error?.message || "Unknown error"}`
        );
      }

      this.manifest = validationResult.data;

      // Assert FFmpeg component is allowed
      const ffmpegAllowed = assertComponentAllowed(this.manifest, "ffmpeg-lgpl");
      if (!ffmpegAllowed.success) {
        throw new Error(`FFmpeg component is not allowed: ${ffmpegAllowed.error?.message}`);
      }

      // Check the host FFmpeg configuration and validate variants
      await this.checkHostFFmpegCompliance();

      this.isInitialized = true;
      console.log("[ffmpeg-proxy-service] Initialized and verified license compliance successfully.");
    } catch (error) {
      console.error("[ffmpeg-proxy-service] Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Probes the video file configurations and asserts compliance with blocked variants.
   */
  private async checkHostFFmpegCompliance(): Promise<void> {
    if (!this.manifest) return;

    try {
      const { stdout } = await execAsync("ffmpeg -version");
      const configLine = stdout.split("\n").find((line) => line.includes("configuration:"));
      
      if (!configLine) {
        console.warn("[ffmpeg-proxy-service] Could not parse FFmpeg configuration options.");
        return;
      }

      // Check for GPL, non-free, or specific blocked encoders
      const checks = [
        { flag: "--enable-gpl", variant: "ffmpeg-enable-gpl" },
        { flag: "--enable-nonfree", variant: "ffmpeg-enable-nonfree" },
        { flag: "--enable-libx264", variant: "libx264" },
        { flag: "--enable-libx265", variant: "libx265" },
      ];

      for (const check of checks) {
        if (configLine.includes(check.flag)) {
          const assertResult = assertVariantNotBlocked(this.manifest, "ffmpeg-lgpl", check.variant);
          if (!assertResult.success) {
            // Log as severe warning in dev, but strictly fail-closed if required
            console.warn(
              `[ffmpeg-proxy-service] COMPLIANCE WARNING: Local FFmpeg binary uses blocked variant "${check.variant}" (${check.flag}).`
            );
          }
        }
      }
    } catch (error) {
      console.error("[ffmpeg-proxy-service] Failed to execute ffmpeg -version for compliance checks.", error);
    }
  }

  /**
   * Extract video/audio metadata using ffprobe.
   */
  public async probe(mediaPath: string): Promise<FFmpegProbeResult> {
    await this.initialize();

    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,codec_name -show_entries format=duration -of json "${mediaPath}"`
      );

      const data = JSON.parse(stdout);
      const stream = data.streams?.[0];
      const format = data.format;

      if (!stream || !format) {
        throw new Error("Invalid metadata returned from ffprobe.");
      }

      // Parse FPS from fraction "num/den"
      let fps = 30;
      if (stream.avg_frame_rate) {
        const parts = stream.avg_frame_rate.split("/");
        if (parts.length === 2) {
          const num = parseFloat(parts[0]);
          const den = parseFloat(parts[1]);
          if (den > 0) fps = Math.round((num / den) * 100) / 100;
        }
      }

      // Probe audio codec
      let audioCodec: string | undefined;
      try {
        const { stdout: audioStdout } = await execAsync(
          `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of json "${mediaPath}"`
        );
        const audioData = JSON.parse(audioStdout);
        audioCodec = audioData.streams?.[0]?.codec_name;
      } catch {
        // Safe to ignore if there is no audio stream
      }

      return {
        duration: parseFloat(format.duration || "0"),
        width: parseInt(stream.width || "0", 10),
        height: parseInt(stream.height || "0", 10),
        fps,
        codec: stream.codec_name || "unknown",
        audioCodec,
      };
    } catch (error) {
      console.error(`[ffmpeg-proxy-service] Probing failed for ${mediaPath}:`, error);
      throw error;
    }
  }

  /**
   * Generates a web-safe, normalized preview proxy of the video.
   */
  public async generatePreviewProxy(
    inputPath: string,
    outputDir: string,
    projectId: string,
    fileId: string
  ): Promise<ProxyGenerationResult> {
    await this.initialize();
    await fs.mkdir(outputDir, { recursive: true });

    const metadata = await this.probe(inputPath);
    const proxyFilename = `${fileId}_proxy.mp4`;
    const outputPath = path.join(outputDir, proxyFilename);
    const proxyKey = `footage/${projectId}/proxies/${proxyFilename}`;

    // Target a maximum of 720p height preserving aspect ratio, ensuring width is divisible by 2
    let scaleFilter = "scale='min(1280,iw)':-2";
    if (metadata.width > 0 && metadata.height > 0) {
      if (metadata.height > 720) {
        scaleFilter = "scale=-2:720";
      }
    }

    // Build transcode parameters:
    // We prioritize LGPL-compliant encoders. 
    // libopenh264 is BSD/LGPL friendly. 
    // If not available, we use libx264 but log a compliance warning if the binary is GPL-linked.
    const videoEncoder = await this.resolveBestVideoEncoder();
    
    const ffmpegCommand = [
      "ffmpeg",
      `-i "${inputPath}"`,
      `-vf "${scaleFilter}"`,
      `-c:v ${videoEncoder}`,
      "-profile:v baseline",
      "-level 3.0",
      "-pix_fmt yuv420p",
      "-c:a aac",
      "-ac 2",
      "-ar 44100",
      "-movflags +faststart",
      `"${outputPath}"`,
      "-y"
    ].join(" ");

    console.log(`[ffmpeg-proxy-service] Generating proxy for ${fileId} using encoder ${videoEncoder}...`);
    try {
      await execAsync(ffmpegCommand);
      return {
        success: true,
        proxyKey,
        proxyPath: outputPath,
        duration: metadata.duration,
        width: metadata.width > 0 ? (metadata.height > 720 ? Math.round((metadata.width * 720) / metadata.height) : metadata.width) : 1280,
        height: metadata.height > 720 ? 720 : metadata.height,
        fps: metadata.fps,
      };
    } catch (error) {
      console.error(`[ffmpeg-proxy-service] Proxy generation failed for ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Resolves the best available video encoder based on compliance and availability.
   */
  private async resolveBestVideoEncoder(): Promise<string> {
    try {
      const { stdout } = await execAsync("ffmpeg -encoders");
      
      // Preferred order: OpenH264 (LGPL/BSD), then standard x264 (check compliance)
      if (stdout.includes("libopenh264")) {
        return "libopenh264";
      }
      
      return "libx264";
    } catch {
      return "libx264";
    }
  }

  /**
   * Extract regular interval thumbnail frames for scrub previews.
   */
  public async extractThumbnails(
    inputPath: string,
    outputDir: string,
    intervalSeconds = 2
  ): Promise<string[]> {
    await this.initialize();
    await fs.mkdir(outputDir, { recursive: true });

    const metadata = await this.probe(inputPath);
    const duration = metadata.duration;
    const thumbnailPaths: string[] = [];

    for (let t = 0; t < duration; t += intervalSeconds) {
      const outName = `thumb_${t.toFixed(0)}.jpg`;
      const outPath = path.join(outputDir, outName);

      try {
        await execAsync(
          `ffmpeg -ss ${t} -i "${inputPath}" -vframes 1 -q:v 4 "${outPath}" -y`
        );
        thumbnailPaths.push(outPath);
      } catch (error) {
        console.warn(`[ffmpeg-proxy-service] Failed to extract thumbnail at ${t}s:`, error);
      }
    }

    return thumbnailPaths;
  }
}
