/**
 * Animation Easing Contract
 *
 * Re-exports easing types and functions from the keyframes contract.
 * This module exists for discoverability — if you're looking for easing,
 * this is the place to import from.
 */
import { z } from "zod";

// Re-export all easing types and functions from keyframes
export {
  EasingTypeSchema,
  type EasingType,
  EASING_FUNCTIONS,
  type EasingFunction,
} from "../video/keyframes";

// ── Easing Categories (for UI grouping) ─────────────────────────────────────

export const EASING_CATEGORIES = {
  "basic": ["linear", "ease-in", "ease-out", "ease-in-out"],
  "quadratic": ["easeInQuad", "easeOutQuad", "easeInOutQuad"],
  "cubic": ["easeInCubic", "easeOutCubic", "easeInOutCubic"],
  "quartic": ["easeInQuart", "easeOutQuart", "easeInOutQuart"],
  "quintic": ["easeInQuint", "easeOutQuint", "easeInOutQuint"],
  "sinusoidal": ["easeInSine", "easeOutSine", "easeInOutSine"],
  "exponential": ["easeInExpo", "easeOutExpo", "easeInOutExpo"],
  "circular": ["easeInCirc", "easeOutCirc", "easeInOutCirc"],
  "back": ["easeInBack", "easeOutBack", "easeInOutBack"],
  "elastic": ["easeInElastic", "easeOutElastic", "easeInOutElastic"],
  "bounce": ["easeInBounce", "easeOutBounce", "easeInOutBounce"],
} as const;
