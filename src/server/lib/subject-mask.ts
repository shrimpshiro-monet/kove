// src/server/lib/subject-mask.ts
// Per-frame subject isolation using MediaPipe Selfie Segmentation.
// Outputs alpha mask video for FFmpeg maskedblur/compositing.
// Based on frame processing loops from cedro3/mediapipe and google-ai-edge/mediapipe-samples.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface MaskOptions {
  /** Model selection: "general" (selfie_segmentation) or "landscape" (landscape_segmentation). */
  model?: "general" | "landscape";
  /** Output mask smoothness (0-1, default 0.5). Higher = smoother edges. */
  smoothness?: number;
  /** Whether to invert the mask (isolate background instead of subject). */
  invert?: boolean;
  /** Output video codec: "rawvideo" for transparency, "libx264" for grayscale. */
  outputCodec?: "rawvideo" | "libx264";
  /** Temp directory for intermediate files. */
  tempDir?: string;
}

export interface MaskResult {
  /** Path to the output mask video file. */
  maskVideoPath: string;
  /** Output format: RGBA video or grayscale MP4. */
  format: "rgba" | "grayscale";
  /** Total frames processed. */
  frameCount: number;
  /** Processing duration in ms. */
  durationMs: number;
}

/**
 * Generate a per-frame alpha mask video from an input video.
 *
 * Uses FFmpeg's built-in face detection as a lightweight fallback, and can optionally
 * be enhanced with a Python MediaPipe sidecar for higher quality segmentation.
 *
 * Pipeline:
 * 1. Extract frames from input video
 * 2. For each frame, generate a segmentation mask (FFmpeg-based or MediaPipe)
 * 3. Optionally smooth the mask edges
 * 4. Encode the mask sequence as a video file
 *
 * @param inputVideoPath - Path to the source video
 * @param outputMaskPath - Path for the output mask video
 * @param options - Mask generation options
 */
