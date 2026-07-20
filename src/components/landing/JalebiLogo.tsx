/**
 * Jalebi spiral logo — SVG with a subtle breathing animation.
 */
export function JalebiLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={`w-8 h-8 ${className}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={SPIRAL_PATH}
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="origin-center animate-jalebi-breathe"
      />
    </svg>
  );
}

/**
 * Hand-traced spiral matching the logo:
 * starts center, spirals outward with a tail at the bottom.
 */
const SPIRAL_PATH = `
  M 40 40
  C 40 36, 44 32, 48 32
  C 52 32, 56 36, 56 40
  C 56 46, 50 52, 44 52
  C 36 52, 28 46, 28 38
  C 28 28, 36 20, 46 20
  C 58 20, 66 30, 66 42
  C 66 56, 54 66, 42 66
  C 26 66, 16 54, 16 40
  C 16 22, 28 10, 44 10
  C 64 10, 78 26, 78 44
  C 78 66, 60 78, 40 78
`.trim();
