export function resolveStrength(targetStrength: number, _engine: string): number {
  return Math.min(1, Math.max(0, targetStrength))
}
