/**
 * Enhanced analysis bridge — calls Python scripts for advanced perception.
 *
 * Tools:
 *   - rembg: background removal (subject isolation)
 *   - YOLO: object detection (shot composition)
 *   - pytesseract: text detection (reference overlays)
 *   - MiDaS: depth estimation (parallax effects)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = path.resolve(process.cwd(), "workers/python-ai/workers");

async function runPython(script: string, func: string, args: string[], timeoutMs = 120_000): Promise<any> {
  const venv = path.resolve(process.cwd(), "workers/python-ai/.venv/bin/python3");
  try {
    const { stdout } = await execFileAsync(
      venv,
      ["-c", `import json,sys;sys.path.insert(0,'${SCRIPT_DIR}');from ${script} import ${func};print(json.dumps(${func}(sys.argv[1])))`, ...args],
      { timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 },
    );
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error(`[enhanced-analysis] ${script}.${func} failed: ${(err as Error).message}`);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Remove background from a frame. Returns RGBA image path + subject stats.
 */
export async function removeBackground(imagePath: string) {
  return runPython("enhanced_analysis", "remove_background", [imagePath], 60_000);
}

/**
 * Detect objects using YOLO. Returns composition analysis.
 */
export async function detectObjects(imagePath: string, confidence = 0.3) {
  return runPython("enhanced_analysis", "detect_objects_yolo", [imagePath], 60_000);
}

/**
 * Detect text using pytesseract. Returns text blocks with positions.
 */
export async function detectText(imagePath: string) {
  return runPython("enhanced_analysis", "detect_text_ocr", [imagePath], 30_000);
}

/**
 * Run all enhanced analysis on a frame.
 */
export async function analyzeFrame(imagePath: string) {
  return runPython("enhanced_analysis", "analyze_frame", [imagePath], 120_000);
}

/**
 * Estimate depth map using MiDaS. Returns depth stats + parallax info.
 */
export async function estimateDepth(imagePath: string) {
  return runPython("depth_estimation", "estimate_depth", [imagePath], 90_000);
}

/**
 * Batch depth estimation for video.
 */
export async function estimateDepthVideo(videoPath: string, stride = 30) {
  return runPython("depth_estimation", "estimate_depth_batch", [videoPath, String(stride)], 300_000);
}
