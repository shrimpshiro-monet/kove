// Effect intensity limits — prevents over-processing that ruins video quality.
// These are HARD LIMITS that no effect can exceed, regardless of what the LLM requests.

export const EFFECT_LIMITS = {
  // Per-shot caps
  MAX_EFFECTS_PER_SHOT: 3,
  MAX_TOTAL_INTENSITY_PER_SHOT: 2.0,

  // Per-effect intensity ranges (AI can tune within these)
  intensity: {
    push_in:         { min: 0.2, max: 0.6, default: 0.4 },
    pull_out:        { min: 0.2, max: 0.6, default: 0.4 },
    impact_flash:    { min: 0.3, max: 0.8, default: 0.6 },
    color_pulse:     { min: 0.2, max: 0.7, default: 0.5 },
    context_shake:   { min: 0.1, max: 0.5, default: 0.3 },
    vignette_punch:  { min: 0.2, max: 0.6, default: 0.4 },
    chromatic_burst: { min: 0.2, max: 0.7, default: 0.5 },
    whip_pan:        { min: 0.3, max: 0.8, default: 0.6 },
    speed_ramp:      { min: 0.2, max: 0.7, default: 0.5 },

    // GPU effects
    hologram:        { min: 0.2, max: 0.6, default: 0.4 },
    thermal:         { min: 0.2, max: 0.6, default: 0.4 },
    plasma:          { min: 0.2, max: 0.5, default: 0.3 },
    bloom_highlights:{ min: 0.2, max: 0.5, default: 0.3 },
    crt_monitor:     { min: 0.2, max: 0.6, default: 0.4 },
    duotone:         { min: 0.5, max: 1.0, default: 0.8 },
    film_scratches:  { min: 0.1, max: 0.4, default: 0.2 },
    vignette:        { min: 0.2, max: 0.5, default: 0.3 },
    lens_blur:       { min: 0.2, max: 0.5, default: 0.3 },
    sepia:           { min: 0.2, max: 0.6, default: 0.4 },
    vibrance:        { min: 0.2, max: 0.5, default: 0.3 },
    shift_towards:   { min: 0.1, max: 0.4, default: 0.2 },
    heat_wave:       { min: 0.2, max: 0.5, default: 0.3 },
    kaleidoscope:    { min: 0.3, max: 0.7, default: 0.5 },
    liquid:          { min: 0.2, max: 0.5, default: 0.3 },
    dream_blur:      { min: 0.2, max: 0.5, default: 0.3 },
    zoom_blur:       { min: 0.2, max: 0.5, default: 0.3 },
    noise_film:      { min: 0.1, max: 0.3, default: 0.15 },
    posterize_gfx:   { min: 0.3, max: 0.8, default: 0.5 },
    color_halftone:  { min: 0.3, max: 0.8, default: 0.5 },
    dot_screen:      { min: 0.3, max: 0.8, default: 0.5 },
    edges_gfx:       { min: 0.2, max: 0.6, default: 0.4 },
    ink_gfx:         { min: 0.2, max: 0.6, default: 0.4 },
    emboss_gfx:      { min: 0.2, max: 0.5, default: 0.3 },
    swirl_gfx:       { min: 0.2, max: 0.5, default: 0.3 },
    bulge_pinch:     { min: 0.2, max: 0.5, default: 0.3 },
    denoise_gfx:     { min: 0.2, max: 0.5, default: 0.3 },
    triangle_blur:   { min: 0.2, max: 0.5, default: 0.3 },
    tilt_shift:      { min: 0.3, max: 0.7, default: 0.5 },
    ascii_matrix:    { min: 0.2, max: 0.6, default: 0.4 },
    floating_dust:   { min: 0.2, max: 0.5, default: 0.3 },
    infrared:        { min: 0.3, max: 0.7, default: 0.5 },
  },

  // Global caps (prevent any single parameter from exceeding these)
  maxBrightness: 0.25,
  maxSaturation: 1.4,
  maxContrast: 1.3,
  maxBlurPx: 15,
  maxZoom: 1.25,
} as const;

/**
 * Clamp an effect's intensity to its allowed range.
 */
export function clampEffectIntensity(
  type: string,
  requestedIntensity: number,
): number {
  const range = EFFECT_LIMITS.intensity[type as keyof typeof EFFECT_LIMITS.intensity];
  if (!range) {
    // Unknown effect — apply general clamp
    return Math.max(0, Math.min(1, requestedIntensity));
  }
  return Math.max(range.min, Math.min(range.max, requestedIntensity));
}

/**
 * Check if a shot has too many effects and trim if needed.
 */
export function enforceShotBudget(effects: any[]): any[] {
  if (effects.length <= EFFECT_LIMITS.MAX_EFFECTS_PER_SHOT) {
    return effects;
  }

  // Keep the most important effects (by intensity, descending)
  return effects
    .sort((a, b) => (b.intensity ?? 0.5) - (a.intensity ?? 0.5))
    .slice(0, EFFECT_LIMITS.MAX_EFFECTS_PER_SHOT);
}

/**
 * Check if total intensity across all effects exceeds the cap.
 */
export function enforceIntensityBudget(effects: any[]): any[] {
  let total = 0;
  const result: any[] = [];

  for (const effect of effects) {
    const intensity = clampEffectIntensity(
      effect.type ?? effect.kind ?? "",
      effect.intensity ?? 0.5,
    );
    if (total + intensity > EFFECT_LIMITS.MAX_TOTAL_INTENSITY_PER_SHOT) {
      // Skip this effect — budget exhausted
      continue;
    }
    total += intensity;
    result.push({ ...effect, intensity });
  }

  return result;
}
