/**
 * Humanizer Pipeline
 *
 * Makes AI edits feel human by adding:
 * 1. Asymmetric pacing (Gaussian sampling from reference distribution)
 * 2. Micro-imperfections (controlled frame offsets around beats)
 * 3. Creative density decay (breathing room after heavy effects)
 * 4. Semantic anchoring (cuts land on action vertices, not arbitrary timestamps)
 *
 * This is the difference between "AI that edits" and "AI that FEELS like it edited."
 */

import type { MonetEDL, Shot } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";
import type { RhythmMap } from "../lib/edl-scoring";

// ============================================================
// 1. ASYMMETRIC PACING — sample from reference distribution
// ============================================================

interface PacingDistribution {
  mean: number;
  std: number;
  median: number;
  p10: number;  // 10th percentile (short shots)
  p90: number;  // 90th percentile (long shots)
  skew: number; // positive = more short shots, negative = more long shots
}

/**
 * Extract the pacing distribution from reference shot durations.
 * Not just the mean — the full shape of how the editor paces.
 */
export function extractPacingDistribution(shotDurations: number[]): PacingDistribution {
  if (shotDurations.length < 2) {
    return { mean: 1.0, std: 0.3, median: 1.0, p10: 0.5, p90: 1.5, skew: 0 };
  }

  const sorted = [...shotDurations].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((s, d) => s + (d - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p10 = sorted[Math.floor(n * 0.1)];
  const p90 = sorted[Math.floor(n * 0.9)];

  // Skewness (Fisher)
  const m3 = sorted.reduce((s, d) => s + ((d - mean) / (std + 1e-9)) ** 3, 0) / n;

  return { mean, std, median, p10, p90, skew: m3 };
}

/**
 * Sample a shot duration from the reference distribution.
 * Uses Gaussian with clamp to prevent extreme values.
 * The skew parameter biases toward short or long shots.
 */
export function sampleDuration(dist: PacingDistribution, skewBias = 0): number {
  // Box-Muller transform for Gaussian sampling
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-9)) * Math.cos(2 * Math.PI * u2);

  // Apply skew bias (positive = favor shorter shots)
  const adjusted = z + skewBias * dist.skew * 0.3;

  // Sample from distribution
  let duration = dist.mean + adjusted * dist.std;

  // Clamp to reasonable bounds (prevent 0-second or 10-second shots)
  const minDur = Math.max(0.15, dist.p10 * 0.5);
  const maxDur = Math.min(8.0, dist.p90 * 2.0);
  duration = Math.max(minDur, Math.min(maxDur, duration));

  return Math.round(duration * 100) / 100; // 2 decimal places
}

/**
 * Generate a pacing sequence that matches the reference's variance profile.
 * Returns an array of durations, one per shot.
 */
export function generatePacingSequence(
  dist: PacingDistribution,
  shotCount: number,
  targetDuration: number,
  sectionRole: string,
): number[] {
  const durations: number[] = [];

  // Section-specific skew: setup shots are longer, montage shots are shorter
  const sectionSkew: Record<string, number> = {
    hook: -0.5,      // longer, more deliberate
    setup: -0.3,     // slightly longer
    drop: 0.8,       // short, punchy
    montage: 0.5,    // short, energetic
    ending: -0.2,    // slightly longer for closure
    build: -0.2,
    peak: 0.6,
  };
  const skew = sectionSkew[sectionRole] ?? 0;

  for (let i = 0; i < shotCount; i++) {
    durations.push(sampleDuration(dist, skew));
  }

  // Normalize to target duration
  const total = durations.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const scale = targetDuration / total;
    for (let i = 0; i < durations.length; i++) {
      durations[i] = Math.round(durations[i] * scale * 100) / 100;
    }
  }

  return durations;
}


// ============================================================
// 2. MICRO-IMPERFECTIONS — controlled frame offsets
// ============================================================

interface OffsetEnvelope {
  downbeatOffset: number;  // frames offset for downbeat cuts (small)
  strongBeatOffset: number; // frames offset for strong beat cuts
  minorBeatOffset: number;  // frames offset for minor beat cuts (larger)
  syncopationChance: number; // probability of skipping a minor beat
}

