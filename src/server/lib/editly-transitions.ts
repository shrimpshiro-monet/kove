// src/server/lib/editly-transitions.ts
// Maps MonetEDL transitions to Editly/gl-transitions specs

import type { TransitionType } from "../types/edl";

interface EditlyTransition {
  name: string;
  duration: number;
  params?: Record<string, number>;
}

/**
 * Map a MonetEDL transition to an Editly-compatible gl-transition.
 *
 * Editly supports ALL gl-transitions natively when gl-transitions is installed.
 * See: https://github.com/gl-transitions/gl-transitions
 */
export function mapTransition(
  type: TransitionType,
  duration: number
): EditlyTransition | undefined {
  if (type === "cut" || duration <= 0) return undefined;

  const mapping: Record<string, { name: string; params?: Record<string, number> }> = {
    // Core transitions
    crossfade: { name: "fade" },
    "whip-pan": { name: "Directional", params: { direction: 0 } },
    "zoom-blur": { name: "CrossZoom" },
    glitch: { name: "GlitchMemories" },
    flash: { name: "fadeBlack" },
    dissolve: { name: "fade" },

    // EDL schema transitions
    dip_black: { name: "fadeBlack" },
    radial_wipe: { name: "Radial" },
    clock_wipe: { name: "Radial" },
    linear_wipe: { name: "Directional", params: { direction: 0 } },
    gradient_wipe: { name: "Directional", params: { direction: 0 } },
    barn_doors: { name: "doorway" },
    iris: { name: "CircleOpen" },
    pinwheel: { name: "PinWheel" },
    film_burn: { name: "burn" },
    spin: { name: "Angular" },
    blur: { name: "CrossZoom" },
    pixelate: { name: "pixelize" },
    morph_cut: { name: "fade" },
    push: { name: "Directional", params: { direction: 1 } },
    flash_frame: { name: "fadeBlack" },
    flash_white: { name: "fade" },

    // Extended transitions
    cube: { name: "cube" },
    morph: { name: "morph" },
    burn: { name: "burn" },
    ripple: { name: "ripple" },
    swirl: { name: "Swirl" },
    dreamy: { name: "DreamyZoom" },
    wind: { name: "wind" },
    mosaic: { name: "Mosaic" },
    radial: { name: "Radial" },
    slide: { name: "Directional", params: { direction: 1 } },
    doorway: { name: "doorway" },
    heart: { name: "heart" },
    kaleidoscope: { name: "kaleidoscope" },
  };

  const mapped = mapping[type];
  if (!mapped) {
    console.warn(`[editly-transitions] Unknown transition type: ${type}, falling back to fade`);
    return { name: "fade", duration };
  }

  return {
    name: mapped.name,
    duration,
    params: mapped.params,
  };
}

/**
 * Get all available gl-transition names for the EDL generation prompt.
 * Gemini should know what transitions are available.
 */
export function getAvailableTransitions(): string[] {
  return [
    "cut", "crossfade", "whip-pan", "zoom-blur", "glitch",
    "flash", "dissolve", "dip_black", "radial_wipe", "clock_wipe",
    "linear_wipe", "gradient_wipe", "barn_doors", "iris", "pinwheel",
    "film_burn", "spin", "blur", "pixelate",
    "cube", "morph", "burn", "ripple", "swirl", "dreamy",
    "wind", "mosaic", "radial", "slide", "doorway", "heart", "kaleidoscope",
    "flash_frame", "flash_white",
  ];
}
