import { useState, useCallback } from "react";
import { useScrollReveal } from "./shared/useScrollReveal";

const SAMPLE_CLIPS = [
  { label: "Beach sunset", duration: "0:45" },
  { label: "City timelapse", duration: "1:12" },
  { label: "Mountain drone", duration: "0:33" },
];

export function TryItNow() {
  const ref = useScrollReveal();
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // TODO: handle file drop
  }, []);

  return (
    <section ref={ref} className="reveal bg-jalebi-surface py-32 px-6">
      <div className="max-w-[720px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-4">
          Try it now
        </h2>
        <p className="text-jalebi-border-strong mb-10">
          Drop a clip or paste a link to see Jalebi in action.
        </p>

        {/* Input bar */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center gap-3 bg-jalebi-bg rounded-full border-2 px-5 py-3 transition-all duration-100 ${
            isDragOver
              ? "border-jalebi-accent shadow-[0_0_0_4px_var(--color-jalebi-accent-muted)]"
              : "border-jalebi-border"
          }`}
        >
          {/* Upload icon */}
          <svg className="w-5 h-5 text-jalebi-border-strong shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>

          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Or paste a link..."
            className="flex-1 bg-transparent text-white text-sm placeholder:text-jalebi-border-strong outline-none"
          />

          <button
            className="w-8 h-8 rounded-full bg-jalebi-accent flex items-center justify-center shrink-0 hover:bg-jalebi-accent-hover transition-colors duration-120"
            aria-label="Submit"
          >
            <svg className="w-4 h-4 text-jalebi-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Sample clips */}
        <p className="text-xs text-jalebi-border-strong mt-6 mb-4">
          Or try one of our sample clips
        </p>
        <div className="flex items-center justify-center gap-3">
          {SAMPLE_CLIPS.map((clip) => (
            <button
              key={clip.label}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-jalebi-surface-2 border border-jalebi-border text-sm text-jalebi-border-strong hover:text-white hover:border-jalebi-border-strong transition-all duration-150"
            >
              <span>{clip.label}</span>
              <span className="text-xs text-jalebi-border-strong">{clip.duration}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