/**
 * Default offset envelope — humans anticipate the snare, not land on it.
 * Negative = cut BEFORE the beat (anticipation)
 * Positive = cut AFTER the beat (letting action trail)
 */
const DEFAULT_OFFSET: OffsetEnvelope = {
  downbeatOffset: -1,      // 1 frame before downbeat (anticipation)
  strongBeatOffset: 0,     // exact on strong beats
  minorBeatOffset: 2,      // 2 frames after minor beats (letting action breathe)
  syncopationChance: 0.15, // 15% chance to skip a minor beat entirely
};

/**
 * Calculate the frame offset for a cut relative to a beat.
 * Returns offset in seconds (frames / fps).
 */
export function calculateCutOffset(
  beatType: "downbeat" | "strong" | "minor",
  fps: number,
  envelope: OffsetEnvelope = DEFAULT_OFFSET,
): number {
  let frames: number;
  switch (beatType) {
    case "downbeat":
      frames = envelope.downbeatOffset;
      break;
    case "strong":
      frames = envelope.strongBeatOffset;
      break;
    case "minor":
      frames = envelope.minorBeatOffset;
      break;
  }

  // Add controlled randomness (±1 frame)
  frames += (Math.random() - 0.5) * 2;

  return frames / fps;
}

/**
 * Should we skip this beat (syncopation)?
 * Humans hold compelling shots past minor beats.
 */
export function shouldSyncopate(
  shotDuration: number,
  beatInterval: number,
  envelope: OffsetEnvelope = DEFAULT_OFFSET,
): boolean {
  // Longer shots are more likely to syncopate (holding a good moment)
  const durationRatio = shotDuration / beatInterval;
  const chance = envelope.syncopationChance * Math.min(2, durationRatio);
  return Math.random() < chance;
}


// ============================================================
// 3. CREATIVE DENSITY DECAY — breathing room after heavy effects
// ============================================================

interface DecayProfile {
  decayRate: number;     // how much to reduce intensity (0.5 = 50% reduction)
  decayShots: number;    // how many shots to decay over
  minIntensity: number;  // floor (never go below this)
}

const DEFAULT_DECAY: DecayProfile = {
  decayRate: 0.6,      // reduce by 60%
  decayShots: 2,       // over 2 shots
  minIntensity: 0.15,  // floor at 15%
};

/**
 * Apply creative density decay to a sequence of shots.
 * After a heavy effect shot, subsequent shots get reduced intensity.
 */
export function applyDecay(
  shots: Shot[],
  profile: DecayProfile = DEFAULT_DECAY,
): Shot[] {
  let lastHeavyIndex = -1;
  let lastHeavyIntensity = 0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const effects = shot.effects ?? [];
    const totalIntensity = effects.reduce((s, fx) => s + (fx.intensity ?? 0), 0);

    // Detect heavy effect shot (total intensity > 1.5)
    if (totalIntensity > 1.5) {
      lastHeavyIndex = i;
      lastHeavyIntensity = totalIntensity;
      continue;
    }

    // Apply decay if within decay window
    if (lastHeavyIndex >= 0 && i - lastHeavyIndex <= profile.decayShots) {
      const progress = (i - lastHeavyIndex) / profile.decayShots;
      const decayFactor = 1 - profile.decayRate * (1 - progress);

      for (const fx of effects) {
        if (fx.intensity !== undefined) {
          fx.intensity = Math.max(
            profile.minIntensity,
            fx.intensity * decayFactor,
          );
        }
      }
    }
  }

  return shots;
}


// ============================================================
// 4. SEMANTIC ANCHORING — cuts land on action vertices
// ============================================================

interface AnchorPoint {
  time: number;
  type: "motion_peak" | "face_center" | "semantic_shift" | "energy_jump";
  strength: number;
}

/**
 * Find the best frame within a shot to place a cut.
 * Uses perception data to find action vertices.
 */
