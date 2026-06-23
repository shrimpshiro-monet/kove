import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { PreviewFrame } from "../../server/types/edl";

const execAsync = promisify(exec);

/**
 * Extracts keyframes from a video file at regular intervals.
 * @param videoPath Path to the input video file.
 * @param outputDir Directory to save extracted frames.
 * @param intervalSeconds Interval in seconds between keyframes.
 * @returns Array of PreviewFrame objects.
 */
export async function extractKeyframes(
  videoPath: string,
  outputDir: string,
  intervalSeconds: number = 2
): Promise<PreviewFrame[]> {
  await fs.mkdir(outputDir, { recursive: true });

  // Get video duration using ffprobe
  const { stdout: durationStdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  const duration = parseFloat(durationStdout);

  const frames: PreviewFrame[] = [];
  const capturePoints: number[] = [];
  for (let t = 0; t <= duration; t += intervalSeconds) {
    capturePoints.push(t);
  }

  // Extract frames using ffmpeg
  // -ss before -i for fast seeking
  // -vframes 1 to capture one frame at the specified time
  // -q:v 2 for high quality JPEG
  for (const timestamp of capturePoints) {
    const fileName = `frame_${timestamp.toFixed(2)}.jpg`;
    const outputPath = path.join(outputDir, fileName);
    
    try {
      await execAsync(
        `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`
      );
      
      // In a real app, you might upload this to S3/Cloudinary and get a URL.
      // For now, we'll return the local path or a placeholder if needed.
      frames.push({
        timestamp,
        imageUrl: outputPath, // For the prototype, local paths are fine if the consumer can read them
      });
    } catch (error) {
      console.error(`Failed to extract frame at ${timestamp}s:`, error);
    }
  }

  return frames;
}
