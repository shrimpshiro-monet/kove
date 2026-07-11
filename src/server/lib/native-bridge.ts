let native: any = null;
try {
  native = require("@kove/core");
} catch {
  native = null;
}

export const nativeAvailable = () => native !== null;

export function snapCuts(cuts: number[], grid: number[], maxDrift: number): number[] {
  if (native) return native.snapCuts(cuts, grid, maxDrift);
  return cuts.map((t) => {
    let best = t, bestD = Infinity;
    for (const g of grid) { const d = Math.abs(g - t); if (d < bestD) { bestD = d; best = g; } }
    return bestD <= maxDrift ? best : t;
  });
}

export function dtwDistance(a: number[], b: number[], window = 0): number {
  if (native) return native.dtwDistance(a, b, window);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = Math.abs(a[i-1]-b[j-1]) + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[n][m];
}

export function isVelocityRamp(magnitudes: number[]): boolean {
  if (native) return native.isVelocityRamp(magnitudes);
  const n = magnitudes.length;
  if (n < 5) return false;
  const third = Math.max(1, Math.floor(n / 3));
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const early = mean(magnitudes.slice(0, third));
  const mid = mean(magnitudes.slice(third, 2 * third));
  const late = mean(magnitudes.slice(2 * third));
  return mid < early * 0.7 && mid < late * 0.7;
}
