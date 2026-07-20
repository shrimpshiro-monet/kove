import { useState } from "react";
import { useScrollReveal } from "./shared/useScrollReveal";
import { EditorToggle, type EditorMode } from "./EditorToggle";

export function Hero() {
  const [mode, setMode] = useState<EditorMode>("simple");
  const ref = useScrollReveal();

  return (
    <section
      ref={ref}
      className="reveal flex flex-col items-center text-center pt-32 pb-16 px-6 max-w-[900px] mx-auto"
    >
      {/* Beta badge */}
      <div className="inline-flex items-center gap-2 bg-jalebi-surface border border-jalebi-border rounded-full px-4 py-1.5 mb-8">
        <span className="text-xs font-medium text-jalebi-border-strong">
          Now in beta — join early
        </span>
      </div>

      {/* Headline */}
      <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.05] tracking-[-0.02em] text-white font-display mb-6">
        Your clips,
        <br />
        edited by AI <span className="text-jalebi-accent">in minutes</span>.
      </h1>

      {/* Subhead */}
      <p className="text-lg text-jalebi-border-strong max-w-[640px] leading-relaxed mb-10">
        Upload raw footage. Describe what you want. Jalebi assembles a
        professional cut — scene detection, pacing, effects — in under a minute.
      </p>

      {/* Mode toggle */}
      <EditorToggle mode={mode} onChange={setMode} />

      {/* Preview placeholder — filled in Task 5 */}
      <div className="w-full max-w-[800px] aspect-video bg-jalebi-surface rounded-2xl border border-jalebi-border mb-10" />

      {/* CTAs */}
      <div className="flex items-center gap-4">
        <a
          href="/sign-up"
          className="px-8 py-3 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold text-sm hover:bg-jalebi-accent-hover transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
        >
          Start editing free
        </a>
        <a
          href="#demo"
          className="px-8 py-3 rounded-full border border-jalebi-border text-white font-medium text-sm hover:border-jalebi-border-strong transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
        >
          Watch demo
        </a>
      </div>
    </section>
  );
}
