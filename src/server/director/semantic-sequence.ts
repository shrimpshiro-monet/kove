/**
 * semantic-sequence.ts — Analyze narrative sequencing patterns from CLIP tags.
 *
 * Detects common editing patterns:
 * - action → reaction (subject action followed by audience/other reaction)
 * - wide → close → extreme (progressive framing)
 * - parallel cutting (alternating between two subjects)
 * - temporal compression (same subject across time)
 * - spatial transition (different locations in sequence)
 */

export interface SemanticSequence {
  patterns: SequencePattern[];
  narrativeArc: "linear" | "parallel" | "flashback" | "montage" | "conversation";
  subjectContinuity: number; // 0-1, how often same subject appears consecutively
  locationVariety: number; // 0-1, how many unique locations
  avgShotDurationByPattern: Record<string, number>;
}

export interface SequencePattern {
  type: "action_reaction" | "wide_close_extreme" | "parallel_cutting" | "temporal_compression" | "spatial_transition" | "subject_return";
  occurrences: number;
  confidence: number;
  timestamps: number[];
}

/**
 * Analyze semantic sequences from per-shot CLIP tags.
 *
 * @param shots - Per-shot data with semantic tags and timing
 * @returns Semantic sequence analysis
 */
export function analyzeSemanticSequences(
  shots: Array<{
    semantic: string[];
    start_time: number;
    end_time: number;
    duration: number;
    motionDir: string;
  }>,
): SemanticSequence {
  if (shots.length < 2) {
    return {
      patterns: [],
      narrativeArc: "linear",
      subjectContinuity: 1,
      locationVariety: 0,
      avgShotDurationByPattern: {},
    };
  }

  const patterns: SequencePattern[] = [];

  // Detect action → reaction
  const actionReaction = detectActionReaction(shots);
  if (actionReaction.occurrences > 0) patterns.push(actionReaction);

  // Detect wide → close → extreme
  const wideClose = detectWideCloseExtreme(shots);
  if (wideClose.occurrences > 0) patterns.push(wideClose);

  // Detect parallel cutting
  const parallel = detectParallelCutting(shots);
  if (parallel.occurrences > 0) patterns.push(parallel);

  // Detect temporal compression
  const temporal = detectTemporalCompression(shots);
  if (temporal.occurrences > 0) patterns.push(temporal);

  // Detect spatial transitions
  const spatial = detectSpatialTransitions(shots);
  if (spatial.occurrences > 0) patterns.push(spatial);

  // Calculate subject continuity
  const subjectContinuity = calculateSubjectContinuity(shots);

  // Calculate location variety
  const locationVariety = calculateLocationVariety(shots);

  // Determine narrative arc
  const narrativeArc = determineNarrativeArc(shots, patterns);

  // Average shot duration by pattern
  const avgShotDurationByPattern = calculateAvgDurationByPattern(shots, patterns);

  return {
    patterns,
    narrativeArc,
    subjectContinuity,
    locationVariety,
    avgShotDurationByPattern,
  };
}

function detectActionReaction(
  shots: Array<{ semantic: string[]; start_time: number }>,
): SequencePattern {
  const timestamps: number[] = [];
  const actionTags = ["high action motion", "fast hand gesture", "sports action"];
  const reactionTags = ["close-up face reaction", "emotional facial expression", "crowd or audience"];

  for (let i = 0; i < shots.length - 1; i++) {
    const hasAction = shots[i].semantic.some(t => actionTags.includes(t));
    const hasReaction = shots[i + 1].semantic.some(t => reactionTags.includes(t));
    if (hasAction && hasReaction) {
      timestamps.push(shots[i].start_time);
    }
  }

  return {
    type: "action_reaction",
    occurrences: timestamps.length,
    confidence: Math.min(1, timestamps.length / Math.max(1, shots.length / 4)),
    timestamps,
  };
}

function detectWideCloseExtreme(
  shots: Array<{ semantic: string[]; start_time: number }>,
): SequencePattern {
  const timestamps: number[] = [];
  const wideTags = ["crowd or audience", "outdoor city street", "nature or landscape"];
  const closeTags = ["close-up face reaction", "product close-up", "emotional facial expression"];
  const extremeTags = ["static talking head", "dialogue conversation"];

  for (let i = 0; i < shots.length - 2; i++) {
    const isWide = shots[i].semantic.some(t => wideTags.includes(t));
    const isClose = shots[i + 1].semantic.some(t => closeTags.includes(t));
    const isExtreme = shots[i + 2].semantic.some(t => extremeTags.includes(t));
    if (isWide && isClose && isExtreme) {
      timestamps.push(shots[i].start_time);
    }
  }

  return {
    type: "wide_close_extreme",
    occurrences: timestamps.length,
    confidence: Math.min(1, timestamps.length / Math.max(1, shots.length / 5)),
    timestamps,
  };
}

