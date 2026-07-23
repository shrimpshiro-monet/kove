/**
 * Cubic bezier easing function — pure math, no server dependencies.
 * Shared between client renderer and server.
 */
export function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let guessT = clamped;
  for (let i = 0; i < 8; i++) {
    const currentX = ((ax * guessT + bx) * guessT + cx) * guessT;
    const dx = (3 * ax * guessT + 2 * bx) * guessT + cx;
    if (Math.abs(dx) < 1e-6) break;
    guessT -= (currentX - clamped) / dx;
  }

  guessT = Math.max(0, Math.min(1, guessT));
  return ((ay * guessT + by) * guessT + cy) * guessT;
}
