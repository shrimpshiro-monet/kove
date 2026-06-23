// apps/web/src/engine/audio/sfx-engine.ts

export function playSFX(src: string, volume = 1): void {
  // SSR safety
  if (typeof window === "undefined") return;

  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {});
}
