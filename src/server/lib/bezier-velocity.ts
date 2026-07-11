export interface BezierVelocityCurve {
  entrySpeed: number;
  anchorSpeed: number;
  exitSpeed: number;
  entryFrames: number;
  exitFrames: number;
  anchorPosition: number;
}

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

export function generateVelocityFactors(
  curve: BezierVelocityCurve,
  totalFrames: number,
): number[] {
  const factors: number[] = new Array(totalFrames);
  const entryEnd = Math.min(curve.entryFrames, totalFrames);
  const exitStart = Math.max(totalFrames - curve.exitFrames, 0);
  const midFrames = Math.max(0, exitStart - entryEnd);
  const anchorFrame = Math.floor(entryEnd + midFrames * curve.anchorPosition);

  for (let i = 0; i < totalFrames; i++) {
    let speed: number;

    if (i < entryEnd) {
      const t = entryEnd > 0 ? i / entryEnd : 1;
      const eased = cubicBezier(t, 0.42, 0, 0.58, 1);
      speed = curve.entrySpeed + (curve.anchorSpeed - curve.entrySpeed) * eased;
    } else if (i >= exitStart) {
      const t = midFrames + curve.exitFrames > 0
        ? (i - exitStart) / curve.exitFrames
        : 1;
      const eased = cubicBezier(t, 0.42, 0, 0.58, 1);
      speed = curve.anchorSpeed + (curve.exitSpeed - curve.anchorSpeed) * eased;
    } else {
      speed = curve.anchorSpeed;
    }

    factors[i] = Math.max(0.01, speed);
  }

  return factors;
}

export function velocityToSetpts(factors: number[]): string {
  if (factors.length === 0) return "PTS";

  const segments: string[] = [];
  let i = 0;
  while (i < factors.length) {
    let j = i + 1;
    while (j < factors.length && Math.abs(factors[j] - factors[i]) < 0.001) {
      j++;
    }
    const factor = factors[i];
    const ptsFactor = (1 / factor).toFixed(6);
    if (i === 0 && j === factors.length) {
      return `setpts=${ptsFactor}*PTS`;
    }
    segments.push(`between(N,${i},${j - 1})/${ptsFactor}`);
    i = j;
  }

  return `setpts=(${segments.join("+")})*PTS`;
}

export function velocityToBlur(factors: number[]): number[] {
  return factors.map((speed) => {
    if (speed <= 1.0) return 0;
    return Math.min((speed - 1.0) * 2.5, 8);
  });
}