function detectParallelCutting(
  shots: Array<{ semantic: string[]; start_time: number }>,
): SequencePattern {
  const timestamps: number[] = [];

  // Look for alternating between two distinct semantic groups
  for (let i = 0; i < shots.length - 3; i++) {
    const tags0 = new Set(shots[i].semantic);
    const tags1 = new Set(shots[i + 1].semantic);
    const tags2 = new Set(shots[i + 2].semantic);
    const tags3 = new Set(shots[i + 3].semantic);

    // Check if shots alternate between two groups
    const overlap02 = [...tags0].filter(t => tags2.has(t)).length;
    const overlap13 = [...tags1].filter(t => tags3.has(t)).length;
    const overlap01 = [...tags0].filter(t => tags1.has(t)).length;

    if (overlap02 > 0 && overlap13 > 0 && overlap01 === 0) {
      timestamps.push(shots[i].start_time);
    }
  }

  return {
    type: "parallel_cutting",
    occurrences: timestamps.length,
    confidence: Math.min(1, timestamps.length / Math.max(1, shots.length / 6)),
    timestamps,
  };
}

function detectTemporalCompression(
  shots: Array<{ semantic: string[]; start_time: number }>,
): SequencePattern {
  const timestamps: number[] = [];

  // Look for same semantic tags with decreasing shot durations
  const shotArr = shots as Array<{ semantic: string[]; start_time: number; end_time: number; duration: number; motionDir: string }>;
  for (let i = 0; i < shotArr.length - 2; i++) {
    const overlap = shotArr[i].semantic.filter(t => shotArr[i + 1].semantic.includes(t));
    if (overlap.length > 0 && shotArr[i + 1].duration < shotArr[i].duration * 0.7) {
      timestamps.push(shotArr[i].start_time);
    }
  }

  return {
    type: "temporal_compression",
    occurrences: timestamps.length,
    confidence: Math.min(1, timestamps.length / Math.max(1, shots.length / 4)),
    timestamps,
  };
}

function detectSpatialTransitions(
  shots: Array<{ semantic: string[]; start_time: number }>,
): SequencePattern {
  const timestamps: number[] = [];
  const locationTags = ["outdoor city street", "nature or landscape", "luxury interior or office", "car or vehicle"];

  for (let i = 0; i < shots.length - 1; i++) {
    const loc0 = shots[i].semantic.find(t => locationTags.includes(t));
    const loc1 = shots[i + 1].semantic.find(t => locationTags.includes(t));
    if (loc0 && loc1 && loc0 !== loc1) {
      timestamps.push(shots[i].start_time);
    }
  }

  return {
    type: "spatial_transition",
    occurrences: timestamps.length,
    confidence: Math.min(1, timestamps.length / Math.max(1, shots.length / 3)),
    timestamps,
  };
}

function calculateSubjectContinuity(
  shots: Array<{ semantic: string[] }>,
): number {
  if (shots.length < 2) return 1;

  let sameSubject = 0;
  for (let i = 0; i < shots.length - 1; i++) {
    const overlap = shots[i].semantic.filter(t => shots[i + 1].semantic.includes(t));
    if (overlap.length > 0) sameSubject++;
  }

  return sameSubject / (shots.length - 1);
}

function calculateLocationVariety(
  shots: Array<{ semantic: string[] }>,
): number {
  const locationTags = ["outdoor city street", "nature or landscape", "luxury interior or office", "car or vehicle"];
  const locations = new Set<string>();

  for (const shot of shots) {
    for (const tag of shot.semantic) {
      if (locationTags.includes(tag)) {
        locations.add(tag);
      }
    }
  }

  return Math.min(1, locations.size / locationTags.length);
}

function determineNarrativeArc(
  shots: Array<{ semantic: string[]; start_time: number; duration: number }>,
  patterns: SequencePattern[],
): SemanticSequence["narrativeArc"] {
  const hasParallel = patterns.some(p => p.type === "parallel_cutting");
  const hasTemporal = patterns.some(p => p.type === "temporal_compression");

  if (hasParallel) return "parallel";
  if (hasTemporal) return "flashback";

  // Check for conversation pattern (alternating dialogue tags)
  let dialogueCount = 0;
  for (const shot of shots) {
    if (shot.semantic.includes("dialogue conversation") || shot.semantic.includes("static talking head")) {
      dialogueCount++;
    }
  }
  if (dialogueCount > shots.length * 0.5) return "conversation";

  // Check for montage (many short shots)
  const avgDuration = shots.reduce((s, sh) => s + sh.duration, 0) / shots.length;
  if (avgDuration < 1.0) return "montage";

  return "linear";
}

function calculateAvgDurationByPattern(
  shots: Array<{ start_time: number; duration: number; semantic: string[] }>,
  patterns: SequencePattern[],
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const pattern of patterns) {
    const durations: number[] = [];
    for (const ts of pattern.timestamps) {
      const shot = shots.find(s => Math.abs(s.start_time - ts) < 0.1);
      if (shot) durations.push(shot.duration);
    }
    if (durations.length > 0) {
      result[pattern.type] = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
  }

  return result;
}
