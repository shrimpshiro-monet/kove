/**
 * Global edit intensity system — one 0-1 slider that scales everything.
 *
 * 0.0 = minimal (barely any effects, subtle color, soft transitions)
 * 0.5 = moderate (balanced, tasteful)
 * 1.0 = maximal (full effects, aggressive color, hard transitions)
 *
 * This scales: effect intensities, color grading strength, transition
 * aggressiveness, motion blur, shake amplitude, and more.
 */

export interface EditIntensityProfile {
  /** Master intensity 0-1 */
  master: number;

  // Derived multipliers (computed from master)
  effectIntensity: number;    // scales all effect intensities
  colorStrength: number;      // scales color grading, saturation, contrast
  motionAggression: number;   // scales shake, whip_pan, speed_ramp amplitude
  transitionBlend: number;    // scales transition duration (0=hard cut, 1=long dissolve)
  blurAmount: number;         // scales blur effects
  textVisibility: number;     // scales text opacity and animation speed
}

/**
 * Compute all derived multipliers from a single 0-1 master value.
 * Uses non-linear curves so 0.5 feels "balanced" not "half-power".
 */
export function computeIntensityProfile(master: number): EditIntensityProfile {
  const m = Math.max(0, Math.min(1, master));

  return {
    master: m,

    // Effects: quadratic curve — subtle at low, aggressive at high
    // At 0.0 → 0.0 (no effects)
    // At 0.5 → 0.35 (tasteful)
    // At 1.0 → 1.0 (full)
    effectIntensity: m * m * 0.4 + m * 0.6,

    // Color: cubic curve — minimal at low, punchy at high
    // At 0.0 → 0.0 (flat)
    // At 0.5 → 0.4 (slight grade)
    // At 1.0 → 1.0 (full grade)
    colorStrength: m * m * m * 0.3 + m * m * 0.3 + m * 0.4,

    // Motion: linear but capped — even at 0.5 there's some movement
    motionAggression: Math.min(1, m * 1.2),

    // Transitions: inverse curve — low = hard cuts, high = soft dissolves
    // At 0.0 → 0.0 (instant cuts)
    // At 0.5 → 0.3 (short dissolves)
    // At 1.0 → 0.8 (long dissolves)
    transitionBlend: m * 0.8,

    // Blur: square root curve — even small values give noticeable blur
    blurAmount: Math.sqrt(m),

    // Text: linear — directly proportional to master
    textVisibility: m,
  };
}

/**
 * Scale an effect intensity by the global profile.
 * Returns a clamped 0-1 value.
 */
export function scaleEffectIntensity(
  baseIntensity: number,
  profile: EditIntensityProfile,
): number {
  return Math.max(0, Math.min(1, baseIntensity * profile.effectIntensity));
}

/**
 * Scale a color parameter by the global profile.
 */
export function scaleColorStrength(
  baseValue: number,
  profile: EditIntensityProfile,
): number {
  return baseValue * profile.colorStrength;
}

/**
 * Scale motion/shake amplitude by the global profile.
 */
export function scaleMotionAggression(
  baseAmplitude: number,
  profile: EditIntensityProfile,
): number {
  return baseAmplitude * profile.motionAggression;
}

/**
 * Get transition duration multiplier from the global profile.
 * Returns 0-1 where 0 = hard cut, 1 = full dissolve.
 */
export function getTransitionBlend(profile: EditIntensityProfile): number {
  return profile.transitionBlend;
}

/**
 * Scale blur amount by the global profile.
 */
export function scaleBlurAmount(
  basePx: number,
  profile: EditIntensityProfile,
): number {
  return basePx * profile.blurAmount;
}