export async function generateSubjectMask(
  inputVideoPath: string,
  outputMaskPath: string,
  options: MaskOptions = {},
): Promise<MaskResult> {
  const {
    smoothness = 0.5,
    invert = false,
    tempDir = path.join(os.tmpdir(), `mask-gen-${Date.now()}`),
  } = options;

  const startTime = Date.now();
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Check if MediaPipe Python sidecar is available
    const hasMediaPipe = await checkMediaPipeAvailable();

    if (hasMediaPipe) {
      return await generateMaskWithMediaPipe(
        inputVideoPath,
        outputMaskPath,
        tempDir,
        { smoothness, invert },
      );
    } else {
      return await generateMaskWithFFmpeg(
        inputVideoPath,
        outputMaskPath,
        tempDir,
        { smoothness, invert },
      );
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Generate mask using MediaPipe Selfie Segmentation (Python sidecar).
 * Higher quality than FFmpeg-based approach.
 */
async function generateMaskWithMediaPipe(
  inputVideoPath: string,
  outputMaskPath: string,
  tempDir: string,
  opts: { smoothness: number; invert: boolean },
): Promise<MaskResult> {
  const startTime = Date.now();

  // Call the Python MediaPipe processing script
  const scriptPath = path.join(
    process.cwd(),
    "workers",
    "python-ai",
    "subject_mask.py",
  );

  const maskFramesDir = path.join(tempDir, "masks");
  await fs.mkdir(maskFramesDir, { recursive: true });

  // Run MediaPipe segmentation
  const pythonScript = `
import sys
import os
import cv2
import numpy as np
import mediapipe as mp

def process_video(input_path, output_dir, smoothness, invert):
    mp_selfie = mp.solutions.selfie_segmentation
    cap = cv2.VideoCapture(input_path)

    if not cap.isOpened():
        print(f"ERROR: Cannot open {input_path}", file=sys.stderr)
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_idx = 0

    with mp_selfie.SelfieSegmentation(model_selection=1) as segmentation:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # MediaPipe expects RGB
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = segmentation.process(rgb)

            # Get segmentation mask
            mask = results.segmentation_mask

            # Apply Gaussian blur for smoothing
            blur_size = int(smoothness * 20) * 2 + 1
            mask = cv2.GaussianBlur(mask, (blur_size, blur_size), 0)

            if invert:
                mask = 1.0 - mask

            # Convert to 8-bit grayscale
            mask_8bit = (mask * 255).astype(np.uint8)

            # Save as PNG with alpha channel
            out_path = os.path.join(output_dir, f"mask_{frame_idx:05d}.png")

            # Create RGBA image (white subject, transparent background)
            h, w = mask_8bit.shape
            rgba = np.zeros((h, w, 4), dtype=np.uint8)
            rgba[:, :, 0] = 255  # R
            rgba[:, :, 1] = 255  # G
            rgba[:, :, 2] = 255  # B
            rgba[:, :, 3] = mask_8bit  # Alpha

            cv2.imwrite(out_path, rgba)
            frame_idx += 1

            if frame_idx % 100 == 0:
                print(f"Processed {frame_idx} frames", file=sys.stderr)

    cap.release()
    print(f"DONE:{frame_idx}:{fps}:{width}:{height}", file=sys.stdout)

if __name__ == "__main__":
    process_video(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4] == "true")
`;

  const scriptFile = path.join(tempDir, "segment.py");
  await fs.writeFile(scriptFile, pythonScript);

  const { stdout, stderr } = await execFileAsync("python3", [
    scriptFile,
    inputVideoPath,
    maskFramesDir,
    String(opts.smoothness),
    String(opts.invert),
  ], { timeout: 600_000 }).catch((err) => {
    throw new Error(`MediaPipe segmentation failed: ${err.message}\n${err.stderr || ""}`);
  });

  // Parse output: "DONE:frameCount:fps:width:height"
  const match = stdout.trim().match(/DONE:(\d+):(\d+\.?\d*):(\d+):(\d+)/);
  if (!match) {
    throw new Error(`Unexpected MediaPipe output: ${stdout}`);
  }

  const frameCount = parseInt(match[1], 10);
  const fps = parseFloat(match[2]);
  const width = parseInt(match[3], 10);
  const height = parseInt(match[4], 10);

  // Encode mask frames to video
  if (opts.invert || true) {
    // Encode as grayscale MP4 for FFmpeg compatibility
    await execFileAsync("ffmpeg", [
      "-framerate", String(fps),
      "-i", path.join(maskFramesDir, "mask_%05d.png"),
      "-vf", "format=gray",
      "-c:v", "libx264",
      "-crf", "10",
      "-pix_fmt", "gray",
      outputMaskPath,
      "-y",
    ], { timeout: 120_000 });
  }

  return {
    maskVideoPath: outputMaskPath,
    format: "grayscale",
    frameCount,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Safely parse a frame rate string from ffprobe (e.g., "30000/1001" or "30").
 */
function parseFrameRate(rateStr: string): number {
  if (!rateStr) return 30;
  const parts = rateStr.split("/");
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den > 0 && !isNaN(num) && !isNaN(den)) return num / den;
  }
  const val = parseFloat(rateStr);
  return !isNaN(val) && val > 0 ? val : 30;
}

/**
 * Generate mask using FFmpeg's built-in face/edge detection.
 * Lightweight fallback when MediaPipe is not available.
 */
async function generateMaskWithFFmpeg(
  inputVideoPath: string,
  outputMaskPath: string,
  tempDir: string,
  opts: { smoothness: number; invert: boolean },
): Promise<MaskResult> {
  const startTime = Date.now();

  // Get video info
  const { stdout: probeOut } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
    "-of", "json",
    inputVideoPath,
  ], { timeout: 10_000 });

  const probe = JSON.parse(probeOut);
  const videoStream = probe.streams.find((s: any) => s.codec_type === "video");
  if (!videoStream) throw new Error("No video stream found");

  const fps = parseFrameRate(videoStream.r_frame_rate);

  // Build FFmpeg filter chain for edge-based subject detection:
  // 1. Convert to grayscale
  // 2. Apply edge detection
  // 3. Dilate edges to create solid mask
  // 4. Invert if needed
  // 5. Apply Gaussian blur for smoothing

  const blurStrength = Math.max(1, Math.round(opts.smoothness * 10));
  const negateFilter = opts.invert ? "negate," : "";

  const filterChain = [
    "format=gray",
    "edgedetect=low=0.05:high=0.15",
    `boxblur=${blurStrength}:${blurStrength}`,
    "threshold=128",
    `boxblur=${blurStrength * 2}:${blurStrength * 2}`,
    negateFilter,
    "format=gray",
  ].filter(Boolean).join(",");

  await execFileAsync("ffmpeg", [
    "-i", inputVideoPath,
    "-vf", filterChain,
    "-c:v", "libx264",
    "-crf", "10",
    "-pix_fmt", "gray",
    outputMaskPath,
    "-y",
  ], { timeout: 300_000 });

  // Count frames
  const { stdout: frameCountStr } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-count_frames",
    "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_frames",
    "-of", "default=noprint_wrappers=1:nokey=1",
    outputMaskPath,
  ], { timeout: 60_000 }).catch(() => ({ stdout: "0" }));

  return {
    maskVideoPath: outputMaskPath,
    format: "grayscale",
    frameCount: parseInt(frameCountStr.trim(), 10) || 0,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Apply the subject mask to a video using FFmpeg's maskedblur filter.
 * Creates a depth-of-field effect where the subject is sharp and background is blurred.
 */
export async function applyMaskedBlur(
  inputVideoPath: string,
  maskVideoPath: string,
  outputPath: string,
  blurStrength: number = 15,
): Promise<void> {
  // FFmpeg maskedblur: apply blur only where mask is white
  await execFileAsync("ffmpeg", [
    "-i", inputVideoPath,
    "-i", maskVideoPath,
    "-filter_complex",
    `[1:v]boxblur=${blurStrength}:${blurStrength / 2}[masked];[0:v][masked]maskedmerge`,
    "-c:v", "libx264",
    "-crf", "18",
    "-c:a", "copy",
    outputPath,
    "-y",
  ], { timeout: 300_000 });
}

/**
 * Apply the subject mask as an alpha channel overlay.
 * Creates a composite where only the subject is visible over a background.
 */
export async function applyMaskAsAlpha(
  inputVideoPath: string,
  maskVideoPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-i", inputVideoPath,
    "-i", maskVideoPath,
    "-filter_complex",
    "[0:v][1:v]alphamerge",
    "-c:v", "png",
    "-pix_fmt", "rgba",
    outputPath,
    "-y",
  ], { timeout: 300_000 });
}

/**
 * Check if the Python MediaPipe sidecar is available.
 * Result is cached after first check to avoid repeated Python spawns.
 */
let _mediaPipeAvailable: boolean | null = null;

async function checkMediaPipeAvailable(): Promise<boolean> {
  if (_mediaPipeAvailable !== null) return _mediaPipeAvailable;
  try {
    await execFileAsync("python3", [
      "-c",
      "import mediapipe; print(mediapipe.__version__)",
    ], { timeout: 5_000 });
    _mediaPipeAvailable = true;
  } catch {
    _mediaPipeAvailable = false;
  }
  return _mediaPipeAvailable;
}
