import { useState, useEffect, useRef, useCallback } from "react";
import { FilmstripBorder } from "./shared/FilmstripBorder";
import type { EditorMode } from "./EditorToggle";

const SIMPLE_FRAMES = Array.from({ length: 12 }, (_, i) => `/frames/simple-${i}.webp`);
const ADVANCED_FRAMES = Array.from({ length: 12 }, (_, i) => `/frames/advanced-${i}.webp`);

interface ScrubbablePreviewProps {
  mode: EditorMode;
}

export function ScrubbablePreview({ mode }: ScrubbablePreviewProps) {
  const frames = mode === "simple" ? SIMPLE_FRAMES : ADVANCED_FRAMES;
  const [frameIndex, setFrameIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoplayRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasInteracted) return;

    let start: number | null = null;
    const duration = 4000;

    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = (elapsed % duration) / duration;
      setFrameIndex(Math.floor(progress * frames.length));
      autoplayRef.current = requestAnimationFrame(tick);
    };

    autoplayRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoplayRef.current) cancelAnimationFrame(autoplayRef.current);
    };
  }, [hasInteracted, frames.length]);

  useEffect(() => {
    setFrameIndex(0);
    setHasInteracted(false);
  }, [mode]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasInteracted(true);
      const val = parseInt(e.target.value, 10);
      setFrameIndex(Math.min(val, frames.length - 1));
    },
    [frames.length],
  );

  return (
    <div className="w-full max-w-[800px] mx-auto">
      <div
        className={`relative w-full aspect-video bg-jalebi-surface rounded-2xl overflow-hidden border transition-colors duration-150 ${
          mode === "simple" ? "border-jalebi-accent/20" : "border-jalebi-border"
        }`}
      >
        <div className="absolute inset-0 flex items-center justify-center text-jalebi-border-strong text-sm">
          Frame {frameIndex + 1} / {frames.length} — {mode} mode
        </div>
      </div>

      <FilmstripBorder className="mt-2" />

      <input
        ref={inputRef}
        type="range"
        min={0}
        max={frames.length - 1}
        value={frameIndex}
        onChange={handleInput}
        className="w-full h-8 mt-1 cursor-grab active:cursor-grabbing opacity-0"
        aria-label={`Scrub through ${mode} editor preview frames`}
      />

      <div
        className="relative h-0 -mt-8 pointer-events-none"
        style={{ left: `${(frameIndex / (frames.length - 1)) * 100}%` }}
      >
        <div className="absolute -translate-x-1/2 w-0.5 h-4 bg-jalebi-accent rounded-full" />
        <div className="absolute -translate-x-1/2 -top-1 w-3 h-3 bg-jalebi-accent rounded-full border-2 border-jalebi-bg" />
      </div>
    </div>
  );
}
