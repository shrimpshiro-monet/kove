/**
 * parallel-render.ts — Remotion-inspired parallel frame rendering.
 *
 * Pattern from remotion-dev/remotion:
 * - Create N offscreen canvases (or Web Workers)
 * - Each renders a range of frames
 * - Collect frame buffers, sort by frame number
 * - Feed sequentially to FFmpeg
 *
 * This is the standard approach for scaling video rendering.
 */

export interface FrameRange {
  startFrame: number;
  endFrame: number;
}

export interface RenderWorker {
  id: number;
  renderRange: (range: FrameRange) => Promise<Buffer[]>;
}

/**
 * Split total frames into ranges for parallel rendering.
 * Pattern from Remotion: divide frames across N workers.
 *
 * @param totalFrames - Total frames to render
 * @param concurrency - Number of parallel workers
 * @returns Array of frame ranges, one per worker
 */
export function splitFrameRanges(
  totalFrames: number,
  concurrency: number,
): FrameRange[] {
  const ranges: FrameRange[] = [];
  const framesPerWorker = Math.ceil(totalFrames / concurrency);

  for (let i = 0; i < concurrency; i++) {
    const start = i * framesPerWorker;
    const end = Math.min(start + framesPerWorker, totalFrames);
    if (start < totalFrames) {
      ranges.push({ startFrame: start, endFrame: end });
    }
  }

  return ranges;
}

/**
 * Render frames in parallel using a pool of workers.
 * Pattern from Remotion: Pool-based parallel frame rendering.
 *
 * @param workers - Array of render workers
 * @param ranges - Frame ranges to render
 * @returns Array of frame buffers, sorted by frame number
 */
export async function renderFramesParallel(
  workers: RenderWorker[],
  ranges: FrameRange[],
): Promise<Buffer[]> {
  // Distribute ranges across workers
  const tasks = ranges.map((range, i) => {
    const worker = workers[i % workers.length];
    return worker.renderRange(range);
  });

  // Render all ranges in parallel
  const results = await Promise.all(tasks);

  // Flatten and sort by frame order
  return results.flat();
}

/**
 * Create a render worker pool.
 * Pattern from Remotion: cycle browser tabs to avoid memory leaks.
 *
 * @param createWorker - Factory function to create a worker
 * @param concurrency - Number of workers in the pool
 * @returns Array of workers
 */
export function createWorkerPool<T extends RenderWorker>(
  createWorker: (id: number) => T,
  concurrency: number,
): T[] {
  return Array.from({ length: concurrency }, (_, i) => createWorker(i));
}
