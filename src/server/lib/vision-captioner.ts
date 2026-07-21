/**
 * Vision captioner — sends 1-2 representative frames per shot to vision AI.
 * Uses existing vision-analyzer.ts for the actual Cloudflare Workers AI call.
 */
import type { Env } from "../types/env";
import { analyzeWithVision } from "./vision-analyzer.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface ShotSegment {
  start_s: number;
  end_s: number;
  frame_start: number;
  frame_end: number;
}

export interface ShotCaption {
  shot_index: number;
  description: string;
  subjects: string[];
  action: string;
  mood: string;
}

/**
 * Select 1-2 representative keyframes for a shot.
 * Returns the first frame + middle frame (if shot > 1s).
 */
function selectKeyframes(
  frameDir: string,
  shot: ShotSegment,
): string[] {
  const frameStart = String(shot.frame_start + 1).padStart(4, "0");
  const paths = [path.join(frameDir, `frame_${frameStart}.jpg`)];

  if (shot.end_s - shot.start_s > 1.0) {
    const midFrame = Math.floor((shot.frame_start + shot.frame_end) / 2);
    const midPath = path.join(frameDir, `frame_${String(midFrame + 1).padStart(4, "0")}.jpg`);
    if (midPath !== paths[0]) {
      paths.push(midPath);
    }
  }

  return paths;
}

/**
 * Read frame files from disk as Uint8Array buffers.
 */
async function readFrames(paths: string[]): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];
  for (const p of paths) {
    try {
      const data = await fs.readFile(p);
      frames.push(new Uint8Array(data));
    } catch {
      // Skip missing frames
    }
  }
  return frames;
}

/**
 * Caption each shot using vision AI on representative keyframes.
 */
export async function captionShots(
  env: Env,
  frameDir: string,
  shots: ShotSegment[],
  fps: number,
): Promise<ShotCaption[]> {
  const captions: ShotCaption[] = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const keyframePaths = selectKeyframes(frameDir, shot);
    const frames = await readFrames(keyframePaths);

    if (frames.length === 0) {
      captions.push({
        shot_index: i,
        description: "No frames available",
        subjects: [],
        action: "unknown",
        mood: "neutral",
      });
      continue;
    }

    // Timestamps for the keyframes within the shot
    const timestamps = [
      shot.start_s,
      ...(frames.length > 1 ? [(shot.start_s + shot.end_s) / 2] : []),
    ];

    try {
      const result = await analyzeWithVision(
        env,
        frames,
        `shot-${i}`,
        shot.end_s - shot.start_s,
        timestamps,
      );

      // Merge segments into a single caption for the shot
      const descriptions = result.segments.map((s) => s.description).filter(Boolean);
      const allSubjects = result.segments.flatMap((s) => s.subject ? [s.subject] : []);
      const actions = result.segments.map((s) => s.action).filter(Boolean);
      const moods = result.segments.map((s) => s.mood).filter(Boolean);

      captions.push({
        shot_index: i,
        description: descriptions[0] || result.summary || "Unknown scene",
        subjects: [...new Set(allSubjects)],
        action: actions[0] || "unknown",
        mood: moods[0] || "neutral",
      });
    } catch (e) {
      console.warn(`[vision-captioner] Failed to caption shot ${i}: ${(e as Error).message}`);
      captions.push({
        shot_index: i,
        description: "Analysis failed",
        subjects: [],
        action: "unknown",
        mood: "neutral",
      });
    }
  }

  return captions;
}
