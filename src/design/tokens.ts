/**
 * Kove Design Tokens
 *
 * Single source of truth for the Kove design language.
 * Import in JS/TS to use token values programmatically.
 * For CSS usage, these same values are mapped via @theme inline in styles.css.
 *
 * Palette: Brutalist monochrome + Kove Orange accent
 * Fonts: Space Grotesk (display), Inter (UI), JetBrains Mono (values)
 * Radius: sharp (4px) — editorial, no softness
 * Motion: fast (80ms), base (120ms), slow (200ms)
 */

export const colors = {
  ink: "#0A0A0A",
  asphalt: "#141414",
  studio: "#1E1E1E",
  chain: "#3A3A3A",
  newsprint: "#B5B0A6",
  paper: "#F5F1E8",
  orange: "#FF4E00",
} as const;

export const radius = {
  sharp: "4px",
  card: "6px",
  panel: "8px",
  modal: "10px",
} as const;

export const type = {
  display: ["Space Grotesk", "Söhne", "Inter", "system-ui"].join(", "),
  ui: ["Inter", "Söhne", "system-ui"].join(", "),
  mono: ["JetBrains Mono", "Berkeley Mono", "ui-monospace"].join(", "),
} as const;

export const motion = {
  fast: "80ms",
  base: "120ms",
  slow: "200ms",
  ease: "ease-out",
} as const;
