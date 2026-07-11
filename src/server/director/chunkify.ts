/**
 * chunkify.ts — Auto-editor inspired label combinator for shot generation.
 *
 * Pattern from WyattBlue/auto-editor:
 * - Labels: 0=silent, 1=active, 2+=special
 * - chunkify() groups consecutive same-label frames into (startFrame, endFrame) tuples
 * - Supports or/and/xor between analysis methods
 *
 * Applied to Kove: converts analysis metrics into shot in/out point candidates.
 */

export interface LabelChunk {
  startFrame: number;
  endFrame: number;
  label: number;
  duration: number;
}

/**
 * Convert a boolean/number array into contiguous chunks.
 * This is the core auto-editor pattern: analysis → threshold → label → chunk.
 *
 * @param labels - Array of label values (0=silent, 1=active, 2+=special)
 * @param fps - Frames per second
 * @returns Array of contiguous chunks
 */
export function chunkify(labels: number[], fps: number): LabelChunk[] {
  if (labels.length === 0) return [];

  const chunks: LabelChunk[] = [];
  let currentLabel = labels[0];
  let startFrame = 0;

  for (let i = 1; i <= labels.length; i++) {
    if (i === labels.length || labels[i] !== currentLabel) {
      chunks.push({
        startFrame,
        endFrame: i - 1,
        label: currentLabel,
        duration: (i - startFrame) / fps,
      });
      if (i < labels.length) {
        currentLabel = labels[i];
        startFrame = i;
      }
    }
  }

  return chunks;
}

/**
 * Combine two label arrays with logical operations.
 * Pattern from auto-editor: supports or/and/xor between analysis methods.
 *
 * @param a - First label array
 * @param b - Second label array
 * @param op - Logical operation: "or", "and", "xor"
 * @returns Combined label array
 */
export function combineLabels(
  a: number[],
  b: number[],
  op: "or" | "and" | "xor",
): number[] {
  const len = Math.max(a.length, b.length);
  const result = new Array(len);

  for (let i = 0; i < len; i++) {
    const va = i < a.length ? a[i] : 0;
    const vb = i < b.length ? b[i] : 0;

    switch (op) {
      case "or":
        result[i] = va > 0 || vb > 0 ? 1 : 0;
        break;
      case "and":
        result[i] = va > 0 && vb > 0 ? 1 : 0;
        break;
      case "xor":
        result[i] = (va > 0) !== (vb > 0) ? 1 : 0;
        break;
    }
  }

  return result;
}

/**
 * Convert energy/motion values into labels using adaptive threshold.
 * This is the "threshold" step in the analysis → threshold → label → clip pipeline.
 *
 * @param values - Raw metric values (0-1 normalized)
 * @param threshold - Adaptive threshold (auto-calculated if not provided)
 * @returns Label array (0=below threshold, 1=above)
 */
export function thresholdToLabels(
  values: number[],
  threshold?: number,
): number[] {
  // Auto-calculate threshold as mean + 0.5 * stddev
  if (threshold === undefined) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    threshold = mean + 0.5 * stddev;
  }

  return values.map((v) => (v >= threshold ? 1 : 0));
}

/**
 * Convert analysis metrics into shot candidates.
 * This is the "clip" step: label → (startFrame, endFrame) tuples.
 *
 * @param energyCurve - Normalized energy values per second
 * @param fps - Frames per second
 * @param minChunkDuration - Minimum chunk duration in seconds
 * @returns Array of label chunks that can become shots
 */
export function analyzeToShotCandidates(
  energyCurve: number[],
  fps: number,
  minChunkDuration = 0.3,
): LabelChunk[] {
  const labels = thresholdToLabels(energyCurve);
  const chunks = chunkify(labels, fps);

  // Filter out chunks shorter than minimum duration
  return chunks.filter((c) => c.duration >= minChunkDuration);
}