export function findBestCutPoint(
  shot: Shot,
  velocity: { timestamp: number; magnitude: number; direction: string }[],
  fps: number,
): number {
  const shotStart = shot.timing.startTime;
  const shotEnd = shotStart + shot.timing.duration;

  // Get velocity samples within this shot
  const inShot = velocity.filter(
    (v) => v.timestamp >= shotStart && v.timestamp < shotEnd,
  );

  if (inShot.length < 2) return shotStart;

  // Find the frame with highest motion (action vertex)
  let peakFrame = inShot[0];
  for (const v of inShot) {
    if (v.magnitude > peakFrame.magnitude) {
      peakFrame = v;
    }
  }

  // Don't anchor to the very start or end — stay within middle 80%
  const margin = shot.timing.duration * 0.1;
  const earliest = shotStart + margin;
  const latest = shotEnd - margin;

  const anchorTime = Math.max(earliest, Math.min(latest, peakFrame.timestamp));

  // Snap to nearest frame boundary
  return Math.round(anchorTime * fps) / fps;
}

/**
 * Detect action vertices from velocity data.
 * These are frames where motion peaks or changes direction.
 */
export function detectActionVertices(
  velocity: { timestamp: number; magnitude: number; direction: string }[],
  threshold = 0.3,
): AnchorPoint[] {
  if (velocity.length < 3) return [];

  const vertices: AnchorPoint[] = [];

  for (let i = 1; i < velocity.length - 1; i++) {
    const prev = velocity[i - 1];
    const curr = velocity[i];
    const next = velocity[i + 1];

    // Motion peak (local maximum)
    if (curr.magnitude > prev.magnitude && curr.magnitude > next.magnitude) {
      if (curr.magnitude > threshold) {
        vertices.push({
          time: curr.timestamp,
          type: "motion_peak",
          strength: curr.magnitude,
        });
      }
    }

    // Direction change (action vertex)
    if (prev.direction !== next.direction && curr.direction !== "none") {
      vertices.push({
        time: curr.timestamp,
        type: "semantic_shift",
        strength: 0.7,
      });
    }
  }

  return vertices.sort((a, b) => b.strength - a.strength);
}


// ============================================================
// 5. THE FULL HUMANIZER — applies all transforms
// ============================================================

export interface HumanizerConfig {
  pacing: PacingDistribution;
  offsetEnvelope: OffsetEnvelope;
  decayProfile: DecayProfile;
  fps: number;
}

/**
 * Humanize an EDL — apply all the transforms that make it feel human.
 *
 * This is called AFTER the mechanical pipeline (enforce → color → effects → continuity → beat-lock).
 * It adds the controlled unpredictability that makes the difference.
 */
export function humanizeEDL(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle,
  rhythm: RhythmMap,
  config: HumanizerConfig,
): MonetEDL {
  if (!edl.shots?.length) return edl;

  // 1. Apply micro-imperfections to beat-locked cuts
  for (const shot of edl.shots) {
    if (shot.timing.beatLocked) {
      const offset = calculateCutOffset("strong", config.fps, config.offsetEnvelope);
      shot.timing.startTime = Math.max(0, shot.timing.startTime + offset);
    }
  }

  // 2. Apply creative density decay
  applyDecay(edl.shots, config.decayProfile);

  // 3. Re-sort by start time after offsets
  edl.shots.sort((a, b) => a.timing.startTime - b.timing.startTime);

  // 4. Re-flow to ensure no gaps or overlaps
  let t = 0;
  for (const shot of edl.shots) {
    shot.timing.startTime = t;
    t += shot.timing.duration;
  }

  return edl;
}

/**
 * Build humanizer config from reference analysis.
 */
export function buildHumanizerConfig(
  referenceStyle: ReferenceStyle,
  shotDurations: number[],
  fps: number,
): HumanizerConfig {
  return {
    pacing: extractPacingDistribution(shotDurations),
    offsetEnvelope: DEFAULT_OFFSET,
    decayProfile: DEFAULT_DECAY,
    fps,
  };
}
